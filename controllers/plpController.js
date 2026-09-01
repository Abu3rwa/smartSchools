import PlpMonthConfig from '../models/PlpMonthConfig.js';
import PlpStudentRecord from '../models/PlpStudentRecord.js';
import PlpEvidence from '../models/PlpEvidence.js';
import PlpSupervisorAssignment from '../models/PlpSupervisorAssignment.js';
import PlpAuditLog from '../models/PlpAuditLog.js';
import PlpTraitConfig from '../models/PlpTraitConfig.js';
import PlpInteraction from '../models/PlpInteraction.js';
import PlpGoal from '../models/PlpGoal.js';
import PlpTask from '../models/PlpTask.js';
import PlpCycle from '../models/PlpCycle.js';
import SelCompetency from '../models/SelCompetency.js';
import CharacterTheme from '../models/CharacterTheme.js';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import School from '../models/School.js';
import mongoose from 'mongoose';
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, PageNumber } from 'docx';
import { asyncHandler } from '../middleware/errorHandler.js';
import plpAiService from '../services/plpAiService.js';
import logger from '../utils/logger.js';

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
const EVIDENCE_SCORE_DELTA = 1;
const POSITIVE_EVIDENCE_TYPES = ['observation', 'positive_example', 'reflection'];

const normalizeThemeCode = (value) => String(value || '').trim().toLowerCase();
const normalizeTraitName = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());

const resolveScoreFieldFromThemeTraits = (themeTraits = [], traitId) => {
    const idx = themeTraits.findIndex((trait) => String(trait._id) === String(traitId));
    if (idx < 0 || idx >= SCORE_SLOT_BY_ORDER.length) return null;
    return SCORE_SLOT_BY_ORDER[idx] || null;
};

const applyScoreDelta = ({ record, scoreField, delta }) => {
    if (!record || !scoreField || !Number.isFinite(delta) || delta === 0) return false;
    const current = Number(record?.scores?.[scoreField] || 0);
    const next = Math.max(0, current + delta);
    if (next === current) return false;
    if (!record.scores) record.scores = {};
    record.scores[scoreField] = next;
    return true;
};

const recomputeRecordScores = ({ record, config }) => {
    const weighted = computeCountBasedWeightedScore(record.scores || {}, config?.weights || { coreTrait: 60, secondaryTrait1: 15, secondaryTrait2: 15, secondaryTrait3: 10 });
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

const buildEvidenceBackedTraitScoreEntries = async ({ schoolId, record, rawEntries = {} }) => {
    const entries = sanitizeTraitScoreEntries(rawEntries);
    if (!entries || Object.keys(entries).length === 0) return {};

    const traitIds = Object.keys(entries).filter((traitId) => mongoose.isValidObjectId(traitId));
    if (traitIds.length === 0) return {};

    const evidenceRows = await PlpEvidence.find({
        school: schoolId,
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

    const normalized = {};
    for (const traitId of traitIds) {
        const evidenceList = evidenceByTraitId[traitId] || [];
        const suggestion = await plpAiService.suggestTraitScore(traitId, evidenceList, {
            academicYear: record.academicYear,
            month: record.month,
            cycleId: record.cycle ? String(record.cycle) : null,
            recordId: String(record._id),
        });
        const suggestedScore = clampTraitScore(suggestion?.suggestedScore);
        if (suggestedScore === null || evidenceList.length === 0) {
            throw Object.assign(new Error('Trait scores can only be saved when trait-linked observation evidence exists'), { statusCode: 400 });
        }

        const requested = entries[traitId] || {};
        const requestedScore = clampTraitScore(requested?.score);
        if (requestedScore === null || requestedScore !== suggestedScore) {
            throw Object.assign(new Error('Trait scores must match the evidence-based suggested score'), { statusCode: 400 });
        }

        normalized[traitId] = {
            score: suggestedScore,
            scoreSource: 'ai_suggested',
            aiSuggestedScore: suggestedScore,
            overrideReason: '',
        };
    }

    return normalized;
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

const computeCountBasedWeightedScore = (scores = {}, weights = {}) => {
    const safeWeights = weights || { coreTrait: 60, secondaryTrait1: 15, secondaryTrait2: 15, secondaryTrait3: 10 };
    const total = Number(safeWeights.coreTrait || 0) + Number(safeWeights.secondaryTrait1 || 0) + Number(safeWeights.secondaryTrait2 || 0) + Number(safeWeights.secondaryTrait3 || 0);
    if (total <= 0) return 0;
    const raw = (
        Number(scores.coreTrait || 0) * Number(safeWeights.coreTrait || 0) +
        Number(scores.secondaryTrait1 || 0) * Number(safeWeights.secondaryTrait1 || 0) +
        Number(scores.secondaryTrait2 || 0) * Number(safeWeights.secondaryTrait2 || 0) +
        Number(scores.secondaryTrait3 || 0) * Number(safeWeights.secondaryTrait3 || 0)
    ) / total;
    return Math.round(raw * 10) / 10;
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
    { name: 'Confidence', code: 'CONFIDENCE', description: 'Believing in oneself and one\'s abilities.', month: 8 },
    { name: 'Hope', code: 'HOPE', description: 'Looking forward to the future with optimism.', month: 9 },
    { name: 'Wisdom', code: 'WISDOM', description: 'Using good judgment and deep understanding.', month: 10 },
    { name: 'Humility', code: 'HUMILITY', description: 'Recognizing one\'s limitations and valuing others.', month: 11 },
    { name: 'Purpose', code: 'PURPOSE', description: 'Having clear goals and a sense of direction.', month: 12 },
    { name: 'Courage', code: 'COURAGE', description: 'Facing difficulty with bravery and resilience.', month: 1 },
    { name: 'Persistence', code: 'PERSISTENCE', description: 'Continuing steadily toward a goal despite obstacles.', month: 2 },
    { name: 'Compassion', code: 'COMPASSION', description: 'Caring about others and acting with kindness.', month: 3 },
    { name: 'Service', code: 'SERVICE', description: 'Contributing to the well-being of others.', month: 4 },
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
        month: t.month,
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
    // Re-sort in-memory by school-year order: Sep(9)→Oct→…→Aug(8)
    const schoolYearOrder = (m) => (m >= 9 ? m - 9 : m + 3);
    configs.sort((a, b) => schoolYearOrder(a.month) - schoolYearOrder(b.month));
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
    const { academicYear, month, secondaryTrait } = req.body;
    if (!month) {
        return res.status(400).json({ success: false, message: 'Month is required' });
    }
    let resolvedTheme = 'confidence';
    if (secondaryTrait) {
        const trait = await PlpTraitConfig.findOne({ _id: secondaryTrait, school: req.user.school });
        if (!trait) {
            return res.status(400).json({ success: false, message: 'Invalid character trait' });
        }
        resolvedTheme = trait.themeCode || 'confidence';
    }
    const config = await PlpMonthConfig.create({
        school: req.user.school,
        academicYear,
        month,
        theme: resolvedTheme,
        secondaryTrait: secondaryTrait || null,
        minEvidenceCount: 2,
        createdBy: req.user._id,
    });
    await refreshAwardCandidatesForMonth({
        schoolId: req.user.school,
        academicYear: config.academicYear,
        month: config.month,
        configOverride: config.toObject(),
    });
    audit(req.user.school, req.user._id, 'config_created', 'PlpMonthConfig', config._id, { month });
    res.status(201).json({ success: true, data: config });
});

export const updateMonthConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { secondaryTrait } = req.body;
    const updateData = { updatedBy: req.user._id };
    if (req.body.month !== undefined) updateData.month = req.body.month;
    if (secondaryTrait !== undefined) {
        if (secondaryTrait) {
            const trait = await PlpTraitConfig.findOne({ _id: secondaryTrait, school: req.user.school });
            if (!trait) {
                return res.status(400).json({ success: false, message: 'Invalid character trait' });
            }
            updateData.theme = trait.themeCode || 'confidence';
            updateData.secondaryTrait = secondaryTrait;
        } else {
            updateData.secondaryTrait = null;
        }
    }
    const config = await PlpMonthConfig.findOneAndUpdate(
        { _id: id, school: req.user.school, status: { $ne: 'closed' } },
        updateData,
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
    const { academicYear, month, cycleId, classId, teacherId } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    if (cycleId && mongoose.isValidObjectId(cycleId)) {
        filter.cycle = cycleId;
    } else if (month) {
        filter.month = Number(month);
    }
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
            if (classId) {
                if (!allowedClassIds.includes(String(classId))) {
                    return res.json({ success: true, data: [] });
                }
                filter.class = classId;
            } else if (allowedClassIds.length === 0) {
                // No recognized homeroom classes; still surface records this teacher personally created.
                filter.teacher = req.user._id;
            } else {
                // Include records the teacher authored even if the record's class is no longer
                // in their current homeroom scope (e.g. student/class reassignment since creation).
                filter.$or = [
                    { class: { $in: allowedClassIds } },
                    { teacher: req.user._id },
                ];
            }
        }
    } else if (teacherId) {
        filter.teacher = teacherId;
    }

    const records = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('cycle', 'title cycleCode startDate endDate status spotlightTraits')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 });

    res.json({ success: true, data: records });
});

export const getLeaderboard = asyncHandler(async (req, res) => {
    const { academicYear, month, cycleId, classId, teacherId, traitId, rankBy, limit } = req.query;
    const filter = { school: req.user.school };
    if (academicYear) filter.academicYear = academicYear;
    if (cycleId && mongoose.isValidObjectId(cycleId)) {
        filter.cycle = cycleId;
    } else if (month !== undefined && month !== '' && month !== null) {
        filter.month = Number(month);
    }
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
            if (classId) {
                if (!allowedClassIds.includes(String(classId))) {
                    return res.json({ success: true, data: { rows: [], mode: 'all' } });
                }
                filter.class = classId;
            } else if (allowedClassIds.length === 0) {
                filter.teacher = req.user._id;
            } else {
                filter.$or = [
                    { class: { $in: allowedClassIds } },
                    { teacher: req.user._id },
                ];
            }
        }
    } else if (teacherId) {
        filter.teacher = teacherId;
    }

    const records = await PlpStudentRecord.find(filter)
        .populate('student', 'firstName lastName studentId')
        .populate('teacher', 'firstName lastName')
        .populate('focusTrait', 'name code themeCode')
        .populate('cycle', 'title cycleCode')
        .populate('class', 'name grade')
        .sort({ createdAt: -1 });

    if (records.length === 0) {
        return res.json({ success: true, data: { rows: [], mode: 'all' } });
    }

    const normalizedTraitId = String(traitId || '').trim();
    const ranking = rankBy === 'overallScore' ? 'overallScore' : 'evidence';
    let mode = 'all';
    let selectedTrait = null;
    if (normalizedTraitId && normalizedTraitId.toLowerCase() !== 'all' && mongoose.isValidObjectId(normalizedTraitId)) {
        selectedTrait = await PlpTraitConfig.findOne({
            _id: normalizedTraitId,
            school: req.user.school,
            isActive: true,
        }).select('_id name month themeCode').lean();
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

    const selectedTraitScoreField = mode === 'trait'
        ? resolveScoreFieldFromThemeTraits(
            await getThemeTraits({ schoolId: req.user.school, themeCode: selectedTrait.themeCode }),
            selectedTrait._id
        )
        : null;

    const leaderboardRows = records
        .map((record) => {
            const recordId = String(record._id);
            const traitEvidenceCount = evidenceCountByRecordId.get(recordId) || 0;
            // Use the aggregate for both modes so the displayed and ranked evidence
            // always reflects the same filtered evidence set.
            const matchedEvidenceCount = traitEvidenceCount;
            const selectedTraitScore = mode === 'trait' && record.theme === selectedTrait.themeCode
                ? Number(record.scores?.[selectedTraitScoreField] || 0)
                : null;
            return {
                record,
                matchedEvidenceCount,
                selectedTraitScore,
            };
        })
        .filter((row) => {
            if (mode !== 'trait') return true;
            // A trait filter must be driven by evidence actually tagged to that trait,
            // not by the theme assigned to the student's record.
            return row.matchedEvidenceCount > 0;
        })
        .sort((a, b) => {
            const weightedDiff = Number(b.record.weightedScore || 0) - Number(a.record.weightedScore || 0);
            const evidenceDiff = b.matchedEvidenceCount - a.matchedEvidenceCount;
            if (ranking === 'overallScore') {
                if (weightedDiff !== 0) return weightedDiff;
                if (evidenceDiff !== 0) return evidenceDiff;
            } else {
                if (evidenceDiff !== 0) return evidenceDiff;
                if (weightedDiff !== 0) return weightedDiff;
            }

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
            rankBy: ranking,
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
        .populate('cycle', 'title cycleCode startDate endDate status')
        .populate('class', 'name grade');
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);
    res.json({ success: true, data: record });
});

export const exportRecordDocx = asyncHandler(async (req, res) => {
    try {
        const record = await PlpStudentRecord.findOne({ _id: req.params.id, school: req.user.school })
            .populate('student', 'firstName lastName studentId')
            .populate('teacher', 'firstName lastName')
            .populate('cycle', 'title cycleCode')
            .populate('class', 'name grade')
            .lean();
        if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
        await assertRecordAccess(req.user, record);

        const [school, evidence, goals, traits] = await Promise.all([
            School.findById(req.user.school).select('name settings.branding.logoUrl').lean(),
            PlpEvidence.find({ school: req.user.school, plpRecord: record._id }).populate('traitId', 'name').sort({ createdAt: -1 }).lean(),
            PlpGoal.find({ school: req.user.school, plpRecord: record._id }).sort({ createdAt: -1 }).lean(),
            PlpTraitConfig.find({ school: req.user.school, isActive: true }).select('_id name themeCode displayOrder').sort({ displayOrder: 1, name: 1 }).lean(),
        ]);
        const text = (value, fallback = '-') => String(value || '').trim() || fallback;
        const titleCase = (value) => text(value, 'Unlinked').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
        const date = (value) => {
            if (!value) return 'No due date';
            const parsedDate = new Date(value);
            return Number.isNaN(parsedDate.getTime()) ? 'No due date' : new Intl.DateTimeFormat('en-GB').format(parsedDate);
        };
        const border = { style: BorderStyle.SINGLE, size: 4, color: 'B8C4CE' };
        const cell = (value, header = false) => new TableCell({
            shading: header ? { fill: '1F4E78' } : undefined,
            margins: { top: 90, bottom: 90, left: 100, right: 100 },
            children: String(value || '-').split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line || '-', bold: header, color: header ? 'FFFFFF' : '000000', size: 20 })] })),
        });
        const table = (headers, rows) => new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
            rows: [
                new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, true)) }),
                ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
            ],
        });
        const heading = (value, level = HeadingLevel.HEADING_1) => new Paragraph({ text: value, heading: level, spacing: { before: 240, after: 120 } });
        const studentName = `${text(record.student?.firstName, '')} ${text(record.student?.lastName, '')}`.trim() || 'Student';
        const teacherName = `${text(record.teacher?.firstName, '')} ${text(record.teacher?.lastName, '')}`.trim() || 'Not recorded';
        const positiveEvidence = evidence.filter((item) => POSITIVE_EVIDENCE_TYPES.includes(item.type));
        const traitTallies = positiveEvidence.reduce((counts, item) => {
            const name = titleCase(item.traitId?.name);
            counts[name] = (counts[name] || 0) + 1;
            return counts;
        }, {});
        const storedScores = toPlainTraitScoreEntries(record.traitScoreEntries);
        const legacyFields = buildRecordScoreFieldByTraitId({ record, activeTraits: traits });
        const scoreRows = traits.map((trait) => {
            const saved = clampTraitScore(storedScores?.[String(trait._id)]?.score);
            const legacy = clampTraitScore(record.scores?.[legacyFields.get(String(trait._id))]);
            return [titleCase(trait.name), saved ?? legacy];
        }).filter(([, score]) => score !== null && score !== undefined);
        const sections = [
            new Paragraph({ text: text(school?.name, 'School'), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: 'Personal Learning Portfolio Report', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 240 } }),
            heading('Student Information'),
            table(['Field', 'Value'], [['Student', studentName], ['Student ID', record.student?.studentId], ['Class', record.class?.name], ['Academic Year', record.academicYear], ['Round', record.cycle?.title || `Month ${record.month}`], ['Teacher', teacherName]]),
            heading('Social-Emotional Development'),
            table(['Character Trait', 'Observed Indicators'], Object.keys(traitTallies).length ? Object.entries(traitTallies).map(([trait, count]) => [trait, `${count} positive observation${count === 1 ? '' : 's'} recorded`]) : [['No evidence recorded this round.', 'No positive observations recorded.']]),
            table(['Trait', 'Type', 'Observable Indicator', 'Date'], evidence.length ? evidence.map((item) => [titleCase(item.traitId?.name), String(item.type || 'observation').replace('_', ' '), text(item.note), date(item.createdAt)]) : [['No evidence recorded this round.', '-', '-', '-']]),
            heading('Trait Score Breakdown'),
            table(['Trait', 'Score'], scoreRows.length ? scoreRows.map(([trait, score]) => [trait, Number(score).toFixed(1)]) : [['No trait scores saved this round.', '-']]),
            heading('Teacher Feedback'),
            table(['Affirmation', 'Challenge'], [[positiveEvidence.slice(0, 3).map((item) => text(item.note)).join('\n') || 'Progress has been noted in the student portfolio.', goals.map((goal) => text(goal.teacherProgressNote, '') || text(goal.successCriteria, '') || `Continue working toward: ${text(goal.title)}`).filter(Boolean).join('\n') || 'Continue working toward the active goals.']]),
            heading('Goals and Teacher Feedback'),
            table(['Category', 'Goal', 'Status', 'Due Date'], goals.length ? goals.map((goal) => [titleCase(goal.goalType), text(goal.title), titleCase(goal.status).replace('_', ' '), date(goal.targetDate)]) : [['No goals recorded this round.', '-', '-', 'No due date']]),
            heading('Academic Effort'),
            table(['Current Level', 'Overall Score'], [[titleCase(record.level), Number(record.weightedScore || 0).toFixed(1)]]),
        ];
        const academicGoals = goals.filter((goal) => goal.goalType === 'academic');
        if (academicGoals.length) {
            sections.push(heading('Academic Goals', HeadingLevel.HEADING_2));
            sections.push(table(['Observed Strength', 'Growth Goal', 'Comment on Previous Goal'], academicGoals.map((goal) => [text(goal.teacherProgressNote, 'Progress is being monitored.'), text(goal.title), text(goal.successCriteria, 'No previous-goal comment recorded.')] )));
        }
        const doc = new Document({
            styles: { default: { document: { run: { font: 'Aptos', size: 20 } }, heading1: { run: { font: 'Aptos Display', color: '1F4E78', bold: true } } } },
            sections: [{
                headers: { default: new Header({ children: [new Paragraph({ text: text(school?.name, 'School'), alignment: AlignmentType.RIGHT, spacing: { after: 100 } })] }) },
                footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Page '), PageNumber.CURRENT, new TextRun(' of '), PageNumber.TOTAL_PAGES] })] }) },
                children: sections,
            }],
        });
        const buffer = await Packer.toBuffer(doc);
        const safeStudentName = `${record.student?.firstName || 'student'}-${record.student?.lastName || 'record'}`.trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        logger.info(`PLP DOCX report generated for record ${record._id} by user ${req.user._id}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="plp-${safeStudentName}-${record.academicYear}.docx"`);
        res.send(buffer);
    } catch (error) {
        logger.error(`PLP DOCX generation failed for record ${req.params.id} by user ${req.user?._id}`);
        if (error?.statusCode) throw error;
        return res.status(500).json({ success: false, message: 'Failed to generate report' });
    }
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

const resolveCycleById = async ({ schoolId, academicYear, cycleId }) => {
    if (!cycleId || !mongoose.isValidObjectId(cycleId)) return null;
    return PlpCycle.findOne({
        _id: cycleId,
        school: schoolId,
        academicYear,
    }).select('_id title startDate endDate status spotlightTraits minEvidenceCount').lean();
};

const resolveCycleForDate = async ({ schoolId, academicYear, date }) => {
    if (!academicYear || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return PlpCycle.findOne({
        school: schoolId,
        academicYear,
        status: { $in: ['published', 'draft'] },
        startDate: { $lte: date },
        endDate: { $gte: date },
    }).select('_id title startDate endDate status spotlightTraits minEvidenceCount').sort({ status: 1, printOrder: 1, startDate: 1 }).lean();
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
    cycleId = null,
    month,
    theme,
}) => {
    let record = cycleId ? await PlpStudentRecord.findOne({
        school: user.school,
        academicYear,
        cycle: cycleId,
        class: classId,
        student: studentId,
        teacher: user._id,
    }) : null;

    if (!record) {
        record = cycleId ? await PlpStudentRecord.findOne({
            school: user.school,
            academicYear,
            cycle: cycleId,
            class: classId,
            student: studentId,
        }).sort({ createdAt: -1 }) : null;
    }

    if (!record) {
        record = await PlpStudentRecord.findOne({
        school: user.school,
        academicYear,
        month,
        class: classId,
        student: studentId,
        teacher: user._id,
    });
    }

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
        cycle: cycleId,
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
    const { academicYear, month, cycleId, theme, classId, studentId, scores, focusTrait } = req.body;
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

    const cycle = await resolveCycleById({
        schoolId: req.user.school,
        academicYear,
        cycleId,
    });
    if (cycleId && !cycle) {
        return res.status(400).json({ success: false, message: 'Selected PLP round is invalid' });
    }
    const resolvedMonth = cycle?.startDate
        ? (new Date(cycle.startDate).getMonth() + 1)
        : (Number.isInteger(Number(month)) ? Number(month) : ((new Date()).getMonth() + 1));
    const config = await PlpMonthConfig.findOne({
        school: req.user.school, academicYear, month: resolvedMonth, status: 'published',
    });
    const weights = config?.weights || { coreTrait: 60, secondaryTrait1: 15, secondaryTrait2: 15, secondaryTrait3: 10 };

    const computedScores = scores || {};
    const weighted = computeWeightedScore(computedScores, weights);
    const level = resolveLevel(weighted);
    const activities = generateActivities(theme, level);

    // The uniqueness constraint is scoped by (school, academicYear, cycle/month, teacher, student) — not by class.
    // Look up any existing match first so a stale/reassigned class doesn't surface a confusing duplicate-key error.
    const duplicateMatch = cycle?._id
        ? { school: req.user.school, academicYear, cycle: cycle._id, teacher: req.user._id, student: studentId }
        : { school: req.user.school, academicYear, cycle: null, month: resolvedMonth, teacher: req.user._id, student: studentId };
    const existingRecord = await PlpStudentRecord.findOne(duplicateMatch)
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name grade');
    if (existingRecord) {
        return res.status(200).json({
            success: true,
            alreadyExists: true,
            message: 'A PLP record already exists for this student in the selected Round/Month.',
            data: existingRecord,
        });
    }

    let record;
    try {
        record = await PlpStudentRecord.create({
            school: req.user.school,
            academicYear,
            cycle: cycle?._id || null,
            month: resolvedMonth,
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
    } catch (createError) {
        if (createError?.code === 11000) {
            const raceRecord = await PlpStudentRecord.findOne(duplicateMatch)
                .populate('student', 'firstName lastName studentId')
                .populate('class', 'name grade');
            if (raceRecord) {
                return res.status(200).json({
                    success: true,
                    alreadyExists: true,
                    message: 'A PLP record already exists for this student in the selected Round/Month.',
                    data: raceRecord,
                });
            }
        }
        throw createError;
    }
    audit(req.user.school, req.user._id, 'record_created', 'PlpStudentRecord', record._id, { classId, studentId });
    res.status(201).json({ success: true, data: record });
});

export const initializeRoundRecords = asyncHandler(async (req, res) => {
    const { academicYear, cycleId, classId, focusTrait } = req.body;
    if (!academicYear || !cycleId || !classId) {
        return res.status(400).json({ success: false, message: 'academicYear, cycleId, and classId are required' });
    }

    await assertTeacherHomeroomClassAccess(req.user, classId, academicYear);
    const cycle = await resolveCycleById({ schoolId: req.user.school, academicYear, cycleId });
    if (!cycle || cycle.status !== 'published') {
        return res.status(400).json({ success: false, message: 'Only a published PLP round can be initialized' });
    }

    const classRecord = await Class.findOne({ _id: classId, school: req.user.school, academicYear, isActive: true }).select('_id').lean();
    if (!classRecord) return res.status(404).json({ success: false, message: 'Class not found' });

    let selectedTrait = null;
    if (focusTrait) {
        selectedTrait = await PlpTraitConfig.findOne({ _id: focusTrait, school: req.user.school, isActive: true }).select('_id themeCode').lean();
        if (!selectedTrait) return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
    }

    const students = await Student.find({ school: req.user.school, currentClass: classId, status: 'active' }).select('_id').lean();
    if (students.length === 0) return res.json({ success: true, data: { created: 0, skipped: 0, total: 0 } });

    // Match the unique index scope (school, academicYear, cycle, teacher, student) — omit class so a
    // student whose class changed since an earlier record was created is still correctly skipped.
    const existing = await PlpStudentRecord.find({
        school: req.user.school,
        academicYear,
        cycle: cycle._id,
        teacher: req.user._id,
        student: { $in: students.map((student) => student._id) },
    }).select('student').lean();
    const existingStudentIds = new Set(existing.map((record) => String(record.student)));
    const studentsToCreate = students.filter((student) => !existingStudentIds.has(String(student._id)));
    const month = new Date(cycle.startDate).getMonth() + 1;
    const theme = selectedTrait?.themeCode || 'confidence';

    if (studentsToCreate.length > 0) {
        await PlpStudentRecord.insertMany(studentsToCreate.map((student) => ({
            school: req.user.school,
            academicYear,
            cycle: cycle._id,
            month,
            theme,
            focusTrait: selectedTrait?._id || null,
            teacher: req.user._id,
            class: classId,
            student: student._id,
            scores: { coreTrait: 0, secondaryTrait1: 0, secondaryTrait2: 0, secondaryTrait3: 0 },
            weightedScore: 0,
            level: 'emerging',
            recommendedActivities: generateActivities(theme, 'emerging'),
        })), { ordered: false });
    }

    res.status(201).json({
        success: true,
        data: { created: studentsToCreate.length, skipped: existing.length, total: students.length },
    });
});

export const updateRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const existing = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found' });
    if (existing.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordWriteAccess(req.user, existing);

    const { scores, traitScoreEntries, cycleId, month, theme, focusTrait } = req.body;
    const updateData = {};

    if (cycleId !== undefined) {
        const cycle = await resolveCycleById({
            schoolId: req.user.school,
            academicYear: existing.academicYear,
            cycleId,
        });
        if (cycleId && !cycle) {
            return res.status(400).json({ success: false, message: 'Selected PLP round is invalid' });
        }
        if (cycle && cycle.status !== 'published') {
            return res.status(400).json({ success: false, message: 'Only published PLP rounds can be assigned to a record' });
        }
        updateData.cycle = cycle?._id || null;
        updateData.month = cycle?.startDate
            ? new Date(cycle.startDate).getMonth() + 1
            : (Number.isInteger(Number(month)) ? Number(month) : existing.month);
    } else if (month !== undefined) {
        updateData.month = Number(month);
    }

    if (theme !== undefined) updateData.theme = theme;
    if (focusTrait !== undefined) updateData.focusTrait = focusTrait || null;
    const hasDirectScores = !!scores;
    const hasTraitScoreEntries = traitScoreEntries && typeof traitScoreEntries === 'object';
    if (hasDirectScores) {
        return res.status(400).json({ success: false, message: 'Direct score entry is disabled. Save scores from observation-backed trait suggestions instead.' });
    }
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
        const sanitizedEntries = hasTraitScoreEntries
            ? await buildEvidenceBackedTraitScoreEntries({
                schoolId: req.user.school,
                record: existing,
                rawEntries: traitScoreEntries,
            })
            : null;

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
    const updated = await PlpStudentRecord.findOneAndUpdate(
        { _id: id, school: req.user.school },
        updateData,
        { new: true, runValidators: true }
    )
        .populate('student', 'firstName lastName studentId');
    res.json({ success: true, data: updated });
});

export const deleteRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordWriteAccess(req.user, record);

    await Promise.all([
        PlpEvidence.deleteMany({ school: req.user.school, plpRecord: record._id }),
        PlpTask.deleteMany({ school: req.user.school, plpRecord: record._id }),
        PlpInteraction.deleteMany({ school: req.user.school, plpRecord: record._id }),
    ]);
    await PlpGoal.deleteMany({ school: req.user.school, plpRecord: record._id });
    await PlpStudentRecord.deleteOne({ _id: record._id, school: req.user.school });
    audit(req.user.school, req.user._id, 'record_deleted', 'PlpStudentRecord', record._id, {});
    res.json({ success: true, data: { id: record._id } });
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

export const unlockRecord = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
        return res.status(400).json({ success: false, message: 'A reason is required to unlock a record' });
    }
    if (reason.length > 500) {
        return res.status(400).json({ success: false, message: 'Reason must be 500 characters or fewer' });
    }
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status !== 'locked') {
        return res.status(400).json({ success: false, message: 'Only locked records can be unlocked' });
    }
    record.status = record.submittedAt ? 'submitted' : 'in_progress';
    await record.save();
    audit(req.user.school, req.user._id, 'record_unlocked', 'PlpStudentRecord', record._id, { reason });
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

export const getStudentEvidence = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) {
        return res.status(400).json({ success: false, message: 'Invalid student selection' });
    }

    const student = await Student.findOne({ _id: studentId, school: req.user.school, status: 'active' })
        .select('_id firstName lastName studentId')
        .lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (req.user.role === 'student') {
        return res.status(403).json({ success: false, message: 'Student evidence history is not available' });
    }

    const { traitId, type, from, to, academicYear, cycleId, month } = req.query;
    const recordFilter = { school: req.user.school, student: student._id };
    if (academicYear) recordFilter.academicYear = String(academicYear);
    if (cycleId) {
        if (!mongoose.isValidObjectId(cycleId)) return res.status(400).json({ success: false, message: 'Invalid Round selection' });
        recordFilter.cycle = cycleId;
    } else if (month !== undefined && month !== '') {
        const parsedMonth = Number(month);
        if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
            return res.status(400).json({ success: false, message: 'Invalid month selection' });
        }
        recordFilter.month = parsedMonth;
    }

    const records = await PlpStudentRecord.find(recordFilter)
        .select('_id teacher class cycle month academicYear theme')
        .populate('cycle', 'title cycleCode startDate endDate status')
        .lean();
    if (req.user.role === 'teacher') {
        const allowedClassIds = await getTeacherHomeroomClassIds(req.user.school, req.user._id, academicYear || null);
        const visibleRecords = records.filter((record) => allowedClassIds.includes(String(record.class)));
        records.splice(0, records.length, ...visibleRecords);
    } else if (req.user.role === 'department_principal') {
        const assignments = await PlpSupervisorAssignment.find({ school: req.user.school, supervisor: req.user._id, active: true })
            .select('teacher')
            .lean();
        const allowedTeacherIds = new Set(assignments.map((assignment) => String(assignment.teacher)));
        const visibleRecords = records.filter((record) => allowedTeacherIds.has(String(record.teacher)));
        records.splice(0, records.length, ...visibleRecords);
    } else if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const recordById = new Map(records.map((record) => [String(record._id), record]));
    const evidenceFilter = { school: req.user.school, plpRecord: { $in: records.map((record) => record._id) } };
    if (traitId) {
        if (!mongoose.isValidObjectId(traitId)) return res.status(400).json({ success: false, message: 'Invalid trait selection' });
        evidenceFilter.traitId = traitId;
    }
    if (type) evidenceFilter.type = type;
    if (from || to) {
        evidenceFilter.createdAt = {};
        if (from) evidenceFilter.createdAt.$gte = new Date(from);
        if (to) evidenceFilter.createdAt.$lte = new Date(to);
    }

    const evidence = records.length === 0 ? [] : await PlpEvidence.find(evidenceFilter)
        .populate('teacher', 'firstName lastName')
        .populate('traitId', 'name code themeCode month')
        .sort({ createdAt: -1 })
        .lean();
    const enrichedEvidence = evidence.map((item) => ({
        ...item,
        record: recordById.get(String(item.plpRecord)) || null,
    }));
    const tallies = {};
    enrichedEvidence.forEach((item) => {
        if (!item.traitId || !POSITIVE_EVIDENCE_TYPES.includes(item.type)) return;
        const key = String(item.traitId._id);
        tallies[key] = (tallies[key] || 0) + 1;
    });

    res.json({ success: true, data: { student, evidence: enrichedEvidence, tallies } });
});

// ─── CSV Export ──────────────────────────────────────────────────────────────

const escapeCsvField = (value) => {
    const stringValue = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
    return stringValue;
};

const buildCsv = (headers, rows) => {
    const headerLine = headers.map(escapeCsvField).join(',');
    const dataLines = rows.map((row) => headers.map((header) => escapeCsvField(row[header])).join(','));
    return [headerLine, ...dataLines].join('\r\n');
};

export const exportObservationsByTrait = asyncHandler(async (req, res) => {
    const { traitId, academicYear, cycleId, classId } = req.query;
    if (!traitId || !mongoose.isValidObjectId(traitId)) {
        return res.status(400).json({ success: false, message: 'A valid traitId is required' });
    }
    if (req.user.role === 'student') return res.status(403).json({ success: false, message: 'Not authorized' });

    const trait = await PlpTraitConfig.findOne({ _id: traitId, school: req.user.school }).select('name').lean();
    if (!trait) return res.status(404).json({ success: false, message: 'Trait not found' });

    const headers = ['Student First Name', 'Student Last Name', 'Student ID', 'Class', 'Trait', 'Type', 'Note', 'Teacher', 'Date'];
    const sendCsv = (rows) => {
        const safeTraitName = String(trait.name || 'trait').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const filename = `plp-observations-${safeTraitName}-${academicYear || 'all-years'}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(`\uFEFF${buildCsv(headers, rows)}`);
    };

    const recordFilter = { school: req.user.school };
    if (academicYear) recordFilter.academicYear = String(academicYear);
    if (cycleId) {
        if (!mongoose.isValidObjectId(cycleId)) return res.status(400).json({ success: false, message: 'Invalid Round selection' });
        recordFilter.cycle = cycleId;
    }
    if (classId && !mongoose.isValidObjectId(classId)) {
        return res.status(400).json({ success: false, message: 'Invalid class selection' });
    }

    if (req.user.role === 'teacher') {
        const allowedClassIds = await getTeacherHomeroomClassIds(req.user.school, req.user._id, academicYear || null);
        if (allowedClassIds.length === 0) return sendCsv([]);
        if (classId && !allowedClassIds.includes(String(classId))) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
        recordFilter.class = classId || { $in: allowedClassIds };
    } else if (req.user.role === 'department_principal') {
        const assignments = await PlpSupervisorAssignment.find({
            school: req.user.school,
            supervisor: req.user._id,
            active: true,
        }).select('teacher').lean();
        const allowedTeacherIds = assignments.map((assignment) => assignment.teacher);
        if (allowedTeacherIds.length === 0) return sendCsv([]);
        recordFilter.teacher = { $in: allowedTeacherIds };
        if (classId) recordFilter.class = classId;
    } else if (req.user.role === 'admin') {
        if (classId) recordFilter.class = classId;
    } else {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const records = await PlpStudentRecord.find(recordFilter).select('_id').lean();
    if (records.length === 0) return sendCsv([]);

    const evidence = await PlpEvidence.find({
        school: req.user.school,
        plpRecord: { $in: records.map((record) => record._id) },
        traitId,
    })
        .populate({
            path: 'plpRecord',
            select: 'student class',
            populate: [
                { path: 'student', select: 'firstName lastName studentId' },
                { path: 'class', select: 'name' },
            ],
        })
        .populate('teacher', 'firstName lastName')
        .sort({ createdAt: -1 })
        .lean();

    const rows = evidence.map((item) => ({
        'Student First Name': item.plpRecord?.student?.firstName || '',
        'Student Last Name': item.plpRecord?.student?.lastName || '',
        'Student ID': item.plpRecord?.student?.studentId || '',
        Class: item.plpRecord?.class?.name || '',
        Trait: trait.name,
        Type: String(item.type || '').replace('_', ' '),
        Note: item.note || '',
        Teacher: `${item.teacher?.firstName || ''} ${item.teacher?.lastName || ''}`.trim(),
        Date: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : '',
    }));

    return sendCsv(rows);
});

export const getTraitScoreSuggestions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const record = await PlpStudentRecord.findOne({ _id: id, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    await assertRecordAccess(req.user, record);

    const activeTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .populate('themeId', 'code title active')
        .select('_id name code month themeCode themeId displayOrder')
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
                month: trait.month || null,
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
    const cleanNote = String(note || '').trim();
    if (!cleanNote) {
        return res.status(400).json({ success: false, message: 'Evidence note is required' });
    }
    if (cleanNote.length > 1000) {
        return res.status(400).json({ success: false, message: 'Evidence note must be 1000 characters or fewer' });
    }
    const evidence = await PlpEvidence.create({
        school: req.user.school,
        plpRecord: id,
        student: record.student,
        teacher: req.user._id,
        traitId: traitId || null,
        type,
        note: cleanNote,
        taggedTraits: taggedTraits || [],
        source: source || 'manual',
        aiConfidence: aiConfidence || null,
        aiRationale: aiRationale || null,
        reviewStatus: reviewStatus || 'confirmed',
    });
    audit(req.user.school, req.user._id, 'evidence_created', 'PlpEvidence', evidence._id, { recordId: id, type: evidence.type });

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
        .select('_id name code description month themeCode displayOrder')
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

    const observationMonth = observationDate.getMonth() + 1;
    const academicYear = String(req.body?.academicYear || student.academicYear || req.academicYear || '').trim();
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'Academic year is required for observation capture' });
    }

    const availableTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .select('_id name code description month themeCode displayOrder')
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

    const resolvedMonth = observationMonth;
    const resolvedCycle = await resolveCycleForDate({
        schoolId: req.user.school,
        academicYear,
        date: observationDate,
    });

    const resolvedTheme = await resolveObservationRecordTheme(
        req.user.school,
        academicYear,
        resolvedMonth,
        resolvedTrait?.themeCode || ''
    );

    const record = await findOrCreateObservationRecord({
        user: req.user,
        studentId: student._id,
        classId: effectiveClassId,
        academicYear,
        cycleId: resolvedCycle?._id || null,
        month: resolvedMonth,
        theme: resolvedTheme,
    });

    const evidence = await PlpEvidence.create({
        school: req.user.school,
        plpRecord: record._id,
        student: record.student,
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
            recordMonth: record.month,
            recordCycleId: record.cycle || null,
            recordCycleTitle: resolvedCycle?.title || null,
            traitMonth: resolvedTrait?.month || null,
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
            select: 'student class cycle month academicYear',
            populate: [
                { path: 'student', select: 'firstName lastName studentId' },
                { path: 'class', select: 'name grade section' },
                { path: 'cycle', select: 'title cycleCode' },
            ],
        })
        .sort({ createdAt: -1 })
        .limit(parsedLimit)
        .lean();

    res.json({ success: true, data: list });
});

export const updateEvidence = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const evidence = await PlpEvidence.findOne({ _id: id, school: req.user.school });
    if (!evidence) return res.status(404).json({ success: false, message: 'Evidence not found' });
    if (evidence.source === 'ai_classified') {
        return res.status(400).json({ success: false, message: 'AI-classified evidence cannot be edited. Delete it and add a manual entry instead.' });
    }

    const record = await PlpStudentRecord.findOne({ _id: evidence.plpRecord, school: req.user.school });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    if (record.status === 'locked') return res.status(400).json({ success: false, message: 'Record is locked' });
    await assertRecordWriteAccess(req.user, record);

    const { type, note, traitId } = req.body;
    const updates = {};
    if (note !== undefined) {
        const cleanNote = String(note || '').trim();
        if (!cleanNote) return res.status(400).json({ success: false, message: 'Evidence note is required' });
        if (cleanNote.length > 1000) return res.status(400).json({ success: false, message: 'Evidence note must be 1000 characters or fewer' });
        updates.note = cleanNote;
    }
    if (type !== undefined) {
        const allowedTypes = ['observation', 'incident', 'positive_example', 'reflection'];
        if (!allowedTypes.includes(type)) return res.status(400).json({ success: false, message: 'Invalid evidence type' });
        updates.type = type;
    }

    const previousTraitId = evidence.traitId ? String(evidence.traitId) : null;
    let nextTraitId = previousTraitId;
    if (traitId !== undefined) {
        if (traitId) {
            const trait = await PlpTraitConfig.findOne({ _id: traitId, school: req.user.school, isActive: true }).select('_id').lean();
            if (!trait) return res.status(400).json({ success: false, message: 'Selected trait is invalid' });
        }
        updates.traitId = traitId || null;
        nextTraitId = traitId ? String(traitId) : null;
    }

    Object.assign(evidence, updates);
    await evidence.save();

    if (nextTraitId !== previousTraitId) {
        const config = await PlpMonthConfig.findOne({
            school: req.user.school,
            academicYear: record.academicYear,
            month: record.month,
        }).lean();
        const themeTraits = await getThemeTraits({ schoolId: req.user.school, themeCode: record.theme });
        let scoreChanged = false;
        if (previousTraitId) {
            const oldScoreField = resolveScoreFieldFromThemeTraits(themeTraits, previousTraitId);
            if (applyScoreDelta({ record, scoreField: oldScoreField, delta: -EVIDENCE_SCORE_DELTA })) scoreChanged = true;
        }
        if (nextTraitId) {
            const newScoreField = resolveScoreFieldFromThemeTraits(themeTraits, nextTraitId);
            if (applyScoreDelta({ record, scoreField: newScoreField, delta: EVIDENCE_SCORE_DELTA })) scoreChanged = true;
        }
        if (scoreChanged) recomputeRecordScores({ record, config });
        await recomputeAwardCandidateForRecord({ record, config, schoolId: req.user.school });
        await record.save();
    }

    audit(req.user.school, req.user._id, 'evidence_updated', 'PlpEvidence', evidence._id, { recordId: String(record._id) });

    const populated = await PlpEvidence.findById(evidence._id)
        .populate('teacher', 'firstName lastName')
        .populate('traitId', 'name code themeCode')
        .lean();
    res.json({ success: true, data: populated });
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
    audit(req.user.school, req.user._id, 'evidence_deleted', 'PlpEvidence', id, { recordId: record?._id });
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
    const { academicYear, cycleId, month, traitId, classId } = req.query;
    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'academicYear is required' });
    }

    const cycle = await resolveCycleById({
        schoolId: req.user.school,
        academicYear,
        cycleId,
    });
    if (cycleId && !cycle) {
        return res.status(400).json({ success: false, message: 'Invalid PLP round selection' });
    }

    const recordsFilter = {
        school: req.user.school,
        academicYear,
    };
    if (cycle?._id) {
        recordsFilter.cycle = cycle._id;
    } else if (month !== undefined && month !== '' && month !== null) {
        recordsFilter.month = Number(month);
    }
    if (classId) recordsFilter.class = classId;

    const records = await PlpStudentRecord.find(recordsFilter)
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name')
        .populate('cycle', 'title cycleCode')
        .sort({ weightedScore: -1 })
        .lean();
    if (records.length === 0) return res.json({ success: true, data: [] });

    const activeTraits = await PlpTraitConfig.find({ school: req.user.school, isActive: true })
        .select('_id month name')
        .lean();
    if (activeTraits.length === 0) return res.json({ success: true, data: [] });

    const cycleSpotlightTraitIds = Array.isArray(cycle?.spotlightTraits)
        ? cycle.spotlightTraits.map((id) => String(id))
        : [];
    let selectedTraitIds = [];
    if (traitId && mongoose.isValidObjectId(traitId)) {
        selectedTraitIds = [String(traitId)];
    } else if (cycleSpotlightTraitIds.length > 0) {
        selectedTraitIds = cycleSpotlightTraitIds;
    } else {
        const parsedMonth = Number(month);
        if (Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12) {
            selectedTraitIds = activeTraits
                .filter((trait) => Number(trait.month) === parsedMonth)
                .map((trait) => String(trait._id));
        } else {
            selectedTraitIds = activeTraits.map((trait) => String(trait._id));
        }
    }
    if (selectedTraitIds.length === 0) return res.json({ success: true, data: [] });

    const evidenceCounts = await PlpEvidence.aggregate([
        {
            $match: {
                school: req.user.school,
                plpRecord: { $in: records.map((record) => record._id) },
                traitId: { $in: selectedTraitIds.map((id) => new mongoose.Types.ObjectId(id)) },
            },
        },
        { $group: { _id: '$plpRecord', count: { $sum: 1 } } },
    ]);
    const evidenceCountByRecordId = new Map(
        evidenceCounts.map((row) => [String(row._id), Number(row.count || 0)])
    );

    const minEvidenceCount = resolveMinEvidenceCount(cycle?.minEvidenceCount);
    const candidates = records
        .map((record) => ({
            ...record,
            matchedEvidenceCount: evidenceCountByRecordId.get(String(record._id)) || 0,
        }))
        .filter((record) => record.matchedEvidenceCount >= minEvidenceCount)
        .sort((a, b) => {
            const evidenceDiff = Number(b.matchedEvidenceCount || 0) - Number(a.matchedEvidenceCount || 0);
            if (evidenceDiff !== 0) return evidenceDiff;
            return Number(b.weightedScore || 0) - Number(a.weightedScore || 0);
        });

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
    const { name, code, description, month, isActive, displayOrder } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: 'Name and code are required' });
    const cleanCode = String(code).trim().toUpperCase();
    const cleanName = normalizeTraitName(name);
    if (month === undefined || month === null || month === '') {
        return res.status(400).json({ success: false, message: 'Month is required' });
    }
    const cleanMonth = month === undefined || month === null || month === ''
        ? null
        : Number(month);
    if (cleanMonth !== null && (!Number.isInteger(cleanMonth) || cleanMonth < 1 || cleanMonth > 12)) {
        return res.status(400).json({ success: false, message: 'Month must be between 1 and 12' });
    }
    const dup = await PlpTraitConfig.findOne({ school: req.user.school, code: cleanCode });
    if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait code' });
    const dupName = await PlpTraitConfig.findOne({ school: req.user.school, name: cleanName });
    if (dupName) return res.status(400).json({ success: false, message: 'Duplicate trait name' });
    const trait = await PlpTraitConfig.create({
        school: req.user.school,
        name: cleanName,
        code: cleanCode,
        description: description || '',
        month: cleanMonth,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        displayOrder: Number(displayOrder) || 0,
        createdBy: req.user._id,
    });
    audit(req.user.school, req.user._id, 'trait_created', 'PlpTraitConfig', trait._id, { code: trait.code });
    res.status(201).json({ success: true, data: trait });
});

export const updateTrait = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, code, description, month, isActive, displayOrder } = req.body;
    const trait = await PlpTraitConfig.findOne({ _id: id, school: req.user.school });
    if (!trait) return res.status(404).json({ success: false, message: 'Trait not found' });
    const cleanMonth = month === undefined
        ? trait.month
        : (month === null || month === '' ? null : Number(month));
    if (cleanMonth !== null && (!Number.isInteger(cleanMonth) || cleanMonth < 1 || cleanMonth > 12)) {
        return res.status(400).json({ success: false, message: 'Month must be between 1 and 12' });
    }
    if (code) {
        const cleanCode = String(code).trim().toUpperCase();
        if (cleanCode !== trait.code) {
            const dup = await PlpTraitConfig.findOne({ school: req.user.school, code: cleanCode, _id: { $ne: id } });
            if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait code' });
        }
    }
    if (name) {
        const cleanName = normalizeTraitName(name);
        const dup = await PlpTraitConfig.findOne({ school: req.user.school, name: cleanName, _id: { $ne: id } });
        if (dup) return res.status(400).json({ success: false, message: 'Duplicate trait name' });
    }
    trait.name = name ? normalizeTraitName(name) : trait.name;
    trait.code = code ? String(code).trim().toUpperCase() : trait.code;
    trait.description = description !== undefined ? description : trait.description;
    trait.month = cleanMonth;
    trait.isActive = isActive !== undefined ? Boolean(isActive) : trait.isActive;
    trait.displayOrder = displayOrder !== undefined ? Number(displayOrder) : trait.displayOrder;
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
