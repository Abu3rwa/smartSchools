import { clipObjectiveText } from '../helpers/lessonObjectives.js';

const mapLessonForPrompt = (lesson = {}) => ({
    id: lesson.id || lesson._id || '',
    title: String(lesson.title || '').trim(),
    date: lesson.date || null,
    objectives: Array.isArray(lesson.objectives)
        ? lesson.objectives.slice(0, 5).map((objective) => ({
            objectiveKey: objective.objectiveKey,
            text: clipObjectiveText(objective.text)
        }))
        : []
});

export const buildTeacherInsightPayload = ({ trace = [], objectivePerformance = [], trends = [] } = {}) => ({
    trace: trace.slice(0, 10).map((item) => ({
        gradeId: item.gradeId,
        score: item.demonstratedPerformance?.score ?? null,
        masteryLevel: item.demonstratedPerformance?.masteryLevel || 'unknown',
        weakObjectives: Array.isArray(item.gapAnalysis?.weakObjectives)
            ? item.gapAnalysis.weakObjectives.map((objective) => ({
                objectiveKey: objective.objectiveKey,
                text: clipObjectiveText(objective.text)
            }))
            : [],
        lessons: Array.isArray(item.taughtContext?.lessons)
            ? item.taughtContext.lessons.slice(0, 3).map(mapLessonForPrompt)
            : [],
        recommendedNextStep: item.recommendedNextStep
    })),
    objectivePerformance: objectivePerformance.slice(0, 12).map((item) => ({
        objectiveKey: item.objectiveKey,
        objectiveName: clipObjectiveText(item.objectiveName),
        masteryRate: item.masteryRate,
        studentsBelowMastery: item.studentsBelowMastery,
        suggestedAction: item.suggestedAction
    })),
    trends: Array.isArray(trends) ? trends.slice(0, 10) : []
});

export const buildParentExplanationDraftPayload = ({ parentSummary }) => ({
    lesson_focus: clipObjectiveText(parentSummary?.lesson_focus || '', 240),
    performance_summary: clipObjectiveText(parentSummary?.performance_summary || '', 240),
    improvement_area: clipObjectiveText(parentSummary?.improvement_area || '', 180),
    home_support_tip: clipObjectiveText(parentSummary?.home_support_tip || '', 180)
});