import { createHash } from 'node:crypto';
import Student from '../../models/Student.js';
import StudentBehavior from '../../models/StudentBehavior.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import BehaviorNotification from '../../models/BehaviorNotification.js';
import { requireEntry } from './teacherBehaviorService.js';
import { resolveParentRecipients } from './notificationService.js';
import { getBehaviorSettings } from './settingsService.js';
import { canApproveBehaviorIncident, canManageBehaviorAdmin } from './accessService.js';
import { deliverBehaviorEmails, liveEmailDeliveryEnabled } from './emailDeliveryService.js';
import { recordBehaviorAudit } from './auditService.js';

const problem = (message, code, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const keyFor = (entryId) => `behavior-entry:${entryId}:email`;
export const parentMessageHash = ({ language, subject, body, recipients }) => createHash('sha256')
    .update(JSON.stringify([language, subject, body, recipients.map((row) => row.email.toLowerCase()).sort()])).digest('hex');

export const communicationDto = (row) => row ? {
    id: String(row._id),
    status: row.status === 'suppressed' ? (row.blockedReason === 'AWAITING_APPROVAL' ? 'awaiting_review' : 'draft')
        : (row.status === 'draft' || row.status === 'sending' ? 'queued' : row.status),
    language: row.language, subject: row.subject, body: row.body,
    recipients: (row.recipients || []).map(({ name, email, relation }) => ({ name, email, relation })),
    previewHash: row.previewHash, sentAt: row.sentAt || null, error: row.error || null,
    blockedReason: row.blockedReason || null
} : { status: 'not_sent' };

export const getEntryDetail = async ({ req, entryId }) => {
    const entry = await requireEntry(req, entryId);
    const [message, settings, formalCase] = await Promise.all([
        BehaviorNotification.findOne({ school: req.schoolId, behaviorEntry: entry._id, channel: 'email' }).lean(),
        getBehaviorSettings(req.schoolId),
        BehaviorIncident.findOne({ school: req.schoolId, routineEntry: entry._id }).select('_id status approval').lean()
    ]);
    return {
        communication: communicationDto(message), formalCase,
        canReview: canApproveBehaviorIncident(req.user, settings),
        canLinkCase: canManageBehaviorAdmin(req.user),
        review: { status: entry.review?.status || 'not_required', approverRoles: settings.approval?.approverRoles || [] },
        followUp: { action: entry.followUpAction || '', dueAt: entry.followUpDate || null, note: entry.followUpNotes || '', completedAt: entry.followUpCompletedAt || null },
        manualContact: entry.parentNotified ? { method: entry.parentNotificationMethod, at: entry.parentNotificationDate } : null,
        deliveryBlock: !settings.emailDelivery?.enabled ? 'SCHOOL_SWITCH_OFF' : (!liveEmailDeliveryEnabled() ? 'DEPLOYMENT_GATE_OFF' : null)
    };
};

export const previewEntryMessage = async ({ req, entryId, payload }) => {
    const entry = await requireEntry(req, entryId);
    const student = await Student.findOne({ _id: entry.student, school: req.schoolId });
    const recipients = resolveParentRecipients(student);
    if (!recipients.length) throw problem('Add a parent email to the student record before preparing a message.', 'MISSING_PARENT_EMAIL');
    const otherStudents = await Student.find({ school: req.schoolId, _id: { $in: entry.otherStudentsInvolved || [] } }).select('firstName lastName').lean();
    const text = `${payload.subject} ${payload.body}`.toLowerCase();
    if (otherStudents.some((other) => [other.firstName, other.lastName].some((name) => name?.length > 2 && text.includes(name.toLowerCase())))) {
        throw problem('Remove other students’ names from the parent message.', 'PARENT_MESSAGE_PRIVACY');
    }
    const fields = { language: payload.language, subject: payload.subject, body: payload.body, recipients };
    const previewHash = parentMessageHash(fields);
    const filter = { school: req.schoolId, idempotencyKey: keyFor(entryId) };
    let row = await BehaviorNotification.findOne(filter);
    if (row && ['sent', 'sending', 'draft'].includes(row.status)) return { communication: communicationDto(row) };
    const update = {
        ...fields, previewHash, school: req.schoolId, behaviorEntry: entry._id,
        channel: 'email', status: 'suppressed', blockedReason: 'PREVIEW_ONLY', nextAttemptAt: null,
        approvedBy: null, approvedAt: null, requestedBy: req.user._id, error: null
    };
    if (row) {
        row = await BehaviorNotification.findOneAndUpdate({ ...filter, status: { $in: ['suppressed', 'failed'] } }, { $set: update }, { new: true });
        if (!row) throw problem('The message changed. Reload before sending.', 'MESSAGE_CHANGED', 409);
    } else {
        try {
            row = await BehaviorNotification.create({ ...update, idempotencyKey: keyFor(entryId) });
        } catch (error) {
            if (error.code === 11000) throw problem('Another draft was prepared. Reload before sending.', 'MESSAGE_CHANGED', 409);
            throw error;
        }
    }
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_message_prepared', targetType: 'StudentBehavior', targetId: entry._id });
    return { communication: communicationDto(row) };
};

export const sendEntryMessage = async ({ req, entryId, previewHash, approve = false }) => {
    const entry = await requireEntry(req, entryId);
    const settings = await getBehaviorSettings(req.schoolId);
    const filter = { school: req.schoolId, behaviorEntry: entry._id, channel: 'email' };
    const row = await BehaviorNotification.findOne(filter);
    if (!row || row.previewHash !== previewHash) throw problem('Preview the current message before sending.', 'MESSAGE_CHANGED', 409);
    if (['sent', 'draft', 'sending'].includes(row.status)) return { communication: communicationDto(row) };
    const student = await Student.findOne({ _id: entry.student, school: req.schoolId });
    if (parentMessageHash({ language: row.language, subject: row.subject, body: row.body, recipients: resolveParentRecipients(student) }) !== previewHash) {
        throw problem('Family contact details changed. Prepare a new preview.', 'RECIPIENTS_CHANGED', 409);
    }
    if (entry.review?.status === 'pending') throw problem('This serious record needs review before parent communication.', 'REVIEW_REQUIRED');
    const formalCase = await BehaviorIncident.findOne({ school: req.schoolId, routineEntry: entry._id }).select('approval status').lean();
    if (formalCase && (formalCase.status === 'pending_approval' || formalCase.approval?.decision === 'rejected')) {
        throw problem('Complete the formal case review first.', 'REVIEW_REQUIRED');
    }
    const needsApproval = settings.approval?.defaultRequired !== false;
    if (approve && !canApproveBehaviorIncident(req.user, settings)) throw problem('Your role cannot approve parent messages.', 'APPROVAL_FORBIDDEN', 403);
    if (needsApproval && !approve) {
        await BehaviorNotification.updateOne({ ...filter, previewHash, status: 'suppressed' }, { $set: { blockedReason: 'AWAITING_APPROVAL' } });
        return { communication: communicationDto(await BehaviorNotification.findOne(filter).lean()) };
    }
    if (!settings.emailDelivery?.enabled) throw problem('The school has disabled behavior emails. Ask an administrator to enable delivery.', 'SCHOOL_SWITCH_OFF');
    if (!liveEmailDeliveryEnabled()) throw problem('Behavior email delivery is disabled on this deployment.', 'DEPLOYMENT_GATE_OFF');
    const readyAt = new Date(Date.now() + (settings.sendDelayMinutes || 0) * 60000);
    await BehaviorNotification.updateOne({ ...filter, previewHash, status: 'suppressed' }, { $set: {
        status: 'draft', blockedReason: null, readyAt, nextAttemptAt: readyAt, attempts: 0,
        ...(approve ? { approvedBy: req.user._id, approvedAt: new Date() } : {})
    } });
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_message_requested', targetType: 'StudentBehavior', targetId: entry._id });
    await deliverBehaviorEmails({ schoolId: req.schoolId, settings, school: req.school, notificationId: row._id, limit: 1 });
    return { communication: communicationDto(await BehaviorNotification.findOne(filter).lean()) };
};

export const recordManualContact = async ({ req, entryId, method }) => {
    const entry = await requireEntry(req, entryId);
    await StudentBehavior.updateOne({ school: req.schoolId, _id: entry._id }, { $set: { parentNotified: true, parentNotificationMethod: method, parentNotificationDate: new Date() } });
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, action: 'routine_contact_recorded', targetType: 'StudentBehavior', targetId: entry._id, after: { method } });
    return { recorded: true };
};

export const linkFormalCase = async ({ req, entryId, incidentId }) => {
    const entry = await requireEntry(req, entryId);
    if (!canManageBehaviorAdmin(req.user)) throw problem('Only behavior administrators can link formal cases.', 'LINK_FORBIDDEN', 403);
    const existing = await BehaviorIncident.findOne({ school: req.schoolId, routineEntry: entry._id });
    if (existing && String(existing._id) !== incidentId) throw problem('This record already has a formal case.', 'CASE_ALREADY_LINKED', 409);
    const linked = await BehaviorIncident.findOneAndUpdate({ _id: incidentId, school: req.schoolId, student: entry.student, $or: [{ routineEntry: null }, { routineEntry: entry._id }] }, { $set: { routineEntry: entry._id } }, { new: true });
    if (!linked) throw problem('Select an unlinked formal case for this student in this school.', 'INVALID_FORMAL_CASE');
    await recordBehaviorAudit({ schoolId: req.schoolId, actor: req.user, incidentId, action: 'routine_case_linked', targetType: 'StudentBehavior', targetId: entry._id });
    return { linked: true };
};
