import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import GameSkill from '../models/GameSkill.js';
import GamePack from '../models/GamePack.js';
import GameAssignment from '../models/GameAssignment.js';
import GameSession from '../models/GameSession.js';
import GameAttempt from '../models/GameAttempt.js';
import GameSkillProgress from '../models/GameSkillProgress.js';
import GameImportReceipt from '../models/GameImportReceipt.js';
import Student from '../models/Student.js';
import Standard from '../models/Standard.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import GameTeacherReward from '../models/GameTeacherReward.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { DEFAULT_SCHOOL_TIMEZONE, resolveTimeZone } from '../utils/schoolTimezone.js';
import { dateKeyFor, monthKeyForDateKey, weekKeyForDateKey } from '../services/languageGameScoring.js';
import { resolvePracticeQuestionType } from '../constants/practiceQuestionTypes.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { canonicalizeGameItems, sanitizePackItems, ITEM_TYPES } from '../services/languageGameItems.js';
import { buildPackTemplateCsv, PACK_CSV_TEMPLATES, SIMPLE_CSV_TEMPLATES, templatesForTarget } from '../services/languageGamePackCsv.js';
import { verifyPlanToken } from '../services/languageGameImportToken.js';
import {
    buildImportPlan,
    executeImportPlan,
    normalizeImportInput,
    previewResponseFor
} from '../services/languageGameImportPlan.js';
import {
    archiveWithRevision,
    ImportConflictError,
    revisionValue,
    saveWithRevision,
    touchReferencedSkills,
    uniqueSlugKey
} from '../services/languageGameAuthoring.js';
import { withTransaction } from '../utils/withTransaction.js';

// Route authorization combines role + roles[]; the controller must agree.
const roleSet = (req) => new Set([req.user?.role, ...(req.user?.roles || [])].filter(Boolean));
const isAdmin = (req) => ['admin', 'super_admin'].some((role) => roleSet(req).has(role));
const canManage = (req, doc) => Boolean(doc) && (isAdmin(req) || String(doc.owner) === String(req.user._id));

const importCtx = (req, session) => ({
    schoolId: req.schoolId,
    userId: req.user._id,
    isAdmin: isAdmin(req),
    session
});

const failWith = (res, error, fallback = 'Something went wrong. Try again.') => res
    .status(error.status || 500)
    .json({
        success: false,
        message: error.status ? error.message : fallback,
        ...(error.code ? { code: error.code } : {}),
        ...(error.data ? { data: error.data } : {})
    });

const normalizeSkillName = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const parseIdList = (value) => (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => mongoose.isValidObjectId(entry));

const skillIdSetFor = (items) => new Set(items.map((item) => String(item.skillId)));

// Null means General (untagged). Only active subjects of this school qualify.
const resolveSubjectId = async (req, value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (!mongoose.isValidObjectId(raw)) {
        const error = new Error('Choose a subject from the list.');
        error.status = 400;
        throw error;
    }
    const exists = await Subject.exists({ _id: raw, school: req.schoolId, isActive: true });
    if (!exists) {
        const error = new Error('The selected subject was not found.');
        error.status = 400;
        throw error;
    }
    return raw;
};

const subjectFilterFor = (req) => {
    const raw = String(req.query.subjectId || '').trim();
    if (!raw) return null;
    if (raw.toLowerCase() === 'general') return { subject: null };
    if (mongoose.isValidObjectId(raw)) return { subject: raw };
    return null;
};

const syncPackSkillIds = (items) => Array.from(skillIdSetFor(items)).map((id) => new mongoose.Types.ObjectId(id));

const skillSnapshotFor = (skills) => skills.map((skill) => ({
    skillId: skill._id,
    name: skill.name,
    nameAr: skill.nameAr || '',
    key: skill.key
}));

const uniqueErrors = (errors, limit = 200) => ({
    errors: errors.slice(0, limit),
    errorsTruncated: errors.length > limit
});

const SKILL_FIELD_LIMITS = { name: 160, nameAr: 160, description: 600, learningGoal: 300, category: 80, gradeLevel: 40 };
const PACK_FIELD_LIMITS = { title: 200, description: 800 };

const assertFieldLengths = (values, limits) => {
    for (const [field, max] of Object.entries(limits)) {
        if (values[field] !== undefined && String(values[field]).length > max) {
            const error = new Error(`${field} is longer than ${max} characters.`);
            error.status = 400;
            throw error;
        }
    }
};

// The same visibility rule everywhere: owners and admins manage their packs,
// everyone on staff can see published school-wide packs. Applied in the
// query so pagination cannot hide accessible packs.
const packVisibilityQuery = (req) => (isAdmin(req)
    ? { school: req.schoolId }
    : {
        school: req.schoolId,
        $or: [
            { owner: req.user._id },
            { visibility: 'school', status: 'published' }
        ]
    });

// Target-specific copyable prompt, generated from the same header list as
// the parser. Only teacher-authored skill metadata is included; no student
// data ever reaches an AI prompt from here.
const AI_ITEM_RULES = {
    multiple_choice: 'Each row is one multiple-choice question: fill option_1..option_6 with two to six distinct options and put the filled option column number in correct_option.',
    fill_in_blank: 'Each row is one typed-answer question: the prompt must contain exactly one ___ blank, put the answer in answer, and list extra accepted spellings in accepted_answers separated by semicolons.',
    true_false: 'Each row is one true/false statement: put true or false in correct_answer.',
    multiple_select: 'Each row is one select-all-that-apply question: fill option_1..option_6 with two to six distinct options and list the filled column numbers of ALL correct options in correct_answer separated by | (at least two correct).',
    matching: 'Each row is one matching question: put 2 to 6 pairs in matching_pairs as term::match separated by |, for example Mercury::1|Venus::2. Keep every term and match short.',
    ordering: 'Each row is one ordering question: put 3 to 8 items in ordering_items in the CORRECT order separated by >, for example Sunrise > Noon > Sunset. The app shuffles them for students.',
    numeric_response: 'Each row is one numeric question: put the answer rule in numeric_rule — a plain number for an exact answer (144), tolerance::3.14~0.01 for a ± tolerance, or range::10~20 for a range; add |unit::cm when a unit is required.'
};

const buildAiPrompt = (type, target, skill) => {
    const mixed = String(type || '').trim().toLowerCase() === 'mixed';
    const resolved = mixed ? 'mixed' : resolvePracticeQuestionType(type);
    const template = templatesForTarget(target)[resolved];
    if (!template) return '';
    const itemRule = mixed
        ? `Put each row's question type in the type column: ${ITEM_TYPES.join(', ')}. Fill only the answer columns that type uses and leave the rest empty. ${Object.entries(AI_ITEM_RULES).map(([key, rule]) => `${key}: ${rule}`).join(' ')}`
        : AI_ITEM_RULES[resolved] || '';
    const lines = [
        `Create a CSV file with exactly these columns, in this order: ${template.headers.join(', ')}.`,
        'Use plain text. Separate multiple accepted answers and standard codes with semicolons.',
        itemRule
    ];
    if (target === 'single') {
        lines.push(skill
            ? `Every question practices the skill "${skill.name}"${skill.gradeLevel ? ` (grade ${skill.gradeLevel})` : ''}${skill.language && skill.language !== 'mixed' ? `, written in ${skill.language === 'ar' ? 'Arabic' : 'English'}` : ''}.`
            : 'Every question practices one skill chosen in the import dialog.');
        lines.push('Do not add pack_key, pack_title, skill_key, skill_name, language or grade_levels columns; the destination is chosen in the app, not in the file.');
        lines.push('external_id is optional but keep it stable per question when updating. difficulty is 1, 2 or 3 (default 2). Leave standard_codes empty if unknown.');
    } else {
        lines.push('pack_key identifies the pack and external_id identifies the question; keep both stable when updating.');
        lines.push('skill_key groups questions by skill; add skill_name for skills that do not exist yet. language must be en, ar or mixed; grade_levels is semicolon-separated. Leave standard_codes empty if unknown.');
    }
    lines.push('Return only the CSV content, without comments or markdown.');
    return lines.join(' ');
};

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export const listSkills = asyncHandler(async (req, res) => {
    const query = { school: req.schoolId };
    if (req.query.status && ['draft', 'published', 'archived'].includes(req.query.status)) {
        query.status = req.query.status;
    } else {
        query.status = { $ne: 'archived' };
    }
    if (req.query.gradeLevel) query.gradeLevel = String(req.query.gradeLevel);
    const subjectFilter = subjectFilterFor(req);
    if (subjectFilter) Object.assign(query, subjectFilter);
    const skills = await GameSkill.find(query).sort({ updatedAt: -1 }).limit(500).lean();

    // Counts use the same pack visibility rule as the pack list, so a skill
    // never claims packs the teacher cannot open.
    const usagePacks = await GamePack.find({ ...packVisibilityQuery(req), status: { $ne: 'archived' } })
        .select('skillIds defaultSkillId items.skillId')
        .lean();
    const packUse = new Map();
    const itemUse = new Map();
    for (const pack of usagePacks) {
        const associated = new Set([
            ...(pack.skillIds || []).map(String),
            ...(pack.defaultSkillId ? [String(pack.defaultSkillId)] : [])
        ]);
        for (const skillId of associated) packUse.set(skillId, (packUse.get(skillId) || 0) + 1);
        for (const item of pack.items || []) {
            const skillId = String(item.skillId || '');
            if (skillId) itemUse.set(skillId, (itemUse.get(skillId) || 0) + 1);
        }
    }
    res.json({
        success: true,
        data: {
            skills: skills.map((skill) => ({
                ...skill,
                packCount: packUse.get(String(skill._id)) || 0,
                itemCount: itemUse.get(String(skill._id)) || 0
            })),
            truncated: skills.length === 500
        }
    });
});

const findSkillTwin = async (req, { name, gradeLevel, excludeId = null, includeArchived = false }) => {
    const query = { school: req.schoolId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    if (!includeArchived) query.status = { $ne: 'archived' };
    if (excludeId) query._id = { $ne: excludeId };
    const candidates = await GameSkill.find(query).select('_id name gradeLevel status').limit(20).lean();
    const wanted = normalizeSkillName(name);
    return candidates.find((skill) => normalizeSkillName(skill.name) === wanted
        && String(skill.gradeLevel || '').trim() === String(gradeLevel || '').trim()) || null;
};

export const createSkill = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'A skill needs a name.' });
    try {
        assertFieldLengths(body, SKILL_FIELD_LIMITS);
    } catch (error) {
        return failWith(res, error);
    }
    const gradeLevel = String(body.gradeLevel || '').trim();

    // Same name and grade means the teacher meant to reuse the skill, not to
    // create a second list of evidence for the same target. Archived twins
    // are surfaced too, because the school+key index spans every status.
    const twin = await findSkillTwin(req, { name, gradeLevel, includeArchived: true });
    if (twin) {
        return res.status(409).json({
            success: false,
            message: twin.status === 'archived'
                ? `An archived skill named "${twin.name}" already exists. Restore it instead of creating a new one.`
                : `A skill named "${twin.name}"${gradeLevel ? ` for grade ${gradeLevel}` : ''} already exists.`,
            data: { skillId: twin._id, archived: twin.status === 'archived' }
        });
    }

    const standardIds = parseIdList(body.standardIds);
    if (standardIds.length > 0) {
        const count = await Standard.countDocuments({ _id: { $in: standardIds }, school: req.schoolId });
        if (count !== new Set(standardIds).size) {
            return res.status(400).json({ success: false, message: 'One of the selected standards was not found.' });
        }
    }
    let subject;
    try {
        subject = await resolveSubjectId(req, body.subject);
    } catch (error) {
        return failWith(res, error);
    }
    const key = await uniqueSlugKey(GameSkill, [name, gradeLevel].filter(Boolean).join('-'), { schoolId: req.schoolId });
    const skill = await GameSkill.create({
        school: req.schoolId,
        owner: req.user._id,
        key,
        name,
        nameAr: String(body.nameAr || '').trim(),
        description: String(body.description || '').trim(),
        learningGoal: String(body.learningGoal || '').trim(),
        category: String(body.category || '').trim(),
        gradeLevel,
        subject,
        language: ['en', 'ar', 'mixed'].includes(body.language) ? body.language : 'en',
        standardIds: [...new Set(standardIds)],
        source: 'manual'
    });
    res.status(201).json({ success: true, data: { skill } });
});

export const updateSkill = asyncHandler(async (req, res) => {
    const skill = await GameSkill.findOne({ _id: req.params.id, school: req.schoolId });
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found.' });
    if (!canManage(req, skill)) return res.status(403).json({ success: false, message: 'Only the skill owner can edit it.' });
    const body = req.body || {};
    try {
        assertFieldLengths(body, SKILL_FIELD_LIMITS);
        const editable = ['name', 'nameAr', 'description', 'learningGoal', 'category', 'gradeLevel'];
        for (const field of editable) {
            if (body[field] !== undefined) skill[field] = String(body[field] || '').trim();
        }
        if (!skill.name) return res.status(400).json({ success: false, message: 'A skill needs a name.' });
        if (body.name !== undefined || body.gradeLevel !== undefined) {
            const twin = await findSkillTwin(req, { name: skill.name, gradeLevel: skill.gradeLevel, excludeId: skill._id });
            if (twin) {
                return res.status(409).json({
                    success: false,
                    message: `A skill named "${twin.name}"${skill.gradeLevel ? ` for grade ${skill.gradeLevel}` : ''} already exists.`,
                    data: { skillId: twin._id }
                });
            }
        }
        if (body.language !== undefined && ['en', 'ar', 'mixed'].includes(body.language)) skill.language = body.language;
        if (body.standardIds !== undefined) {
            const standardIds = parseIdList(body.standardIds);
            if (standardIds.length > 0) {
                const count = await Standard.countDocuments({ _id: { $in: standardIds }, school: req.schoolId });
                if (count !== new Set(standardIds).size) {
                    return res.status(400).json({ success: false, message: 'One of the selected standards was not found.' });
                }
            }
            skill.standardIds = [...new Set(standardIds)];
        }
        if (body.subject !== undefined) {
            skill.subject = await resolveSubjectId(req, body.subject);
        }

        let saved = null;
        if (body.status === 'archived' && skill.status !== 'archived') {
            // Historical snapshots keep the skill forever; only live draft
            // questions block archiving. The transaction makes the check and
            // the write conflict with a concurrent import adding references.
            await withTransaction(async (session) => {
                const packsUsing = await GamePack.countDocuments({
                    school: req.schoolId,
                    status: { $ne: 'archived' },
                    $or: [{ 'items.skillId': skill._id }, { defaultSkillId: skill._id }]
                }).session(session);
                if (packsUsing > 0) {
                    const error = new Error(`This skill still tags questions in ${packsUsing} pack${packsUsing === 1 ? '' : 's'}. Remove its questions from those packs before archiving.`);
                    error.status = 409;
                    throw error;
                }
                saved = await archiveWithRevision(skill, { field: 'revision', schoolId: req.schoolId, session });
            });
        } else {
            if (body.status === 'draft' && skill.status === 'archived') skill.status = 'draft';
            saved = await saveWithRevision(skill, { field: 'revision', schoolId: req.schoolId });
        }
        res.json({ success: true, data: { skill: saved } });
    } catch (error) {
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

// Permanent removal is only offered for a skill nothing depends on. A skill
// that students practiced keeps their progress rows readable; those rows join
// the skill document for their name, so the document is archived instead of
// deleted and leaves every active list, exactly like a used pack.
export const deleteSkill = asyncHandler(async (req, res) => {
    const skill = await GameSkill.findOne({ _id: req.params.id, school: req.schoolId });
    if (!skill) return res.status(404).json({ success: false, message: 'Skill not found.' });
    if (!canManage(req, skill)) return res.status(403).json({ success: false, message: 'Only the skill owner can delete it.' });
    try {
        let archived = false;
        await withTransaction(async (session) => {
            const packsUsing = await GamePack.countDocuments({
                school: req.schoolId,
                status: { $ne: 'archived' },
                $or: [{ 'items.skillId': skill._id }, { defaultSkillId: skill._id }]
            }).session(session);
            if (packsUsing > 0) {
                const error = new Error(`This skill still tags questions in ${packsUsing} pack${packsUsing === 1 ? '' : 's'}. Remove its questions from those packs before deleting it.`);
                error.status = 409;
                throw error;
            }
            const practiced = await GameSkillProgress.countDocuments({
                school: req.schoolId,
                skillId: skill._id
            }).session(session);
            if (practiced > 0) {
                await archiveWithRevision(skill, { field: 'revision', schoolId: req.schoolId, session });
                archived = true;
                return;
            }
            await GameSkill.deleteOne({ _id: skill._id, school: req.schoolId }).session(session);
        });
        res.json({ success: true, data: { deleted: !archived, archived } });
    } catch (error) {
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

/* ------------------------------------------------------------------ */
/* Packs                                                               */
/* ------------------------------------------------------------------ */

const packSummary = (pack, skillNames = new Map()) => ({
    _id: pack._id,
    key: pack.key,
    title: pack.title,
    description: pack.description,
    language: pack.language,
    gradeLevels: pack.gradeLevels,
    subject: pack.subject || null,
    visibility: pack.visibility,
    status: pack.status,
    itemCount: (pack.items || []).length,
    itemTypeCounts: (pack.items || []).reduce((counts, item) => {
        counts[item.type] = (counts[item.type] || 0) + 1;
        return counts;
    }, {}),
    skills: [...new Set([
        ...(pack.skillIds || []).map(String),
        ...(pack.defaultSkillId ? [String(pack.defaultSkillId)] : [])
    ])]
        .map((id) => ({ _id: id, name: skillNames.get(id) || '' }))
        .filter((skill) => skill.name),
    defaultSkillId: pack.defaultSkillId || null,
    authoringRevision: revisionValue(pack, 'authoringRevision') ?? 0,
    revisionVersion: pack.publishedRevision?.version || 0,
    owner: pack.owner,
    updatedAt: pack.updatedAt
});

const skillNamesFor = async (packs) => {
    const skillIds = [...new Set(packs.flatMap((pack) => [
        ...(pack.skillIds || []).map(String),
        ...(pack.defaultSkillId ? [String(pack.defaultSkillId)] : [])
    ]))];
    const skillNames = new Map();
    if (skillIds.length > 0) {
        const docs = await GameSkill.find({ _id: { $in: skillIds } }).select('_id name').lean();
        for (const skill of docs) skillNames.set(String(skill._id), skill.name);
    }
    return skillNames;
};

export const listPacks = asyncHandler(async (req, res) => {
    const query = { ...packVisibilityQuery(req), status: { $ne: 'archived' } };
    if (req.query.status && ['draft', 'published'].includes(req.query.status)) query.status = req.query.status;
    if (req.query.skillId && mongoose.isValidObjectId(req.query.skillId)) {
        query.$and = [{ $or: [{ skillIds: req.query.skillId }, { defaultSkillId: req.query.skillId }] }];
    }
    const subjectFilter = subjectFilterFor(req);
    if (subjectFilter) Object.assign(query, subjectFilter);
    const packs = await GamePack.find(query).sort({ updatedAt: -1 }).limit(500).lean();
    const skillNames = await skillNamesFor(packs);
    res.json({
        success: true,
        data: {
            packs: packs.map((pack) => packSummary(pack, skillNames)),
            truncated: packs.length === 500
        }
    });
});

export const getPack = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId }).lean();
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    const authorized = canManage(req, pack) || (pack.visibility === 'school' && pack.status === 'published');
    if (!authorized) return res.status(403).json({ success: false, message: 'This pack is private.' });
    res.json({
        success: true,
        data: {
            pack: { ...pack, authoringRevision: revisionValue(pack, 'authoringRevision') ?? 0 },
            canEdit: canManage(req, pack)
        }
    });
});

const activeSkillsExist = async (skillIds, schoolId, session) => {
    const ids = [...new Set(skillIds.map(String))];
    if (ids.length === 0) return true;
    const q = GameSkill.find({ _id: { $in: ids }, school: schoolId, status: { $ne: 'archived' } }).select('_id');
    const found = await (session ? q.session(session) : q).lean();
    return found.length === ids.length;
};

export const createPack = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'A pack needs a title.' });
    try {
        assertFieldLengths(body, PACK_FIELD_LIMITS);
    } catch (error) {
        return failWith(res, error);
    }
    const defaultSkillId = String(body.defaultSkillId || '').trim();
    if (defaultSkillId && !mongoose.isValidObjectId(defaultSkillId)) {
        return res.status(400).json({ success: false, message: 'Choose a skill for this pack.' });
    }
    let subject;
    try {
        subject = await resolveSubjectId(req, body.subject);
    } catch (error) {
        return failWith(res, error);
    }
    if (!subject && defaultSkillId) {
        const defaultSkill = await GameSkill.findOne({ _id: defaultSkillId, school: req.schoolId }).select('subject').lean();
        subject = defaultSkill?.subject ? String(defaultSkill.subject) : null;
    }
    const { items, errors } = sanitizePackItems(body.items || []);
    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: 'Some questions are incomplete.', data: uniqueErrors(errors) });
    }
    const referenced = [...new Set([...items.map((item) => item.skillId), ...(defaultSkillId ? [defaultSkillId] : [])])];
    if (!await activeSkillsExist(referenced, req.schoolId)) {
        return res.status(400).json({ success: false, message: 'One of the selected skills was not found or is archived.' });
    }
    try {
        const pack = await withTransaction(async (session) => {
            await touchReferencedSkills(referenced, { schoolId: req.schoolId, session });
            const key = await uniqueSlugKey(GamePack, title, { schoolId: req.schoolId, session });
            const [created] = await GamePack.create([{
                school: req.schoolId,
                owner: req.user._id,
                key,
                title,
                description: String(body.description || '').trim(),
                language: ['en', 'ar', 'mixed'].includes(body.language) ? body.language : 'en',
                gradeLevels: (Array.isArray(body.gradeLevels) ? body.gradeLevels : []).map((level) => String(level).trim()).filter(Boolean),
                subject,
                visibility: body.visibility === 'school' ? 'school' : 'private',
                defaultSkillId: defaultSkillId || null,
                items,
                skillIds: syncPackSkillIds(items),
                authoringRevision: 1
            }], { session });
            return created;
        });
        res.status(201).json({ success: true, data: { pack } });
    } catch (error) {
        if (error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

export const updatePack = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId });
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    if (!canManage(req, pack)) return res.status(403).json({ success: false, message: 'Only the pack owner can edit it.' });
    if (pack.status === 'archived') return res.status(409).json({ success: false, message: 'This pack is archived. Restore it before editing.' });
    const body = req.body || {};
    const currentRevision = revisionValue(pack, 'authoringRevision');
    if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== (currentRevision ?? 0)) {
        return res.status(409).json({
            success: false,
            message: 'This pack changed since you opened it. Reload it before saving.',
            code: 'REVISION_CONFLICT'
        });
    }
    try {
        assertFieldLengths(body, PACK_FIELD_LIMITS);
        let touchedSkills = null;
        if (body.items !== undefined) {
            const { items, errors } = sanitizePackItems(body.items);
            if (errors.length > 0) {
                return res.status(400).json({ success: false, message: 'Some questions are incomplete.', data: uniqueErrors(errors) });
            }
            if (!await activeSkillsExist(items.map((item) => item.skillId), req.schoolId)) {
                return res.status(400).json({ success: false, message: 'One of the question skills was not found or is archived.' });
            }
            pack.items = items;
            pack.skillIds = syncPackSkillIds(items);
            touchedSkills = items.map((item) => item.skillId);
            // The published revision stays pinned for open assignments; the
            // pack must be published again before students can start from it.
            if (pack.status === 'published') pack.status = 'draft';
        }
        if (body.defaultSkillId !== undefined) {
            const next = String(body.defaultSkillId || '').trim();
            if (next && !mongoose.isValidObjectId(next)) {
                return res.status(400).json({ success: false, message: 'Choose a skill for this pack.' });
            }
            if (next && !await activeSkillsExist([next], req.schoolId)) {
                return res.status(400).json({ success: false, message: 'The selected skill was not found or is archived.' });
            }
            pack.defaultSkillId = next || null;
            if (next) touchedSkills = [...(touchedSkills || []), next];
        }
        if (body.title !== undefined) {
            pack.title = String(body.title || '').trim();
            if (!pack.title) return res.status(400).json({ success: false, message: 'A pack needs a title.' });
        }
        if (body.description !== undefined) pack.description = String(body.description || '').trim();
        if (body.language !== undefined && ['en', 'ar', 'mixed'].includes(body.language)) pack.language = body.language;
        if (body.visibility !== undefined) pack.visibility = body.visibility === 'school' ? 'school' : 'private';
        if (body.gradeLevels !== undefined) {
            pack.gradeLevels = (Array.isArray(body.gradeLevels) ? body.gradeLevels : [])
                .map((level) => String(level).trim()).filter(Boolean);
        }
        if (body.subject !== undefined) {
            pack.subject = await resolveSubjectId(req, body.subject);
        }
        let saved = null;
        await withTransaction(async (session) => {
            if (touchedSkills) await touchReferencedSkills(touchedSkills, { schoolId: req.schoolId, session });
            saved = await saveWithRevision(pack, { field: 'authoringRevision', schoolId: req.schoolId, session });
        });
        res.json({ success: true, data: { pack: saved } });
    } catch (error) {
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

export const publishPack = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId });
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    if (!canManage(req, pack)) return res.status(403).json({ success: false, message: 'Only the pack owner can publish it.' });
    if (pack.status === 'archived') return res.status(409).json({ success: false, message: 'This pack is archived. Restore it before publishing.' });
    if (pack.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Add at least one question before publishing.' });
    }
    try {
        let saved = null;
        await withTransaction(async (session) => {
            const skills = await GameSkill.find({
                _id: { $in: pack.items.map((item) => item.skillId) },
                school: req.schoolId
            }).session(session).lean();
            if (skills.length !== skillIdSetFor(pack.items).size) {
                const error = new Error('One of the question skills was not found.');
                error.status = 400;
                throw error;
            }
            await touchReferencedSkills(pack.items.map((item) => item.skillId), { schoolId: req.schoolId, session });
            pack.publishedRevision = {
                version: (pack.publishedRevision?.version || 0) + 1,
                publishedAt: new Date(),
                publishedBy: req.user._id,
                items: canonicalizeGameItems(pack.items),
                skills: skillSnapshotFor(skills)
            };
            pack.status = 'published';
            pack.skillIds = syncPackSkillIds(pack.items);
            saved = await saveWithRevision(pack, { field: 'authoringRevision', schoolId: req.schoolId, session });
            await GameSkill.updateMany(
                { _id: { $in: pack.skillIds }, school: req.schoolId, status: 'draft' },
                { $set: { status: 'published' } },
                { session }
            );
        });
        res.json({ success: true, data: { pack: packSummary(saved) } });
    } catch (error) {
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

export const archivePack = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId });
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    if (!canManage(req, pack)) return res.status(403).json({ success: false, message: 'Only the pack owner can archive it.' });
    try {
        const saved = await archiveWithRevision(pack, { field: 'authoringRevision', schoolId: req.schoolId });
        res.json({ success: true, data: { pack: packSummary(saved) } });
    } catch (error) {
        if (error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

// Assignments and sessions keep the pack id for their reports and history, so
// a pack with either is archived instead of removed. Its open assignments are
// closed in the same write, which takes it off every student list while the
// stored pack still supplies titles and reports for past work.
export const deletePack = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId });
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    if (!canManage(req, pack)) return res.status(403).json({ success: false, message: 'Only the pack owner can delete it.' });
    try {
        let archived = false;
        let closedAssignments = 0;
        await withTransaction(async (session) => {
            const assignments = await GameAssignment.countDocuments({
                school: req.schoolId,
                pack: pack._id
            }).session(session);
            const sessions = await GameSession.countDocuments({
                school: req.schoolId,
                pack: pack._id
            }).session(session);
            if (assignments === 0 && sessions === 0) {
                await GamePack.deleteOne({ _id: pack._id, school: req.schoolId }).session(session);
                return;
            }
            const closed = await GameAssignment.updateMany(
                { school: req.schoolId, pack: pack._id, status: 'open' },
                { $set: { status: 'closed' } },
                { session }
            );
            closedAssignments = closed.modifiedCount ?? closed.matchedCount ?? 0;
            await archiveWithRevision(pack, { field: 'authoringRevision', schoolId: req.schoolId, session });
            archived = true;
        });
        res.json({ success: true, data: { deleted: true, archived, closedAssignments } });
    } catch (error) {
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

const importTarget = (req) => (req.query.target === 'bulk' ? 'bulk' : 'single');

const skillForTemplate = async (req) => {
    const skillId = String(req.query.skillId || '');
    if (!mongoose.isValidObjectId(skillId)) return null;
    return GameSkill.findOne({ _id: skillId, school: req.schoolId }).select('name gradeLevel language').lean();
};

export const importTemplate = asyncHandler(async (req, res) => {
    const type = String(req.params.type || '');
    const target = importTarget(req);
    const csv = buildPackTemplateCsv(type, target);
    if (!csv) return res.status(404).json({ success: false, message: 'Unknown template.' });
    const skill = target === 'single' ? await skillForTemplate(req) : null;
    const namePart = skill ? `-${String(skill.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}` : '';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="skillpath-${type}${namePart}.csv"`);
    res.send(csv);
});

export const importPrompt = asyncHandler(async (req, res) => {
    const requested = String(req.params.type || '');
    const type = requested.trim().toLowerCase() === 'mixed' ? 'mixed' : resolvePracticeQuestionType(requested);
    const target = importTarget(req);
    const templates = target === 'bulk' ? PACK_CSV_TEMPLATES : SIMPLE_CSV_TEMPLATES;
    if (!templates[type]) return res.status(404).json({ success: false, message: 'Unknown template.' });
    const skill = target === 'single' ? await skillForTemplate(req) : null;
    res.json({
        success: true,
        data: { type, target, headers: templates[type].headers, prompt: buildAiPrompt(type, target, skill) }
    });
});

// Pool imports re-check the teacher's class scope at commit time too, not
// only at preview, so a reassignment between the two cannot slip through.
const poolCtxFor = async (req, input, session = null) => {
    const ctx = importCtx(req, session);
    if (input.source === 'pool' && !ctx.isAdmin) {
        const teacher = await resolveTeacherProfile(req);
        ctx.teacherClassIds = teacher ? (await getTeacherClassIds(teacher._id)).map(String) : [];
    }
    return ctx;
};

export const previewImport = asyncHandler(async (req, res) => {
    const input = normalizeImportInput(req.body);
    try {
        const ctx = await poolCtxFor(req, input);
        const plan = await buildImportPlan(input, ctx);
        res.json({ success: true, data: previewResponseFor(plan, ctx) });
    } catch (error) {
        if (error.status) return failWith(res, error);
        throw error;
    }
});

const receiptReplay = async (req, submissionId, fingerprint) => {
    const existing = await GameImportReceipt.findOne({
        school: req.schoolId,
        actor: req.user._id,
        submissionId
    }).lean();
    if (!existing) return null;
    if (existing.fingerprint !== fingerprint) {
        const error = new Error('This import was already submitted with different content. Preview the file again.');
        error.status = 409;
        error.code = 'SUBMISSION_REUSED';
        throw error;
    }
    return { ...existing.result, replayed: true };
};

export const commitImport = asyncHandler(async (req, res) => {
    const input = normalizeImportInput(req.body);
    const submissionId = String(req.body?.submissionId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(submissionId)) {
        return res.status(400).json({ success: false, message: 'Missing import submission id. Preview the file again.' });
    }
    let verified;
    try {
        verified = verifyPlanToken({ token: String(req.body?.token || ''), schoolId: req.schoolId, userId: req.user._id });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }

    // A retry of an already-committed import returns the stored result
    // without touching anything, even if the pack has moved on since.
    try {
        const replay = await receiptReplay(req, submissionId, verified.fingerprint);
        if (replay) return res.json({ success: true, data: replay });
    } catch (error) {
        return failWith(res, error);
    }

    const writeCommit = async () => {
        let result = null;
        await withTransaction(async (session) => {
            const replay = await receiptReplay(req, submissionId, verified.fingerprint);
            if (replay) {
                result = replay;
                return;
            }
            const ctx = await poolCtxFor(req, input, session);
            const plan = await buildImportPlan(input, ctx);
            if (!plan.canCommit) {
                const error = new Error(plan.confirmationsMissing.length > 0
                    ? 'Confirm the reviewed changes before importing.'
                    : 'Fix the reported problems, then preview the file again.');
                error.status = 422;
                error.data = {
                    errors: plan.csv.errors.slice(0, 200),
                    problems: plan.problems,
                    confirmationsMissing: plan.confirmationsMissing
                };
                throw error;
            }
            if (plan.fingerprint !== verified.fingerprint) {
                throw new ImportConflictError('The destination changed since the preview. Preview the file again.');
            }
            const executed = await executeImportPlan(plan, ctx);
            await GameImportReceipt.create([{
                school: req.schoolId,
                actor: req.user._id,
                submissionId,
                fingerprint: verified.fingerprint,
                result: executed
            }], { session });
            result = executed;
        });
        return result;
    };

    try {
        const result = await writeCommit();
        return res.json({ success: true, data: result });
    } catch (error) {
        // Two identical submissions racing: the loser's transaction rolled
        // back completely, so returning the winner's receipt is safe.
        if (error.code === 11000) {
            try {
                const replay = await receiptReplay(req, submissionId, verified.fingerprint);
                if (replay) return res.json({ success: true, data: replay });
            } catch (replayError) {
                return failWith(res, replayError);
            }
        }
        if (error.status || error instanceof ImportConflictError) return failWith(res, error);
        throw error;
    }
});

/* ------------------------------------------------------------------ */
/* Question pool import                                                */
/* ------------------------------------------------------------------ */

export const listQuestionPools = asyncHandler(async (req, res) => {
    const query = { school: req.schoolId, status: 'published', isActive: true };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) query.subject = req.query.subjectId;
    if (req.query.standardId && mongoose.isValidObjectId(req.query.standardId)) query.standard = req.query.standardId;
    if (!isAdmin(req)) {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Only a teacher profile can import from question pools.' });
        query.class = { $in: await getTeacherClassIds(teacher._id) };
    }
    const pools = await StandardQuestionPool.find(query)
        .sort({ updatedAt: -1 })
        .limit(100)
        .select('standard class subject currentVersion questions.questionText questions.questionType questions.difficulty questions.passageText updatedAt')
        .lean();
    const [standards, classes, subjects] = await Promise.all([
        Standard.find({ _id: { $in: [...new Set(pools.map((pool) => String(pool.standard)))] } }).select('code name').lean(),
        Class.find({ _id: { $in: [...new Set(pools.map((pool) => String(pool.class)))] } }).select('name section').lean(),
        Subject.find({ _id: { $in: [...new Set(pools.map((pool) => String(pool.subject)))] } }).select('name').lean()
    ]);
    const standardById = new Map(standards.map((standard) => [String(standard._id), standard]));
    const classById = new Map(classes.map((entry) => [String(entry._id), entry]));
    const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));
    res.json({
        success: true,
        data: {
            pools: pools.map((pool) => ({
                _id: pool._id,
                currentVersion: pool.currentVersion || 1,
                standard: standardById.get(String(pool.standard)) || null,
                class: classById.get(String(pool.class)) || null,
                subject: subjectById.get(String(pool.subject)) || null,
                questionCount: (pool.questions || []).length,
                typeCounts: (pool.questions || []).reduce((counts, question) => {
                    const type = resolvePracticeQuestionType(question.questionType);
                    counts[type] = (counts[type] || 0) + 1;
                    return counts;
                }, {}),
                questions: (pool.questions || []).map((question) => ({
                    _id: question._id,
                    questionText: String(question.questionText || '').slice(0, 200),
                    questionType: resolvePracticeQuestionType(question.questionType),
                    difficulty: question.difficulty || 'medium',
                    hasPassage: Boolean(question.passageText)
                })),
                updatedAt: pool.updatedAt
            })),
            truncated: pools.length === 100
        }
    });
});

export const previewPoolImport = asyncHandler(async (req, res) => {
    const input = normalizeImportInput({ ...(req.body || {}), source: 'pool' });
    try {
        const ctx = await poolCtxFor(req, input);
        const plan = await buildImportPlan(input, ctx);
        res.json({ success: true, data: previewResponseFor(plan, ctx) });
    } catch (error) {
        if (error.status) return failWith(res, error);
        throw error;
    }
});

/* ------------------------------------------------------------------ */
/* Teacher rewards                                                     */
/* ------------------------------------------------------------------ */

const REWARD_NOTE_LIMIT = 300;

const teacherOfClass = async (req, classId) => {
    if (isAdmin(req)) return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;
    return (await getTeacherClassIds(teacher._id)).map(String).includes(String(classId));
};

const rewardPeriodKey = async (periodType, provided) => {
    if (provided || periodType === 'custom') return provided;
    const config = await SchoolCalendarConfig.findOne().select('timezone').lean();
    const timeZone = resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
    const dayKey = dateKeyFor(new Date(), timeZone);
    return periodType === 'week' ? weekKeyForDateKey(dayKey) : monthKeyForDateKey(dayKey);
};

export const giveReward = asyncHandler(async (req, res) => {
    const classId = String(req.params.classId || '');
    if (!mongoose.isValidObjectId(classId)) return res.status(400).json({ success: false, message: 'Choose a class.' });
    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });
    if (!await teacherOfClass(req, classId)) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this class.' });
    }
    const body = req.body || {};
    const studentId = String(body.studentId || '').trim();
    if (!mongoose.isValidObjectId(studentId)) return res.status(400).json({ success: false, message: 'Choose a student.' });
    const student = await Student.findOne({ _id: studentId, school: req.schoolId }).select('currentClass enrolledClasses').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    const inClass = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String).includes(classId);
    if (!inClass) return res.status(400).json({ success: false, message: 'This student is not in the selected class.' });
    const note = String(body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'Write a short note for the student.' });
    if (note.length > REWARD_NOTE_LIMIT) {
        return res.status(400).json({ success: false, message: `Keep the note under ${REWARD_NOTE_LIMIT} characters.` });
    }
    const periodType = ['week', 'month', 'custom'].includes(body.periodType) ? body.periodType : 'custom';
    const providedKey = String(body.periodKey || '').trim();
    if (providedKey.length > 20) return res.status(400).json({ success: false, message: 'The period label is too long.' });
    const periodKey = await rewardPeriodKey(periodType, providedKey);
    const reward = await GameTeacherReward.create({
        school: req.schoolId,
        class: classId,
        student: studentId,
        issuedBy: req.user._id,
        note,
        periodType,
        periodKey
    });
    res.status(201).json({
        success: true,
        data: {
            reward: {
                _id: reward._id,
                student: reward.student,
                note: reward.note,
                periodType: reward.periodType,
                periodKey: reward.periodKey,
                createdAt: reward.createdAt
            }
        }
    });
});

export const listClassRewards = asyncHandler(async (req, res) => {
    const classId = String(req.params.classId || '');
    if (!mongoose.isValidObjectId(classId)) return res.status(400).json({ success: false, message: 'Choose a class.' });
    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found.' });
    if (!await teacherOfClass(req, classId)) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this class.' });
    }
    const rewards = await GameTeacherReward.find({ school: req.schoolId, class: classId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    const [students, issuers] = await Promise.all([
        Student.find({ _id: { $in: [...new Set(rewards.map((reward) => String(reward.student)))] } }).select('firstName lastName').lean(),
        User.find({ _id: { $in: [...new Set(rewards.map((reward) => String(reward.issuedBy)))] } }).select('firstName lastName').lean()
    ]);
    const fullName = (person) => `${person.firstName || ''} ${person.lastName || ''}`.trim();
    const studentNames = new Map(students.map((student) => [String(student._id), fullName(student)]));
    const issuerNames = new Map(issuers.map((user) => [String(user._id), fullName(user)]));
    res.json({
        success: true,
        data: {
            rewards: rewards.map((reward) => ({
                _id: reward._id,
                studentId: String(reward.student),
                studentName: studentNames.get(String(reward.student)) || '',
                note: reward.note,
                periodType: reward.periodType,
                periodKey: reward.periodKey,
                issuedByName: issuerNames.get(String(reward.issuedBy)) || '',
                createdAt: reward.createdAt
            }))
        }
    });
});

export const myRewards = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId })
        .select('_id')
        .sort({ createdAt: -1 })
        .lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found.' });
    const rewards = await GameTeacherReward.find({ school: req.schoolId, student: student._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    const issuers = await User.find({ _id: { $in: [...new Set(rewards.map((reward) => String(reward.issuedBy)))] } })
        .select('firstName lastName')
        .lean();
    const names = new Map(issuers.map((user) => [String(user._id), `${user.firstName || ''} ${user.lastName || ''}`.trim()]));
    res.json({
        success: true,
        data: {
            rewards: rewards.map((reward) => ({
                _id: reward._id,
                note: reward.note,
                periodType: reward.periodType,
                periodKey: reward.periodKey,
                teacherName: names.get(String(reward.issuedBy)) || '',
                createdAt: reward.createdAt
            }))
        }
    });
});

/* ------------------------------------------------------------------ */
/* Assignments and reports                                             */
/* ------------------------------------------------------------------ */

const teacherStudentIdsForClasses = async (classIds) => {
    const students = await Student.find({
        status: 'active',
        $or: [
            { currentClass: { $in: classIds } },
            { enrolledClasses: { $in: classIds } }
        ]
    }).select('_id').lean();
    return students.map((student) => student._id);
};

export const createAssignment = asyncHandler(async (req, res) => {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return res.status(403).json({ success: false, message: 'Only a teacher profile can assign practice.' });
    const body = req.body || {};
    if (!mongoose.isValidObjectId(body.packId)) {
        return res.status(400).json({ success: false, message: 'Choose a pack to assign.' });
    }
    const pack = await GamePack.findOne({ _id: body.packId, school: req.schoolId }).lean();
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    // Knowing the id of another teacher's private pack must not grant the
    // right to assign it, even when it is published.
    if (!canManage(req, pack) && pack.visibility !== 'school') {
        return res.status(403).json({ success: false, message: 'This pack is private.' });
    }
    if (pack.status !== 'published' || !pack.publishedRevision) {
        return res.status(400).json({ success: false, message: 'Publish the pack before assigning it.' });
    }

    const classIds = parseIdList(body.classIds);
    const teacherClassIds = (await getTeacherClassIds(teacher._id)).map(String);
    const unauthorized = classIds.filter((classId) => !teacherClassIds.includes(String(classId)));
    if (unauthorized.length > 0) {
        return res.status(403).json({ success: false, message: 'You are not assigned to one of the selected classes.' });
    }
    const explicitStudentIds = parseIdList(body.studentIds);
    if (explicitStudentIds.length > 0) {
        const chosen = await Student.find({ _id: { $in: explicitStudentIds } })
            .select('currentClass enrolledClasses')
            .lean();
        const outside = chosen.filter((student) => {
            const classIdsForStudent = [student.currentClass, ...(student.enrolledClasses || [])]
                .filter(Boolean)
                .map(String);
            return !classIdsForStudent.some((classId) => teacherClassIds.includes(classId));
        });
        if (outside.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'One of the selected students is not in a class you teach.'
            });
        }
    }
    const fromClasses = classIds.length > 0 ? await teacherStudentIdsForClasses(classIds) : [];
    const studentIds = [...new Set([...fromClasses, ...explicitStudentIds].map(String))];

    const recipientPool = classIds.length > 0 ? studentIds : explicitStudentIds.map(String);
    if (recipientPool.length === 0) {
        return res.status(400).json({ success: false, message: 'Choose at least one class or student.' });
    }
    const validStudents = await Student.find({ _id: { $in: studentIds } }).select('_id').lean();
    if (validStudents.length !== studentIds.length) {
        return res.status(400).json({ success: false, message: 'One of the selected students was not found.' });
    }

    const settingsInput = body.settings || {};
    const clamp = (value, min, max, fallback) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
    };
    const dueDate = settingsInput.dueDate ? new Date(settingsInput.dueDate) : null;
    if (settingsInput.dueDate && Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({ success: false, message: 'The due date is not a valid date.' });
    }

    const assignment = await GameAssignment.create({
        school: req.schoolId,
        teacher: teacher._id,
        pack: pack._id,
        packRevisionVersion: pack.publishedRevision.version,
        items: canonicalizeGameItems(pack.publishedRevision.items),
        mode: body.mode === 'quiz' ? 'quiz' : 'practice',
        classIds: classIds.map((id) => new mongoose.Types.ObjectId(id)),
        studentIds: studentIds.map((id) => new mongoose.Types.ObjectId(id)),
        settings: {
            shuffle: settingsInput.shuffle !== false,
            itemCount: clamp(settingsInput.itemCount, 1, Math.min(100, pack.publishedRevision.items.length), pack.publishedRevision.items.length),
            attemptsAllowed: clamp(settingsInput.attemptsAllowed, 1, 5, 1),
            showAnswersAfter: settingsInput.showAnswersAfter !== false,
            timePerItemSec: clamp(settingsInput.timePerItemSec, 0, 300, 0),
            dueDate
        }
    });
    res.status(201).json({
        success: true,
        data: {
            assignment: {
                _id: assignment._id,
                pack: { _id: pack._id, title: pack.title },
                mode: assignment.mode,
                settings: assignment.settings,
                studentCount: studentIds.length,
                status: assignment.status,
                createdAt: assignment.createdAt
            }
        }
    });
});

export const listAssignments = asyncHandler(async (req, res) => {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return res.status(403).json({ success: false, message: 'Only a teacher profile can see assignments.' });
    const assignments = await GameAssignment.find({ teacher: teacher._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    const packIds = [...new Set(assignments.map((assignment) => String(assignment.pack)))];
    const packs = await GamePack.find({ _id: { $in: packIds } }).select('title').lean();
    const packTitles = new Map(packs.map((pack) => [String(pack._id), pack.title]));
    const sessionCounts = await GameSession.aggregate([
        { $match: { assignment: { $in: assignments.map((assignment) => assignment._id) } } },
        { $group: { _id: '$assignment', sessions: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
    ]);
    const counts = new Map(sessionCounts.map((row) => [String(row._id), row]));
    res.json({
        success: true,
        data: {
            assignments: assignments.map((assignment) => ({
                _id: assignment._id,
                packId: assignment.pack,
                packTitle: packTitles.get(String(assignment.pack)) || '',
                mode: assignment.mode,
                settings: assignment.settings,
                status: assignment.status,
                studentCount: (assignment.studentIds || []).length,
                classCount: (assignment.classIds || []).length,
                sessions: counts.get(String(assignment._id))?.sessions || 0,
                completed: counts.get(String(assignment._id))?.completed || 0,
                createdAt: assignment.createdAt
            }))
        }
    });
});

export const closeAssignment = asyncHandler(async (req, res) => {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return res.status(403).json({ success: false, message: 'Only a teacher profile can close an assignment.' });
    const assignment = await GameAssignment.findOne({ _id: req.params.id, teacher: teacher._id });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    assignment.status = 'closed';
    await assignment.save();
    res.json({ success: true, data: { assignment: { _id: assignment._id, status: assignment.status } } });
});

export const packReport = asyncHandler(async (req, res) => {
    const pack = await GamePack.findOne({ _id: req.params.id, school: req.schoolId }).lean();
    if (!pack) return res.status(404).json({ success: false, message: 'Pack not found.' });
    const teacher = await resolveTeacherProfile(req);
    if (!isAdmin(req) && (!teacher || String(pack.owner) !== String(req.user._id))) {
        return res.status(403).json({ success: false, message: 'Only the pack owner can see its report.' });
    }
    const assignmentQuery = teacher ? { pack: pack._id, teacher: teacher._id } : { pack: pack._id };
    const assignments = await GameAssignment.find(assignmentQuery).select('_id studentIds').lean();
    const sessions = await GameSession.find({
        assignment: { $in: assignments.map((assignment) => assignment._id) }
    }).select('_id student status').lean();
    const attempts = await GameAttempt.find({ session: { $in: sessions.map((session) => session._id) } })
        .select('student correct firstAttempt session')
        .lean();
    const studentIds = [...new Set(attempts.map((attempt) => String(attempt.student)))];
    const students = await Student.find({ _id: { $in: studentIds } })
        .select('firstName lastName currentClass')
        .lean();
    const names = new Map(students.map((student) => [String(student._id), `${student.firstName || ''} ${student.lastName || ''}`.trim()]));

    const rows = new Map();
    for (const attempt of attempts) {
        const key = String(attempt.student);
        if (!rows.has(key)) {
            rows.set(key, { studentId: key, name: names.get(key) || '', answered: 0, correct: 0, firstAttemptCorrect: 0 });
        }
        const row = rows.get(key);
        row.answered += 1;
        if (attempt.correct) row.correct += 1;
        if (attempt.correct && attempt.firstAttempt) row.firstAttemptCorrect += 1;
    }
    const sessionsPerStudent = new Map();
    for (const session of sessions) {
        const key = String(session.student);
        sessionsPerStudent.set(key, (sessionsPerStudent.get(key) || 0) + 1);
    }
    res.json({
        success: true,
        data: {
            pack: { _id: pack._id, title: pack.title, itemCount: (pack.publishedRevision?.items || []).length },
            assignmentCount: assignments.length,
            rows: Array.from(rows.values()).map((row) => ({
                ...row,
                sessions: sessionsPerStudent.get(row.studentId) || 0,
                accuracy: row.answered > 0 ? Math.round((row.correct / row.answered) * 100) : null
            })).sort((a, b) => a.name.localeCompare(b.name))
        }
    });
});
