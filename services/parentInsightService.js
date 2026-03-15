import { getStudentLearningTrace } from './learningTraceService.js';

const roundOneDecimal = (value) => Number(Number(value || 0).toFixed(1));

const uniqueTexts = (values = []) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];

const summarizePerformance = (averageScore) => {
    if (!Number.isFinite(averageScore)) return 'Recent academic evidence is limited, so the summary is based on the available assessments.';
    if (averageScore >= 85) return 'Your child is showing strong understanding in recent assessed work.';
    if (averageScore >= 70) return 'Your child is making steady progress and is close to secure mastery in recent work.';
    return 'Recent assessments show that your child needs more support to secure the lesson goals.';
};

const buildHomeSupportTip = (improvementArea) => {
    if (!improvementArea) {
        return 'Ask your child to explain what they learned today and review one key example together.';
    }
    return `Review ${improvementArea.toLowerCase()} with your child, then ask them to explain the idea aloud and complete one short practice example.`;
};

export const getParentLearningSummary = async ({ school, studentId, academicYear, dateRange = null, assignmentSet = null }) => {
    const trace = await getStudentLearningTrace({
        school,
        studentId,
        academicYear,
        dateRange,
        assignmentSet
    });

    const latestTrace = [...trace].sort((left, right) => new Date(right.date) - new Date(left.date)).slice(0, 5);
    const averageScore = latestTrace.length > 0
        ? roundOneDecimal(latestTrace.reduce((sum, item) => sum + Number(item.demonstratedPerformance.score || 0), 0) / latestTrace.length)
        : null;

    const lessonFocus = uniqueTexts(latestTrace.flatMap((item) => {
        const objectiveTexts = item.taughtContext.objectives.map((objective) => objective.text);
        if (objectiveTexts.length > 0) return objectiveTexts;
        return item.taughtContext.lessons.map((lesson) => lesson.title);
    })).slice(0, 3).join('; ');

    const improvementArea = uniqueTexts(latestTrace.flatMap((item) => item.gapAnalysis.weakObjectives.map((objective) => objective.text)))[0] || '';

    return {
        lesson_focus: lessonFocus || 'Recent lessons focused on the current classroom targets.',
        performance_summary: summarizePerformance(averageScore),
        improvement_area: improvementArea || 'Continue building consistency across recent classroom assessments.',
        home_support_tip: buildHomeSupportTip(improvementArea),
        recent_trace: latestTrace.map((item) => ({
            gradeId: item.gradeId,
            date: item.date,
            subject: item.subject?.name || '',
            score: item.demonstratedPerformance.score,
            next_step: item.recommendedNextStep
        }))
    };
};