import mongoose from 'mongoose';
import School from '../models/School.js';
import Student from '../models/Student.js';
import SessionBillingEntry from '../models/SessionBillingEntry.js';
import SessionBillingEmailDelivery from '../models/SessionBillingEmailDelivery.js';
import {
    getBillingSettings,
    getStudentContacts,
    getStudentStatement
} from './sessionBillingService.js';
import { getReminderCandidates } from './sessionBillingReportService.js';
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

const normalizeRequestedEmails = (requested, allowed) => {
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > 10) {
        throw badRequest('Select between 1 and 10 parent or student email addresses.');
    }
    const allowedByEmail = new Map(allowed.map((recipient) => [recipient.email, recipient]));
    const emails = [...new Set(requested.map((email) => String(email || '').trim().toLowerCase()))];
    if (emails.length !== requested.length || emails.some((email) => !allowedByEmail.has(email))) {
        throw badRequest('Every selected address must be a current parent or student contact who has not turned school email off.');
    }
    return emails.map((email) => allowedByEmail.get(email));
};

const sendRecipient = async ({
    schoolId,
    studentId,
    recipient,
    email,
    purpose,
    periodKey,
    periodFrom = null,
    periodTo = null,
    language,
    user,
    resend = false
}) => {
    const previous = await SessionBillingEmailDelivery.findOne({
        school: schoolId,
        student: studentId,
        recipientEmail: recipient.email,
        periodKey,
        purpose
    }).sort({ attempt: -1 }).lean();

    const decision = getStatementEmailAttempt(previous, { resend });
    if (decision.blocked) {
        return {
            email: recipient.email,
            status: decision.reason,
            message: decision.reason === 'duplicate_blocked'
                ? 'This message was already sent. Confirm resend to send another copy.'
                : 'A send attempt is already in progress.'
        };
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
            student: studentId,
            recipientEmail: recipient.email,
            recipientType: recipient.type,
            sentBy: user._id,
            language,
            purpose,
            periodKey,
            periodFrom,
            periodTo,
            attempt: decision.attempt,
            status: 'sending'
        });
    } catch (error) {
        if (error?.code === 11000) {
            return { email: recipient.email, status: 'sending', message: 'A send attempt is already in progress.' };
        }
        throw error;
    }

    try {
        const transport = await sendTransactionalEmail({
            to: recipient.email,
            subject: email.subject,
            text: email.text,
            html: email.html,
            schoolId,
            preferredUserId: user._id
        });
        await SessionBillingEmailDelivery.updateOne({ _id: delivery._id }, {
            $set: {
                status: 'sent',
                messageId: transport?.messageId || '',
                deliveredAt: new Date(),
                error: ''
            }
        });
        return { email: recipient.email, status: 'sent' };
    } catch (error) {
        const reason = String(error?.message || error || 'Email delivery failed').slice(0, 500);
        await SessionBillingEmailDelivery.updateOne({ _id: delivery._id }, {
            $set: { status: 'failed', error: reason }
        });
        logger.error(`Session billing ${purpose} email failed`, {
            studentId: String(studentId),
            deliveryId: String(delivery._id),
            error: reason
        });
        return {
            email: recipient.email,
            status: 'failed',
            message: 'Email delivery failed. Check the sender configuration and retry.'
        };
    }
};

const loadStudent = async (schoolId, studentId) => {
    if (!mongoose.isValidObjectId(String(studentId || ''))) throw notFound('Student not found.');
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName studentEmail email parentInfo user')
        .populate('user', 'email');
    if (!student) throw notFound('Student not found.');
    return student;
};

const loadAllowedRecipients = async (student, schoolId) => {
    const contacts = await getStudentContacts(student, schoolId);
    return filterStatementRecipients(
        contacts,
        contacts.filter((contact) => contact.optedOut).map((contact) => contact.email)
    );
};

const loadSchool = (schoolId) => School.findById(schoolId).select('name branding').lean();

const statementFor = async (schoolId, studentId) => getStudentStatement(schoolId, studentId);

export const getReceiptPreview = async (schoolId, entryId) => {
    if (!mongoose.isValidObjectId(String(entryId || ''))) throw notFound('Payment not found.');
    const entry = await SessionBillingEntry.findOne({
        _id: entryId,
        school: schoolId,
        kind: 'payment',
        status: 'active'
    }).lean();
    if (!entry) throw notFound('Payment not found.');

    const [student, statement, school, settings] = await Promise.all([
        loadStudent(schoolId, entry.student),
        statementFor(schoolId, entry.student),
        loadSchool(schoolId),
        getBillingSettings(schoolId)
    ]);
    const recipients = await loadAllowedRecipients(student, schoolId);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const email = buildSessionBillingStatementEmail({
        studentName,
        statement,
        language: settings.statement.defaultLanguage || 'en',
        school,
        purpose: 'receipt',
        receipt: entry,
        subjectOverride: settings.statement?.emailSubject || ''
    });

    return {
        entry: {
            id: String(entry._id),
            amount: entry.amount,
            method: entry.method,
            reference: entry.reference || '',
            occurredAt: entry.occurredAt,
            currency: entry.currency
        },
        language: normalizeSessionBillingEmailLanguage(settings.statement.defaultLanguage),
        subject: email.subject,
        text: email.text,
        html: email.html,
        recipients,
        message: recipients.length
            ? ''
            : 'No parent or student email address is on file for this student, or every contact has turned school email off.'
    };
};

export const sendReceiptEmail = async (schoolId, entryId, payload = {}, user) => {
    const preview = await getReceiptPreview(schoolId, entryId);
    const recipients = normalizeRequestedEmails(payload.recipientEmails, preview.recipients);
    const language = payload.language === undefined
        ? preview.language
        : normalizeSessionBillingEmailLanguage(payload.language);
    if (!SESSION_BILLING_EMAIL_LANGUAGES.includes(language)) {
        throw badRequest('language must be en, ar or both.');
    }

    const entry = await SessionBillingEntry.findOne({
        _id: entryId,
        school: schoolId,
        kind: 'payment',
        status: 'active'
    }).lean();
    if (!entry) throw notFound('Payment not found.');

    const student = await loadStudent(schoolId, entry.student);
    const [statement, school, settings] = await Promise.all([
        statementFor(schoolId, entry.student),
        loadSchool(schoolId),
        getBillingSettings(schoolId)
    ]);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const email = buildSessionBillingStatementEmail({
        studentName,
        statement,
        language,
        school,
        purpose: 'receipt',
        receipt: entry,
        subjectOverride: payload.subject || settings.statement?.emailSubject || ''
    });

    const results = [];
    for (const recipient of recipients) {
        results.push(await sendRecipient({
            schoolId,
            studentId: student._id,
            recipient,
            email,
            purpose: 'receipt',
            periodKey: `receipt:${String(entry._id)}`,
            language,
            user,
            resend: payload.resend === true
        }));
    }
    return results;
};

export const getReminderPreview = async (schoolId, studentId, query = {}) => {
    const student = await loadStudent(schoolId, studentId);
    const [statement, school, settings] = await Promise.all([
        statementFor(schoolId, student._id),
        loadSchool(schoolId),
        getBillingSettings(schoolId)
    ]);
    if (!(statement.totals?.balance < 0)) {
        throw badRequest('This lesson account does not owe anything, so there is nothing to remind the family about.');
    }
    const recipients = await loadAllowedRecipients(student, schoolId);
    const language = normalizeSessionBillingEmailLanguage(query.language || settings.statement.defaultLanguage);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const email = buildSessionBillingStatementEmail({
        studentName,
        statement,
        language,
        school,
        purpose: 'reminder',
        opening: query.opening || '',
        paymentInstructions: settings.statement?.paymentInstructions || ''
    });

    return {
        student: { id: String(student._id), name: studentName },
        balance: statement.totals.balance,
        owed: Math.abs(statement.totals.balance),
        currency: statement.currency,
        language,
        subject: email.subject,
        text: email.text,
        html: email.html,
        recipients,
        paymentInstructions: settings.statement?.paymentInstructions || '',
        message: recipients.length
            ? ''
            : 'No parent or student email address is on file for this student, or every contact has turned school email off.'
    };
};

export const sendReminderEmail = async (schoolId, studentId, payload = {}, user) => {
    const preview = await getReminderPreview(schoolId, studentId, payload);
    const recipients = normalizeRequestedEmails(payload.recipientEmails, preview.recipients);
    const language = normalizeSessionBillingEmailLanguage(payload.language || preview.language);
    const student = await loadStudent(schoolId, studentId);
    const [statement, school, settings] = await Promise.all([
        statementFor(schoolId, student._id),
        loadSchool(schoolId),
        getBillingSettings(schoolId)
    ]);
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const email = buildSessionBillingStatementEmail({
        studentName,
        statement,
        language,
        school,
        purpose: 'reminder',
        opening: payload.opening || '',
        paymentInstructions: settings.statement?.paymentInstructions || ''
    });

    const results = [];
    for (const recipient of recipients) {
        results.push(await sendRecipient({
            schoolId,
            studentId: student._id,
            recipient,
            email,
            purpose: 'reminder',
            periodKey: `reminder:${String(student._id)}:${isoDay(new Date())}`,
            language,
            user,
            resend: payload.resend === true
        }));
    }
    return results;
};

export const getMessageCenter = async (schoolId, query = {}) => {
    const [settings, candidates, deliveries] = await Promise.all([
        getBillingSettings(schoolId),
        getReminderCandidates(schoolId, query),
        SessionBillingEmailDelivery.find({ school: schoolId })
            .sort({ createdAt: -1 })
            .limit(25)
            .select('student recipientEmail recipientType language purpose periodKey status error deliveredAt createdAt sentBy')
            .lean()
    ]);
    const studentIds = [...new Set(deliveries.map((delivery) => String(delivery.student)))];
    const students = studentIds.length
        ? await Student.find({ school: schoolId, _id: { $in: studentIds } })
            .select('firstName lastName')
            .lean()
        : [];
    const nameById = new Map(students.map((student) => [
        String(student._id),
        `${student.firstName || ''} ${student.lastName || ''}`.trim()
    ]));
    const statusCounts = deliveries.reduce((acc, delivery) => {
        acc[delivery.status] = (acc[delivery.status] || 0) + 1;
        return acc;
    }, {});

    return {
        currency: settings.currency,
        reminderSettings: settings.reminder,
        statementSettings: settings.statement,
        candidates: candidates.candidates,
        summary: candidates.summary,
        recent: deliveries.map((delivery) => ({
            id: String(delivery._id),
            studentId: String(delivery.student),
            student: nameById.get(String(delivery.student)) || '',
            recipientEmail: delivery.recipientEmail,
            recipientType: delivery.recipientType,
            language: delivery.language,
            purpose: delivery.purpose,
            periodKey: delivery.periodKey,
            status: delivery.status,
            error: delivery.error,
            sentAt: delivery.deliveredAt || delivery.createdAt
        })),
        deliverySummary: {
            sent: statusCounts.sent || 0,
            failed: statusCounts.failed || 0,
            sending: statusCounts.sending || 0
        }
    };
};
