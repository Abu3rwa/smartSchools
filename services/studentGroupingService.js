import mongoose from 'mongoose';
import MasteryRecord from '../models/MasteryRecord.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import StudentGroupingOverride from '../models/StudentGroupingOverride.js';
import GroupingActivityCache from '../models/GroupingActivityCache.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import StandardAssignment from '../models/StandardAssignment.js';
import { getActiveSBRScale } from './sbrService.js';
import { connectAi } from '../utils/connectAi.js';
import { logAIUsage } from '../utils/aiUsageTracker.js';
import logger from '../utils/logger.js';

/* ─── Default thresholds ────────────────────────────────────────────── */

const DEFAULT_THRESHOLDS = {
    advanced: 90,
    proficient: 70,
    approaching: 50,
    below: 0
};

const LEVEL_LABELS = {
    advanced: 'Advanced',
    proficient: 'Proficient',
    approaching: 'Approaching',
    below: 'Below Grade Level'
};

const LEVELS_ORDERED = ['below', 'approaching', 'proficient', 'advanced'];

const ACTIVITY_CACHE_TTL_DAYS = 7;

const LEVEL_VALUE_MAP = {
    advanced: 4,
    proficient: 3,
    approaching: 2,
    below: 1
};

/* ─── Helpers ────────────────────────────────────────────────────────── */

async function getGroupingConfig(schoolId) {
    const fallback = {
        thresholds: DEFAULT_THRESHOLDS,
        levelLabels: LEVEL_LABELS
    };

    try {
        const scale = await getActiveSBRScale(schoolId);
        if (!scale || !Array.isArray(scale.levels) || scale.levels.length === 0) {
            return fallback;
        }

        const levelsByValue = new Map();
        for (const level of scale.levels) {
            if (!Number.isFinite(level?.value)) continue;
            levelsByValue.set(Number(level.value), level);
        }

        const resolvedThresholds = { ...DEFAULT_THRESHOLDS };
        const resolvedLabels = { ...LEVEL_LABELS };

        for (const [levelKey, value] of Object.entries(LEVEL_VALUE_MAP)) {
            const scaleLevel = levelsByValue.get(value);
            if (!scaleLevel) continue;

            const minPercent = Number(scaleLevel.minPercent);
            if (Number.isFinite(minPercent)) {
                resolvedThresholds[levelKey] = minPercent;
            }

            const customLabel = String(scaleLevel.label || '').trim();
            if (customLabel) {
                resolvedLabels[levelKey] = customLabel;
            }
        }

        return {
            thresholds: resolvedThresholds,
            levelLabels: resolvedLabels
        };
    } catch (error) {
        logger.warn('Failed to load active SBR scale for grouping config, using defaults', {
            schoolId,
            error: error?.message
        });
        return fallback;
    }
}

function classifyStudent(masteryPercentage, thresholds = DEFAULT_THRESHOLDS) {
    if (masteryPercentage >= thresholds.advanced) return 'advanced';
    if (masteryPercentage >= thresholds.proficient) return 'proficient';
    if (masteryPercentage >= thresholds.approaching) return 'approaching';
    return 'below';
}

async function computeTrendsByStudent({ studentIds, standardId, schoolId, masteryMap }) {
    if (!Array.isArray(studentIds) || studentIds.length === 0) return new Map();

    const toObjectId = (value) => {
        if (!value) return null;
        if (value instanceof mongoose.Types.ObjectId) return value;
        return mongoose.Types.ObjectId.isValid(String(value))
            ? new mongoose.Types.ObjectId(String(value))
            : null;
    };

    const schoolObjectId = toObjectId(schoolId);
    const standardObjectId = toObjectId(standardId);
    const studentObjectIds = studentIds.map(toObjectId).filter(Boolean);

    if (!schoolObjectId || !standardObjectId || studentObjectIds.length === 0) {
        return new Map();
    }

    const groupedAttempts = await PracticeAttempt.aggregate([
        {
            $match: {
                school: schoolObjectId,
                standard: standardObjectId,
                student: { $in: studentObjectIds }
            }
        },
        {
            $sort: {
                student: 1,
                createdAt: -1
            }
        },
        {
            $group: {
                _id: '$student',
                attempts: { $push: '$isCorrect' }
            }
        },
        {
            $project: {
                attempts: { $slice: ['$attempts', 5] }
            }
        }
    ]);

    const trendMap = new Map();

    for (const row of groupedAttempts) {
        const sid = String(row?._id || '');
        const attempts = Array.isArray(row?.attempts) ? row.attempts : [];

        if (!sid || attempts.length < 3) {
            if (sid) trendMap.set(sid, 'stable');
            continue;
        }

        const recentCorrect = attempts.filter(Boolean).length;
        const recentAccuracy = (recentCorrect / attempts.length) * 100;

        const mastery = masteryMap.get(sid);
        if (!mastery || mastery.totalAttemptsAllTime === 0) {
            trendMap.set(sid, 'stable');
            continue;
        }

        const overallAccuracy = (mastery.totalCorrectAllTime / mastery.totalAttemptsAllTime) * 100;
        const diff = recentAccuracy - overallAccuracy;

        if (diff >= 10) {
            trendMap.set(sid, 'improving');
        } else if (diff <= -10) {
            trendMap.set(sid, 'declining');
        } else {
            trendMap.set(sid, 'stable');
        }
    }

    return trendMap;
}

/* ─── Core grouping computation ──────────────────────────────────────── */

async function computeGroups({ classId, standardId, academicYear, schoolId }) {
    const { thresholds, levelLabels } = await getGroupingConfig(schoolId);

    // Fetch class to ensure it exists
    const classDoc = await Class.findById(classId)
        .select('_id')
        .lean();

    if (!classDoc) {
        const error = new Error('Class not found');
        error.statusCode = 404;
        throw error;
    }

    const studentQuery = {
        currentClass: classId,
        status: 'active'
    };
    if (academicYear) {
        studentQuery.academicYear = academicYear;
    }

    const classStudents = await Student.find(studentQuery)
        .select('firstName lastName')
        .lean();

    const studentIds = classStudents.map((s) => s._id);
    if (studentIds.length === 0) {
        return { groups: buildEmptyGroups(), notStarted: [] };
    }

    // Fetch mastery records for all students in this class for this standard
    const masteryRecords = await MasteryRecord.find({
        student: { $in: studentIds },
        standard: standardId
    }).lean();

    const masteryMap = new Map();
    for (const record of masteryRecords) {
        masteryMap.set(record.student.toString(), record);
    }

    const trendByStudent = await computeTrendsByStudent({
        studentIds,
        standardId,
        schoolId,
        masteryMap
    });

    // Fetch overrides
    const overridesQuery = {
        class: classId,
        standard: standardId
    };
    if (academicYear) {
        overridesQuery.academicYear = academicYear;
    }
    const overrides = await StudentGroupingOverride.find(overridesQuery).lean();

    const overrideMap = new Map();
    for (const override of overrides) {
        overrideMap.set(override.student.toString(), override);
    }

    // Build groups
    const groups = {
        advanced: [],
        proficient: [],
        approaching: [],
        below: []
    };
    const notStarted = [];

    for (const student of classStudents) {
        const sid = student._id.toString();
        const mastery = masteryMap.get(sid);

        if (!mastery || mastery.totalAttemptsAllTime === 0) {
            notStarted.push({
                studentId: student._id,
                name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                masteryPercentage: 0,
                totalAttempts: 0,
                trend: 'stable'
            });
            continue;
        }

        const masteryPercentage = Math.round(
            (mastery.totalCorrectAllTime / mastery.totalAttemptsAllTime) * 100
        );

        const algorithmLevel = classifyStudent(masteryPercentage, thresholds);
        const override = overrideMap.get(sid);

        // Determine if override is stale
        let effectiveLevel = algorithmLevel;
        let isOverridden = false;
        let overrideStale = false;

        if (override) {
            // Check expiry
            if (override.expiresAt && override.expiresAt < new Date()) {
                // Expired override — ignore
            } else {
                effectiveLevel = override.overrideLevel;
                isOverridden = true;
                overrideStale = algorithmLevel !== override.overrideLevel && algorithmLevel !== effectiveLevel;
            }
        }

        const trend = trendByStudent.get(sid) || 'stable';

        const studentData = {
            studentId: student._id,
            name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            masteryPercentage,
            totalAttempts: mastery.totalAttemptsAllTime,
            trend,
            isOverridden,
            overrideStale,
            algorithmLevel
        };

        groups[effectiveLevel].push(studentData);
    }

    return { groups, notStarted, levelLabels };
}

function buildEmptyGroups() {
    return {
        advanced: [],
        proficient: [],
        approaching: [],
        below: []
    };
}

/* ─── AI activity suggestions ────────────────────────────────────────── */

async function getActivitiesForLevel({ standardId, level, schoolId, userId, forceRefresh = false }) {
    // Check cache first
    if (!forceRefresh) {
        const cached = await GroupingActivityCache.findOne({
            standard: standardId,
            level,
            expiresAt: { $gt: new Date() }
        }).lean();

        if (cached) return cached.activities;
    }

    // Fetch standard text for prompt
    const standard = await Standard.findById(standardId)
        .select('code name description subject gradeLevel')
        .lean();

    if (!standard) return [];

    const standardLabel = standard.code || standard.name || '';
    const standardText = `${standardLabel}: ${standard.description || ''}`.trim();
    const { levelLabels } = await getGroupingConfig(schoolId);
    const levelLabel = levelLabels?.[level] || LEVEL_LABELS[level];

    const prompt = `You are an expert K-12 instructional designer helping teachers differentiate instruction.

Given this curriculum standard:
"${standardText}"

Generate exactly 3 differentiated learning activities for students at the "${levelLabel}" level.

${level === 'below' ? 'These students are struggling significantly. Focus on foundational concepts, scaffolded support, and concrete/visual approaches.' : ''}
${level === 'approaching' ? 'These students are close to proficiency. Focus on guided practice, targeted skill-building, and bridging gaps.' : ''}
${level === 'proficient' ? 'These students have solid understanding. Focus on deepening comprehension, application, and peer collaboration.' : ''}
${level === 'advanced' ? 'These students have mastered the basics. Focus on enrichment, higher-order thinking, real-world application, and leadership opportunities.' : ''}

Respond ONLY with a JSON array of exactly 3 objects. No other text, no markdown, no code blocks. Each object must have:
- "title": short activity name (5-8 words)
- "description": 2-3 sentence description of the activity
- "type": one of "hands-on", "collaborative", "independent", "technology", "creative"
- "materials": brief list of needed materials or "none"`;

    try {
        const aiResponse = await connectAi(prompt);

        await logAIUsage({
            model: aiResponse.modelName || 'gemini-2.5-flash-lite',
            feature: 'student_grouping_activities',
            schoolId,
            userId,
            entityType: 'Standard',
            entityId: standardId,
            metadata: { level },
            response: aiResponse
        });

        let activities;
        try {
            const cleanText = aiResponse.text.replace(/```json\n?|```\n?/g, '').trim();
            activities = JSON.parse(cleanText);
        } catch {
            logger.warn('Failed to parse AI activity suggestions, returning empty');
            return [];
        }

        if (!Array.isArray(activities)) return [];

        const validated = activities.slice(0, 3).map((a) => ({
            title: String(a.title || '').slice(0, 200),
            description: String(a.description || '').slice(0, 500),
            type: String(a.type || 'activity').slice(0, 50),
            materials: String(a.materials || 'none').slice(0, 300)
        }));

        // Upsert cache
        const expiresAt = new Date(Date.now() + ACTIVITY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
        await GroupingActivityCache.findOneAndUpdate(
            { standard: standardId, level },
            {
                activities: validated,
                generatedAt: new Date(),
                expiresAt,
                school: schoolId
            },
            { upsert: true, new: true }
        );

        return validated;
    } catch (error) {
        logger.error('Failed to generate activity suggestions:', error);
        return [];
    }
}

/* ─── Overview computation ───────────────────────────────────────────── */

async function computeOverview({ classId, academicYear, subjectId, schoolId }) {
    const { thresholds, levelLabels } = await getGroupingConfig(schoolId);

    const classDoc = await Class.findById(classId)
        .select('subjects')
        .lean();

    if (!classDoc) {
        const error = new Error('Class not found');
        error.statusCode = 404;
        throw error;
    }

    const studentQuery = {
        currentClass: classId,
        status: 'active'
    };
    if (academicYear) {
        studentQuery.academicYear = academicYear;
    }
    const classStudents = await Student.find(studentQuery).select('_id').lean();
    const studentIds = classStudents.map((s) => s._id);

    if (studentIds.length === 0) return [];

    // Resolve standards from class subjects, with assignment fallback for classes that
    // have standards assigned but no explicit class.subjects entries.
    const subjectIds = (classDoc.subjects || []).map((s) => s.subject || s);
    const standardsQuery = {};
    if (subjectId) {
        standardsQuery.subject = subjectId;
    } else if (subjectIds.length > 0) {
        standardsQuery.subject = { $in: subjectIds };
    }

    let standards = await Standard.find(standardsQuery)
        .select('code name description subject gradeLevel')
        .lean();

    if (standards.length === 0) {
        const assignmentQuery = {
            class: classId,
            isActive: true
        };
        if (academicYear) assignmentQuery.academicYear = academicYear;
        if (subjectId) assignmentQuery.subject = subjectId;

        const assignedStandardIds = await StandardAssignment.distinct('standard', assignmentQuery);
        if (assignedStandardIds.length > 0) {
            standards = await Standard.find({ _id: { $in: assignedStandardIds } })
                .select('code name description subject gradeLevel')
                .lean();
        }
    }

    if (standards.length === 0) return [];

    const standardIds = standards.map((s) => s._id);

    // Fetch all mastery records at once
    const allMastery = await MasteryRecord.find({
        student: { $in: studentIds },
        standard: { $in: standardIds }
    }).lean();

    // Group by standard
    const masteryByStandard = new Map();
    for (const record of allMastery) {
        const key = record.standard.toString();
        if (!masteryByStandard.has(key)) masteryByStandard.set(key, []);
        masteryByStandard.get(key).push(record);
    }

    // Compute counts per standard
    const overview = standards.map((standard) => {
        const records = masteryByStandard.get(standard._id.toString()) || [];
        const studentsWithRecords = new Set(records.map((r) => r.student.toString()));

        const counts = { advanced: 0, proficient: 0, approaching: 0, below: 0, notStarted: 0 };

        for (const record of records) {
            if (record.totalAttemptsAllTime === 0) {
                counts.notStarted++;
                continue;
            }
            const pct = Math.round((record.totalCorrectAllTime / record.totalAttemptsAllTime) * 100);
            const level = classifyStudent(pct, thresholds);
            counts[level]++;
        }

        // Students without any mastery record
        counts.notStarted += studentIds.length - studentsWithRecords.size;

        return {
            standardId: standard._id,
            identifier: standard.code || standard.name || '',
            description: standard.description,
            subject: standard.subject,
            counts,
            levelLabels,
            totalStudents: studentIds.length
        };
    });

    return overview;
}

/* ─── Override management ────────────────────────────────────────────── */

async function saveOverride({ classId, standardId, studentId, overrideLevel, reason, teacherId, academicYear, schoolId }) {
    const override = await StudentGroupingOverride.findOneAndUpdate(
        {
            class: classId,
            standard: standardId,
            student: studentId,
            academicYear
        },
        {
            school: schoolId,
            class: classId,
            standard: standardId,
            student: studentId,
            teacher: teacherId,
            overrideLevel,
            reason: reason || '',
            academicYear,
            expiresAt: null
        },
        { upsert: true, new: true }
    );

    return override;
}

/* ─── Exports ────────────────────────────────────────────────────────── */

export default {
    computeGroups,
    computeOverview,
    getActivitiesForLevel,
    saveOverride,
    LEVEL_LABELS,
    LEVELS_ORDERED,
    DEFAULT_THRESHOLDS
};
