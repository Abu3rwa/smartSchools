import HomeworkAssignment from '../../models/HomeworkAssignment.js';
import HomeworkSubmission from '../../models/HomeworkSubmission.js';
import { endOfDay } from './dateRange.js';

/**
 * Evidence collector for homework.
 * Queries HomeworkSubmission and joins with HomeworkAssignment for due dates.
 */
export async function collect({ schoolId, studentId, startDate, endDate, classId, subjectId }) {
    const assignmentQuery = {
        school: schoolId,
        status: { $in: ['published', 'closed'] }
    };

    if (classId) assignmentQuery.class = classId;
    if (subjectId) assignmentQuery.subject = subjectId;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = endOfDay(endDate);
    if (Object.keys(dateFilter).length > 0) assignmentQuery.dueDate = dateFilter;

    const assignments = await HomeworkAssignment.find(assignmentQuery)
        .select('_id title dueDate maxMarks')
        .lean();

    if (assignments.length === 0) {
        return {
            source: 'homework',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const assignmentIds = assignments.map(a => a._id);
    const submissions = await HomeworkSubmission.find({
        school: schoolId,
        student: studentId,
        homeworkAssignment: { $in: assignmentIds }
    }).populate('grade', 'marks maxMarks').lean();

    const submissionMap = new Map(
        submissions.map(s => [String(s.homeworkAssignment), s])
    );

    let submitted = 0;
    let late = 0;
    let graded = 0;
    let notSubmitted = 0;
    let totalScore = 0;
    let totalMax = 0;
    let gradedCount = 0;

    for (const assignment of assignments) {
        const sub = submissionMap.get(String(assignment._id));
        if (!sub) {
            notSubmitted += 1;
            continue;
        }

        switch (sub.status) {
            case 'submitted':
                submitted += 1;
                break;
            case 'late':
                late += 1;
                break;
            case 'graded':
                graded += 1;
                gradedCount += 1;
                if (sub.grade) {
                    totalScore += sub.grade.marks || 0;
                    totalMax += sub.grade.maxMarks || assignment.maxMarks || 0;
                }
                break;
            case 'not_submitted':
            default:
                notSubmitted += 1;
                break;
        }
    }

    const completionRate = assignments.length > 0
        ? Math.round(((submitted + late + graded) / assignments.length) * 100)
        : 0;

    const averageScore = gradedCount > 0 && totalMax > 0
        ? Math.round((totalScore / totalMax) * 100)
        : 0;

    const overdue = notSubmitted > 0;

    const facts = [];
    facts.push(`Homework assignments: ${assignments.length} total.`);
    facts.push(`Submitted: ${submitted}. Late: ${late}. Graded: ${graded}. Not submitted: ${notSubmitted}.`);
    facts.push(`Completion rate: ${completionRate}%.`);
    if (gradedCount > 0) {
        facts.push(`Average score on graded work: ${averageScore}%.`);
    }
    if (overdue) {
        facts.push(`Overdue assignments: ${notSubmitted}.`);
    }

    let trend = 'stable';
    if (assignments.length >= 4) {
        const half = Math.floor(assignments.length / 2);
        const older = assignments.slice(half);
        const newer = assignments.slice(0, half);

        const olderDone = older.filter(a => {
            const s = submissionMap.get(String(a._id));
            return s && s.status !== 'not_submitted';
        }).length;
        const newerDone = newer.filter(a => {
            const s = submissionMap.get(String(a._id));
            return s && s.status !== 'not_submitted';
        }).length;

        const olderRate = Math.round((olderDone / older.length) * 100);
        const newerRate = Math.round((newerDone / newer.length) * 100);
        const diff = newerRate - olderRate;
        if (diff > 10) trend = 'improving';
        else if (diff < -10) trend = 'declining';
    }

    return {
        source: 'homework',
        available: true,
        recordCount: assignments.length,
        metrics: {
            totalAssignments: assignments.length,
            submitted,
            late,
            graded,
            notSubmitted,
            completionRate,
            averageScore,
            overdue
        },
        facts,
        trend
    };
}
