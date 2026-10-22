import mongoose from 'mongoose';
import BehaviorTask from '../../models/BehaviorTask.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import {
    RETURN_GATING_TASK_TYPES,
    SUBMITTABLE_BEHAVIOR_TASK_TYPES
} from '../../constants/behavior.js';
import { meetsWordMinimum } from './suggestionService.js';
import { canVerifyBehaviorTask } from './accessService.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from './auditService.js';
import { applyBehaviorTransition } from './stateMachine.js';

const badRequest = (message, code) => Object.assign(new Error(message), { statusCode: 400, code });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

export const CLOSED_TASK_STATUSES = ['completed', 'waived'];
const ADMIN_ROLES = ['super_admin', 'admin'];

const resolveVerifierRule = ({ consequence, taskType, settings }) => consequence?.verifierRule
    || settings?.verifier?.perTaskType?.find?.((entry) => entry.taskType === taskType)?.rule
    || settings?.verifier?.defaultRule
    || 'logging-staff';

const verifierRoleFor = ({ rule, user }) => {
    if (rule === 'specific-role') return user?.role || null;
    if (rule === 'admin-only') return 'admin';
    return null;
};

/**
 * Turns a ladder step into tracked tasks with due dates and a verifier.
 */
export const createTasksForStep = async ({ incident, step, settings, actor }) => {
    const consequences = step?.consequences || [];
    if (!consequences.length) return [];

    const anchor = new Date(incident.occurredAt || Date.now()).getTime();
    const docs = consequences.map((consequence) => {
        const rule = resolveVerifierRule({ consequence, taskType: consequence.taskType, settings });
        const minWords = Number(consequence.minWords || 0)
            || (['apology_letter', 'fix_it_plan'].includes(consequence.taskType)
                ? (settings?.apologyMinWords || 0)
                : 0);

        return {
            school: incident.school,
            incident: incident._id,
            student: incident.student,
            behaviorType: incident.behaviorType,
            stepOrder: step.order,
            taskType: consequence.taskType,
            title: consequence.title,
            instructions: consequence.instructions || '',
            questions: consequence.questions || [],
            toWhom: consequence.toWhom || null,
            minWords,
            assignedAt: new Date(anchor),
            dueAt: consequence.dueInDays
                ? new Date(anchor + Number(consequence.dueInDays) * 24 * 60 * 60 * 1000)
                : null,
            status: 'assigned',
            requiresReturnClearance: RETURN_GATING_TASK_TYPES.includes(consequence.taskType),
            verifier: {
                rule,
                role: verifierRoleFor({ rule, user: actor }),
                user: rule === 'logging-staff' ? incident.reportedBy : null
            }
        };
    });

    const created = await BehaviorTask.create(docs);
    const tasks = Array.isArray(created) ? created : [created];

    await recordBehaviorAudit({
        schoolId: incident.school,
        action: BEHAVIOR_AUDIT_ACTIONS.TASK_CREATED,
        actor,
        incidentId: incident._id,
        after: { count: tasks.length, taskTypes: tasks.map((task) => task.taskType) }
    });

    return tasks;
};

const loadSubmittableTask = async ({ taskId, schoolId }) => {
    if (!mongoose.isValidObjectId(taskId)) throw badRequest('Invalid task id', 'INVALID_TASK_ID');
    const task = await BehaviorTask.findOne({ _id: taskId, school: schoolId }).lean();
    if (!task) throw notFound('Task not found');
    if (!SUBMITTABLE_BEHAVIOR_TASK_TYPES.includes(task.taskType)) {
        throw badRequest('This task type has no written submission', 'TASK_NOT_SUBMITTABLE');
    }
    if (CLOSED_TASK_STATUSES.includes(task.status)) {
        throw badRequest('This task is already closed', 'TASK_CLOSED');
    }
    return task;
};

/**
 * The student answers a written task. The minimum word count is enforced here on
 * the server, never only in the browser.
 */
export const submitBehaviorTask = async ({ req, taskId, text, answers, linkedStudentId }) => {
    const task = await loadSubmittableTask({ taskId, schoolId: req.schoolId });
    if (String(task.student) !== String(linkedStudentId || '')) {
        throw forbidden('You can only submit your own tasks.');
    }

    const wordCount = meetsWordMinimum({ text, minWords: task.minWords });
    if (!wordCount.ok) {
        throw Object.assign(
            new Error(`This answer needs at least ${task.minWords} words (currently ${wordCount.wordCount}).`),
            {
                statusCode: 400,
                code: 'WORD_COUNT_TOO_SHORT',
                wordCount: wordCount.wordCount,
                minWords: task.minWords
            }
        );
    }

    const submission = {
        text: String(text || '').trim(),
        answers: (answers || []).map((entry) => ({
            question: String(entry?.question || '').slice(0, 500),
            answer: String(entry?.answer || '').slice(0, 4000)
        })),
        wordCount: wordCount.wordCount,
        submittedAt: new Date(),
        submittedBy: req.user._id
    };

    const updated = await BehaviorTask.findOneAndUpdate(
        { _id: task._id, school: req.schoolId },
        { $set: { submission, status: 'submitted' } },
        { new: true }
    ).populate('student', 'firstName lastName studentId').lean();

    await BehaviorIncident.updateOne({ _id: task.incident }, { $inc: { studentSubmissionCount: 1 } });

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.TASK_SUBMITTED,
        actor: req.user,
        incidentId: task.incident,
        targetType: 'task',
        targetId: task._id,
        after: { status: 'submitted', wordCount: submission.wordCount }
    });

    return updated;
};

const verificationPatch = ({ user, decision, comment }) => {
    const now = new Date();
    if (decision === 'completed') {
        return { status: 'completed', verifiedBy: user._id, verifiedAt: now, revisionComment: '' };
    }
    if (decision === 'waived') {
        return { status: 'waived', verifiedBy: user._id, verifiedAt: now, waiverReason: comment };
    }
    return { status: 'needs_revision', revisionComment: comment };
};

const AUDIT_FOR_DECISION = {
    completed: BEHAVIOR_AUDIT_ACTIONS.TASK_VERIFIED,
    waived: BEHAVIOR_AUDIT_ACTIONS.TASK_WAIVED,
    needs_revision: BEHAVIOR_AUDIT_ACTIONS.TASK_REVISION_REQUESTED
};

/**
 * A verifier marks a task complete, asks for a revision, or waives it with a
 * reason. Once every task on the incident is closed, the incident closes.
 */
export const verifyBehaviorTask = async ({ req, taskId, decision, comment, settings }) => {
    if (!['completed', 'needs_revision', 'waived'].includes(decision)) {
        throw badRequest('Unknown verification decision', 'TASK_DECISION_INVALID');
    }

    const task = await BehaviorTask.findOne({ _id: taskId, school: req.schoolId }).lean();
    if (!task) throw notFound('Task not found');
    if (CLOSED_TASK_STATUSES.includes(task.status)) {
        throw badRequest('This task is already closed', 'TASK_CLOSED');
    }
    if (decision !== 'completed' && !String(comment || '').trim()) {
        throw badRequest('This decision needs a reason', 'VERIFIER_REASON_REQUIRED');
    }

    const incident = await BehaviorIncident.findOne({ _id: task.incident, school: req.schoolId }).lean();
    if (!canVerifyBehaviorTask(req.user, task, { incident, settings })) {
        throw forbidden('You are not the verifier for this task.');
    }

    const patch = verificationPatch({ user: req.user, decision, comment: String(comment || '').trim() });
    const updated = await BehaviorTask.findOneAndUpdate(
        { _id: task._id, school: req.schoolId },
        { $set: patch },
        { new: true, lean: true }
    );

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: AUDIT_FOR_DECISION[decision],
        actor: req.user,
        incidentId: task.incident,
        targetType: 'task',
        targetId: task._id,
        before: { status: task.status },
        after: { status: updated.status }
    });

    if (incident?.status === 'in_progress') {
        await closeIncidentIfCleared({ incidentId: incident._id, schoolId: req.schoolId, actor: req.user });
    }

    return updated;
};

export const closeIncidentIfCleared = async ({ incidentId, schoolId, actor }) => {
    const openCount = await BehaviorTask.countDocuments({
        school: schoolId,
        incident: incidentId,
        status: { $nin: CLOSED_TASK_STATUSES }
    });
    if (openCount > 0) return null;

    const incident = await BehaviorIncident.findOne({ _id: incidentId, school: schoolId });
    if (!incident || incident.status !== 'in_progress') return null;

    return applyBehaviorTransition({
        incident,
        to: 'closed',
        actor,
        meta: { reason: 'all tasks completed or waived' }
    });
};

/**
 * Scheduled sweep: overdue work is flagged for staff. No message leaves the
 * system - reminders surface in the staff queue instead of an inbox.
 */
export const markOverdueBehaviorTasks = async ({ schoolId = null, now = new Date() } = {}) => {
    const filter = {
        ...(schoolId ? { school: schoolId } : {}),
        status: { $in: ['assigned', 'submitted', 'needs_revision'] },
        dueAt: { $lt: now }
    };

    const result = await BehaviorTask.updateMany(filter, { $set: { status: 'overdue' } });
    // The audit row belongs to one school, so a global sweep (job restart, no
    // school context) only reports the count.
    if (result.modifiedCount && schoolId) {
        await recordBehaviorAudit({
            schoolId,
            action: BEHAVIOR_AUDIT_ACTIONS.TASK_OVERDUE,
            after: { marked: result.modifiedCount }
        });
    }
    return { marked: result.modifiedCount || 0 };
};

export const listTasksForActor = async ({ req, status, limit = 50, skip = 0 }) => {
    const filter = {
        school: req.schoolId,
        ...(status ? { status } : { status: { $in: ['assigned', 'submitted', 'needs_revision', 'overdue'] } })
    };

    if (!ADMIN_ROLES.includes(req.user.role)) {
        filter.$or = [
            { 'verifier.user': req.user._id },
            { 'verifier.role': req.user.role }
        ];
    }

    const [items, total] = await Promise.all([
        BehaviorTask.find(filter)
            .sort({ dueAt: 1, createdAt: -1 })
            .skip(skip)
            .limit(Math.min(Number(limit) || 50, 200))
            .populate('student', 'firstName lastName studentId')
            .populate('behaviorType', 'name level')
            .lean(),
        BehaviorTask.countDocuments(filter)
    ]);

    return { items, total };
};

/**
 * Informational only. Attendance and class features are never altered by this
 * module; staff simply see that the student is not cleared to return yet.
 */
export const getBehaviorReturnStatus = async ({ schoolId, studentId }) => {
    const pending = await BehaviorTask.exists({
        school: schoolId,
        student: studentId,
        requiresReturnClearance: true,
        status: { $nin: CLOSED_TASK_STATUSES }
    });

    return {
        clearedToReturn: !pending,
        label: pending ? 'not_cleared' : 'cleared'
    };
};
