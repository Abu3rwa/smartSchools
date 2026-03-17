import Student from '../models/Student.js';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import { getStudentLearningTrace } from './learningTraceService.js';
import { getStudentPendingTasks } from './academicExcellenceTaskService.js';
import {
    getEffectiveAcademicExcellenceThresholds,
    getActiveExclusions
} from './academicExcellenceSettingsService.js';
import { autoAssignAIInteractiveTask } from './academicExcellenceTaskService.js';

const roundOneDecimal = (value) => Number(Number(value || 0).toFixed(1));

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const deriveMasteryLevel = (score, thresholds) => {
    if (!Number.isFinite(score)) return 'not_started';
    const weakThreshold = Number(thresholds?.objectiveWeakThreshold || 70);
    const masteryThreshold = Number(thresholds?.masteryThreshold || 85);
    if (score >= masteryThreshold) return 'mastered';
    if (score >= weakThreshold) return 'developing';
    return 'at_risk';
};

const deriveTrend = (scores = []) => {
    if (!Array.isArray(scores) || scores.length < 2) return 'stable';
    const first = Number(scores[0]);
    const last = Number(scores[scores.length - 1]);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return 'stable';
    const delta = last - first;
    if (delta >= 3) return 'improving';
    if (delta <= -3) return 'declining';
    return 'stable';
};

const exclusionBlocksObjective = ({ exclusion, objective, studentId, classId }) => {
    if (!exclusion?.isActive) return false;

    if (exclusion.targetType === 'student' && toIdString(exclusion.studentId) !== toIdString(studentId)) {
        return false;
    }
    if (exclusion.targetType === 'class' && toIdString(exclusion.classId) !== toIdString(classId)) {
        return false;
    }

    if (exclusion.scopeType === 'objective') {
        return String(exclusion.objectiveKey || '').trim() === String(objective.objectiveKey || '').trim();
    }
    if (exclusion.scopeType === 'subject') {
        return toIdString(exclusion.subjectId) === toIdString(objective.subject);
    }

    return false;
};

export const applyExclusions = async ({ objectiveList = [], schoolId, studentId, classId }) => {
    if (!Array.isArray(objectiveList) || objectiveList.length === 0) {
        return [];
    }

    const exclusionResult = await getActiveExclusions(schoolId, {
        studentId,
        classId,
        limit: 500
    });
    const exclusions = exclusionResult.items || [];

    return objectiveList.filter((objective) => {
        if (objective.isDisabledForStudent || objective.isDisabledForClass) {
            return false;
        }

        const blocked = exclusions.some((exclusion) => exclusionBlocksObjective({
            exclusion,
            objective,
            studentId,
            classId
        }));
        return !blocked;
    });
};

export const syncStudentObjectiveMastery = async ({ school, studentId, subjectId = null, academicYear = null }) => {
    const student = await Student.findOne({
        _id: studentId,
        school: school._id,
        ...(academicYear ? { academicYear } : {})
    })
        .select('_id school currentClass academicYear')
        .lean();

    if (!student) {
        return { synced: 0, objectives: [] };
    }

    const traces = await getStudentLearningTrace({
        school,
        studentId,
        academicYear: academicYear || student.academicYear,
        subjectId
    });

    const grouped = new Map();

    for (const trace of traces) {
        const score = Number(trace?.demonstratedPerformance?.score);
        const traceDate = trace?.date ? new Date(trace.date) : new Date();
        const subjectKey = toIdString(trace?.subject?.id || subjectId);

        const objectives = [
            ...(trace?.taughtContext?.objectives || []),
            ...(trace?.gapAnalysis?.weakObjectives || [])
        ];

        for (const objective of objectives) {
            const objectiveKey = String(objective?.objectiveKey || '').trim();
            if (!objectiveKey) continue;

            const key = `${subjectKey}:${objectiveKey}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    objectiveKey,
                    objectiveName: String(objective?.text || objective?.objectiveName || '').trim(),
                    subject: subjectKey || null,
                    lessonPlanIds: [],
                    scores: [],
                    dates: []
                });
            }

            const target = grouped.get(key);
            if (Number.isFinite(score)) {
                target.scores.push(score);
                target.dates.push(traceDate);
            }
        }
    }

    const syncedObjectives = [];

    for (const item of grouped.values()) {
        if (!item.subject) continue;

        const thresholdsResponse = await getEffectiveAcademicExcellenceThresholds(
            school._id,
            student.currentClass,
            item.subject
        );
        
        const thresholds = thresholdsResponse?.thresholds || {
            objectiveWeakThreshold: 70,
            masteryThreshold: 85
        };

        const averageScore = item.scores.length > 0
            ? roundOneDecimal(item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length)
            : 0;

        const masteryLevel = deriveMasteryLevel(averageScore, thresholds);
        const trend = deriveTrend(item.scores);

        const existing = await AcademicExcellenceObjective.findOne({
            school: school._id,
            student: student._id,
            subject: item.subject,
            objectiveKey: item.objectiveKey
        });

        const historyEntry = {
            date: item.dates[item.dates.length - 1] || new Date(),
            score: averageScore,
            masteryLevel,
            sourceType: 'grade',
            sourceId: null
        };

        if (existing) {
            const previousMasteryLevel = existing.masteryLevel;
            existing.objectiveName = item.objectiveName || existing.objectiveName;
            existing.class = student.currentClass || existing.class;
            existing.masteryScore = averageScore;
            existing.masteryLevel = masteryLevel;
            existing.trend = trend;
            existing.history = [...(existing.history || []), historyEntry].slice(-20);
            if (!existing.firstWeakDetectedAt && masteryLevel === 'at_risk') {
                existing.firstWeakDetectedAt = new Date();
            }
            await existing.save();

            if (masteryLevel === 'at_risk' && previousMasteryLevel !== 'at_risk') {
                Promise.resolve(autoAssignAIInteractiveTask(student._id, existing, {
                    schoolId: school._id,
                    classId: student.currentClass,
                    subjectId: item.subject
                })).catch(() => null);
            }

            syncedObjectives.push(existing.toObject());
            continue;
        }

        const created = await AcademicExcellenceObjective.create({
            school: school._id,
            student: student._id,
            subject: item.subject,
            class: student.currentClass || null,
            objectiveKey: item.objectiveKey,
            objectiveName: item.objectiveName,
            lessonPlanIds: item.lessonPlanIds,
            masteryLevel,
            masteryScore: averageScore,
            trend,
            history: [historyEntry],
            firstWeakDetectedAt: masteryLevel === 'at_risk' ? new Date() : null
        });

        if (masteryLevel === 'at_risk') {
            Promise.resolve(autoAssignAIInteractiveTask(student._id, created, {
                schoolId: school._id,
                classId: student.currentClass,
                subjectId: item.subject
            })).catch(() => null);
        }

        syncedObjectives.push(created.toObject());
    }

    return {
        synced: syncedObjectives.length,
        objectives: syncedObjectives
    };
};

export const getStudentExcellenceDashboardData = async ({ school, studentId, subjectId = null, academicYear = null }) => {
    const student = await Student.findOne({
        _id: studentId,
        school: school._id,
        ...(academicYear ? { academicYear } : {})
    })
        .select('_id school currentClass academicYear firstName lastName')
        .lean();

    if (!student) {
        return null;
    }

    await syncStudentObjectiveMastery({
        school,
        studentId: student._id,
        subjectId,
        academicYear: academicYear || student.academicYear
    });

    const objectiveQuery = {
        school: school._id,
        student: student._id
    };
    if (subjectId) objectiveQuery.subject = subjectId;

    const objectives = await AcademicExcellenceObjective.find(objectiveQuery)
        .sort({ masteryScore: 1, updatedAt: -1 })
        .lean();

    const filteredObjectives = await applyExclusions({
        objectiveList: objectives,
        schoolId: school._id,
        studentId: student._id,
        classId: student.currentClass
    });

    const pendingTasks = await getStudentPendingTasks(student._id, subjectId || null);

    const atRiskObjectives = filteredObjectives.filter((item) => item.masteryLevel === 'at_risk');
    const masteredObjectives = filteredObjectives.filter((item) => item.masteryLevel === 'mastered');
    const focusObjectives = filteredObjectives
        .filter((item) => item.masteryLevel !== 'mastered')
        .sort((left, right) => {
            const rank = { at_risk: 0, developing: 1, not_started: 2 };
            const leftRank = rank[left.masteryLevel] ?? 3;
            const rightRank = rank[right.masteryLevel] ?? 3;
            if (leftRank !== rightRank) return leftRank - rightRank;
            return Number(left.masteryScore || 0) - Number(right.masteryScore || 0);
        });

    const masteryScores = filteredObjectives
        .map((item) => Number(item.masteryScore || 0))
        .filter((value) => Number.isFinite(value));

    const overallScore = masteryScores.length > 0
        ? roundOneDecimal(masteryScores.reduce((sum, value) => sum + value, 0) / masteryScores.length)
        : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const masteredThisMonth = masteredObjectives.filter((item) => {
        const updatedAt = item?.updatedAt ? new Date(item.updatedAt) : null;
        return updatedAt && updatedAt >= startOfMonth;
    }).length;

    return {
        student: {
            id: student._id,
            firstName: student.firstName,
            lastName: student.lastName
        },
        stats: {
            overallScore,
            tasksPending: pendingTasks.length,
            objectivesAtRisk: atRiskObjectives.length,
            masteredThisMonth
        },
        objectives: focusObjectives,
        masteredObjectives,
        tasks: pendingTasks
    };
};

export default {
    syncStudentObjectiveMastery,
    getStudentExcellenceDashboardData,
    applyExclusions
};
