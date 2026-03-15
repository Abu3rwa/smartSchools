import ReteachTask from '../models/ReteachTask.js';

const pickAllowedFields = (payload = {}) => {
    const next = {};
    const keys = [
        'class',
        'subject',
        'objectiveKey',
        'objectiveName',
        'linkedLessons',
        'reason',
        'studentsTargeted',
        'recommendedStrategy',
        'assignedTeacher',
        'plannedDate',
        'status',
        'followUpAssessmentRef',
        'linkedInterventionCase'
    ];

    keys.forEach((key) => {
        if (payload[key] !== undefined) next[key] = payload[key];
    });

    return next;
};

export const createReteachTask = async ({ schoolId, createdBy, payload }) => {
    const doc = {
        school: schoolId,
        createdBy,
        ...pickAllowedFields(payload)
    };

    return ReteachTask.create(doc);
};

export const listReteachTasksForClass = async ({ schoolId, classId, subjectId = null }) => {
    const query = {
        school: schoolId,
        class: classId
    };
    if (subjectId) query.subject = subjectId;

    return ReteachTask.find(query)
        .populate('subject', 'name code')
        .populate('class', 'name grade section department')
        .populate('studentsTargeted', 'firstName lastName studentId')
        .populate('linkedLessons', 'title date')
        .populate('assignedTeacher', 'employeeId')
        .populate('linkedInterventionCase', 'status riskLevel')
        .sort({ plannedDate: -1, createdAt: -1 })
        .lean();
};

export const updateReteachTaskById = async ({ taskId, payload }) => ReteachTask.findByIdAndUpdate(
    taskId,
    { $set: pickAllowedFields(payload) },
    { new: true, runValidators: true }
)
    .populate('subject', 'name code')
    .populate('class', 'name grade section department')
    .populate('studentsTargeted', 'firstName lastName studentId')
    .populate('linkedLessons', 'title date')
    .populate('assignedTeacher', 'employeeId')
    .populate('linkedInterventionCase', 'status riskLevel')
    .lean();

export const getReteachTaskById = async (taskId) => ReteachTask.findById(taskId)
    .populate('subject', 'name code')
    .populate('class', 'name grade section department')
    .populate('studentsTargeted', 'firstName lastName studentId')
    .populate('linkedLessons', 'title date')
    .populate('assignedTeacher', 'employeeId')
    .populate('linkedInterventionCase', 'status riskLevel')
    .lean();