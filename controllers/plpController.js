import PlpMonthConfig from '../models/PlpMonthConfig.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpSupervisorAssignment from '../models/PlpSupervisorAssignment.js';
import PlpAuditLog from '../models/PlpAuditLog.js';
import PlpTraitConfig from '../models/PlpTraitConfig.js';
import PlpInteraction from '../models/PlpInteraction.js';
import SelCompetency from '../models/SelCompetency.js';
import CharacterTheme from '../models/CharacterTheme.js';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import plpAiService from '../services/plpAiService.js';

const THEME_TRAITS = {
    confidence: {
        core: 'Confidence',
        s1: 'Humility',
        s2: 'Purpose',
        s3: 'Courage',
    },
    hope: {
        core: 'Hope',
        s1: 'Persistence',
        s2: 'Compassion',
        s3: 'Service',
    },
    wisdom: {
        core: 'Wisdom',
        s1: 'Curiosity',
        s2: 'Connection',
        s3: 'Discernment',
    },
};

const ACTIVITY_TEMPLATES = {
    confidence: {
        emerging: [
            'Journal: write three things that make you unique.',
            'Pair-share: discuss a personal strength with a classmate.',
            'Create a personal crest with symbols representing your values.',
        ],
        developing: [
            'Lead a small group discussion on a topic of your choice.',
            'Present one idea to the class without notes.',
            'Interview a role model about their confidence journey.',
        ],
        strong: [
            'Mentor a classmate in an area where you excel.',
            'Design a short lesson on self-identity for younger students.',
            'Reflect in writing: how has your confidence shaped your decisions this month?',
        ],
    },
    hope: {
        emerging: [
            'Write about a challenge you overcame and what you learned.',
            'Identify one person in your community you can support.',
            'Track one positive thing per day for a week.',
        ],
        developing: [
            'Lead a class gratitude circle.',
            'Plan and carry out a small act of service.',
            'Read and discuss a story of someone who turned hardship into strength.',
        ],
        strong: [
            'Design a service project for your class or community.',
            'Write a letter of encouragement to a struggling peer.',
            'Facilitate a classroom discussion on resilience.',
        ],
    },
    wisdom: {
        emerging: [
            'Ask three "why" questions about a topic this week.',
            'Compare two different perspectives on a current event.',
            'Create a mind map connecting a new concept to something you already know.',
        ],
        developing: [
            'Debate a complex issue using evidence from multiple sources.',
            'Design a decision-making framework for a real dilemma.',
            'Lead a Socratic seminar with your peers.',
        ],
        strong: [
            'Mentor classmates in critical thinking strategies.',
            'Write a reflective essay on a moral decision you faced.',
            'Create and teach a lesson connecting knowledge to real-life application.',
        ],
    },
};

const computeWeightedScore = (scores, weights) => {
    const w = weights || { coreTrait: 60, secondaryTrait1: 15, secondaryTrait2: 15, secondaryTrait3: 10 };
    const total = w.coreTrait + w.secondaryTrait1 + w.secondaryTrait2 + w.secondaryTrait3;
    const raw =
        (scores.coreTrait * w.coreTrait +
            scores.secondaryTrait1 * w.secondaryTrait1 +
            scores.secondaryTrait2 * w.secondaryTrait2 +
            scores.secondaryTrait3 * w.secondaryTrait3) / total;
    return Math.round(raw * 10) / 10;
};

const resolveLevel = (weightedScore) => {
    if (weightedScore >= 4) return 'strong';
    if (weightedScore >= 2.5) return 'developing';
    return 'emerging';
};

const generateActivities = (theme, level) => {
    return (ACTIVITY_TEMPLATES[theme]?.[level] || []).slice(0, 3);
};

const SCORE_SLOT_BY_ORDER = ['coreTrait', 'secondaryTrait1', 'secondaryTrait2', 'secondaryTrait3'];
const EVIDENCE_SCORE_DELTA = 0.2;

const normalizeThemeCode = (value) => String(value || '').trim().toLowerCase();

const resolveScoreFieldFromThemeTraits = (themeTraits = [], traitId) => {
    const idx = themeTraits.findIndex((trait) => String(trait._id) === String(traitId));
    if (idx < 0 || idx >= SCORE_SLOT_BY_ORDER.length) return null;
    return SCORE_SLOT_BY_ORDER[idx] || null;
};

const applyScoreDelta = ({ record, scoreField, delta }) => {
    if (!record || !scoreField || !Number.isFinite(delta) || delta === 0) return false;
    const current = Number(record?.scores?.[scoreField] || 0);
    const next = Math.max(0, Math.min(5, Math.round((current + delta) * 10) / 10));
    if (next === current) return false;
    if (!record.scores) record.scores = {};
    record.scores[scoreField] = next;
    return true;
};

const recomputeRecordScores = ({ record, config }) => {
    const weighted = computeWeightedScore(record.scores || {}, config?.weights);
    const level = resolveLevel(weighted);
    record.weightedScore = weighted;
    record.level = level;
    record.recommendedActivities = generateActivities(record.theme, level);
};

const getThemeTraits = async ({ schoolId, themeCode }) => {
    const normalizedTheme = normalizeThemeCode(themeCode);
    if (!normalizedTheme) return [];
    return PlpTraitConfig.find({ school: schoolId, isActive: true, themeCode: normalizedTheme })
        .select('_id displayOrder code')
        .sort({ displayOrder: 1, code: 1 })
        .lean();
};

const resolveMinEvidenceCount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
};

const clampTraitScore = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed * 10) / 10;
    return Math.max(0, Math.min(5, rounded));
};

const normalizeScoreSource = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    const allowed = ['ai_suggested', 'teacher_override', 'teacher_manual'];
    return allowed.includes(normalized) ? normalized : null;
};

const normalizeOverrideReason = (value) => String(value || '').trim().slice(0, 300);

const sanitizeTraitScoreEntries = (entries = {}) => {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    const next = {};
    for (const [traitId, rawEntry] of Object.entries(entries)) {
        if (!mongoose.isValidObjectId(traitId)) continue;
        const score = clampTraitScore(rawEntry?.score);
        const aiSuggestedScore = clampTraitScore(rawEntry?.aiSuggestedScore);
        const scoreSource = normalizeScoreSource(rawEntry?.scoreSource);
        const overrideReason = normalizeOverrideReason(rawEntry?.overrideReason);
        if (score === null && aiSuggestedScore === null && !scoreSource && !overrideReason) continue;
        next[String(traitId)] = {
            score,
            scoreSource,
            aiSuggestedScore,
            overrideReason,
        };
    }
    return next;
};

const toPlainTraitScoreEntries = (entries) => {
    if (!entries) return {};
    if (entries instanceof Map) return Object.fromEntries(entries);
    if (typeof entries.toObject === 'function') return entries.toObject();
    return entries;
};

const buildThemeTraitList = (traits = []) => {
    const grouped = {};
    for (const trait of traits) {
        const key = String(trait.themeCode || '').trim().toLowerCase() || 'other';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(trait);
    }
    for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => {
            const displayOrderDiff = Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
            if (displayOrderDiff !== 0) return displayOrderDiff;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
    }
    return grouped;
};

const buildRecordScoreFieldByTraitId = ({ record, activeTraits }) => {
    const byTheme = buildThemeTraitList(activeTraits);
    const themeTraits = byTheme[normalizeThemeCode(record?.theme)] || [];
    const map = new Map();
    themeTraits.forEach((trait, index) => {
        const scoreField = SCORE_SLOT_BY_ORDER[index] || null;
        if (!scoreField) return;
        map.set(String(trait._id), scoreField);
    });
    return map;
};

const countSpotlightTraitEvidenceForRecord = async ({ schoolId, recordId, spotlightTraitId }) => {
    if (!spotlightTraitId) return 0;
    return PlpEvidence.countDocuments({
        school: schoolId,
        plpRecord: recordId,
        traitId: spotlightTraitId,
    });
};

const recomputeAwardCandidateForRecord = async ({ record, config, schoolId }) => {
    if (!record) return false;
    const spotlightTraitId = config?.secondaryTrait || null;
    if (!spotlightTraitId) {
        record.awardCandidate = false;
        return false;
    }
    const spotlightEvidenceCount = await countSpotlightTraitEvidenceForRecord({
        schoolId,
        recordId: record._id,
        spotlightTraitId,
    });
    const eligible = spotlightEvidenceCount >= resolveMinEvidenceCount(config?.minEvidenceCount);
    record.awardCandidate = eligible;
    return eligible;
};

const refreshAwardCandidatesForMonth = async ({ schoolId, academicYear, month, configOverride = null }) => {
    const filter = { school: schoolId, academicYear, month: Number(month) };
    const records = await PlpStudentRecord.find(filter).select('_id');
    if (records.length === 0) return;

    const config = configOverride || await PlpMonthConfig.findOne(filter).select('secondaryTrait minEvidenceCount').lean();
    const spotlightTraitId = config?.secondaryTrait || null;
    if (!spotlightTraitId) {
        await PlpStudentRecord.updateMany(filter, { awardCandidate: false });
        return;
    }

    const recordIds = records.map((record) => record._id);
    const counts = await PlpEvidence.aggregate([
        {
            $match: {
                school: schoolId,
                plpRecord: { $in: recordIds },
                traitId: spotlightTraitId,
            },
        },
        { $group: { _id: '$plpRecord', count: { $sum: 1 } } },
    ]);

    const threshold = resolveMinEvidenceCount(config?.minEvidenceCount);
    const eligibleRecordIds = counts
        .filter((row) => Number(row.count || 0) >= threshold)
        .map((row) => row._id);

    if (eligibleRecordIds.length > 0) {
        await PlpStudentRecord.updateMany(
            { ...filter, _id: { $in: eligibleRecordIds } },
            { awardCandidate: true }
        );
    }
    await PlpStudentRecord.updateMany(
        { ...filter, _id: { $nin: eligibleRecordIds } },
        { awardCandidate: false }
    );
};

const audit = (school, actor, action, targetType, targetId, meta) =>
    PlpAuditLog.create({ school, actor, action, targetType, targetId, meta }).catch(() => {});

const HOMEROOM_SUBJECT_MATCHERS = ['homeroom', 'home room', 'advisory', 'advisor', 'hmrm'];

const isHomeroomSubject = (subject) => {
    const name = String(subject?.name || '').toLowerCase();
    const code = String(subject?.code || '').toLowerCase();
    return HOMEROOM_SUBJECT_MATCHERS.some((term) => name.includes(term) || code.includes(term));
};

const getTeacherHomeroomClassIds = async (schoolId, teacherUserId, academicYear = null) => {
    const teacherProfile = await Teacher.findOne({ school: schoolId, user: teacherUserId, isActive: true })
        .select('_id')
        .lean();
    if (!teacherProfile) return [];

    const subjects = await Subject.find({ school: schoolId, isActive: true })
        .select('_id name code')
        .lean();
    const homeroomSubjectIds = subjects.filter(isHomeroomSubject).map((s) => s._id.toString());
    if (homeroomSubjectIds.length === 0) return [];

    const classQuery = {
        school: schoolId,
        isActive: true,
        $or: [
            { classTeacher: teacherProfile._id },
            {
                subjects: {
                    $elemMatch: {
                        teacher: teacherProfile._id,
                        subject: { $in: homeroomSubjectIds }
                    }
                }
            }
        ]
    };
    if (academicYear) classQuery.academicYear = academicYear;

    const classes = await Class.find(classQuery).select('_id').lean();
    return classes.map((row) => row._id.toString());
};

const assertTeacherHomeroomClassAccess = async (user, classId, academicYear = null) => {
    if (user.role !== 'teacher') return;
    const normalizedClassId = String(classId?._id || classId || '');
    if (!normalizedClassId) {
        throw Object.assign(new Error('PLP class context is missing'), { statusCode: 400 });
    }
    const allowedClassIds = await getTeacherHomeroomClassIds(user.school, user._id, academicYear);
    if (!allowedClassIds.some((id) => id === normalizedClassId)) {
        throw Object.assign(new Error('PLP is only available for your homeroom class assignments'), { statusCode: 403 });
    }
};

const buildThemeTraitMap = (traits = []) => {
    const byTheme = {};
    for (const t of traits) {
        if (!t.themeCode) continue;
        if (!byTheme[t.themeCode]) byTheme[t.themeCode] = [];
        byTheme[t.themeCode].push({ code: t.code, name: t.name });
    }
    for (const theme of Object.keys(byTheme)) {
        byTheme[theme].sort((a, b) => a.code.localeCompare(b.code));
    }
    return byTheme;
};

const resolveThemeLabels = async (schoolId) => {
    const traits = await PlpTraitConfig.find({ school: schoolId }).lean();
    const byTheme = buildThemeTraitMap(traits);
    const result = {};
    for (const theme of Object.keys(THEME_TRAITS)) {
        const configured = byTheme[theme] || [];
        if (configured.length >= 4) {
            result[theme] = {
                core: configured[0].name,
                s1: configured[1].name,
                s2: configured[2].name,
                s3: configured[3].name,
            };
        } else if (configured.length > 0) {
            const fallback = { ...THEME_TRAITS[theme] };
            for (let i = 0; i < Math.min(configured.length, 4); i++) {
                const keys = ['core', 's1', 's2', 's3'];
                fallback[keys[i]] = configured[i].name;
            }
            result[theme] = fallback;
        } else {
            result[theme] = THEME_TRAITS[theme];
        }
    }
    return result;
};

const SEED_TRAITS = [
    { name: 'Confidence', code: 'CONFIDENCE', description: 'Believing in oneself and one\'s abilities.', selSkills: ['self_awareness', 'self_management'], themeCode: 'confidence' },
    { name: 'Hope', code: 'HOPE', description: 'Looking forward to the future with optimism.', selSkills: ['self_awareness', 'relationship_skills'], themeCode: 'hope' },
    { name: 'Wisdom', code: 'WISDOM', description: 'Using good judgment and deep understanding.', selSkills: ['responsible_decision_making', 'self_awareness'], themeCode: 'wisdom' },
    { name: 'Humility', code: 'HUMILITY', description: 'Recognizing one\'s limitations and valuing others.', selSkills: ['self_awareness', 'social_awareness'], themeCode: 'confidence' },
    { name: 'Purpose', code: 'PURPOSE', description: 'Having clear goals and a sense of direction.', selSkills: ['responsible_decision_making', 'self_management'], themeCode: 'confidence' },
    { name: 'Courage', code: 'COURAGE', description: 'Facing difficulty with bravery and resilience.', selSkills: ['self_management', 'responsible_decision_making'], themeCode: 'confidence' },
    { name: 'Persistence', code: 'PERSISTENCE', description: 'Continuing steadily toward a goal despite obstacles.', selSkills: ['self_management', 'responsible_decision_making'], themeCode: 'hope' },
    { name: 'Compassion', code: 'COMPASSION', description: 'Caring about others and acting with kindness.', selSkills: ['social_awareness', 'relationship_skills'], themeCode: 'hope' },
    { name: 'Service', code: 'SERVICE', description: 'Contributing to the well-being of others.', selSkills: ['relationship_skills', 'responsible_decision_making'], themeCode: 'hope' },
];

const SEED_SEL_COMPETENCIES = [
    { code: 'self_awareness', title: 'Self Awareness', description: 'Understanding emotions, strengths, and areas for growth.', displayOrder: 1 },
    { code: 'self_management', title: 'Self Management', description: 'Managing emotions and behaviors to achieve goals.', displayOrder: 2 },
    { code: 'social_awareness', title: 'Social Awareness', description: 'Showing empathy and understanding others.', displayOrder: 3 },
    { code: 'relationship_skills', title: 'Relationship Skills', description: 'Building and maintaining healthy relationships.', displayOrder: 4 },
    { code: 'responsible_decision_making', title: 'Responsible Decision Making', description: 'Making caring and constructive choices.', displayOrder: 5 },
];

const SEED_CHARACTER_THEMES = [
    {
        code: 'confidence',
        title: 'Confidence',
        description: 'Asserting unique identity and acting with healthy self-belief.',
        displayOrder: 1,
    },
    {
        code: 'hope',
        title: 'Hope',
        description: 'Maintaining optimistic focus and resilience through challenges.',
        displayOrder: 2,
    },
    {
        code: 'wisdom',
        title: 'Wisdom',
        description: 'Growing discernment and good judgment through reflection.',
        displayOrder: 3,
    },
];

const seedStarterTraits = async (schoolId, actorId) => {
    const existing = await PlpTraitConfig.find({ school: schoolId }).lean();
    if (existing.length > 0) return existing;
    const docs = SEED_TRAITS.map((t, idx) => ({
        school: schoolId,
        name: t.name,
        code: t.code,
        description: t.description,
        selSkills: t.selSkills,
        themeCode: t.themeCode,
        displayOrder: idx + 1,
        isActive: true,
        createdBy: actorId,
    }));
    return await PlpTraitConfig.insertMany(docs);
};

const seedSelCompetencies = async (schoolId, academicYear, actorId) => {
    const existing = await SelCompetency.find({ school: schoolId, academicYear }).lean();
    if (existing.length > 0) return existing;
    const docs = SEED_SEL_COMPETENCIES.map((item) => ({
        school: schoolId,
        academicYear,
        code: item.code,
        title: item.title,
        description: item.description,
        displayOrder: item.displayOrder,
        active: true,
        createdBy: actorId,
    }));
    return SelCompetency.insertMany(docs);
};

const seedCharacterThemes = async (schoolId, academicYear, actorId) => {
    const existing = await CharacterTheme.find({ school: schoolId, academicYear }).lean();
    if (existing.length > 0) return existing;
    const docs = SEED_CHARACTER_THEMES.map((item) => ({
        school: schoolId,
        academicYear,
        code: item.code,
        title: item.title,
        description: item.description,
        displayOrder: item.displayOrder,
        active: true,
        createdBy: actorId,
    }));
    return CharacterTheme.insertMany(docs);
};

const notifyTeacherForSupervisorNote = async ({ schoolId, teacherId, supervisorId, recordId, note }) => {
    const recipientTeacher = await Teacher.findOne({ school: schoolId, user: teacherId }).select('_id').lean();
    if (!recipientTeacher) return;

    const maxPreview = String(note || '').trim().slice(0, 120);
    await Notification.create({
        school: schoolId,
        recipient: teacherId,
        recipientEmail: 'internal-notification@system.local',
        type: 'announcement',
        subject: 'New supervisor PLP note',
        message: maxPreview || 'A supervisor added a note to your PLP record.',
        channels: ['push'],
        metadata: {
            source: 'plp_supervisor_note',
            recordId,
            supervisorId,
            teacherProfileId: recipientTeacher._id,
        },
        createdBy: supervisorId,
    });
};

// ─── Month Config ───────────────────────────────────────────────────────────────

export const getMonthConfigs = asyncHandler(async (req, res) => {
    const { academicYear } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    const configs = await PlpMonthConfig.find(filter)
        .populate('secondaryTrait', 'name code themeCode themeId')
        .sort({ academicYear: 1, month: 1 });
    res.json({ success: true, data: configs });
});

export const getMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOne({ _id: id, school: req.user.school })
        .populate('secondaryTrait', 'name code themeCode themeId');
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, data: config });
});

export const createMonthConfig = asyncHandler(async (req, res) => {
    const { academicYear, month, theme, secondaryTrait, weights, minEvidenceCount } = req.body;
    if (secondaryTrait) {
        const trait = await PlpTraitConfig.findOne({ _id: secondaryTrait, school: req.user.school });
        if (!trait) {
            return res.status(400).json({ success: false, message: 'Invalid spotlight trait' });
        }
        if (trait.themeCode && trait.themeCode !== theme) {
            return res.status(400).json({ success: false, message: 'Selected trait does not belong to the selected theme' });
        }
    }
    const config = await PlpMonthConfig.create({
        school: req.user.school,
        academicYear,
        month,
        theme,
        secondaryTrait: secondaryTrait || null,
        weights,
        minEvidenceCount,
        createdBy: req.user._id,
    });
    await refreshAwardCandidatesForMonth({
        schoolId: req.user.school,
        academicYear: config.academicYear,
        month: config.month,
        configOverride: config.toObject(),
    });
    audit(req.user.school, req.user._id, 'config_created', 'PlpMonthConfig', config._id, { month, theme });
    res.status(201).json({ success: true, data: config });
});

export const updateMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { theme, secondaryTrait } = req.body;
    if (secondaryTrait) {
        const trait = await PlpTraitConfig.findOne({ _id: secondaryTrait, school: req.user.school });
        if (!trait) {
            return res.status(400).json({ success: false, message: 'Invalid spotlight trait' });
        }
        if (theme && trait.themeCode && trait.themeCode !== theme) {
            return res.status(400).json({ success: false, message: 'Selected trait does not belong to the selected theme' });
        }
    }
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: { $ne: 'closed' } },
        { ...req.body, updatedBy: req.user._id },
        { new: true, runValidators: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or closed' });
    await refreshAwardCandidatesForMonth({
        schoolId: req.user.school,
        academicYear: config.academicYear,
        month: config.month,
        configOverride: config.toObject(),
    });
    res.json({ success: true, data: config });
});

export const publishMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'draft' },
        { status: 'published', updatedBy: req.user._id },
        { new: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or not in draft' });
    await refreshAwardCandidatesForMonth({
        schoolId: req.user.school,
        academicYear: config.academicYear,
        month: config.month,
        configOverride: config.toObject(),
    });
    audit(req.user.school, req.user._id, 'config_published', 'PlpMonthConfig', config._id, {});
    res.json({ success: true, data: config });
});

export const closeMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: 'published' },
        { status: 'closed', updatedBy: req.user._id },
        { new: true }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found or not published' });
    // lock all submitted records for this month
    await PlpStudentRecord.updateMany(
        { school: req.user.school, academicYear: config.academicYear, month: config.month, status: 'submitted' },
        { status: 'locked' }
    );
    audit(req.user.school, req.user._id, 'config_closed', 'PlpMonthConfig', config._id, {});
    res.json({ success: true, data: config });
});

// ─── Student Records ────────────────────────────────────────────────────────────

export const getRecords = asyncHandler(async (req, res) => {
    const { academicYear, month, classId, teacherId } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    if (month) filter.month = Number(month);
    if (classId) filter.class = classId;

    const isAdmin = ['admin', 'department_principal'].includes(req.user.role);
    const isSupervisor = req.user.role === 'department_principal';

    if (!isAdmin) {
        if (isSupervisor) {
            const assignments = await PlpSupervisorAssignment.find({
                school: req.user.school,
                supervisor: req.user._id,
                active: true,
            }).select('teacher');
            const teacherIds = assignments.map((a) => a.teacher);
            if (teacherId && !teacherIds.some((t) => t.toString() === teacherId)) {
                return res.json({ success: true, data: [] });
            }
            filter.teacher = teacherId ? teacherId : { $in: teacherIds };
        } else {
            const allowedClassIds = await getTeacherHomeroomClassIds(req.user.school, req.user._id, academicYear || null);
            if (allowedClassIds.length === 0) {
                return res.json({ success: true, data: [] });
            }
            if (classId && !allowedClassIds.includes(String(classId))) {
                return res.json({ success: true, data: [] });
            }
            filter.class = classId || { $in: allowedClassIds };
        }
    } else if (teacherId) {
        filter.teacher = teacherId;
    }

    const records = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: records });
});

export const getLeaderboard = asyncHandler(async (req, res) => {
    const { academicYear, month, classId, teacherId, traitId, limit } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    if (month) filter.month = Number(month);
    if (classId) filter.class = classId;

    const isAdmin = ['admin', 'department_principal'].includes(req.user.role);
    const isSupervisor = req.user.role === 'department_principal';

    if (!isAdmin) {
        if (isSupervisor) {
            const assignments = await PlpSupervisorAssignment.find({
                school: req.user.school,
                supervisor: req.user._id,
                active: true,
            }).select('teacher');
            const teacherIds = assignments.map((a) => a.teacher);
            if (teacherId && !teacherIds.some((t) => t.toString() === teacherId)) {
                return res.json({ success: true, data: { rows: [], mode: 'all' } });
            }
            filter.teacher = teacherId ? teacherId : { $in: teacherIds };
        } else {
            const allowedClassIds = await getTeacherHomeroomClassIds(req.user.school, req.user._id, academicYear || null);
            if (allowedClassIds.length === 0) {
                return res.json({ success: true, data: { rows: [], mode: 'all' } });
            }
            if (classId && !allowedClassIds.includes(String(classId))) {
                return res.json({ success: true, data: { rows: [], mode: 'all' } });
            }
            filter.class = classId || { $in: allowedClassIds };
        }
    } else if (teacherId) {
        filter.teacher = teacherId;
    }

    const records = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 });

    if (records.length === 0) {
        return res.json({ success: true, data: { rows: [], mode: 'all' } });
    }

    const normalizedTraitId = String(traitId || '').trim();
    let mode = 'all';
    let selectedTrait = null;
    if (normalizedTraitId && normalizedTraitId.toLowerCase() !== 'all' && mongoose.isValidObjectId(normalizedTraitId)) {
        selectedTrait = await PlpTraitConfig.findOne({
            _id: normalizedTraitId,
            school: req.user.school,
            isActive: true,
        }).select('_id name themeCode').lean();
        if (selectedTrait) {
            mode = 'trait';
        }
    }

    const recordIds = records.map((record) => record._id);
    const evidenceMatch = {
        school: req.user.school,
        plpRecord: { $in: recordIds },
    };
    if (mode === 'trait') {
        evidenceMatch.traitId = selectedTrait._id;
    }

    const evidenceCounts = await PlpEvidence.aggregate([
        { $match: evidenceMatch },
        { $group: { _id: '$plpRecord', count: { $sum: 1 } } },
    ]);
    const evidenceCountByRecordId = new Map(
        evidenceCounts.map((row) => [String(row._id), Number(row.count || 0)])
    );

    let scoreFieldForTrait = null;
    if (mode === 'trait') {
        const themeTraits = await getThemeTraits({
            schoolId: req.user.school,
            themeCode: selectedTrait.themeCode,
        });
        scoreFieldForTrait = resolveScoreFieldFromThemeTraits(themeTraits, selectedTrait._id);
    }

    const leaderboardRows = records
        .map((record) => {
            const recordId = String(record._id);
            const traitEvidenceCount = evidenceCountByRecordId.get(recordId) || 0;
            const allEvidenceCount = Number(record.evidenceCount || 0);
            const selectedTraitScore =
                mode === 'trait' &&
                record.theme === selectedTrait.themeCode &&
                scoreFieldForTrait
                    ? Number(record?.scores?.[scoreFieldForTrait] || 0)
                    : null;
            return {
                record,
                matchedEvidenceCount: mode === 'trait' ? traitEvidenceCount : allEvidenceCount,
                selectedTraitScore,
            };
        })
        .filter((row) => {
            if (mode !== 'trait') return true;
            return row.record.theme === selectedTrait.themeCode;
        })
        .sort((a, b) => {
            const evidenceDiff = b.matchedEvidenceCount - a.matchedEvidenceCount;
            if (evidenceDiff !== 0) return evidenceDiff;

            if (mode === 'trait') {
                const traitScoreDiff = Number(b.selectedTraitScore || 0) - Number(a.selectedTraitScore || 0);
                if (traitScoreDiff !== 0) return traitScoreDiff;
            }

            const weightedDiff = Number(b.record.weightedScore || 0) - Number(a.record.weightedScore || 0);
            if (weightedDiff !== 0) return weightedDiff;

            const studentA = `${a.record.student?.firstName || ''} ${a.record.student?.lastName || ''}`.trim();
            const studentB = `${b.record.student?.firstName || ''} ${b.record.student?.lastName || ''}`.trim();
            return studentA.localeCompare(studentB);
        });

    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 100;
    const rows = leaderboardRows.slice(0, safeLimit).map((row, index) => ({
        rank: index + 1,
        matchedEvidenceCount: row.matchedEvidenceCount,
        selectedTraitScore: row.selectedTraitScore,
        record: row.record,
    }));

    res.json({
        success: true,
        data: {
            mode,
            selectedTrait,
            rows,
        },
    });
});

export const getRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school })
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('class', 'name grade');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    res.json({ success: true, data: record });
});

const assertRecordAccess = async (user, record) => {
    if (['admin'].includes(user.role)) return;
    if (user.role === 'teacher') {
        await assertTeacherHomeroomClassAccess(user, record.class, record.academicYear);
        return;
    }
    if (user.role === 'department_principal') {
        const assignment = await PlpSupervisorAssignment.findOne({
            school: user.school,
            supervisor: user._id,
            teacher: record.teacher,
            active: true,
        });
        if (assignment) return;
    }
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
};

const assertRecordWriteAccess = async (user, record) => {
    if (user.role === 'department_principal') {
        throw Object.assign(new Error('Supervisors have read-only access and can only add notes'), { statusCode: 403 });
    }
    await assertRecordAccess(user, record);
};

const resolveObservationRecordTheme = async (schoolId, academicYear, month, preferredTheme = '') => {
    const cleanedPreferredTheme = String(preferredTheme || '').trim().toLowerCase();
    if (cleanedPreferredTheme) {
        return cleanedPreferredTheme;
    }

    const config = await PlpMonthConfig.findOne({
        school: schoolId,
        academicYear,
        month,
    }).select('theme').lean();
    if (config?.theme) return String(config.theme).trim().toLowerCase();

    const activeTheme = await CharacterTheme.findOne({
        school: schoolId,
        academicYear,
        active: true,
    }).sort({ displayOrder: 1 }).select('code').lean();
    if (activeTheme?.code) return String(activeTheme.code).trim().toLowerCase();

    return 'confidence';
};

const findOrCreateObservationRecord = async ({
    user,
    studentId,
    classId,
    academicYear,
    month,
    theme,
}) => {
    let record = await PlpStudentRecord.findOne({
        school: user.school,
        academicYear,
        month,
        class: classId,
        student: studentId,
        teacher: user._id,
    });

    if (!record) {
        record = await PlpStudentRecord.findOne({
            school: user.school,
            academicYear,
            month,
            class: classId,
            student: studentId,
        }).sort({ createdAt: -1 });
    }

    if (record) return record;

    const weightedScore = 0;
    return PlpStudentRecord.create({
        school: user.school,
        academicYear,
        month,
        theme,
        teacher: user._id,
        class: classId,
        student: studentId,
        scores: {
            coreTrait: 0,
            secondaryTrait1: 0,
            secondaryTrait2: 0,
            secondaryTrait3: 0,
        },
        weightedScore,
        level: resolveLevel(weightedScore),
        recommendedActivities: generateActivities(theme, 'emerging'),
    });
};

export const createRecord = asyncHandler(async (req, res) => {
    const { academicYear, month, theme, classId, studentId, scores, focusTrait } = req.body;
    await assertTeacherHomeroomClassAccess(req.user, classId, academicYear);

    if (focusTrait) {
        const trait = await PlpTraitConfig.findOne({ _id: focusTrait, school: req.user.school }).lean();
        if (!trait) {
            return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
        }
        if (trait.themeCode && trait.themeCode !== theme) {
            return res.status(400).json({ success: false, message: 'Selected trait does not belong to selected theme' });
        }
    }

    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear, month, status: 'published',
    });
    if (!config) return res.status(400).json({ success: false, message: 'Month config not published yet' });

    const computedScores = scores || {};
    const weighted = computeWeightedScore(computedScores, config.weights);
    const level = resolveLevel(weighted);
    const activities = generateActivities(theme, level);

    const record = await PlpStudentRecord.create({
        school: req.user.school,
        academicYear,
        month,
        theme,
        focusTrait: focusTrait || null,
        teacher: req.user._id,
        class: classId,
        student: studentId,
        scores: computedScores,
        weightedScore: weighted,
        level,
        recommendedActivities: activities,
    });
    res.status(201).json({ success: true, data: record });
});

export const updateRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found' });
    if (existing.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordWriteAccess(req.user, existing);

    const { scores, traitScoreEntries } = req.body;
    let updateData = { ...req.body };
    delete updateData.traitScoreEntries;
    const hasDirectScores = !!scores;
    const hasTraitScoreEntries = traitScoreEntries && typeof traitScoreEntries === 'object';
    if (hasDirectScores || hasTraitScoreEntries) {
        const config = await PlpMonthConfig.findOne({
            school: req.user.school, academicYear: existing.academicYear, month: existing.month,
        });
        const activeTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
            .select('_id name themeCode displayOrder')
            .sort({ displayOrder: 1, name: 1 })
            .lean();
        const scoreFieldByTraitId = buildRecordScoreFieldByTraitId({ record: existing, activeTraits });
        const existingEntries = toPlainTraitScoreEntries(existing.traitScoreEntries);
        const sanitizedEntries = hasTraitScoreEntries ? sanitizeTraitScoreEntries(traitScoreEntries) : null;

        const nextScores = hasDirectScores
            ? { ...scores }
            : {
                coreTrait: Number(existing?.scores?.coreTrait || 0),
                secondaryTrait1: Number(existing?.scores?.secondaryTrait1 || 0),
                secondaryTrait2: Number(existing?.scores?.secondaryTrait2 || 0),
                secondaryTrait3: Number(existing?.scores?.secondaryTrait3 || 0),
            };

        if (sanitizedEntries) {
            for (const [traitId, entry] of Object.entries(sanitizedEntries)) {
                const scoreField = scoreFieldByTraitId.get(String(traitId));
                if (!scoreField || entry.score === null) continue;
                nextScores[scoreField] = entry.score;
            }
            updateData.traitScoreEntries = {
                ...existingEntries,
                ...sanitizedEntries,
            };
        }

        const weighted = computeWeightedScore(nextScores, config?.weights);
        const level = resolveLevel(weighted);
        updateData.scores = nextScores;
        updateData.weightedScore = weighted;
        updateData.level = level;
        updateData.recommendedActivities = generateActivities(existing.theme, level);
    }
    const updated = await PlpStudentRecord.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .populate('student', 'firstName lastName studentId');
    res.json({ success: true, data: updated });
});

export const submitRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status !== 'in_progress') return res.status(400).json({ success: false, message: 'Record already submitted or locked' });
    await assertRecordWriteAccess(req.user, record);
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear: record.academicYear, month: record.month,
    });
    const eligible = await recomputeAwardCandidateForRecord({
        record,
        config,
        schoolId: req.user.school,
    });
    record.status = 'submitted';
    record.submittedAt = new Date();
    record.awardCandidate = eligible;
    await record.save();
    audit(req.user.school, req.user._id, 'record_submitted', 'PlpStudentRecord', record._id, {});
    res.json({ success: true, data: record });
});

// ─── Evidence ───────────────────────────────────────────────────────────────────

export const getEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school }).select('_id teacher class academicYear');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    const evidence = await PlpEvidence.find({ school: req.user.school, plpRecord: id })
        .populate('teacher', 'firstName lastName')
        .populate('traitId', 'name code themeCode')
        .sort({ createdAt: -1 });
    res.json({ success: true, data: evidence });
});

export const getTraitScoreSuggestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);

    const activeTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .populate('themeId', 'code title active')
        .select('_id name code themeCode themeId displayOrder')
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    if (activeTraits.length === 0) {
        return res.json({ success: true, data: { traits: [] } });
    }

    const traitIds = activeTraits.map((trait) => trait._id);
    const evidenceRows = await PlpEvidence.find({
        school: req.user.school,
        plpRecord: record._id,
        traitId: { $in: traitIds },
    })
        .select('traitId type note aiConfidence createdAt')
        .sort({ createdAt: -1 })
        .lean();

    const evidenceByTraitId = evidenceRows.reduce((acc, item) => {
        const key = String(item?.traitId || '');
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    const scoreFieldByTraitId = buildRecordScoreFieldByTraitId({ record, activeTraits });
    const storedEntries = toPlainTraitScoreEntries(record.traitScoreEntries);
    const period = {
        academicYear: record.academicYear,
        month: record.month,
        recordId: String(record._id),
    };

    const suggestions = await Promise.all(activeTraits.map(async (trait) => {
        const traitId = String(trait._id);
        const traitEvidence = evidenceByTraitId[traitId] || [];
        const suggestion = await plpAiService.suggestTraitScore(traitId, traitEvidence, period);
        const stored = storedEntries?.[traitId] || {};
        const legacyScoreField = scoreFieldByTraitId.get(traitId);
        const legacyScore = legacyScoreField ? clampTraitScore(record?.scores?.[legacyScoreField]) : null;
        const savedScore = clampTraitScore(stored?.score);

        return {
            trait: {
                _id: trait._id,
                name: trait.name,
                code: trait.code,
                themeCode: trait.themeCode,
                themeId: trait.themeId || null,
                displayOrder: trait.displayOrder,
            },
            suggestion,
            saved: {
                score: savedScore !== null ? savedScore : legacyScore,
                scoreSource: normalizeScoreSource(stored?.scoreSource),
                aiSuggestedScore: clampTraitScore(stored?.aiSuggestedScore),
                overrideReason: normalizeOverrideReason(stored?.overrideReason),
            },
        };
    }));

    res.json({ success: true, data: { traits: suggestions } });
});

export const createEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordWriteAccess(req.user, record);

    const { type, note, taggedTraits, traitId, source, aiConfidence, aiRationale, reviewStatus } = req.body;
    const evidence = await PlpEvidence.create({
        school: req.user.school,
        plpRecord: id,
        teacher: req.user._id,
        traitId: traitId || null,
        type,
        note,
        taggedTraits: taggedTraits || [],
        source: source || 'manual',
        aiConfidence: aiConfidence || null,
        aiRationale: aiRationale || null,
        reviewStatus: reviewStatus || 'confirmed',
    });

    const newCount = (record.evidenceCount || 0) + 1;
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear: record.academicYear, month: record.month,
    });

    let scoreField = null;
    if (traitId) {
        const themeTraits = await getThemeTraits({
            schoolId: req.user.school,
            themeCode: record.theme,
        });
        scoreField = resolveScoreFieldFromThemeTraits(themeTraits, traitId);
    }

    record.evidenceCount = newCount;

    const didChangeScore = applyScoreDelta({
        record,
        scoreField,
        delta: EVIDENCE_SCORE_DELTA,
    });
    if (didChangeScore) {
        recomputeRecordScores({ record, config });
    }
    await recomputeAwardCandidateForRecord({
        record,
        config,
        schoolId: req.user.school,
    });
    await record.save();

    res.status(201).json({ success: true, data: evidence });
});

export const classifyObservationDraft = asyncHandler(async (req, res) => {
    const { studentId, rawText, capturedAt, classId } = req.body || {};
    if (!studentId || !String(rawText || '').trim()) {
        return res.status(400).json({ success: false, message: 'studentId and rawText are required' });
    }

    const student = await Student.findOne({ _id: studentId, school: req.user.school, status: 'active' })
        .select('_id firstName lastName currentClass academicYear')
        .lean();
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const effectiveClassId = classId || student.currentClass;
    if (!effectiveClassId) {
        return res.status(400).json({ success: false, message: 'Student has no active class assignment' });
    }

    await assertTeacherHomeroomClassAccess(req.user, effectiveClassId, student.academicYear || req.academicYear || null);

    const availableTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .select('_id name code description themeCode displayOrder')
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    const observationDate = capturedAt ? new Date(capturedAt) : new Date();
    const studentContext = {
        studentId: String(student._id),
        studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        classId: String(effectiveClassId),
        academicYear: student.academicYear || req.academicYear || null,
        capturedAt: observationDate.toISOString(),
    };

    const classification = await plpAiService.classifyObservation(rawText, availableTraits, studentContext);

    res.json({
        success: true,
        data: {
            studentId: String(student._id),
            classification,
            availableTraits,
        },
    });
});

export const createQuickObservation = asyncHandler(async (req, res) => {
    const { studentId, rawText, traitId, capturedAt, classId, evidenceType, structuredNote, aiConfidence, aiRationale, source: requestedSource, reviewStatus: requestedReviewStatus } = req.body || {};
    const noteInput = String(rawText || '').trim();
    if (!studentId || !noteInput) {
        return res.status(400).json({ success: false, message: 'studentId and rawText are required' });
    }

    const student = await Student.findOne({ _id: studentId, school: req.user.school, status: 'active' })
        .select('_id firstName lastName currentClass academicYear')
        .lean();
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const effectiveClassId = classId || student.currentClass;
    if (!effectiveClassId) {
        return res.status(400).json({ success: false, message: 'Student has no active class assignment' });
    }

    await assertTeacherHomeroomClassAccess(req.user, effectiveClassId, student.academicYear || req.academicYear || null);

    const observationDate = capturedAt ? new Date(capturedAt) : new Date();
    if (Number.isNaN(observationDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid capturedAt date' });
    }

    const month = observationDate.getMonth() + 1;
    const academicYear = String(req.body?.academicYear || student.academicYear || req.academicYear || '').trim();
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'Academic year is required for observation capture' });
    }

    const availableTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .select('_id name code description themeCode displayOrder')
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    let resolvedTrait = null;
    let source = 'manual';
    let resolvedEvidenceType = 'observation';
    let resolvedNote = String(structuredNote || noteInput).trim().slice(0, 1000);
    let resolvedConfidence = null;
    let resolvedRationale = null;
    let reviewStatus = 'confirmed';

    if (traitId) {
        resolvedTrait = availableTraits.find((trait) => String(trait._id) === String(traitId));
        if (!resolvedTrait) {
            return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
        }
        if (evidenceType) {
            resolvedEvidenceType = String(evidenceType).trim().toLowerCase();
        }
        if (requestedSource === 'ai_classified') {
            source = 'ai_classified';
            resolvedConfidence = aiConfidence ? String(aiConfidence).trim().toLowerCase() : null;
            resolvedRationale = aiRationale ? String(aiRationale).trim().slice(0, 300) : null;
            reviewStatus = requestedReviewStatus === 'needs_review' ? 'needs_review' : 'confirmed';
        }
    } else {
        source = 'ai_classified';

        const classification = await plpAiService.classifyObservation(noteInput, availableTraits, {
            studentId: String(student._id),
            studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            classId: String(effectiveClassId),
            academicYear,
            capturedAt: observationDate.toISOString(),
        });

        resolvedTrait = classification?.traitId
            ? availableTraits.find((trait) => String(trait._id) === String(classification.traitId))
            : null;
        resolvedEvidenceType = String(classification?.evidenceType || 'observation').trim().toLowerCase();
        resolvedNote = String(classification?.structuredNote || noteInput).trim().slice(0, 1000);
        resolvedConfidence = String(classification?.confidence || 'low').trim().toLowerCase();
        resolvedRationale = String(classification?.rationale || '').trim().slice(0, 300) || null;
        reviewStatus = resolvedTrait ? 'confirmed' : 'needs_review';
    }

    const allowedEvidenceTypes = ['observation', 'incident', 'positive_example', 'reflection'];
    if (!allowedEvidenceTypes.includes(resolvedEvidenceType)) {
        resolvedEvidenceType = 'observation';
    }
    if (resolvedConfidence && !['high', 'medium', 'low'].includes(resolvedConfidence)) {
        resolvedConfidence = 'low';
    }

    const resolvedTheme = await resolveObservationRecordTheme(
        req.user.school,
        academicYear,
        month,
        resolvedTrait?.themeCode || ''
    );

    const record = await findOrCreateObservationRecord({
        user: req.user,
        studentId: student._id,
        classId: effectiveClassId,
        academicYear,
        month,
        theme: resolvedTheme,
    });

    const evidence = await PlpEvidence.create({
        school: req.user.school,
        plpRecord: record._id,
        teacher: req.user._id,
        traitId: resolvedTrait?._id || null,
        type: resolvedEvidenceType,
        note: resolvedNote,
        taggedTraits: resolvedTrait ? [String(resolvedTrait.code || resolvedTrait.name || '').trim()].filter(Boolean) : [],
        source,
        aiConfidence: aiConfidence || resolvedConfidence || null,
        aiRationale: aiRationale || resolvedRationale || null,
        reviewStatus,
    });

    const config = await PlpMonthConfig.findOne({
        school: req.user.school,
        academicYear: record.academicYear,
        month: record.month,
    }).lean();
    const newCount = (record.evidenceCount || 0) + 1;
    const themeTraits = await getThemeTraits({
        schoolId: req.user.school,
        themeCode: record.theme,
    });
    const scoreField = resolvedTrait
        ? resolveScoreFieldFromThemeTraits(themeTraits, resolvedTrait._id)
        : null;

    record.evidenceCount = newCount;

    const didChangeScore = applyScoreDelta({
        record,
        scoreField,
        delta: EVIDENCE_SCORE_DELTA,
    });
    if (didChangeScore) {
        recomputeRecordScores({ record, config });
    }
    await recomputeAwardCandidateForRecord({
        record,
        config,
        schoolId: req.user.school,
    });
    await record.save();

    const populatedEvidence = await PlpEvidence.findById(evidence._id)
        .populate('teacher', 'firstName lastName')
        .populate('traitId', 'name code themeCode')
        .lean();

    res.status(201).json({
        success: true,
        data: {
            recordId: record._id,
            evidence: populatedEvidence,
        },
    });
});

export const getNeedsReviewObservations = asyncHandler(async (req, res) => {
    const { limit = 20 } = req.query;
    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

    const list = await PlpEvidence.find({
        school: req.user.school,
        teacher: req.user._id,
        reviewStatus: 'needs_review',
    })
        .populate('traitId', 'name code themeCode')
        .populate({
            path: 'plpRecord',
            select: 'student class month academicYear',
            populate: [
                { path: 'student', select: 'firstName lastName studentId' },
                { path: 'class', select: 'name grade section' },
            ],
        })
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .lean();

    res.json({ success: true, data: list });
});

export const deleteEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const evidence = await PlpEvidence.findOne({ _id: id, school: req.user.school });
    if (!evidence) return res.status(404).json({ success: false, message: 'Evidence not found' });
    const record = await PlpStudentRecord.findOne({ _id: evidence.plpRecord, school: req.user.school });
    if (record) {
        await assertRecordWriteAccess(req.user, record);

        const config = await PlpMonthConfig.findOne({
            school: req.user.school,
            academicYear: record.academicYear,
            month: record.month,
        }).lean();

        const nextCount = Math.max(0, (record.evidenceCount || 0) - 1);
        record.evidenceCount = nextCount;

        if (evidence.traitId) {
            const themeTraits = await getThemeTraits({
                schoolId: req.user.school,
                themeCode: record.theme,
            });
            const scoreField = resolveScoreFieldFromThemeTraits(themeTraits, evidence.traitId);
            const didChangeScore = applyScoreDelta({
                record,
                scoreField,
                delta: -EVIDENCE_SCORE_DELTA,
            });
            if (didChangeScore) {
                recomputeRecordScores({ record, config });
            }
        }

        await recomputeAwardCandidateForRecord({
            record,
            config,
            schoolId: req.user.school,
        });
        await record.save();
    }
    await evidence.deleteOne();
    res.json({ success: true, message: 'Evidence deleted' });
});

export const getRecordInteractions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);

    const interactions = await PlpInteraction.find({ school: req.user.school, plpRecord: id })
        .populate('actor', 'firstName lastName role')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: interactions });
});

export const addSupervisorNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const note = String(req.body?.note || '').trim();
    if (!note) {
        return res.status(400).json({ success: false, message: 'Supervisor note is required' });
    }
    if (note.length > 1000) {
        return res.status(400).json({ success: false, message: 'Supervisor note is too long (max 1000 chars)' });
    }

    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);

    if (req.user.role !== 'department_principal') {
        return res.status(403).json({ success: false, message: 'Only supervisors can add supervisor notes' });
    }

    const interaction = await PlpInteraction.create({
        school: req.user.school,
        plpRecord: record._id,
        actorRole: 'supervisor',
        actor: req.user._id,
        actionType: 'supervisor_note',
        visibility: 'internal',
        payload: { note },
    });

    await notifyTeacherForSupervisorNote({
        schoolId: req.user.school,
        teacherId: record.teacher,
        supervisorId: req.user._id,
        recordId: record._id,
        note,
    });

    audit(req.user.school, req.user._id, 'supervisor_note_added', 'PlpStudentRecord', record._id, {});
    res.status(201).json({ success: true, data: interaction });
});

// ─── Awards ─────────────────────────────────────────────────────────────────────

export const getAwardCandidates = asyncHandler(async (req, res) => {
    const { academicYear, month, classId } = req.query;
    const numericMonth = Number(month);
    if (!academicYear || !Number.isFinite(numericMonth) || numericMonth < 1 || numericMonth > 12) {
        return res.status(400).json({ success: false, message: 'academicYear and valid month are required' });
    }

    const config = await PlpMonthConfig.findOne({
        school: req.user.school,
        academicYear,
        month: numericMonth,
    }).select('secondaryTrait minEvidenceCount').lean();

    if (!config?.secondaryTrait) {
        return res.json({ success: true, data: [] });
    }

    await refreshAwardCandidatesForMonth({
        schoolId: req.user.school,
        academicYear,
        month: numericMonth,
        configOverride: config,
    });

    const filter = {
        school: req.user.school,
        academicYear,
        month: numericMonth,
        awardCandidate: true,
    };
    if (classId) filter.class = classId;
    const candidates = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name')
        .sort({ weightedScore: -1 });
    res.json({ success: true, data: candidates });
});

export const setAwardDecision = asyncHandler(async (req, res) => {
    const { recordId, decision, reason } = req.body;
    if (decision === 'not_selected' && !reason?.trim()) {
        return res.status(400).json({ success: false, message: 'Reason required when not selecting a candidate' });
    }
    const record = await PlpStudentRecord.findOneAndUpdate(
        { _id: recordId, school: req.user.school },
        { awardDecision: decision, awardDecisionReason: reason || '' },
        { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    audit(req.user.school, req.user._id, 'award_decision', 'PlpStudentRecord', record._id, { decision, reason });
    res.json({ success: true, data: record });
});

// ─── Recommendations ────────────────────────────────────────────────────────────

export const getRecommendations = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    res.json({ success: true, data: record.recommendedActivities });
});

export const regenerateRecommendations = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    const activities = generateActivities(record.theme, record.level);
    record.recommendedActivities = activities;
    await record.save();
    res.json({ success: true, data: activities });
});

// ─── Supervisor Scope ────────────────────────────────────────────────────────────

export const getSupervisorTeachers = asyncHandler(async (req, res) => {
    const assignments = await PlpSupervisorAssignment.find({
        school: req.user.school,
        supervisor: req.user._id,
        active: true,
    }).populate('teacher', 'firstName lastName email');
    res.json({ success: true, data: assignments });
});

// ─── Supervisor Assignments (admin) ─────────────────────────────────────────────

export const getSupervisorAssignments = asyncHandler(async (req, res) => {
    const assignments = await PlpSupervisorAssignment.find({ school: req.user.school })
        .populate('supervisor', 'firstName lastName email role')
        .populate('teacher', 'firstName lastName email');
    res.json({ success: true, data: assignments });
});

export const createSupervisorAssignment = asyncHandler(async (req, res) => {
    const { supervisorId, teacherId } = req.body;
    const assignment = await PlpSupervisorAssignment.create({
        school: req.user.school,
        supervisor: supervisorId,
        teacher: teacherId,
    });
    audit(req.user.school, req.user._id, 'supervisor_assignment_created', 'PlpSupervisorAssignment', assignment._id, { supervisorId, teacherId });
    res.status(201).json({ success: true, data: assignment });
});

export const deleteSupervisorAssignment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    await PlpSupervisorAssignment.findOneAndDelete({ _id: id, school: req.user.school });
    res.json({ success: true, message: 'Assignment removed' });
});

// ─── Audit Log ───────────────────────────────────────────────────────────────────

export const getAuditLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const logs = await PlpAuditLog.find({ school: req.user.school })
        .populate('actor', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));
    const total = await PlpAuditLog.countDocuments({ school: req.user.school });
    res.json({ success: true, data: logs, total, page: Number(page) });
});

// ─── Theme labels (public helper) ────────────────────────────────────────────────

export const getThemeLabels = asyncHandler(async (req, res) => {
    const labels = await resolveThemeLabels(req.user.school);
    res.json({ success: true, data: labels });
});

// ─── Trait Config ────────────────────────────────────────────────────────────────

export const getTraits = asyncHandler(async (req, res) => {
    const traits = await PlpTraitConfig.find({ school: req.user.school })
        .populate('selCompetencyId', 'code title active')
        .populate('themeId', 'code title active')
        .sort({ displayOrder: 1, name: 1 });
    res.json({ success: true, data: traits });
});

export const getTrait = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const trait = await PlpTraitConfig.findOne({ _id: id, school: req.user.school });
    if (!trait) return res.status(404).json({ success: false, message: 'Trait not found' });
    res.json({ success: true, data: trait });
});

export const createTrait = asyncHandler(async (req, res) => {
    const { name, code, description, selSkills, isActive, displayOrder, themeCode, selCompetencyId, themeId } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: 'Name and code are required' });
    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = String(name).trim();
    const dup = await PlpTraitConfig.findOne({ school: req.user.school, code: cleanCode });
    if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait code' });
    const dupName = await PlpTraitConfig.findOne({ school: req.user.school, name: cleanName });
    if (dupName) return res.status(400).json({ success: false, message: 'Duplicate trait name' });
    const cleanedSkills = Array.isArray(selSkills)
        ? selSkills.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : [];
    const trait = await PlpTraitConfig.create({
        school: req.user.school,
        name: cleanName,
        code: cleanCode,
        description: description || '',
        selCompetencyId: selCompetencyId || null,
        themeId: themeId || null,
        selSkills: cleanedSkills,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        displayOrder: Number(displayOrder) || 0,
        themeCode: themeCode || '',
        createdBy: req.user._id,
    });
    audit(req.user.school, req.user._id, 'trait_created', 'PlpTraitConfig', trait._id, { code: trait.code });
    res.status(201).json({ success: true, data: trait });
});

export const updateTrait = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, code, description, selSkills, isActive, displayOrder, themeCode, selCompetencyId, themeId } = req.body;
    const trait = await PlpTraitConfig.findOne({ _id: id, school: req.user.school });
    if (!trait) return res.status(404).json({ success: false, message: 'Trait not found' });
    if (code) {
        const cleanCode = String(code).trim().toUpperCase();
        if (cleanCode !== trait.code) {
            const dup = await PlpTraitConfig.findOne({ school: req.user.school, code: cleanCode, _id: { $ne: id } });
            if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait code' });
        }
    }
    if (name) {
        const cleanName = String(name).trim();
        const dup = await PlpTraitConfig.findOne({ school: req.user.school, name: cleanName, _id: { $ne: id } });
        if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait name' });
    }
    const cleanedSkills = Array.isArray(selSkills)
        ? selSkills.map((s) => String(s).trim()).filter((s) => s.length > 0)
        : trait.selSkills;
    trait.name = name ? String(name).trim() : trait.name;
    trait.code = code ? String(code).trim().toUpperCase() : trait.code;
    trait.description = description !== undefined ? description : trait.description;
    trait.selCompetencyId = selCompetencyId !== undefined ? (selCompetencyId || null) : trait.selCompetencyId;
    trait.themeId = themeId !== undefined ? (themeId || null) : trait.themeId;
    trait.selSkills = cleanedSkills;
    trait.isActive = isActive !== undefined ? Boolean(isActive) : trait.isActive;
    trait.displayOrder = displayOrder !== undefined ? Number(displayOrder) : trait.displayOrder;
    trait.themeCode = themeCode !== undefined ? themeCode : trait.themeCode;
    trait.updatedBy = req.user._id;
    await trait.save();
    audit(req.user.school, req.user._id, 'trait_updated', 'PlpTraitConfig', trait._id, { code: trait.code });
    res.json({ success: true, data: trait });
});

export const setTraitActive = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;
    const trait = await PlpTraitConfig.findOne({ _id: id, school: req.user.school });
    if (!trait) return res.status(404).json({ success: false, message: 'Trait not found' });
    trait.isActive = Boolean(isActive);
    trait.updatedBy = req.user._id;
    await trait.save();
    audit(req.user.school, req.user._id, isActive ? 'trait_activated' : 'trait_deactivated', 'PlpTraitConfig', trait._id, {});
    res.json({ success: true, data: trait });
});

export const seedTraits = asyncHandler(async (req, res) => {
    const traits = await seedStarterTraits(req.user.school, req.user._id);
    res.json({ success: true, data: traits });
});

// ─── SEL Competency Config ─────────────────────────────────────────────────────

export const getSelCompetencies = asyncHandler(async (req, res) => {
    const { academicYear } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    const items = await SelCompetency.find(filter).sort({ displayOrder: 1, title: 1 });
    res.json({ success: true, data: items });
});

export const createSelCompetency = asyncHandler(async (req, res) => {
    const { academicYear, code, title, description, icon, color, displayOrder, active } = req.body;
    if (!academicYear || !code || !title) {
        return res.status(400).json({ success: false, message: 'academicYear, code, and title are required' });
    }

    const item = await SelCompetency.create({
        school: req.user.school,
        academicYear,
        code: String(code).trim().toLowerCase(),
        title: String(title).trim(),
        description: description || '',
        icon: icon || '',
        color: color || '',
        displayOrder: Number(displayOrder) || 0,
        active: active !== undefined ? Boolean(active) : true,
        createdBy: req.user._id,
    });
    audit(req.user.school, req.user._id, 'sel_competency_created', 'SelCompetency', item._id, { code: item.code });
    res.status(201).json({ success: true, data: item });
});

export const updateSelCompetency = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await SelCompetency.findOneAndUpdate(
        { _id: id, school: req.user.school },
        { ...req.body, updatedBy: req.user._id },
        { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'SEL competency not found' });
    audit(req.user.school, req.user._id, 'sel_competency_updated', 'SelCompetency', item._id, { code: item.code });
    res.json({ success: true, data: item });
});

export const seedSelCompetenciesAction = asyncHandler(async (req, res) => {
    const { academicYear } = req.body;
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'academicYear is required' });
    }
    const items = await seedSelCompetencies(req.user.school, academicYear, req.user._id);
    res.json({ success: true, data: items });
});

// ─── Character Theme Config ───────────────────────────────────────────────────

export const getCharacterThemes = asyncHandler(async (req, res) => {
    const { academicYear } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    const items = await CharacterTheme.find(filter).sort({ displayOrder: 1, title: 1 });
    res.json({ success: true, data: items });
});

export const createCharacterTheme = asyncHandler(async (req, res) => {
    const { academicYear, code, title, description, displayOrder, active } = req.body;
    if (!academicYear || !code || !title) {
        return res.status(400).json({ success: false, message: 'academicYear, code, and title are required' });
    }

    const item = await CharacterTheme.create({
        school: req.user.school,
        academicYear,
        code: String(code).trim().toLowerCase(),
        title: String(title).trim(),
        description: description || '',
        displayOrder: Number(displayOrder) || 0,
        active: active !== undefined ? Boolean(active) : true,
        createdBy: req.user._id,
    });
    audit(req.user.school, req.user._id, 'character_theme_created', 'CharacterTheme', item._id, { code: item.code });
    res.status(201).json({ success: true, data: item });
});

export const updateCharacterTheme = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const item = await CharacterTheme.findOneAndUpdate(
        { _id: id, school: req.user.school },
        { ...req.body, updatedBy: req.user._id },
        { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Character theme not found' });
    audit(req.user.school, req.user._id, 'character_theme_updated', 'CharacterTheme', item._id, { code: item.code });
    res.json({ success: true, data: item });
});

export const seedCharacterThemesAction = asyncHandler(async (req, res) => {
    const { academicYear } = req.body;
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'academicYear is required' });
    }
    const items = await seedCharacterThemes(req.user.school, academicYear, req.user._id);
    res.json({ success: true, data: items });
});
