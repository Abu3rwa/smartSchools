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
        .select('_id title dueDate maxMarks scope studentIds')
        .sort({ dueDate: 1 })
        .lean();

    // selected-student work only counts for the students it was assigned to.
    const audienceAssignments = assignments.filter(a =>
        a.scope !== 'selected_students' ||
        (a.studentIds || []).some(id => String(id) === String(studentId))
    );

    if (audienceAssignments.length === 0) {
        return {
            source: 'homework',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const assignmentIds = audienceAssignments.map(a => a._id);
    const submissions = await HomeworkSubmission.find({
        school: schoolId,
        student: studentId,
        homeworkAssignment: { $in: assignmentIds }
    }).populate('grade', 'marks maxMarks').lean();

    const submissionMap = new Map(
        submissions.map(s => [String(s.homeworkAssignment), s])
    );

    const now = new Date();
    let submitted = 0;
    let late = 0;
    let graded = 0;
    let notSubmitted = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    let dueSoFar = 0;
    let totalScore = 0;
    let totalMax = 0;
    let gradedCount = 0;

    for (const assignment of audienceAssignments) {
        const isDue = new Date(assignment.dueDate) <= now;
        if (isDue) dueSoFar += 1;
        const sub = submissionMap.get(String(assignment._id));
        if (!sub) {
            notSubmitted += 1;
            if (isDue) overdueCount += 1;
            else upcomingCount += 1;
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
                if (isDue) overdueCount += 1;
                else upcomingCount += 1;
                break;
        }
    }

    // Completion is measured against work that was actually due — future
    // assignments are upcoming, not incomplete.
    const completionRate = dueSoFar > 0
        ? Math.round(((submitted + late + graded) / dueSoFar) * 100)
        : null;

    const averageScore = gradedCount > 0 && totalMax > 0
        ? Math.round((totalScore / totalMax) * 100)
        : null;

    const facts = [];
    facts.push(`Homework assignments: ${audienceAssignments.length} total.`);
    facts.push(`Submitted: ${submitted}. Late: ${late}. Graded: ${graded}. Not submitted: ${notSubmitted}.`);
    if (completionRate !== null) {
        facts.push(`Completion rate on work due so far: ${completionRate}%.`);
    }
    if (upcomingCount > 0) {
        facts.push(`Upcoming (not yet due): ${upcomingCount}.`);
    }
    if (gradedCount > 0 && averageScore !== null) {
        facts.push(`Average score on graded work: ${averageScore}%.`);
    }
    if (overdueCount > 0) {
        facts.push(`Overdue assignments: ${overdueCount}.`);
    }

    // Trend compares the older and newer halves by due date, never by the
    // arbitrary order the database returned.
    let trend = 'insufficient_data';
    if (audienceAssignments.length >= 4) {
        const ordered = [...audienceAssignments].sort(
            (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
        );
        const half = Math.floor(ordered.length / 2);
        const older = ordered.slice(0, half);
        const newer = ordered.slice(half);

        const doneCount = (rows) => rows.filter(a => {
            const s = submissionMap.get(String(a._id));
            return s && s.status !== 'not_submitted';
        }).length;

        const olderRate = Math.round((doneCount(older) / older.length) * 100);
        const newerRate = Math.round((doneCount(newer) / newer.length) * 100);
        const diff = newerRate - olderRate;
        trend = 'stable';
        if (diff > 10) trend = 'improving';
        else if (diff < -10) trend = 'declining';
    }

    return {
        source: 'homework',
        available: true,
        recordCount: audienceAssignments.length,
        metrics: {
            totalAssignments: audienceAssignments.length,
            submitted,
            late,
            graded,
            notSubmitted,
            completionRate,
            averageScore,
            overdue: overdueCount,
            upcoming: upcomingCount
        },
        facts,
        trend
    };
}
