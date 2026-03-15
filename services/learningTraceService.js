import Grade from '../models/Grade.js';
import { resolveLessonObjectives } from '../helpers/lessonObjectives.js';
import { getAcademicIntelligenceSettingsFromSchool } from '../utils/academicIntelligenceSettings.js';
import { categorizeMasteryFromScore } from './objectivePerformanceService.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const roundOneDecimal = (value) => Number(Number(value || 0).toFixed(1));

const computeGradePercentage = (grade) => {
    const marks = Number(grade?.marks || 0);
    const maxMarks = Number(grade?.maxMarks || 0);
    if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0) return null;
    return roundOneDecimal((marks / maxMarks) * 100);
};

const collectGradeObjectiveContext = (grade) => {
    const lessons = Array.isArray(grade?.lessonPlanIds) ? grade.lessonPlanIds.slice(0, 3) : [];
    const objectiveSeen = new Set();
    const objectives = [];

    const taughtLessons = lessons.map((lesson) => {
        const resolvedObjectives = resolveLessonObjectives(lesson);
        resolvedObjectives.forEach((objective) => {
            if (objectiveSeen.has(objective.objectiveKey)) return;
            objectiveSeen.add(objective.objectiveKey);
            objectives.push({
                objectiveKey: objective.objectiveKey,
                text: objective.text
            });
        });

        return {
            id: toIdString(lesson?._id || lesson),
            title: lesson?.title || '',
            date: lesson?.date || null,
            objectives: resolvedObjectives.map((objective) => ({
                objectiveKey: objective.objectiveKey,
                text: objective.text
            })),
            standards: Array.isArray(lesson?.standardIds)
                ? lesson.standardIds.map((standard) => ({
                    id: toIdString(standard?._id || standard),
                    code: standard?.code || '',
                    name: standard?.name || ''
                }))
                : []
        };
    });

    return { taughtLessons, objectives };
};

const buildWeakEventMap = (grades, threshold, windowDays) => {
    const latestDate = grades.reduce((latest, grade) => {
        const current = new Date(grade.date);
        return current > latest ? current : latest;
    }, new Date(0));
    const windowStart = new Date(latestDate);
    windowStart.setDate(windowStart.getDate() - Number(windowDays || 30));
    const weakEvents = new Map();

    grades.forEach((grade) => {
        const percentage = computeGradePercentage(grade);
        const gradeDate = new Date(grade.date);
        if (!Number.isFinite(percentage) || percentage >= threshold || gradeDate < windowStart) return;

        const studentId = toIdString(grade?.student?._id || grade?.student);
        collectGradeObjectiveContext(grade).objectives.forEach((objective) => {
            const key = `${studentId}:${objective.objectiveKey}`;
            weakEvents.set(key, (weakEvents.get(key) || 0) + 1);
        });
    });

    return weakEvents;
};

const determineNextStep = ({ percentage, weakObjectives, repeatedWeakObjective, threshold }) => {
    if (repeatedWeakObjective) return 'intervention';
    if (Number.isFinite(percentage) && percentage < threshold && weakObjectives.length > 0) return 'reteach';
    if (Number.isFinite(percentage) && percentage < 85) return 'practice';
    return 'reassessment';
};

export const getStudentLearningTrace = async ({
    school,
    studentId,
    academicYear,
    subjectId = null,
    dateRange = null,
    category = null,
    assignmentSet = null
}) => {
    const query = {
        school: school._id,
        student: studentId,
        academicYear
    };
    if (subjectId) query.subject = subjectId;
    if (dateRange?.$gte || dateRange?.$lte) query.date = dateRange;
    if (category) query.gradeType = category;

    const rows = await Grade.find(query)
        .populate('subject', 'name code')
        .populate('class', 'name grade section department')
        .populate({
            path: 'lessonPlanIds',
            populate: {
                path: 'standardIds',
                select: 'code name'
            }
        })
        .sort({ date: 1, createdAt: 1 })
        .lean();

    const filteredRows = Array.isArray(assignmentSet) && assignmentSet.length > 0
        ? rows.filter((grade) => assignmentSet.some((assignment) => (
            toIdString(assignment.classId) === toIdString(grade.class)
            && toIdString(assignment.subjectId) === toIdString(grade.subject)
        )))
        : rows;

    const traces = [];
    const weakEventMapCache = new Map();

    for (const grade of filteredRows) {
        const thresholds = getAcademicIntelligenceSettingsFromSchool({
            school,
            classId: grade.class,
            subjectId: grade.subject
        }).thresholds;
        const cacheKey = [
            toIdString(grade.class),
            toIdString(grade.subject),
            thresholds.objectiveWeakThreshold,
            thresholds.repeatedWeakWindowDays
        ].join(':');
        if (!weakEventMapCache.has(cacheKey)) {
            const scopedRows = filteredRows.filter((item) => (
                toIdString(item.class) === toIdString(grade.class)
                && toIdString(item.subject) === toIdString(grade.subject)
            ));
            weakEventMapCache.set(
                cacheKey,
                buildWeakEventMap(
                    scopedRows,
                    thresholds.objectiveWeakThreshold,
                    thresholds.repeatedWeakWindowDays
                )
            );
        }

        const percentage = computeGradePercentage(grade);
        const { taughtLessons, objectives } = collectGradeObjectiveContext(grade);
        const weakEventMap = weakEventMapCache.get(cacheKey) || new Map();
        const weakObjectives = Number.isFinite(percentage) && percentage < thresholds.objectiveWeakThreshold
            ? objectives
            : [];
        const repeatedWeakObjective = weakObjectives.some((objective) => (
            (weakEventMap.get(`${toIdString(studentId)}:${objective.objectiveKey}`) || 0) >= thresholds.repeatedWeakCount
        ));

        traces.push({
            gradeId: toIdString(grade._id),
            assessmentGroupId: grade.assessmentGroupId || '',
            date: grade.date,
            subject: grade.subject ? {
                id: toIdString(grade.subject._id),
                name: grade.subject.name || '',
                code: grade.subject.code || ''
            } : null,
            taughtContext: {
                lessons: taughtLessons,
                objectives,
                standards: taughtLessons.flatMap((lesson) => lesson.standards || [])
            },
            demonstratedPerformance: {
                marks: Number(grade.marks || 0),
                maxMarks: Number(grade.maxMarks || 0),
                score: percentage,
                masteryLevel: categorizeMasteryFromScore(percentage),
                performanceCategory: categorizeMasteryFromScore(percentage)
            },
            gapAnalysis: {
                weakObjectives,
                missingSkills: weakObjectives.map((objective) => objective.text)
            },
            recommendedNextStep: determineNextStep({
                percentage,
                weakObjectives,
                repeatedWeakObjective,
                threshold: thresholds.objectiveWeakThreshold
            })
        });
    }

    return traces;
};