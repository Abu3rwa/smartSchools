// Guards shared by every SkillPath authoring write. A document save carries
// the revision it was loaded with, so two teachers editing the same pack (or
// an archive racing a new question reference) cannot both commit.
import mongoose from 'mongoose';
import GameSkill from '../models/GameSkill.js';

export class ImportConflictError extends Error {
    constructor(message, code = 'REVISION_CONFLICT') {
        super(message);
        this.name = 'ImportConflictError';
        this.status = 409;
        this.code = code;
    }
}

export const revisionValue = (doc, field) => (Number.isFinite(doc?.[field]) ? doc[field] : null);

// Legacy documents may not carry the counter yet; null matches them the same
// way 0 matches new ones.
const revisionFilter = (value) => (value === null ? { $in: [0, null] } : value);

export const saveWithRevision = async (doc, {
    field,
    expected,
    schoolId,
    session,
    conflictMessage = 'Someone else changed this while you were editing. Reload and try again.'
}) => {
    const before = revisionValue(doc, field);
    doc[field] = (before ?? 0) + 1;
    doc.$where = {
        ...(doc.$where || {}),
        school: schoolId,
        [field]: revisionFilter(expected === undefined ? before : expected)
    };
    try {
        await doc.save(session ? { session } : undefined);
        return doc;
    } catch (error) {
        if (error instanceof mongoose.Error.DocumentNotFoundError) {
            throw new ImportConflictError(conflictMessage);
        }
        throw error;
    }
};

// Called inside the same transaction that writes the new question references.
// The write conflicts with a concurrent archive of any of these skills, and
// the status filter refuses skills that are already archived.
export const touchReferencedSkills = async (skillIds, { schoolId, session }) => {
    const ids = [...new Set(skillIds.map(String))].map((id) => new mongoose.Types.ObjectId(id));
    if (ids.length === 0) return;
    const result = await GameSkill.updateMany(
        { _id: { $in: ids }, school: schoolId, status: { $ne: 'archived' } },
        { $set: { lastReferencedAt: new Date() } },
        session ? { session } : undefined
    );
    if (result.matchedCount !== ids.length) {
        throw new ImportConflictError('One of the selected skills was archived. Pick another skill and preview again.', 'SKILL_UNAVAILABLE');
    }
};

export const slugKey = (value, fallback) => {
    const slug = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 70);
    return slug || fallback;
};

// Keys are machine identifiers, never something the teacher types. Collisions
// get a numeric suffix instead of failing the whole create.
export const uniqueSlugKey = async (Model, base, { schoolId, session }) => {
    const root = slugKey(base, `item-${Date.now().toString(36)}`);
    let candidate = root;
    for (let suffix = 2; suffix < 200; suffix += 1) {
        const query = Model.findOne({ school: schoolId, key: candidate }).select('_id');
        const clash = await (session ? query.session(session) : query).lean();
        if (!clash) return candidate;
        candidate = `${root}-${suffix}`;
    }
    throw new ImportConflictError('Too many items share this name. Use a more specific title.');
};
