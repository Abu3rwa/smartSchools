// Guards shared by every SkillPath authoring write. The write carries the
// revision the document was loaded with, so two teachers editing the same pack
// (or an archive racing a new question reference) cannot both commit.
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

// Legacy rows have no counter on disk, but the schema default loads them as 0,
// so both 0 and null must match a missing field.
const revisionFilter = (value) => (value === null || value === 0 ? { $in: [0, null] } : value);

// Written as an explicit update rather than doc.save(): rows created before a
// schema field existed only hold its default in memory, and defaults that are
// empty arrays switch on Mongoose's __v filter, so the save can miss a row
// that exists and raise a VersionError instead of our conflict. Only the paths
// this request changed are written; a no-match is the conflict.
export const saveWithRevision = async (doc, {
    field,
    expected,
    schoolId,
    session,
    conflictMessage = 'Someone else changed this while you were editing. Reload and try again.'
}) => {
    const before = revisionValue(doc, field);
    const $set = {};
    for (const path of doc.modifiedPaths()) {
        const value = doc.get(path);
        $set[path] = value && typeof value.toObject === 'function' ? value.toObject() : value;
    }
    $set[field] = (before ?? 0) + 1;
    const saved = await doc.constructor.findOneAndUpdate(
        {
            _id: doc._id,
            school: schoolId,
            [field]: revisionFilter(expected === undefined ? before : expected)
        },
        { $set },
        { new: true, runValidators: true, ...(session ? { session } : {}) }
    );
    if (!saved) throw new ImportConflictError(conflictMessage);
    return saved;
};

// Archiving takes a record out of every live list instead of editing it, so a
// stale counter must never block it: the teacher who loaded the page first and
// clicks later still gets the record removed. The counter still moves forward
// so any editor still holding the old token cannot write over the archive.
export const archiveWithRevision = async (doc, { field, schoolId, session }) => {
    const current = revisionValue(doc, field) ?? 0;
    const saved = await doc.constructor.findOneAndUpdate(
        { _id: doc._id, school: schoolId },
        { $set: { status: 'archived', [field]: current + 1 } },
        { new: true, ...(session ? { session } : {}) }
    );
    if (!saved) throw new ImportConflictError('This item was already removed. Refresh the page.');
    return saved;
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
