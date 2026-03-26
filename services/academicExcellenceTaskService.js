import Student from '../models/Student.js';
import AcademicExcellenceTask from '../models/AcademicExcellenceTask.js';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import User from '../models/User.js';
import academicExcellenceNotificationService from './academicExcellenceNotificationService.js';
import logger from '../utils/logger.js';

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const normalizeTaskPayload = (taskData = {}) => ({
    title: String(taskData.title || '').trim(),
    description: String(taskData.description || '').trim(),
    taskType: taskData.taskType || 'practice_questions',
    resourceUrl: String(taskData.resourceUrl || '').trim(),
    estimatedMinutes: isFiniteNumber(taskData.estimatedMinutes) ? Number(taskData.estimatedMinutes) : 0,
    dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
    objectiveName: String(taskData.objectiveName || '').trim(),
    subjectId: taskData.subjectId || null,
    classId: taskData.classId || null
});

export const assignTask = async (teacherId, studentId, objectiveKey, taskData = {}, context = {}) => {
    const normalized = normalizeTaskPayload(taskData);
    if (!normalized.title) {
        throw new Error('title is required');
    }

    const student = await Student.findById(studentId).select('_id school currentClass academicYear status').lean();
    if (!student) {
        throw new Error('Student not found');
    }

    const schoolId = context.schoolId || student.school;
    const classId = normalized.classId || student.currentClass;
    const subjectId = normalized.subjectId;

    if (!classId) {
        throw new Error('classId is required to assign AE task');
    }
    if (!subjectId) {
        throw new Error('subjectId is required to assign AE task');
    }

    const objectiveDoc = await AcademicExcellenceObjective.findOne({
        school: schoolId,
        student: student._id,
        objectiveKey: String(objectiveKey || '').trim(),
        ...(subjectId ? { subject: subjectId } : {})
    });

    const createdTask = await AcademicExcellenceTask.create({
        school: schoolId,
        academicYear: null,
        student: student._id,
        class: classId,
        subject: subjectId,
        teacher: teacherId,
        objectiveKey: String(objectiveKey || '').trim(),
        objectiveName: normalized.objectiveName || objectiveDoc?.objectiveName || '',
        objectiveRef: objectiveDoc?._id || null,
        title: normalized.title,
        description: normalized.description,
        taskType: normalized.taskType,
        resourceUrl: normalized.resourceUrl,
        estimatedMinutes: normalized.estimatedMinutes,
        dueDate: normalized.dueDate,
        status: 'assigned',
        assignedAt: new Date()
    });

    if (objectiveDoc) {
        objectiveDoc.practiceTasksAssigned = Number(objectiveDoc.practiceTasksAssigned || 0) + 1;
        await objectiveDoc.save();
    }

    // Fire task-assigned notification (student + parent, non-blocking)
    const fullStudent = await Student.findById(studentId);
    if (fullStudent) {
        academicExcellenceNotificationService.sendTaskAssignedNotification({
            schoolId,
            student: fullStudent,
            taskTitle: createdTask.title,
            taskId: String(createdTask._id),
        }).catch((err) => logger.warn('ae_task_notify_failed', { error: err?.message }));
    }

    return createdTask;
};

export const bulkAssignTasks = async (teacherId, classId, objectiveKey, taskData = {}, context = {}) => {
    const students = await Student.find({
        school: context.schoolId,
        currentClass: classId,
        status: 'active'
    })
        .select('_id')
        .lean();

    if (students.length === 0) {
        return { created: [], count: 0 };
    }

    const created = [];
    for (const student of students) {
        const task = await assignTask(
            teacherId,
            student._id,
            objectiveKey,
            { ...taskData, classId },
            context
        );
        created.push(task);
    }

    return { created, count: created.length };
};

export const completeTask = async (studentId, taskId, completionData = {}) => {
    const task = await AcademicExcellenceTask.findById(taskId);
    if (!task) return null;

    if (String(task.student) !== String(studentId)) {
        throw new Error('Access denied');
    }

    if (task.status === 'completed') {
        return task;
    }

    task.status = 'completed';
    task.startedAt = task.startedAt || new Date();
    task.completedAt = new Date();
    task.studentScore = isFiniteNumber(completionData.studentScore)
        ? Number(completionData.studentScore)
        : task.studentScore;
    task.studentNotes = String(completionData.studentNotes || task.studentNotes || '').trim();
    await task.save();

    if (task.objectiveRef) {
        const objectiveDoc = await AcademicExcellenceObjective.findById(task.objectiveRef);
        if (objectiveDoc) {
            objectiveDoc.practiceTasksCompleted = Number(objectiveDoc.practiceTasksCompleted || 0) + 1;
            objectiveDoc.lastPracticeDate = new Date();
            objectiveDoc.totalPracticeMinutes = Number(objectiveDoc.totalPracticeMinutes || 0) + Number(task.estimatedMinutes || 0);
            await objectiveDoc.save();
        }
    }

    return task;
};

export const reviewTask = async (teacherId, taskId, feedback = '') => {
    const task = await AcademicExcellenceTask.findById(taskId);
    if (!task) return null;

    if (String(task.teacher) !== String(teacherId)) {
        throw new Error('Access denied');
    }

    task.teacherFeedback = String(feedback || '').trim();
    task.teacherReviewedAt = new Date();
    await task.save();
    return task;
};

export const getStudentPendingTasks = async (studentId, subjectId = null) => {
    const query = {
        student: studentId,
        status: { $in: ['assigned', 'in_progress', 'overdue'] }
    };

    if (subjectId) query.subject = subjectId;

    return AcademicExcellenceTask.find(query)
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();
};

export const getTeacherTaskQueue = async (teacherId, classId = null) => {
    const query = {
        teacher: teacherId,
        status: 'completed',
        teacherReviewedAt: null
    };

    if (classId) query.class = classId;

    return AcademicExcellenceTask.find(query)
        .sort({ completedAt: -1, createdAt: -1 })
        .populate('student', 'firstName lastName studentId')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .lean();
};

export const autoAssignAIInteractiveTask = async (studentId, objectiveDoc, context = {}) => {
    const objectiveKey = String(objectiveDoc?.objectiveKey || '').trim();
    if (!objectiveKey) return null;

    const student = await Student.findById(studentId)
        .select('_id school currentClass academicYear status')
        .lean();
    if (!student || student.status !== 'active') return null;

    const schoolId = context.schoolId || student.school;
    const classId = context.classId || objectiveDoc?.class || student.currentClass;
    const subjectId = context.subjectId || objectiveDoc?.subject || null;
    if (!classId || !subjectId) return null;

    const existing = await AcademicExcellenceTask.findOne({
        school: schoolId,
        student: student._id,
        objectiveKey,
        taskType: 'ai_interactive',
        status: { $in: ['assigned', 'in_progress'] }
    }).select('_id').lean();
    if (existing) return null;

    let teacherId = context.teacherId || null;
    if (!teacherId) {
        const fallbackTeacher = await User.findOne({
            school: schoolId,
            role: { $in: ['teacher', 'admin', 'department_principal'] },
            isActive: true
        }).select('_id').lean();
        teacherId = fallbackTeacher?._id || null;
    }
    if (!teacherId) return null;

    return AcademicExcellenceTask.create({
        school: schoolId,
        academicYear: student.academicYear || null,
        student: student._id,
        class: classId,
        subject: subjectId,
        teacher: teacherId,
        objectiveKey,
        objectiveName: String(objectiveDoc?.objectiveName || objectiveKey).trim(),
        objectiveRef: objectiveDoc?._id || null,
        title: `AI Practice: ${String(objectiveDoc?.objectiveName || objectiveKey).trim()}`,
        description: '',
        taskType: 'ai_interactive',
        estimatedMinutes: 15,
        status: 'assigned',
        assignedAt: new Date()
    });
};

export default {
    assignTask,
    bulkAssignTasks,
    completeTask,
    reviewTask,
    getStudentPendingTasks,
    getTeacherTaskQueue,
    autoAssignAIInteractiveTask
};
