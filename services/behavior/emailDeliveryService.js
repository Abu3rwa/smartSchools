import BehaviorNotification from '../../models/BehaviorNotification.js';
import School from '../../models/School.js';
import { sendTransactionalEmail } from '../transactionalEmailService.js';
import { renderBehaviorEmailHtml, renderBehaviorEmailText } from './emailHtml.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from './auditService.js';
import logger from '../../utils/logger.js';

/**
 * Delivery for behavior communications.
 *
 * Two switches must both be true before a message leaves the building:
 *   1. the school's own `emailDelivery.enabled`, and
 *   2. BEHAVIOR_EMAIL_DELIVERY, a deployment-wide gate.
 * With the deployment gate unset the dispatcher only reports what it *would*
 * send, so the feature can be built and tested without reaching a family.
 *
 * Approval is still the real control: a step awaiting approval is written
 * `suppressed`, and nothing here reads a suppressed row.
 */

const MAX_ATTEMPTS = 3;
const LEASE_MINUTES = 5;
const BACKOFF_MINUTES = 30;

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

export const liveEmailDeliveryEnabled = () => truthy(process.env.BEHAVIOR_EMAIL_DELIVERY);

/**
 * Name and branding for the shell the family reads. This is presentation only,
 * so a missing or malformed school row must never stop a send.
 */
export const loadDeliverySchool = async (schoolId) => {
    try {
        return await School.findById(schoolId).select('name branding').lean();
    } catch {
        return null;
    }
};

const emailList = (entries) => [...new Set((entries || [])
    .map((entry) => String(entry?.email || '').trim())
    .filter(Boolean))];

// A mail provider echoes the address back in its error text, and this row is read
// by staff screens, so the address is stripped before anything is stored.
const redactAddresses = (value) => String(value || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]');

const nextAttemptAt = ({ now, minutes }) => new Date(now.getTime() + minutes * 60 * 1000);

/**
 * Claims one due row and marks it as being worked on. Re-claiming an expired
 * lease means a crashed worker cannot strand a message forever.
 */
const claimDueRow = async ({ schoolId, now }) => {
    const leaseExpired = { nextAttemptAt: { $lte: now } };
    const row = await BehaviorNotification.findOneAndUpdate(
        {
            school: schoolId,
            channel: 'email',
            recipients: { $not: { $size: 0 } },
            $or: [
                { status: { $in: ['draft', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS }, ...leaseExpired },
                { status: 'sending', ...leaseExpired }
            ]
        },
        {
            $set: { status: 'sending', nextAttemptAt: nextAttemptAt({ now, minutes: LEASE_MINUTES }) },
            $inc: { attempts: 1 }
        },
        { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
    );
    return row;
};

const sendRow = async (row, school) => {
    const to = emailList(row.recipients);
    const cc = emailList(row.cc);
    const message = { body: row.body || '', language: row.language, facts: row.facts };
    return sendTransactionalEmail({
        to,
        ...(cc.length ? { cc } : {}),
        subject: row.subject || '',
        // Both parts carry the same facts, so neither reader gets a shorter notice.
        text: renderBehaviorEmailText(message),
        html: renderBehaviorEmailHtml({ ...message, subject: row.subject, school }),
        schoolId: row.school,
        // A family notice is a school message, not a teacher's personal mail, and
        // a shared SMTP account must never be used for it.
        allowAdminFallback: true,
        allowSmtp: false
    });
};

export const deliverBehaviorEmails = async ({
    schoolId,
    settings,
    school = null,
    now = new Date(),
    limit = 20,
    deliver = null
} = {}) => {
    const schoolWantsEmail = settings?.emailDelivery?.enabled === true;
    const deploymentAllows = deliver ?? liveEmailDeliveryEnabled();

    if (!schoolId || !schoolWantsEmail) {
        return { dryRun: true, reason: 'SCHOOL_SWITCH_OFF', due: 0, sent: 0, failed: 0 };
    }

    const due = await BehaviorNotification.countDocuments({
        school: schoolId,
        channel: 'email',
        recipients: { $not: { $size: 0 } },
        $or: [
            { status: { $in: ['draft', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
            { status: 'sending', nextAttemptAt: { $lte: now } }
        ]
    });

    if (!deploymentAllows) {
        // Nothing is claimed and nothing is mutated: the queue is only reported.
        return { dryRun: true, reason: 'DEPLOYMENT_GATE_OFF', due, sent: 0, failed: 0 };
    }

    const summary = { dryRun: false, reason: null, due, sent: 0, failed: 0, errors: [] };
    const max = Math.min(Math.max(Number(limit) || 1, 1), 100);

    for (let index = 0; index < max; index += 1) {
        const row = await claimDueRow({ schoolId, now });
        if (!row) break;

        try {
            const result = await sendRow(row, school);
            await BehaviorNotification.updateOne(
                { _id: row._id, status: 'sending' },
                {
                    $set: {
                        status: 'sent',
                        sentAt: new Date(),
                        messageId: result?.messageId || null,
                        transport: result?.channel || null,
                        blockedReason: null,
                        error: null
                    }
                }
            );
            summary.sent += 1;
            await recordBehaviorAudit({
                schoolId,
                action: BEHAVIOR_AUDIT_ACTIONS.NOTIFICATION_SENT,
                incidentId: row.incident,
                // Recipients are never written to the audit trail.
                after: { notificationId: String(row._id), channel: 'email', language: row.language }
            });
        } catch (error) {
            const retriesLeft = row.attempts < MAX_ATTEMPTS;
            await BehaviorNotification.updateOne(
                { _id: row._id, status: 'sending' },
                {
                    $set: {
                        status: 'failed',
                        error: redactAddresses(error?.message || 'send failed').slice(0, 300),
                        // A row that used its attempts keeps the old deadline, so the
                        // claim filter (attempts < MAX) leaves it alone until it is
                        // deliberately retried.
                        ...(retriesLeft
                            ? { nextAttemptAt: nextAttemptAt({ now, minutes: BACKOFF_MINUTES }) }
                            : {})
                    }
                }
            );
            summary.failed += 1;
            summary.errors.push(String(error?.code || 'SEND_FAILED'));
            await recordBehaviorAudit({
                schoolId,
                action: BEHAVIOR_AUDIT_ACTIONS.NOTIFICATION_FAILED,
                incidentId: row.incident,
                after: { notificationId: String(row._id), code: error?.code || 'SEND_FAILED' }
            }).catch(() => null);
            logger.warn('behavior_email_send_failed', {
                schoolId: String(schoolId),
                notificationId: String(row._id),
                code: error?.code || 'SEND_FAILED'
            });
        }
    }

    return summary;
};

export default deliverBehaviorEmails;
