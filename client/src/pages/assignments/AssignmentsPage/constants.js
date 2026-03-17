export const STATUS_OPTIONS = ['all', 'draft', 'published', 'closed', 'archived'];

export const DEFAULT_ASSIGNMENT_FORM = {
    assignmentTypeId: '',
    title: '',
    instructions: '',
    lessonPlanIds: [],
    dueDate: '',
    maxMarks: 10,
    publishNow: false,
    notifyOnAssign: true,
    notifyOnGrade: true
};

export const createDefaultAssignmentForm = () => ({ ...DEFAULT_ASSIGNMENT_FORM });
