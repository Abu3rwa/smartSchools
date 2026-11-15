import SupportSettings from '../models/SupportSettings.js';
import SupportCase from '../models/SupportCase.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { sendSurveyReminders } from './supportEmailService.js';
import { refreshReviewStatus } from './supportReviewService.js';
import logger from '../utils/logger.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_SCHOOLS_PER_RUN = 50;
const MAX_SURVEYS_PER_SCHOOL = 200;

const boundedDays = (value) => Math.min(30, Math.max(1, Number(value) || 3));
const boundedReminders = (value) => Math.min(5, Math.max(0, Number(value) || 2));

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY);

const studentLabel = (student) => (
    `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student'
);

/**
 * Bounded, idempotent reminder and escalation sweep. Every send re-checks the
 * current settings, the case, the respondent and the survey state.
 */
export const runSupportReminderJob = async ({ now = new Date() } = {}) => {
    const schools = await SupportSettings.find({ enabled: true })
        .setOptions({ skipTenantFilter: true })
        .select('school reminderDays reminderCount notifications')
        .limit(MAX_SCHOOLS_PER_RUN)
        .lean();

    const summary = { schools: schools.length, processed: 0, sent: 0, failed: 0, escalated: 0, skipped: 0 };

    for (const settings of schools) {
        const schoolId = settings.school;
        const intervalDays = boundedDays(settings.reminderDays);
        const maxReminders = boundedReminders(settings.reminderCount);
        const remindersOn = settings.notifications?.reminder !== false;
        const escalationOn = settings.notifications?.reminderEscalation !== false;
        if (!remindersOn && !escalationOn) continue;

        const surveys = await SupportSurvey.find({
            school: schoolId,
            status: { $in: ['sent', 'opened'] },
            case: { $ne: null },
            sentAt: { $ne: null },
        })
            .populate('student', 'firstName lastName')
            .populate('subject', 'name')
            .populate('review', 'month academicYear')
            .populate({
                path: 'respondent',
                select: 'kind name email active deliveryMethod teacher',
                populate: { path: 'teacher', select: 'firstName lastName email' },
            })
            .limit(MAX_SURVEYS_PER_SCHOOL);

        for (const survey of surveys) {
            const base = survey.lastReminderAt || survey.sentAt;
            if (!base || addDays(base, intervalDays) > now) continue;
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
                if (!survey.escalatedAt && await escalateOnce({ survey, caseDoc, now, reason: 'paper' })) {
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
                });
                if (result?.status === 'sent') {
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

            if (escalationOn && !survey.escalatedAt) {
                const escalated = await escalateOnce({ survey, caseDoc, now, reason: 'unanswered' });
                if (escalated) summary.escalated += 1;
            }
        }
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
