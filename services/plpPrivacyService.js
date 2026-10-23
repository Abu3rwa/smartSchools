export const toStudentVisibleGoal = (goal) => ({
    _id: goal._id,
    plpRecord: goal.plpRecord,
    goalType: goal.goalType,
    title: goal.title,
    description: goal.description || '',
    successCriteria: goal.successCriteria || '',
    targetDate: goal.targetDate || null,
    checkInDate: goal.checkInDate || null,
    milestones: (goal.milestones || []).map((milestone) => ({
        title: milestone.title,
        targetDate: milestone.targetDate || null,
        status: milestone.status,
        completedAt: milestone.completedAt || null,
    })),
    lastReviewedAt: goal.lastReviewedAt || null,
    reviewOutcome: goal.reviewOutcome || null,
    status: goal.status,
});

export const toStudentVisibleTask = (task) => ({
    _id: task._id,
    plpGoal: task.plpGoal,
    plpRecord: task.plpRecord,
    title: task.title,
    instructions: task.instructions || '',
    dueDate: task.dueDate || null,
    status: task.status,
    studentCompletionNote: task.studentCompletionNote || '',
    studentComment: task.studentComment || '',
    teacherFeedback: task.teacherFeedback || '',
    completedAt: task.completedAt || null,
    assignedByTeacher: task.assignedByTeacher || null,
    createdAt: task.createdAt,
});

export const toPlpHistoryItem = (record) => ({
    _id: record._id,
    academicYear: record.academicYear,
    month: record.month,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cycle: record.cycle
        ? { _id: record.cycle._id, title: record.cycle.title, cycleCode: record.cycle.cycleCode, status: record.cycle.status }
        : null,
});

export const buildFamilySafeProgressUpdate = ({ student, record, goals = [], tasks = [] }) => ({
    studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    academicYear: record.academicYear,
    roundTitle: record.cycle?.title || '',
    month: record.month,
    goals: goals.map((goal) => ({
        goalType: goal.goalType || '',
        title: goal.title,
        description: goal.description || '',
        successCriteria: goal.successCriteria || '',
        status: goal.status,
        targetDate: goal.targetDate || null,
        reviewOutcome: goal.reviewOutcome || null,
        // Labels describe the student's own practice work; ids and teacher reasons stay out.
        linkedPractice: (goal.linkedPractice || []).map((link) => ({
            kind: link.kind,
            label: link.label,
            detail: link.detail || '',
        })),
    })),
    nextTasks: tasks
        .filter((task) => !['completed', 'reviewed'].includes(task.status))
        .map((task) => ({
            title: task.title,
            instructions: task.instructions || '',
            dueDate: task.dueDate || null,
            status: task.status,
            teacherFeedback: task.teacherFeedback || '',
        })),
});
