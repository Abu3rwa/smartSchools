import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import { resolveLessonObjectives } from '../helpers/lessonObjectives.js';
import { resolveAssessmentGroupKeyFromGrade } from '../helpers/assessmentGrouping.js';
import { getAcademicIntelligenceSettingsFromSchool } from '../utils/academicIntelligenceSettings.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const roundOneDecimal = (value) => Number(Number(value || 0).toFixed(1));

export const categorizeMasteryFromScore = (score) => {
    if (!Number.isFinite(score)) return 'unknown';
    if (score >= 85) return 'mastered';
    if (score >= 70) return 'developing';
    return 'at_risk';
};

export const determineSuggestedAction = ({ classWideWeakPercent = 0, repeatedWeakStudents = 0, studentsBelowMastery = 0, thresholds }) => {
    if (classWideWeakPercent > Number(thresholds.classWideWeakThreshold || 40)) {
        return 'reteach';
    }
    if (repeatedWeakStudents >= 1) {
        return 'intervention';
    }
    if (studentsBelowMastery > 0) {
        return 'practice';
    }
    return 'reassessment';
};

const computeGradePercentage = (grade) => {
    const marks = Number(grade?.marks || 0);
    const maxMarks = Number(grade?.maxMarks || 0);
    if (!Number.isFinite(marks) || !Number.isFinite(maxMarks) || maxMarks <= 0) return null;
    return (marks / maxMarks) * 100;
};

const collectGradeObjectives = (grade) => {
    const lessons = Array.isArray(grade?.lessonPlanIds) ? grade.lessonPlanIds.slice(0, 3) : [];
    const seen = new Set();
    const objectives = [];

    lessons.forEach((lesson) => {
        resolveLessonObjectives(lesson).forEach((objective) => {
            if (!objective?.objectiveKey || seen.has(objective.objectiveKey)) return;
            seen.add(objective.objectiveKey);
            objectives.push({
                objectiveKey: objective.objectiveKey,
                objectiveName: objective.text,
                linkedLessonId: toIdString(lesson?._id || lesson),
            });
        });
    });

    return objectives;
};

const buildDateWindowQuery = ({ endDate, windowDays }) => {
    const latest = endDate instanceof Date && !Number.isNaN(endDate.getTime()) ? endDate : new Date();
    const startDate = new Date(latest);
    startDate.setDate(startDate.getDate() - Number(windowDays || 30));
    return { $gte: startDate, $lte: latest };
};

export const buildObjectiveMetrics = ({ focusGrades = [], historyGrades = [], thresholds }) => {
    const lowThreshold = Number(thresholds.objectiveWeakThreshold || 70);
    const repeatedWeakCount = Number(thresholds.repeatedWeakCount || 2);
    const objectiveMap = new Map();
    const historyWeakEvents = new Map();

    historyGrades.forEach((grade) => {
        const percentage = computeGradePercentage(grade);
        if (!Number.isFinite(percentage) || percentage >= lowThreshold) return;

        const studentId = toIdString(grade?.student?._id || grade?.student);
        collectGradeObjectives(grade).forEach((objective) => {
            const key = `${studentId}:${objective.objectiveKey}`;
            historyWeakEvents.set(key, (historyWeakEvents.get(key) || 0) + 1);
        });
    });

    focusGrades.forEach((grade) => {
        const percentage = computeGradePercentage(grade);
        if (!Number.isFinite(percentage)) return;

        const studentId = toIdString(grade?.student?._id || grade?.student);
        collectGradeObjectives(grade).forEach((objective) => {
            const existing = objectiveMap.get(objective.objectiveKey) || {
                objectiveKey: objective.objectiveKey,
                objectiveName: objective.objectiveName,
                scores: [],
                assessedStudents: new Set(),
                studentsBelowMasterySet: new Set(),
                repeatedWeakStudentsSet: new Set(),
                linkedLessonIds: new Set()
            };

            existing.scores.push(percentage);
            existing.assessedStudents.add(studentId);
            existing.linkedLessonIds.add(objective.linkedLessonId);

            if (percentage < lowThreshold) {
                existing.studentsBelowMasterySet.add(studentId);
                if ((historyWeakEvents.get(`${studentId}:${objective.objectiveKey}`) || 0) >= repeatedWeakCount) {
                    existing.repeatedWeakStudentsSet.add(studentId);
                }
            }

            objectiveMap.set(objective.objectiveKey, existing);
        });
    });

    return [...objectiveMap.values()]
        .map((item) => {
            const masteryRate = item.scores.length > 0
                ? roundOneDecimal(item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length)
                : 0;
            const studentsBelowMastery = item.studentsBelowMasterySet.size;
            const assessedStudents = item.assessedStudents.size;
            const classWideWeakPercent = assessedStudents > 0
                ? roundOneDecimal((studentsBelowMastery / assessedStudents) * 100)
                : 0;

            return {
                objectiveKey: item.objectiveKey,
                objectiveName: item.objectiveName,
                masteryRate,
                masteryCategory: categorizeMasteryFromScore(masteryRate),
                studentsBelowMastery,
                assessedStudents,
                repeatedWeakStudents: item.repeatedWeakStudentsSet.size,
                classWideWeakPercent,
                isWeakObjective: masteryRate < lowThreshold,
                suggestedAction: determineSuggestedAction({
                    classWideWeakPercent,
                    repeatedWeakStudents: item.repeatedWeakStudentsSet.size,
                    studentsBelowMastery,
                    thresholds
                }),
                linkedLessons: [...item.linkedLessonIds].filter(Boolean)
            };
        })
        .sort((left, right) => left.masteryRate - right.masteryRate || left.objectiveName.localeCompare(right.objectiveName));
};

const populateGradeContext = (query) => query
    .populate({
        path: 'lessonPlanIds',
        populate: {
            path: 'standardIds',
            select: 'code name'
        }
    })
    .populate('class', 'name department')
    .populate('subject', 'name code')
    .lean();

export const getAssessmentObjectiveAnalysis = async ({ school, assessmentId }) => {
    const assessmentMatch = [{ assessmentGroupId: assessmentId }];
    if (mongoose.isValidObjectId(assessmentId)) {
        assessmentMatch.push({ _id: assessmentId });
    }

    const sampleGrade = await Grade.findOne({
        school: school._id,
        $or: assessmentMatch
    })
        .populate('class', 'name department')
        .populate('subject', 'name code')
        .lean();

    if (!sampleGrade) return null;

    const thresholds = getAcademicIntelligenceSettingsFromSchool({
        school,
        classId: sampleGrade.class,
        subjectId: sampleGrade.subject
    }).thresholds;

    const focusQuery = {
        school: school._id,
        class: sampleGrade.class?._id || sampleGrade.class,
        subject: sampleGrade.subject?._id || sampleGrade.subject,
        academicYear: sampleGrade.academicYear
    };

    if (sampleGrade.assessmentGroupId) {
        focusQuery.assessmentGroupId = sampleGrade.assessmentGroupId;
    } else {
        focusQuery.gradeType = sampleGrade.gradeType;
        focusQuery.date = {
            $gte: new Date(new Date(sampleGrade.date).setHours(0, 0, 0, 0)),
            $lte: new Date(new Date(sampleGrade.date).setHours(23, 59, 59, 999))
        };
        if (sampleGrade.title) focusQuery.title = sampleGrade.title;
        if (sampleGrade.examName) focusQuery.examName = sampleGrade.examName;
    }

    const historyQuery = {
        school: school._id,
        class: focusQuery.class,
        subject: focusQuery.subject,
        academicYear: focusQuery.academicYear,
        date: buildDateWindowQuery({
            endDate: sampleGrade.date,
            windowDays: thresholds.repeatedWeakWindowDays
        })
    };

    const [focusGrades, historyGrades] = await Promise.all([
        populateGradeContext(Grade.find(focusQuery)),
        populateGradeContext(Grade.find(historyQuery))
    ]);

    const objectives = buildObjectiveMetrics({ focusGrades, historyGrades, thresholds });

    return {
        assessmentGroupId: resolveAssessmentGroupKeyFromGrade(sampleGrade),
        class: sampleGrade.class,
        subject: sampleGrade.subject,
        thresholds,
        objectives,
        weakObjectives: objectives.filter((item) => item.isWeakObjective)
    };
};

export const getClassObjectivePerformance = async ({
    school,
    classId,
    subjectId = null,
    academicYear = null,
    dateRange = null,
    category = null
}) => {
    const thresholds = getAcademicIntelligenceSettingsFromSchool({ school, classId, subjectId }).thresholds;
    const query = {
        school: school._id,
        class: classId
    };

    if (subjectId) query.subject = subjectId;
    if (academicYear) query.academicYear = academicYear;
    if (dateRange?.$gte || dateRange?.$lte) query.date = dateRange;
    if (category) query.gradeType = category;

    const focusGrades = await populateGradeContext(Grade.find(query));
    const latestDate = focusGrades.reduce((latest, grade) => {
        const current = new Date(grade.date);
        return current > latest ? current : latest;
    }, new Date());

    const historyQuery = {
        ...query,
        date: buildDateWindowQuery({
            endDate: latestDate,
            windowDays: thresholds.repeatedWeakWindowDays
        })
    };
    const historyGrades = await populateGradeContext(Grade.find(historyQuery));
    const objectives = buildObjectiveMetrics({ focusGrades, historyGrades, thresholds });

    return {
        classId,
        subjectId,
        thresholds,
        objectives,
        alerts: objectives.filter((item) => item.classWideWeakPercent > thresholds.classWideWeakThreshold)
    };
};