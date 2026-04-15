export const STATUS_OPTIONS = ['all', 'draft', 'published', 'closed', 'archived'];

export const LINK_TYPES = [
    { value: 'external_url', label: 'External URL' },
    { value: 'assessment', label: 'Assessment' },
    { value: 'practice_objective', label: 'Standard / Objective' }
];

export const DEFAULT_ASSIGNMENT_FORM = {
    assignmentTypeId: '',
    title: '',
    instructions: '',
    lessonPlanIds: [],
    dueDate: '',
    maxMarks: 10,
    publishNow: false,
    notifyOnAssign: true,
    notifyOnGrade: true,
    links: [],
    attachmentFiles: [],
    existingAttachments: [],
    removeAttachmentIds: []
};

export const createDefaultAssignmentForm = () => ({
    ...DEFAULT_ASSIGNMENT_FORM,
    links: [],
    attachmentFiles: [],
    existingAttachments: [],
    removeAttachmentIds: []
});
