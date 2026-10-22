import mongoose from 'mongoose';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorTask from '../../models/BehaviorTask.js';
import Student from '../../models/Student.js';
import { resolvePortalStudentIds } from './accessService.js';
import { getBehaviorReturnStatus } from './taskService.js';
import { countBehaviorWords } from './suggestionService.js';

const OPEN_TASK_STATUSES = ['assigned', 'submitted', 'needs_revision', 'overdue'];

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });

/**
 * Portal reads are deliberately narrow: only incidents whose step was released
 * to the portal, and only the fields a family needs. Staff notes, other students
 * and email drafts never appear in these shapes.
 */
export const getPortalOverview = async ({ req, limit = 30 }) => {
    const { studentIds, scope } = await resolvePortalStudentIds(req);
    if (!studentIds.length) {
        return { scope, students: [], incidents: [], tasks: [], totals: { openTasks: 0, released: 0 } };
    }

    const incidentFilter = {
        school: req.schoolId,
        student: { $in: studentIds },
        portalReleased: true,
        status: { $nin: ['voided', 'merged'] }
    };
    const taskFilter = {
        school: req.schoolId,
        student: { $in: studentIds },
        status: { $in: OPEN_TASK_STATUSES }
    };

    const [students, incidents, tasks, releasedTotal] = await Promise.all([
        Student.find({ _id: { $in: studentIds }, school: req.schoolId })
            .select('firstName lastName studentId')
            .lean(),
        BehaviorIncident.find(incidentFilter)
            .sort({ occurredAt: -1 })
            .limit(Math.min(Number(limit) || 30, 100))
            .select('student occurredAt status behaviorType appliedStep countSnapshot studentSubmissionCount')
            .populate('behaviorType', 'name level')
            .lean(),
        BehaviorTask.find(taskFilter)
            .sort({ dueAt: 1 })
            .select('student incident taskType title instructions questions dueAt status minWords stepOrder submission requiresReturnClearance')
            .lean(),
        BehaviorIncident.countDocuments(incidentFilter)
    ]);

    const returnStatuses = await Promise.all(
        students.map(async (student) => ({
            studentId: student._id,
            ...(await getBehaviorReturnStatus({ schoolId: req.schoolId, studentId: student._id }))
        }))
    );

    return {
        scope,
        students: students.map((student) => ({
            ...student,
            returnStatus: returnStatuses.find((entry) => String(entry.studentId) === String(student._id))
                || { clearedToReturn: true, label: 'cleared' }
        })),
        incidents: incidents.map((incident) => ({
            _id: incident._id,
            student: incident.student,
            occurredAt: incident.occurredAt,
            status: incident.status,
            behaviorType: incident.behaviorType,
            step: incident.appliedStep
                ? { order: incident.appliedStep.order, title: incident.appliedStep.title }
                : null,
            occurrence: incident.countSnapshot?.occurrence ?? null
        })),
        tasks: tasks.map((task) => ({
            ...task,
            wordCount: task.submission?.wordCount ?? countBehaviorWords(task.submission?.text || '')
        })),
        totals: { openTasks: tasks.length, released: releasedTotal }
    };
};

/**
 * One released incident with its tasks, for the family's detail view.
 */
export const getPortalIncident = async ({ req, incidentId }) => {
    if (!mongoose.isValidObjectId(incidentId)) throw badRequest('Invalid incident id', 'INVALID_INCIDENT_ID');

    const { studentIds } = await resolvePortalStudentIds(req);
    if (!studentIds.length) throw notFound('Incident not found');

    const incident = await BehaviorIncident.findOne({
        school: req.schoolId,
        _id: incidentId,
        student: { $in: studentIds },
        portalReleased: true
    })
        .select('student occurredAt status behaviorType appliedStep countSnapshot createdAt')
        .populate('behaviorType', 'name level description')
        .lean();
    if (!incident) throw notFound('Incident not found');

    const tasks = await BehaviorTask.find({ school: req.schoolId, incident: incident._id })
        .sort({ dueAt: 1 })
        .select('taskType title instructions questions dueAt status minWords stepOrder submission verifiedAt')
        .lean();

    return {
        incident: {
            ...incident,
            step: incident.appliedStep
                ? { order: incident.appliedStep.order, title: incident.appliedStep.title }
                : null
        },
        tasks: tasks.map((task) => ({
            ...task,
            wordCount: task.submission?.wordCount ?? countBehaviorWords(task.submission?.text || '')
        }))
    };
};

/**
 * The student's own task list, newest due date first, with the word minimum so
 * the UI can show progress before anything is submitted.
 */
export const getPortalTasks = async ({ req, status = null, limit = 50 }) => {
    const { studentIds } = await resolvePortalStudentIds(req);
    if (!studentIds.length) return { items: [], total: 0 };

    const filter = {
        school: req.schoolId,
        student: { $in: studentIds },
        ...(status && OPEN_TASK_STATUSES.includes(status) ? { status } : { status: { $in: OPEN_TASK_STATUSES } })
    };

    const [items, total] = await Promise.all([
        BehaviorTask.find(filter)
            .sort({ dueAt: 1, createdAt: -1 })
            .limit(Math.min(Number(limit) || 50, 100))
            .select('student incident behaviorType taskType title instructions questions dueAt status minWords submission stepOrder')
            .populate('behaviorType', 'name level')
            .lean(),
        BehaviorTask.countDocuments(filter)
    ]);

    return {
        items: items.map((task) => ({
            ...task,
            wordCount: task.submission?.wordCount ?? countBehaviorWords(task.submission?.text || '')
        })),
        total
    };
};

/**
 * Only the linked student may write the answer; a parent reads but never signs
 * on their child's behalf.
 */
export const assertPortalSubmitter = async (req) => {
    const { studentIds, scope } = await resolvePortalStudentIds(req);
    if (scope !== 'student') {
        throw Object.assign(new Error('Only the student can complete this task.'), { statusCode: 403 });
    }
    return studentIds[0] || null;
};
