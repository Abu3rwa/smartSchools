import SupportSettings from '../models/SupportSettings.js';
import SupportCase from '../models/SupportCase.js';
import SupportSurvey from '../models/SupportSurvey.js';
import User from '../models/User.js';
import { sendStaffEscalation, sendSurveyReminders } from './supportEmailService.js';
import { refreshReviewStatus } from './supportReviewService.js';
import logger from '../utils/logger.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_SCHOOLS_PER_RUN = 50;
const MAX_SURVEYS_PER_SCHOOL = 200;
const MAX_ACK_CASES_PER_SCHOOL = 100;

// A settings value of 0 must mean zero — a `Number(value) || fallback` guard
// would silently turn "no reminders" into two reminders. A missing value is
// not zero: null/undefined/'' take the default.
const isMissing = (value) => value === null || value === undefined || value === '';

export const boundedDays = (value) => {
    if (isMissing(value)) return 3;
    const num = Number(value);
    return Math.min(30, Math.max(1, Number.isFinite(num) ? num : 3));
};

export const boundedReminders = (value) => {
    if (isMissing(value)) return 2;
    const num = Number(value);
    return Math.min(5, Math.max(0, Number.isFinite(num) ? num : 2));
};

export const boundedAckDays = (value) => {
    if (isMissing(value)) return 2;
    const num = Number(value);
    return Math.min(10, Math.max(1, Number.isFinite(num) ? num : 2));
};

export const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY);

/** School working days skip the Friday/Saturday weekend. */
export const addSchoolDays = (date, days) => {
    const result = new Date(new Date(date).getTime());
    let remaining = days;
    while (remaining > 0) {
        result.setDate(result.getDate() + 1);
        const weekday = result.getDay();
        if (weekday === 5 || weekday === 6) continue;
        remaining -= 1;
    }
    return result;
};

const studentLabel = (student) => (
    `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student'
);

const nameOf = (user) => (
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
);

/** Backup first; without a named backup the school admins absorb the escalation. */
const escalationRecipients = async ({ schoolId, settings }) => {
    if (settings.escalationBackup) {
        const backup = await User.findOne({ _id: settings.escalationBackup, school: schoolId, isActive: true })
            .select('email firstName lastName')
            .setOptions({ skipTenantFilter: true })
            .lean();
        if (backup?.email) return [{ id: String(backup._id), email: String(backup.email).toLowerCase(), name: nameOf(backup) }];
    }
    const admins = await User.find({
        school: schoolId,
        isActive: true,
        $or: [
            { role: { $in: ['admin', 'super_admin'] } },
            { roles: { $in: ['admin', 'super_admin'] } },
        ],
    })
        .select('email firstName lastName')
        .setOptions({ skipTenantFilter: true })
        .lean();
    return admins
        .filter((row) => row.email)
        .map((row) => ({ id: String(row._id), email: String(row.email).toLowerCase(), name: nameOf(row) }));
};

/**
 * Bounded, idempotent reminder sweep. The query is the cursor: only surveys
 * actually due are read, oldest first, and every escalated survey leaves the
 * pool for good, so a slow school never starves behind its first 200 rows.
 */
export const runSupportReminderJob = async ({ now = new Date() } = {}) => {
    const schools = await SupportSettings.find({ enabled: true })
        .setOptions({ skipTenantFilter: true })
        .select('school reminderDays reminderCount notifications acknowledgmentDays escalationBackup')
        .limit(MAX_SCHOOLS_PER_RUN)
        .lean();

    const summary = {
        schools: schools.length,
        processed: 0,
        sent: 0,
        failed: 0,
        escalated: 0,
        skipped: 0,
        ackEscalated: 0,
        ackEmailed: 0,
    };

    for (const settings of schools) {
        const schoolId = settings.school;
        const intervalDays = boundedDays(settings.reminderDays);
        const maxReminders = boundedReminders(settings.reminderCount);
        const remindersOn = settings.notifications?.reminder !== false;
        const escalationOn = settings.notifications?.reminderEscalation !== false;

        const dueCutoff = addDays(now, -intervalDays);
        const surveys = remindersOn || escalationOn
            ? await SupportSurvey.find({
                school: schoolId,
                status: { $in: ['sent', 'opened'] },
                case: { $ne: null },
                sentAt: { $ne: null },
                respondent: { $ne: null },
                escalatedAt: null,
                $or: [
                    { lastReminderAt: { $lte: dueCutoff } },
                    { lastReminderAt: null, sentAt: { $lte: dueCutoff } },
                ],
            })
                .sort({ sentAt: 1 })
                .limit(MAX_SURVEYS_PER_SCHOOL)
                .populate('student', 'firstName lastName')
                .populate('subject', 'name')
                .populate('review', 'month academicYear')
                .populate({
                    path: 'respondent',
                    select: 'kind name email active deliveryMethod teacher',
                    populate: { path: 'teacher', select: 'firstName lastName email' },
                })
            : [];

        for (const survey of surveys) {
            if (!survey.respondent?.active) continue;

            const caseDoc = await SupportCase.findOne({
                _id: survey.case,
                school: schoolId,
                status: 'active',
            }).select('owner homeroomTeacher').lean();
            if (!caseDoc) continue;

            const canEmail = survey.deliveryMethod === 'email' && survey.deliveryState === 'sent';
            if (!canEmail) {
                if (!escalationOn) continue;
                if (await escalateOnce({ survey, caseDoc, now, reason: 'paper' })) {
                    summary.escalated += 1;
                }
                continue;
            }

            if (survey.reminderCount < maxReminders && remindersOn) {
                summary.processed += 1;
                const claimed = await SupportSurvey.findOneAndUpdate(
                    {
                        _id: survey._id,
                        school: schoolId,
                        status: { $in: ['sent', 'opened'] },
                        reminderCount: survey.reminderCount,
                    },
                    { $inc: { reminderCount: 1 }, $set: { lastReminderAt: now } },
                    { new: true },
                );
                if (!claimed) {
                    summary.skipped += 1;
                    continue;
                }
                const [result] = await sendSurveyReminders({
                    schoolId,
                    surveys: [survey],
                    student: survey.student,
                    reminderNumber: claimed.reminderCount,
                });
                const delivered = result?.status === 'sent'
                    || (result?.status === 'skipped' && result?.reason === 'already-sent');
                if (delivered) {
                    summary.sent += 1;
                } else {
                    summary.failed += 1;
                    // A provider failure is not family nonresponse: give the slot back.
                    await SupportSurvey.updateOne(
                        { _id: survey._id, school: schoolId },
                        { $inc: { reminderCount: -1 }, $set: { reminderFailedAt: now } },
                    );
                }
                continue;
            }

            if (escalationOn) {
                const escalated = await escalateOnce({ survey, caseDoc, now, reason: 'unanswered' });
                if (escalated) summary.escalated += 1;
            }
        }

        await acknowledgmentSweep({ schoolId, settings, now, summary });
    }

    logger.info('support_reminder_job_run', summary);
    return summary;
};

const escalateOnce = async ({ survey, caseDoc, now, reason }) => {
    const claimed = await SupportSurvey.findOneAndUpdate(
        { _id: survey._id, school: survey.school, escalatedAt: null },
        { $set: { escalatedAt: now } },
        { new: true },
    );
    if (!claimed) return false;

    const text = reason === 'paper'
        ? `Support survey follow-up / متابعة استبيان الدعم: ${studentLabel(survey.student)} has no email on file. Hand over or collect the paper survey (${survey.audience}${survey.respondentSlot ? `, ${survey.respondentSlot}` : ''}).`
        : `Support survey follow-up / متابعة استبيان الدعم: ${studentLabel(survey.student)} has not answered after the reminders. Check in with the family or the teacher (${survey.audience}${survey.respondentSlot ? `, ${survey.respondentSlot}` : ''}).`;
    await SupportCase.updateOne(
        { _id: caseDoc._id, school: survey.school },
        { $push: { notes: { text, at: now, by: null } } },
    );
    if (claimed.review) await refreshReviewStatus({ schoolId: survey.school, reviewId: claimed.review });
    return true;
};

/**
 * Q12 acknowledgment SLA: a case its managing staff have not opened within
 * `acknowledgmentDays` school days escalates once — a case note, then one
 * digest email to the named backup (or the admins). Escalation never repeats
 * for the same case.
 */
export const acknowledgmentSweep = async ({ schoolId, settings, now, summary = null }) => {
    if (settings.notifications?.acknowledgmentEscalation === false) {
        return { escalated: 0, emailed: 0 };
    }
    const ackDays = boundedAckDays(settings.acknowledgmentDays);
    const dueBefore = addSchoolDays(now, -ackDays);

    const stale = await SupportCase.find({
        school: schoolId,
        status: 'active',
        acknowledgedAt: null,
        assignmentEscalatedAt: null,
        openedAt: { $ne: null, $lte: dueBefore },
    })
        .sort({ openedAt: 1 })
        .limit(MAX_ACK_CASES_PER_SCHOOL)
        .populate('student', 'firstName lastName')
        .populate('owner', 'firstName lastName')
        .setOptions({ skipTenantFilter: true });

    const escalatedRows = [];
    let escalated = 0;
    for (const caseDoc of stale) {
        const claimed = await SupportCase.findOneAndUpdate(
            { _id: caseDoc._id, school: schoolId, assignmentEscalatedAt: null },
            { $set: { assignmentEscalatedAt: now } },
            { new: true },
        );
        if (!claimed) continue;
        escalated += 1;
        const text = `Support case needs acknowledgment / حالة الدعم بحاجة إلى تأكيد الاستلام: ${studentLabel(caseDoc.student)} has been open for ${ackDays} school days without being acknowledged by its owner.`;
        await SupportCase.updateOne(
            { _id: caseDoc._id, school: schoolId },
            { $push: { notes: { text, at: now, by: null } } },
        );
        escalatedRows.push({
            caseId: String(caseDoc._id),
            studentName: studentLabel(caseDoc.student),
            actionEn: 'Acknowledge the support case',
            ownerName: nameOf(caseDoc.owner),
            dueEn: '',
        });
    }

    let emailed = 0;
    if (escalatedRows.length) {
        const recipients = await escalationRecipients({ schoolId, settings });
        const dayKey = now.toISOString().slice(0, 10);
        for (const recipient of recipients) {
            const outcome = await sendStaffEscalation({
                schoolId,
                recipientEmail: recipient.email,
                subject: {
                    scope: `ack:${schoolId}:${dayKey}`,
                    text: `Support cases awaiting acknowledgment — ${escalatedRows.length} case${escalatedRows.length === 1 ? '' : 's'}`,
                },
                introEn: `These support cases have waited ${ackDays} school days without acknowledgment.`,
                cases: escalatedRows,
            });
            if (outcome.status === 'sent') emailed += 1;
        }
    }

    if (summary) {
        summary.ackEscalated = (summary.ackEscalated || 0) + escalated;
        summary.ackEmailed = (summary.ackEmailed || 0) + emailed;
    }
    return { escalated, emailed };
};

