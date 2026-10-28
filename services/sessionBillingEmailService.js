import mongoose from 'mongoose';
import School from '../models/School.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import ParentSetting from '../models/ParentSetting.js';
import SessionBillingEmailDelivery from '../models/SessionBillingEmailDelivery.js';
import { getStudentStatement, resolveBillingDateRange } from './sessionBillingService.js';
import { getBillingOverview } from './sessionBillingReportService.js';
import {
    SESSION_BILLING_EMAIL_LANGUAGES,
    buildSessionBillingStatementEmail,
    filterStatementRecipients,
    getStatementEmailAttempt,
    normalizeSessionBillingEmailLanguage
} from './sessionBillingStatementEmail.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import logger from '../utils/logger.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const isoDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Parent accounts can switch school email off altogether; that switch is
 * honoured here rather than guessed from the address alone.
 */
const loadOptedOutEmails = async (schoolId, emails) => {
    const list = [...new Set((emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return [];
    const users = await User.find({ school: schoolId, role: 'parent', email: { $in: list } })
        .select('_id email')
        .lean();
    if (!users.length) return [];
    const disabled = await ParentSetting.find({
        school: schoolId,
        user: { $in: users.map((user) => user._id) },
        'notifications.email': false
    }).select('user').lean();
    const disabledIds = new Set(disabled.map((row) => String(row.user)));
    return users
        .filter((user) => disabledIds.has(String(user._id)))
        .map((user) => String(user.email).toLowerCase());
};

const periodKeyFor = (range) => `${isoDay(range.start)}:${isoDay(range.end)}`;

const loadStatementEmailContext = async (schoolId, studentId, { language, from, to } = {}) => {
    if (!mongoose.isValidObjectId(String(studentId || ''))) throw notFound('Student not found.');
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName studentEmail email parentInfo user')
        .populate('user', 'email');
    if (!student) throw notFound('Student not found.');

    const range = resolveBillingDateRange({ from, to });
    const [statement, school] = await Promise.all([
        getStudentStatement(schoolId, student._id),
        School.findById(schoolId).select('name branding').lean()
    ]);

    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const contacts = student.getAllContactEmailEntries();
    const optedOut = await loadOptedOutEmails(schoolId, contacts.map((contact) => contact.email));
    const recipients = filterStatementRecipients(contacts, optedOut);
    const chosen = normalizeSessionBillingEmailLanguage(language);
    const period = { from: range.start, to: range.end };
    const email = buildSessionBillingStatementEmail({
        studentName,
        statement,
        period,
        language: chosen,
        school
    });

    return {
        student,
        studentName,
        statement,
        school,
        recipients,
        language: chosen,
        period,
        periodKey: periodKeyFor(range),
        email
    };
};

export const getStatementEmailPreview = async (schoolId, studentId, query = {}) => {
    const context = await loadStatementEmailContext(schoolId, studentId, query);
    return {
        language: context.language,
        subject: context.email.subject,
        text: context.email.text,
        html: context.email.html,
        recipients: context.recipients,
        period: { from: context.period.from, to: context.period.to },
        message: context.recipients.length
            ? ''
            : 'No parent or student email address is on file for this student, or every contact has turned school email off.'
    };
};

export const sendStatementEmail = async (schoolId, studentId, payload = {}, user) => {
    const requested = payload.recipientEmails;
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > 10) {
        throw badRequest('Select between 1 and 10 parent or student email addresses.');
    }
    if (typeof payload.resend !== 'undefined' && typeof payload.resend !== 'boolean') {
        throw badRequest('resend must be true or false.');
    }
    if (typeof payload.language !== 'undefined'
        && !SESSION_BILLING_EMAIL_LANGUAGES.includes(String(payload.language).trim().toLowerCase())) {
        throw badRequest('language must be en, ar or both.');
    }

    const context = await loadStatementEmailContext(schoolId, studentId, {
        language: payload.language,
        from: payload.from,
        to: payload.to
    });
    const recipientsByEmail = new Map(context.recipients.map((recipient) => [recipient.email, recipient]));
    const emails = [...new Set(requested.map((email) => String(email || '').trim().toLowerCase()))];
    if (emails.length !== requested.length || emails.some((email) => !recipientsByEmail.has(email))) {
        throw badRequest('Every selected address must be a current parent or student contact who has not turned school email off.');
    }

    const results = [];
    for (const recipientEmail of emails) {
        const recipient = recipientsByEmail.get(recipientEmail);
        const previous = await SessionBillingEmailDelivery.findOne({
            school: schoolId,
            student: context.student._id,
            recipientEmail,
            periodKey: context.periodKey,
            purpose: 'statement'
        }).sort({ attempt: -1 }).lean();

        const decision = getStatementEmailAttempt(previous, { resend: payload.resend === true });
        if (decision.blocked) {
            results.push({
                email: recipientEmail,
                status: decision.reason,
                message: decision.reason === 'duplicate_blocked'
                    ? 'This statement was already emailed for this period. Confirm resend to send another copy.'
                    : 'A send attempt is already in progress.'
            });
            continue;
        }

        if (previous?.status === 'sending') {
            await SessionBillingEmailDelivery.updateOne({ _id: previous._id, status: 'sending' }, {
                $set: { status: 'failed', error: 'Previous send attempt timed out.' }
            });
        }

        let delivery;
        try {
            delivery = await SessionBillingEmailDelivery.create({
                school: schoolId,
                student: context.student._id,
                recipientEmail,
                recipientType: recipient.type,
                sentBy: user._id,
                language: context.language,
                purpose: 'statement',
                periodKey: context.periodKey,
                periodFrom: context.period.from,
                periodTo: context.period.to,
                attempt: decision.attempt,
                status: 'sending'
            });
        } catch (error) {
            if (error?.code === 11000) {
                results.push({ email: recipientEmail, status: 'sending', message: 'A send attempt is already in progress.' });
                continue;
            }
            throw error;
        }

        let transport;
        try {
            transport = await sendTransactionalEmail({
                to: recipientEmail,
                subject: context.email.subject,
                text: context.email.text,
                html: context.email.html,
                schoolId,
                preferredUserId: user._id
            });
        } catch (error) {
            const reason = String(error?.message || error || 'Email delivery failed').slice(0, 500);
            await SessionBillingEmailDelivery.updateOne({ _id: delivery._id }, {
                $set: { status: 'failed', error: reason }
            });
            logger.error('Session billing statement email failed', {
                studentId: String(context.student._id),
                deliveryId: String(delivery._id),
                error: reason
            });
            results.push({
                email: recipientEmail,
                status: 'failed',
                message: 'Email delivery failed. Check the sender configuration and retry.'
            });
            continue;
        }

        await SessionBillingEmailDelivery.updateOne({ _id: delivery._id }, {
            $set: {
                status: 'sent',
                messageId: transport?.messageId || '',
                deliveredAt: new Date(),
                error: ''
            }
        });
        logger.info('Session billing statement email sent', {
            studentId: String(context.student._id),
            recipientType: recipient.type,
            language: context.language,
            attempt: decision.attempt
        });
        results.push({ email: recipientEmail, status: 'sent' });
    }

    return results;
};

export const getStatementEmailRoster = async (schoolId, query = {}) => {
    const overview = await getBillingOverview(schoolId, query);
    const range = { start: overview.range.from, end: overview.range.to };
    const periodKey = periodKeyFor(range);
    const studentIds = overview.students.map((student) => student.studentId);

    const docs = studentIds.length
        ? await Student.find({ school: schoolId, _id: { $in: studentIds } })
            .select('firstName lastName studentEmail email parentInfo user')
            .populate('user', 'email')
        : [];

    const allContacts = docs.flatMap((student) => student.getAllContactEmailEntries());
    const optedOut = await loadOptedOutEmails(schoolId, allContacts.map((contact) => contact.email));
    const contactsByStudent = new Map(docs.map((student) => [
        String(student._id),
        filterStatementRecipients(student.getAllContactEmailEntries(), optedOut)
    ]));

    const sentRows = await SessionBillingEmailDelivery.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                periodKey,
                purpose: 'statement',
                status: 'sent'
            }
        },
        { $group: { _id: '$student', lastSentAt: { $max: '$deliveredAt' } } }
    ]);
    const lastSentByStudent = new Map(sentRows.map((row) => [String(row._id), row.lastSentAt]));

    return {
        currency: overview.settings?.currency || 'USD',
        period: { from: overview.range.from, to: overview.range.to },
        students: overview.students.map((student) => ({
            studentId: student.studentId,
            name: student.name,
            balance: student.balance,
            rangeCharged: student.rangeCharged,
            rangePaid: student.rangePaid,
            rangeSessions: student.rangeSessions,
            recipients: contactsByStudent.get(student.studentId) || [],
            lastSentAt: lastSentByStudent.get(student.studentId) || null
        }))
    };
};
