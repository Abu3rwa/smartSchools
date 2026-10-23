const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const LABELS = {
    recordStatus: { in_progress: 'In progress', submitted: 'Sent for review', locked: 'Locked' },
    award: { none: 'No decision yet', selected: 'Selected for the award', not_selected: 'Not selected' },
    level: { emerging: 'Emerging', developing: 'Developing', strong: 'Strong' },
    goalType: { character: 'Character goal', academic: 'Academic goal' },
    goalStatus: { active: 'Active', completed: 'Completed', carried_forward: 'Carried forward', archived: 'Archived' },
    milestoneStatus: { pending: 'Pending', achieved: 'Achieved', adjusted: 'Adjusted' },
    reviewOutcome: { continue: 'Keep going', revise: 'Revised', complete: 'Completed' },
    taskStatus: {
        assigned: 'Assigned',
        in_progress: 'In progress',
        submitted_by_student: 'Submitted by student',
        reviewed: 'Reviewed',
        completed: 'Completed',
        needs_revision: 'Needs revision',
    },
    evidenceType: {
        observation: 'Observation',
        incident: 'Incident',
        positive_example: 'Positive example',
        reflection: 'Reflection',
    },
    practiceKind: {
        spelling_session: 'Spelling session',
        map_practice_plan: 'MAP practice plan',
        map_practice_assignment: 'MAP practice test',
    },
};

const OPEN_TASK_STATUSES = ['assigned', 'in_progress', 'submitted_by_student', 'needs_revision'];
const POSITIVE_EVIDENCE_TYPES = ['observation', 'positive_example', 'reflection'];

const label = (group, value) => LABELS[group]?.[value] || humanize(value);

const humanize = (value) => {
    const words = String(value || '').replace(/_/g, ' ').trim();
    if (!words) return '—';
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

const text = (value) => String(value ?? '').trim();

const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(date);
};

const personName = (person, fallback = 'Not recorded') => {
    const name = `${text(person?.firstName)} ${text(person?.lastName)}`.trim();
    return name || fallback;
};

const roundLabel = (record) => {
    const cycle = text(record?.cycle?.title) || text(record?.cycle?.cycleCode);
    if (cycle) return cycle;
    const month = Number(record?.month);
    return Number.isInteger(month) && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : 'Unassigned round';
};

const practiceLookup = (items) => {
    const byKey = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const key = `${text(item?.kind)}:${text(item?.targetId)}`;
        if (key !== ':') byKey.set(key, item);
    }
    return byKey;
};

/**
 * Stored links keep a label captured when the teacher confirmed them. A freshly
 * resolved candidate wins when the caller supplies one, so a renamed or deleted
 * practice item cannot be reported from stale text.
 */
const goalPracticeRows = (goal, candidates) => (goal.linkedPractice || []).map((link) => {
    const fresh = candidates.get(`${text(link?.kind)}:${text(link?.targetId)}`);
    return {
        kind: label('practiceKind', link?.kind),
        label: text(fresh?.label) || text(link?.label) || 'Unlinked practice',
        detail: text(fresh?.detail) || text(link?.detail),
        source: text(link?.source) === 'ai_suggested' ? 'Suggested by AI, confirmed by teacher' : 'Added by teacher',
    };
});

const taskRow = (task, now) => {
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const isOpen = OPEN_TASK_STATUSES.includes(task.status);
    return {
        title: text(task.title) || 'Untitled task',
        status: label('taskStatus', task.status),
        dueDate: formatDate(due),
        isOverdue: Boolean(isOpen && due && due < now),
        instructions: text(task.instructions),
        studentNote: text(task.studentCompletionNote),
        feedback: [text(task.teacherFeedback), text(task.teacherFollowUpAction)].filter(Boolean).join('\n'),
    };
};

const goalRow = (goal, { candidates, tasks, now }) => {
    const linkedTasks = tasks.filter((task) => String(task.plpGoal?._id || task.plpGoal || '') === String(goal._id));
    return {
        title: text(goal.title) || 'Untitled goal',
        type: label('goalType', goal.goalType),
        status: label('goalStatus', goal.status),
        description: text(goal.description),
        baseline: text(goal.baselineNote),
        successCriteria: text(goal.successCriteria),
        teacherNote: text(goal.teacherProgressNote),
        targetDate: formatDate(goal.targetDate),
        checkInDate: formatDate(goal.checkInDate),
        review: [
            goal.reviewOutcome ? label('reviewOutcome', goal.reviewOutcome) : '',
            goal.lastReviewedAt ? `Reviewed ${formatDate(goal.lastReviewedAt)}` : '',
        ].filter(Boolean).join(' · '),
        reviewNote: text(goal.reviewNote),
        milestones: (goal.milestones || []).map((milestone) => ({
            title: text(milestone.title) || 'Milestone',
            status: label('milestoneStatus', milestone.status),
            targetDate: formatDate(milestone.targetDate),
        })),
        practice: goalPracticeRows(goal, candidates),
        tasks: linkedTasks.map((task) => taskRow(task, now)),
    };
};

export const buildPlpReportModel = ({
    record,
    goals = [],
    tasks = [],
    evidence = [],
    school = null,
    traitScores = [],
    practiceItems = [],
    generatedAt = new Date(),
} = {}) => {
    const now = new Date(generatedAt);
    const candidates = practiceLookup(practiceItems);
    const positiveEvidence = evidence.filter((item) => POSITIVE_EVIDENCE_TYPES.includes(item.type));
    const countsByTrait = positiveEvidence.reduce((counts, item) => {
        const trait = text(item.traitId?.name) || 'Trait not tagged';
        counts.set(trait, (counts.get(trait) || 0) + 1);
        return counts;
    }, new Map());
    const traitTally = [...countsByTrait.entries()]
        .map(([trait, count]) => ({ trait, count }))
        .sort((left, right) => right.count - left.count || left.trait.localeCompare(right.trait));
    const visibleGoals = goals.filter((goal) => goal.status !== 'archived');
    const goalIds = new Set(visibleGoals.map((goal) => String(goal._id)));
    const reportedTasks = tasks.filter((task) => !task.plpGoal || !goalIds.has(String(task.plpGoal?._id || task.plpGoal)));
    const scores = traitScores
        .filter(([, score]) => score !== null && score !== undefined && score !== '')
        .map(([trait, score]) => ({ trait: text(trait) || 'Trait', score: Number(score) }))
        .filter((row) => Number.isFinite(row.score));
    const averageScore = scores.length
        ? Math.round((scores.reduce((sum, row) => sum + row.score, 0) / scores.length) * 10) / 10
        : null;
    const className = text(record?.class?.name) || 'Class not set';
    const grade = text(record?.class?.grade);

    return {
        generatedAt: now,
        schoolName: text(school?.name) || 'School',
        reportTitle: 'Personal Learning Plan',
        student: {
            name: personName(record?.student, 'Student'),
            studentId: text(record?.student?.studentId) || '—',
            className,
            grade,
            classLabel: [className, grade && !className.toLowerCase().includes(grade.toLowerCase()) ? `Grade ${grade}` : ''].filter(Boolean).join(' · '),
            teacher: personName(record?.teacher),
        },        period: {
            academicYear: text(record?.academicYear) || 'Not set',
            round: roundLabel(record),
            theme: humanize(record?.theme),
            level: label('level', record?.level),
            status: label('recordStatus', record?.status),
            awardDecision: text(record?.awardDecision) || 'none',
            award: label('award', record?.awardDecision || 'none'),
            awardReason: text(record?.awardDecisionReason),
        },
        metrics: [
            { label: 'Positive observations', value: String(positiveEvidence.length) },
            { label: 'Traits noticed', value: String(traitTally.length) },
            {
                label: 'Goals',
                value: `${visibleGoals.length} · ${visibleGoals.filter((goal) => goal.status === 'completed').length} complete`,
            },
            {
                label: 'Tasks',
                value: `${tasks.length} · ${tasks.filter((task) => !OPEN_TASK_STATUSES.includes(task.status)).length} done`,
            },
            { label: 'Average trait score', value: averageScore === null ? 'No scores yet' : `${averageScore.toFixed(1)} / 5` },
        ],
        traitTally,
        scores,
        observations: evidence.map((item) => ({
            date: formatDate(item.createdAt),
            trait: text(item.traitId?.name) || 'Trait not tagged',
            type: label('evidenceType', item.type),
            note: text(item.note),
            teacher: personName(item.teacher, 'Recorded by teacher'),
            needsReview: item.reviewStatus === 'needs_review',
            isPositive: POSITIVE_EVIDENCE_TYPES.includes(item.type),
        })),
        goals: visibleGoals.map((goal) => goalRow(goal, { candidates, tasks, now })),
        unassignedTasks: reportedTasks.map((task) => taskRow(task, now)),
        counters: {
            overdueTasks: tasks.filter((task) => {
                const due = task.dueDate ? new Date(task.dueDate) : null;
                return OPEN_TASK_STATUSES.includes(task.status) && due && due < now;
            }).length,
            pendingReview: evidence.filter((item) => item.reviewStatus === 'needs_review').length,
            practiceLinks: visibleGoals.reduce((sum, goal) => sum + (goal.linkedPractice || []).length, 0),
        },
    };
};

export const PLP_REPORT_LABELS = LABELS;
