import Class from '../models/Class.js';
import ReteachTask from '../models/ReteachTask.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getTeacherAssignments, isTeacherAuthorizedForClassSubject, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { createReteachTask, getReteachTaskById, listReteachTasksForClass, updateReteachTaskById } from '../services/reteachTaskService.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const enforceDepartmentScopeForClass = (req, classDoc) => {
    if (req.user.role !== 'department_principal' || !req.departmentId) return true;
    return toIdString(classDoc?.department) === toIdString(req.departmentId);
};

const enforceClassAccess = async ({ req, classDoc, subjectId }) => {
    if (!classDoc) return { allowed: false, status: 404, message: 'Class not found' };
    if (!enforceDepartmentScopeForClass(req, classDoc)) {
        return { allowed: false, status: 403, message: 'Access denied' };
    }
    if (req.user.role !== 'teacher') return { allowed: true };

    const teacherProfile = await resolveTeacherProfile(req);
    if (!teacherProfile) {
        return { allowed: false, status: 403, message: 'Teacher profile not found' };
    }

    const allowed = await isTeacherAuthorizedForClassSubject(teacherProfile._id, classDoc._id, subjectId);
    return allowed
        ? { allowed: true }
        : { allowed: false, status: 403, message: 'Access denied' };
};

export const createReteachTaskController = asyncHandler(async (req, res) => {
    const classDoc = await Class.findOne({ _id: req.body.class, school: req.schoolId }).select('department').lean();
    const access = await enforceClassAccess({ req, classDoc, subjectId: req.body.subject });
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const task = await createReteachTask({
        schoolId: req.schoolId,
        createdBy: req.user._id,
        payload: req.body
    });

    const populatedTask = await getReteachTaskById(task._id);
    res.status(201).json({ success: true, data: populatedTask });
});

export const getReteachTasksForClassController = asyncHandler(async (req, res) => {
    const classDoc = await Class.findOne({ _id: req.params.id, school: req.schoolId }).select('department').lean();
    const access = await enforceClassAccess({ req, classDoc, subjectId: req.query.subjectId || null });
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const tasks = await listReteachTasksForClass({
        schoolId: req.schoolId,
        classId: req.params.id,
        subjectId: req.query.subjectId || null
    });

    let filteredTasks = tasks;
    if (req.user.role === 'teacher' && !req.query.subjectId) {
        const assignments = await getTeacherAssignments(req.teacherId || (await resolveTeacherProfile(req))._id);
        filteredTasks = tasks.filter((task) => assignments.some((assignment) => (
            toIdString(assignment.classId) === toIdString(task.class?._id || task.class)
            && toIdString(assignment.subjectId) === toIdString(task.subject?._id || task.subject)
        )));
    }

    res.status(200).json({ success: true, data: filteredTasks });
});

export const updateReteachTaskController = asyncHandler(async (req, res) => {
    const existing = await ReteachTask.findOne({ _id: req.params.id, school: req.schoolId }).select('class subject').lean();
    if (!existing) {
        return res.status(404).json({ success: false, message: 'Reteach task not found' });
    }

    const classDoc = await Class.findOne({ _id: existing.class, school: req.schoolId }).select('department').lean();
    const access = await enforceClassAccess({ req, classDoc, subjectId: existing.subject });
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const task = await updateReteachTaskById({ taskId: req.params.id, payload: req.body });
    if (!task) {
        return res.status(404).json({ success: false, message: 'Reteach task not found' });
    }

    res.status(200).json({ success: true, data: task });
});