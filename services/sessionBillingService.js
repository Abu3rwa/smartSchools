import mongoose from 'mongoose';
import LiveSession from '../models/LiveSession.js';
import LiveSessionEvent from '../models/LiveSessionEvent.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import ParentSetting from '../models/ParentSetting.js';
import SessionBillingEntry from '../models/SessionBillingEntry.js';
import SessionBillingSettings from '../models/SessionBillingSettings.js';
import SessionBillingAudit from '../models/SessionBillingAudit.js';
import SessionBillingIssue from '../models/SessionBillingIssue.js';
import SessionBillingNote from '../models/SessionBillingNote.js';
import SessionBillingPackage from '../models/SessionBillingPackage.js';
import SessionBillingPackagePurchase from '../models/SessionBillingPackagePurchase.js';
import SessionBillingEmailDelivery from '../models/SessionBillingEmailDelivery.js';
import { resolveSchoolFeatureContext } from '../middleware/featureGate.js';
import { staffClassQuery, staffClassesListQuery } from '../helpers/liveLessonAccess.js';
import {
    amountFromMinutes,
    balanceDelta,
    billableMsFromSegments,
    buildLessonCharge,
    estimateMinutesRemaining,
    getPauseWindows,
    getPresenceSegments,
    getSessionWindow,
    minutesFromMs,
    packageHourlyRate,
    resolveHourlyRate,
    roundBillableMinutes,
    summarizeEntries
} from './sessionBillingMath.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ROUNDING_CHOICES = [1, 5, 10, 15];
const PAYMENT_METHODS = ['cash', 'bank-transfer', 'cheque', 'online', 'other'];
const LESSON_SOURCES = ['zoom', 'in-person', 'other', 'manual'];
const STATEMENT_LANGUAGES = ['en', 'ar', 'both'];
const DAY_MS = 24 * 60 * 60 * 1000;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });

export const DEFAULT_BILLING_SETTINGS = {
    currency: 'USD',
    defaultHourlyRate: 0,
    roundingMinutes: 5,
    minimumBillableMinutes: 15,
    noShowMinutes: 0,
    lateCancellationMinutes: 0,
    graceMinutes: 0,
    billingBasis: 'individual',
    excludePauseTime: true,
    classRates: [],
    studentRates: [],
    enabledPaymentMethods: PAYMENT_METHODS,
    packagesEnabled: true,
    statement: {
        defaultLanguage: 'en',
        emailSubject: '',
        paymentInstructions: '',
        includeContact: true,
        ccAdminOnFailure: true
    },
    reminder: {
        enabled: false,
        afterDays: 7,
        quietDays: 7,
        minimumBalance: 1,
        lowCreditMinutes: 60,
        packageExpiryDays: 14
    }
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toNumber = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const toObjectId = (value) => (
    mongoose.Types.ObjectId.isValid(String(value || '')) ? new mongoose.Types.ObjectId(String(value)) : null
);

const existingCurrency = (settings) => String(settings?.currency || 'USD').toUpperCase();

const userName = (user) => {
    if (!user) return '';
    if (user.name) return String(user.name);
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
};

const studentName = (student) => `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';

const isoDay = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const startOfDay = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

const parseLocalDate = (value, endOfDay = false) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const [year, month, day] = value.trim().split('-').map(Number);
        return endOfDay
            ? new Date(year, month - 1, day, 23, 59, 59, 999)
            : new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return endOfDay
        ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 23, 59, 59, 999)
        : parsed;
};

const parseOptionalDate = (value, endOfDay = false) => {
    if (value === null || value === undefined || value === '') return null;
    return parseLocalDate(value, endOfDay);
};

const parseRange = ({ from, to } = {}) => {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = from ? parseLocalDate(from) : defaultFrom;
    const end = to ? parseLocalDate(to, true) : now;
    if (!start || !end) throw badRequest('The report dates are not valid.');
    if (end < start) throw badRequest('The end date must be after the start date.');
    if ((end - start) / DAY_MS > 400) {
        throw badRequest('Choose a date range of one year or less.');
    }
    return { start, end };
};

export const resolveBillingDateRange = parseRange;

const periodKeyFor = (range) => `${isoDay(range.start)}:${isoDay(range.end)}`;

const methodValid = (method, settings) => {
    const enabled = settings?.enabledPaymentMethods?.length
        ? settings.enabledPaymentMethods
        : PAYMENT_METHODS;
    return enabled.includes(method);
};

export const paymentMethodChoices = (settings) => {
    const enabled = settings?.enabledPaymentMethods?.length
        ? settings.enabledPaymentMethods
        : PAYMENT_METHODS;
    return PAYMENT_METHODS.filter((method) => enabled.includes(method));
};

export const isSessionBillingEnabled = async (schoolId) => {
    const context = await resolveSchoolFeatureContext(schoolId);
    return Boolean(context?.features?.liveSessionBilling);
};

const normalizeRateRows = (rows) => (rows || []).map((rate) => ({
    classId: rate.classId ? String(rate.classId) : undefined,
    studentId: rate.studentId ? String(rate.studentId) : undefined,
    hourlyRate: Number(rate.hourlyRate) || 0,
    effectiveFrom: rate.effectiveFrom || null,
    effectiveTo: rate.effectiveTo || null,
    reason: rate.reason || ''
}));

export const getBillingSettings = async (schoolId) => {
    const doc = await SessionBillingSettings.findOne({ school: schoolId }).lean();
    if (!doc) {
        return {
            ...DEFAULT_BILLING_SETTINGS,
            classRates: [],
            studentRates: [],
            statement: { ...DEFAULT_BILLING_SETTINGS.statement },
            reminder: { ...DEFAULT_BILLING_SETTINGS.reminder }
        };
    }
    return {
        ...DEFAULT_BILLING_SETTINGS,
        ...doc,
        enabledPaymentMethods: doc.enabledPaymentMethods?.length
            ? doc.enabledPaymentMethods
            : DEFAULT_BILLING_SETTINGS.enabledPaymentMethods,
        classRates: normalizeRateRows(doc.classRates),
        studentRates: normalizeRateRows(doc.studentRates),
        statement: { ...DEFAULT_BILLING_SETTINGS.statement, ...(doc.statement || {}) },
        reminder: { ...DEFAULT_BILLING_SETTINGS.reminder, ...(doc.reminder || {}) }
    };
};

const normalizeRateWindow = (item, label) => {
    const from = parseOptionalDate(item?.effectiveFrom);
    const to = parseOptionalDate(item?.effectiveTo, true);
    if (item?.effectiveFrom && !from) throw badRequest(`The ${label} start date is not valid.`);
    if (item?.effectiveTo && !to) throw badRequest(`The ${label} end date is not valid.`);
    if (from && to && to < from) throw badRequest(`The ${label} end date must be after its start date.`);
    return { from, to };
};

const assertNoOverlap = (rows, keyOf, label) => {
    const byKey = new Map();
    for (const row of rows) {
        const key = keyOf(row);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(row);
    }
    for (const list of byKey.values()) {
        const sorted = list
            .slice()
            .sort((a, b) => (a.from?.getTime() ?? -Infinity) - (b.from?.getTime() ?? -Infinity));
        let previous = null;
        for (const row of sorted) {
            const from = row.from?.getTime() ?? -Infinity;
            const to = row.to?.getTime() ?? Infinity;
            if (previous && from <= previous.to) {
                throw badRequest(`${label} rates cannot overlap. Adjust the effective dates.`);
            }
            previous = { to };
        }
    }
};

const normalizeClassRates = (list) => {
    if (!Array.isArray(list)) return [];
    const normalized = [];
    for (const item of list) {
        const classId = toObjectId(item?.classId);
        if (!classId) throw badRequest('Each class rate needs a valid class.');
        const rate = toNumber(item?.hourlyRate, NaN);
        if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
            throw badRequest('Hourly rates must be between 0 and 10,000.');
        }
        const { from, to } = normalizeRateWindow(item, 'class rate');
        normalized.push({
            classId,
            hourlyRate: round2(rate),
            effectiveFrom: from,
            effectiveTo: to,
            reason: String(item?.reason || '').trim().slice(0, 200)
        });
    }
    assertNoOverlap(
        normalized.map((row) => ({ ...row, from: row.effectiveFrom, to: row.effectiveTo })),
        (row) => String(row.classId),
        'Class'
    );
    return normalized;
};

const normalizeStudentRates = (list) => {
    if (!Array.isArray(list)) return [];
    const normalized = [];
    for (const item of list) {
        const studentId = toObjectId(item?.studentId);
        if (!studentId) throw badRequest('Each student rate needs a valid student.');
        const rate = toNumber(item?.hourlyRate, NaN);
        if (!Number.isFinite(rate) || rate < 0 || rate > 10000) {
            throw badRequest('Hourly rates must be between 0 and 10,000.');
        }
        const { from, to } = normalizeRateWindow(item, 'student rate');
        normalized.push({
            studentId,
            hourlyRate: round2(rate),
            effectiveFrom: from,
            effectiveTo: to,
            reason: String(item?.reason || '').trim().slice(0, 200)
        });
    }
    assertNoOverlap(
        normalized.map((row) => ({ ...row, from: row.effectiveFrom, to: row.effectiveTo })),
        (row) => String(row.studentId),
        'Student'
    );
    return normalized;
};

const settingsChangeSummary = (before, after) => {
    const keys = [
        'currency',
        'defaultHourlyRate',
        'roundingMinutes',
        'minimumBillableMinutes',
        'noShowMinutes',
        'lateCancellationMinutes',
        'graceMinutes',
        'billingBasis',
        'excludePauseTime',
        'packagesEnabled'
    ];
    const changed = keys.filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
    if (JSON.stringify(before?.classRates || []) !== JSON.stringify(after?.classRates || [])) changed.push('classRates');
    if (JSON.stringify(before?.studentRates || []) !== JSON.stringify(after?.studentRates || [])) changed.push('studentRates');
    if (JSON.stringify(before?.statement || {}) !== JSON.stringify(after?.statement || {})) changed.push('statement');
    if (JSON.stringify(before?.reminder || {}) !== JSON.stringify(after?.reminder || {})) changed.push('reminder');
    return changed;
};

export const logBillingAudit = async ({
    school,
    actor,
    action,
    entityType = '',
    entityId = null,
    student = null,
    summary = '',
    meta = null
}) => {
    try {
        const actorId = actor?._id || actor || null;
        await SessionBillingAudit.create({
            school,
            actor: actorId && mongoose.Types.ObjectId.isValid(String(actorId)) ? actorId : undefined,
            actorName: userName(actor).slice(0, 160),
            action,
            entityType,
            entityId: entityId && mongoose.Types.ObjectId.isValid(String(entityId)) ? entityId : undefined,
            student: student && mongoose.Types.ObjectId.isValid(String(student)) ? student : undefined,
            summary: String(summary || '').slice(0, 400),
            meta
        });
    } catch {
        // Audit must never block the financial action it records.
    }
};

export const saveBillingSettings = async (schoolId, payload = {}, actor) => {
    const existingDoc = await SessionBillingSettings.findOne({ school: schoolId }).lean();
    const existing = existingDoc
        ? {
            ...DEFAULT_BILLING_SETTINGS,
            ...existingDoc,
            statement: { ...DEFAULT_BILLING_SETTINGS.statement, ...(existingDoc.statement || {}) },
            reminder: { ...DEFAULT_BILLING_SETTINGS.reminder, ...(existingDoc.reminder || {}) }
        }
        : { ...DEFAULT_BILLING_SETTINGS };

    const currency = String(payload.currency ?? existing.currency ?? 'USD').trim().toUpperCase();
    if (!CURRENCY_PATTERN.test(currency)) throw badRequest('Currency must be a three-letter code, like USD.');

    if (existingDoc && existing.currency !== currency) {
        const billedEntries = await SessionBillingEntry.exists({ school: schoolId });
        if (billedEntries) {
            throw badRequest('Currency cannot change after sessions have been billed. Void the entries first or start a new school year.');
        }
    }

    const roundingMinutes = toNumber(payload.roundingMinutes, existing.roundingMinutes);
    if (!ROUNDING_CHOICES.includes(roundingMinutes)) {
        throw badRequest('Rounding must be 1, 5, 10, or 15 minutes.');
    }

    const defaultHourlyRate = toNumber(payload.defaultHourlyRate, existing.defaultHourlyRate);
    if (defaultHourlyRate < 0 || defaultHourlyRate > 10000) {
        throw badRequest('The hourly rate must be between 0 and 10,000.');
    }

    const minimumBillableMinutes = toNumber(payload.minimumBillableMinutes, existing.minimumBillableMinutes);
    if (minimumBillableMinutes < 0 || minimumBillableMinutes > 600) {
        throw badRequest('The minimum billable time must be between 0 and 600 minutes.');
    }

    const noShowMinutes = toNumber(payload.noShowMinutes, existing.noShowMinutes);
    if (noShowMinutes < 0 || noShowMinutes > 600) {
        throw badRequest('The no-show charge must be between 0 and 600 minutes.');
    }

    const lateCancellationMinutes = toNumber(payload.lateCancellationMinutes, existing.lateCancellationMinutes);
    if (lateCancellationMinutes < 0 || lateCancellationMinutes > 600) {
        throw badRequest('The late-cancellation charge must be between 0 and 600 minutes.');
    }

    const graceMinutes = toNumber(payload.graceMinutes, existing.graceMinutes);
    if (graceMinutes < 0 || graceMinutes > 60) {
        throw badRequest('Grace time must be between 0 and 60 minutes.');
    }

    const billingBasis = String(payload.billingBasis ?? existing.billingBasis);
    if (!['individual', 'session'].includes(billingBasis)) {
        throw badRequest('Choose individual attendance or whole-session billing.');
    }

    const statementPayload = payload.statement && typeof payload.statement === 'object' ? payload.statement : {};
    const statement = {
        ...existing.statement,
        ...statementPayload
    };
    statement.defaultLanguage = String(statement.defaultLanguage || 'en').toLowerCase();
    if (!STATEMENT_LANGUAGES.includes(statement.defaultLanguage)) {
        throw badRequest('The statement language must be en, ar or both.');
    }
    statement.emailSubject = String(statement.emailSubject || '').trim().slice(0, 160);
    statement.paymentInstructions = String(statement.paymentInstructions || '').trim().slice(0, 800);
    statement.includeContact = statement.includeContact !== false;
    statement.ccAdminOnFailure = statement.ccAdminOnFailure !== false;

    const reminderPayload = payload.reminder && typeof payload.reminder === 'object' ? payload.reminder : {};
    const reminder = {
        ...existing.reminder,
        ...reminderPayload
    };
    reminder.enabled = reminder.enabled === true;
    reminder.afterDays = toNumber(reminder.afterDays, 7);
    reminder.quietDays = toNumber(reminder.quietDays, 7);
    reminder.minimumBalance = toNumber(reminder.minimumBalance, 1);
    reminder.lowCreditMinutes = toNumber(reminder.lowCreditMinutes, 60);
    reminder.packageExpiryDays = toNumber(reminder.packageExpiryDays, 14);
    if (reminder.afterDays < 1 || reminder.afterDays > 120
        || reminder.quietDays < 1 || reminder.quietDays > 120
        || reminder.packageExpiryDays < 1 || reminder.packageExpiryDays > 120) {
        throw badRequest('Reminder day settings must be between 1 and 120.');
    }
    if (reminder.minimumBalance < 0 || reminder.minimumBalance > 100000) {
        throw badRequest('The reminder minimum balance is not valid.');
    }
    if (reminder.lowCreditMinutes < 0 || reminder.lowCreditMinutes > 6000) {
        throw badRequest('The low-credit warning must be between 0 and 6,000 minutes.');
    }

    const requestedMethods = payload.enabledPaymentMethods === undefined
        ? existing.enabledPaymentMethods
        : payload.enabledPaymentMethods;
    const enabledPaymentMethods = [...new Set(
        (Array.isArray(requestedMethods) ? requestedMethods : [])
            .map((method) => String(method || '').trim())
            .filter((method) => PAYMENT_METHODS.includes(method))
    )];
    if (!enabledPaymentMethods.length) throw badRequest('Keep at least one payment method enabled.');

    const update = {
        school: schoolId,
        currency,
        defaultHourlyRate: round2(defaultHourlyRate),
        roundingMinutes,
        minimumBillableMinutes,
        noShowMinutes,
        lateCancellationMinutes,
        graceMinutes,
        billingBasis,
        excludePauseTime: payload.excludePauseTime === undefined
            ? existing.excludePauseTime !== false
            : payload.excludePauseTime !== false,
        packagesEnabled: payload.packagesEnabled === undefined
            ? existing.packagesEnabled !== false
            : payload.packagesEnabled !== false,
        classRates: payload.classRates === undefined
            ? (existingDoc?.classRates || [])
            : normalizeClassRates(payload.classRates),
        studentRates: payload.studentRates === undefined
            ? (existingDoc?.studentRates || [])
            : normalizeStudentRates(payload.studentRates),
        enabledPaymentMethods,
        statement,
        reminder,
        updatedBy: actor?._id || actor
    };

    if (update.classRates.length) {
        const classIds = update.classRates.map((rate) => rate.classId);
        const found = await Class.countDocuments({ _id: { $in: classIds }, school: schoolId });
        if (found !== new Set(classIds.map(String)).size) {
            throw badRequest('One of the classes does not belong to this school.');
        }
    }
    if (update.studentRates.length) {
        const studentIds = update.studentRates.map((rate) => rate.studentId);
        const found = await Student.countDocuments({ _id: { $in: studentIds }, school: schoolId });
        if (found !== new Set(studentIds.map(String)).size) {
            throw badRequest('One of the students does not belong to this school.');
        }
    }

    const saved = await SessionBillingSettings.findOneAndUpdate(
        { school: schoolId },
        { $set: update },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    const changed = settingsChangeSummary(existing, update);
    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'settings.updated',
        entityType: 'settings',
        entityId: saved?._id,
        summary: changed.length ? `Updated ${changed.join(', ')}` : 'Saved billing settings',
        meta: { changed }
    });

    return getBillingSettings(schoolId);
};

/* ------------------------------------------------------------------ */
/* Issues                                                              */
/* ------------------------------------------------------------------ */

const ISSUE_LABELS = {
    'missing-rate': 'Missing hourly rate',
    'missing-student': 'Roster student has no student record',
    'no-attendance': 'No attendance and no no-show rule',
    'zero-amount': 'Lesson produced a zero charge',
    'session-incomplete': 'Session time is incomplete',
    'duplicate-manual': 'Possible duplicate lesson',
    'review-hold': 'Held for review',
    'statement-failed': 'Statement delivery failed'
};

export const issueLabel = (reason) => ISSUE_LABELS[reason] || 'Billing issue';

const openIssue = async ({ school, session, student, entry, classId, reason, detail, minutes, studentName: name, sessionTitle, occurredAt }) => {
    const filter = {
        school,
        reason,
        ...(session ? { session } : {}),
        ...(student ? { student } : { studentName: name || '' })
    };
    try {
        await SessionBillingIssue.updateOne(
            filter,
            {
                $setOnInsert: {
                    school,
                    session,
                    student,
                    entry,
                    classId,
                    reason,
                    detail: String(detail || '').slice(0, 500),
                    minutes: Number(minutes) || 0,
                    studentName: String(name || '').slice(0, 160),
                    sessionTitle: String(sessionTitle || '').slice(0, 300),
                    occurredAt: occurredAt || new Date(),
                    status: 'open'
                }
            },
            { upsert: true }
        );
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }
};

export const reportIssue = async (schoolId, payload = {}) => {
    const reason = String(payload.reason || 'review-hold');
    if (!ISSUE_LABELS[reason]) throw badRequest('Choose a valid issue reason.');
    const student = toObjectId(payload.studentId);
    const session = toObjectId(payload.sessionId);
    await openIssue({
        school: schoolId,
        session,
        student,
        classId: toObjectId(payload.classId),
        reason,
        detail: payload.detail,
        minutes: payload.minutes,
        studentName: payload.studentName,
        sessionTitle: payload.sessionTitle,
        occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date()
    });
    return { reported: true };
};

export const listIssues = async (schoolId, query = {}) => {
    const range = parseRange(query);
    const status = ['open', 'resolved', 'ignored', 'all'].includes(String(query.status))
        ? String(query.status)
        : 'open';
    const filter = {
        school: schoolId,
        occurredAt: { $gte: range.start, $lte: range.end }
    };
    if (status !== 'all') filter.status = status;
    if (query.reason) filter.reason = String(query.reason);
    if (query.classId && mongoose.Types.ObjectId.isValid(String(query.classId))) {
        filter.classId = query.classId;
    }
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        filter.student = query.studentId;
    }

    const docs = await SessionBillingIssue.find(filter)
        .sort({ occurredAt: -1 })
        .limit(500)
        .lean();

    return {
        range: { from: range.start, to: range.end },
        issues: docs.map((issue) => ({
            id: String(issue._id),
            reason: issue.reason,
            label: issueLabel(issue.reason),
            detail: issue.detail || '',
            status: issue.status,
            occurredAt: issue.occurredAt,
            minutes: issue.minutes || 0,
            studentId: issue.student ? String(issue.student) : '',
            studentName: issue.studentName || '',
            classId: issue.classId ? String(issue.classId) : '',
            sessionId: issue.session ? String(issue.session) : '',
            sessionTitle: issue.sessionTitle || '',
            resolutionNote: issue.resolutionNote || ''
        }))
    };
};

export const resolveIssue = async (schoolId, issueId, { action = 'resolve', note = '' } = {}, actor) => {
    const issue = await SessionBillingIssue.findOne({ _id: issueId, school: schoolId });
    if (!issue) throw notFound('This billing issue no longer exists.');
    if (issue.status !== 'open') throw badRequest('This issue is already closed.');
    const nextStatus = action === 'ignore' ? 'ignored' : 'resolved';
    issue.status = nextStatus;
    issue.resolvedBy = actor?._id || actor;
    issue.resolvedAt = new Date();
    issue.resolutionNote = String(note || '').trim().slice(0, 300);
    await issue.save();
    await logBillingAudit({
        school: schoolId,
        actor,
        action: `issue.${nextStatus}`,
        entityType: 'issue',
        entityId: issue._id,
        student: issue.student,
        summary: `${issueLabel(issue.reason)} ${nextStatus}`,
        meta: { reason: issue.reason, note: issue.resolutionNote }
    });
    return { id: String(issue._id), status: issue.status };
};

/* ------------------------------------------------------------------ */
/* Packages                                                            */
/* ------------------------------------------------------------------ */

const packagePayload = (payload, settings) => {
    const name = String(payload.name || '').trim();
    if (!name) throw badRequest('Give this package a name.');
    const minutes = toNumber(payload.minutes, NaN);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 100000) {
        throw badRequest('Included minutes must be between 1 and 100,000.');
    }
    const price = toNumber(payload.price, NaN);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
        throw badRequest('The package price is not valid.');
    }
    const expiryDays = toNumber(payload.expiryDays, 0);
    if (expiryDays < 0 || expiryDays > 3650) throw badRequest('Choose an expiry between 0 and 3,650 days.');
    const eligibleClasses = Array.isArray(payload.eligibleClasses)
        ? [...new Set(payload.eligibleClasses.map((id) => String(id)).filter((id) => mongoose.Types.ObjectId.isValid(id)))]
        : [];
    return {
        name: name.slice(0, 120),
        description: String(payload.description || '').trim().slice(0, 500),
        minutes: Math.round(minutes),
        price: round2(price),
        currency: existingCurrency(settings),
        expiryDays: Math.round(expiryDays),
        eligibleClasses,
        carryOver: payload.carryOver === true,
        refundable: payload.refundable === true,
        active: payload.active !== false
    };
};

export const listPackages = async (schoolId, settings) => {
    const resolved = settings || await getBillingSettings(schoolId);
    const [packages, stats] = await Promise.all([
        SessionBillingPackage.find({ school: schoolId }).sort({ active: -1, createdAt: -1 }).lean(),
        SessionBillingPackagePurchase.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)) } },
            {
                $group: {
                    _id: '$package',
                    sold: { $sum: 1 },
                    minutesSold: { $sum: '$minutesIncluded' },
                    minutesRemaining: { $sum: '$minutesRemaining' },
                    valueSold: { $sum: '$price' },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            }
        ])
    ]);
    const statById = new Map(stats.map((row) => [String(row._id), row]));
    return {
        currency: existingCurrency(resolved),
        packagesEnabled: resolved.packagesEnabled !== false,
        packages: packages.map((pkg) => {
            const stat = statById.get(String(pkg._id)) || {};
            return {
                id: String(pkg._id),
                name: pkg.name,
                description: pkg.description || '',
                minutes: pkg.minutes,
                price: round2(pkg.price),
                currency: pkg.currency || existingCurrency(resolved),
                expiryDays: pkg.expiryDays || 0,
                eligibleClasses: (pkg.eligibleClasses || []).map(String),
                carryOver: pkg.carryOver === true,
                refundable: pkg.refundable === true,
                active: pkg.active !== false,
                sold: stat.sold || 0,
                activePurchases: stat.active || 0,
                minutesRemaining: stat.minutesRemaining || 0,
                valueSold: round2(stat.valueSold || 0),
                effectiveHourlyRate: packageHourlyRate(pkg)
            };
        })
    };
};

export const savePackage = async (schoolId, payload = {}, actor) => {
    const settings = await getBillingSettings(schoolId);
    if (settings.packagesEnabled === false) throw badRequest('Packages are turned off for this school.');
    const update = packagePayload(payload, settings);
    if (update.eligibleClasses.length) {
        const found = await Class.countDocuments({
            school: schoolId,
            _id: { $in: update.eligibleClasses }
        });
        if (found !== update.eligibleClasses.length) {
            throw badRequest('One of the eligible classes does not belong to this school.');
        }
    }

    let doc;
    if (payload.id) {
        if (!mongoose.Types.ObjectId.isValid(String(payload.id))) throw notFound('Package not found.');
        doc = await SessionBillingPackage.findOneAndUpdate(
            { _id: payload.id, school: schoolId },
            { $set: update },
            { new: true, runValidators: true }
        );
        if (!doc) throw notFound('Package not found.');
    } else {
        doc = await SessionBillingPackage.create({
            ...update,
            school: schoolId,
            createdBy: actor?._id || actor
        });
    }
    await logBillingAudit({
        school: schoolId,
        actor,
        action: payload.id ? 'package.updated' : 'package.created',
        entityType: 'package',
        entityId: doc._id,
        summary: `${update.name} · ${update.minutes} min · ${update.price} ${update.currency}`
    });
    return doc.toObject();
};

export const archivePackage = async (schoolId, packageId, actor) => {
    const doc = await SessionBillingPackage.findOneAndUpdate(
        { _id: packageId, school: schoolId },
        { $set: { active: false } },
        { new: true }
    );
    if (!doc) throw notFound('Package not found.');
    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'package.archived',
        entityType: 'package',
        entityId: doc._id,
        summary: `${doc.name} archived`
    });
    return { id: String(doc._id), active: false };
};

const findActivePackageForStudent = async (schoolId, studentId, at, classId, purchasesCache) => {
    let purchases = purchasesCache?.get(String(studentId));
    if (!purchases) {
        purchases = await SessionBillingPackagePurchase.find({
            school: schoolId,
            student: studentId,
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).sort({ purchasedAt: 1 }).lean();
        purchasesCache?.set(String(studentId), purchases);
    }
    const time = at ? new Date(at).getTime() : Date.now();
    return purchases.find((purchase) => {
        if (purchase.expiresAt && new Date(purchase.expiresAt).getTime() < time) return false;
        if (purchase.eligibleClasses?.length && classId
            && !purchase.eligibleClasses.some((id) => String(id) === String(classId))) return false;
        return Number(purchase.minutesRemaining) > 0;
    }) || null;
};

const consumePackage = async (purchase, minutes) => {
    if (!purchase || !(minutes > 0)) return null;
    const consumed = Math.min(Number(minutes) || 0, Number(purchase.minutesRemaining) || 0);
    if (!(consumed > 0)) return null;
    const updated = await SessionBillingPackagePurchase.findOneAndUpdate(
        {
            _id: purchase._id,
            status: 'active',
            minutesRemaining: { $gte: consumed }
        },
        { $inc: { minutesRemaining: -consumed } },
        { new: true }
    );
    if (!updated) return null;
    if (updated.minutesRemaining <= 0) {
        updated.status = 'exhausted';
        await updated.save();
    }
    return consumed;
};

const restorePackage = async (purchaseId, minutes) => {
    if (!purchaseId || !(minutes > 0)) return;
    const purchase = await SessionBillingPackagePurchase.findById(purchaseId);
    if (!purchase) return;
    purchase.minutesRemaining = Math.min(
        purchase.minutesIncluded,
        (Number(purchase.minutesRemaining) || 0) + (Number(minutes) || 0)
    );
    if (purchase.status === 'exhausted' && purchase.minutesRemaining > 0) {
        purchase.status = 'active';
    }
    await purchase.save();
};

export const recordPackagePurchase = async (schoolId, payload = {}, actor) => {
    const settings = await getBillingSettings(schoolId);
    if (settings.packagesEnabled === false) throw badRequest('Packages are turned off for this school.');
    const studentId = toObjectId(payload.studentId);
    if (!studentId) throw badRequest('Choose the student buying this package.');
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('_id user firstName lastName')
        .lean();
    if (!student) throw notFound('Student not found.');

    let pkg = null;
    if (payload.packageId) {
        pkg = await SessionBillingPackage.findOne({ _id: payload.packageId, school: schoolId }).lean();
        if (!pkg) throw notFound('Package not found.');
        if (pkg.active === false) throw badRequest('This package is archived.');
    }

    const price = round2(toNumber(payload.price, pkg?.price ?? 0));
    const minutes = Math.round(toNumber(payload.minutes, pkg?.minutes ?? 0));
    if (!(minutes > 0)) throw badRequest('The package must include lesson minutes.');
    if (price < 0) throw badRequest('The package price is not valid.');
    const method = String(payload.method || 'cash');
    if (!PAYMENT_METHODS.includes(method) || !methodValid(method, settings)) {
        throw badRequest('Choose an available payment method.');
    }
    const purchasedAt = payload.purchasedAt ? parseLocalDate(payload.purchasedAt) : new Date();
    if (!purchasedAt) throw badRequest('The purchase date is not valid.');
    if (purchasedAt.getTime() > Date.now() + DAY_MS) {
        throw badRequest('The purchase date cannot be in the future.');
    }
    const expiryDays = Math.round(toNumber(payload.expiryDays, pkg?.expiryDays ?? 0));
    if (expiryDays < 0 || expiryDays > 3650) throw badRequest('The package expiry is not valid.');
    const expiresAt = expiryDays > 0 ? addDays(purchasedAt, expiryDays) : null;
    const name = String(payload.name || pkg?.name || 'Lesson package').trim().slice(0, 120);

    const entry = await SessionBillingEntry.create({
        school: schoolId,
        student: student._id,
        studentUser: student.user,
        kind: 'payment',
        occurredAt: purchasedAt,
        amount: price,
        currency: existingCurrency(settings),
        method,
        reference: `Package: ${name}`,
        receivedBy: actor?._id || actor,
        createdBy: actor?._id || actor,
        note: String(payload.note || '').trim().slice(0, 500),
        source: 'manual',
        status: 'active'
    });

    const purchase = await SessionBillingPackagePurchase.create({
        school: schoolId,
        student: student._id,
        package: pkg?._id,
        name,
        minutesIncluded: minutes,
        minutesRemaining: minutes,
        price,
        currency: existingCurrency(settings),
        purchasedAt,
        expiresAt,
        eligibleClasses: pkg?.eligibleClasses || [],
        paymentEntry: entry._id,
        note: String(payload.note || '').trim().slice(0, 500),
        createdBy: actor?._id || actor,
        status: 'active'
    });

    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'package.sold',
        entityType: 'package-purchase',
        entityId: purchase._id,
        student: student._id,
        summary: `${name} sold to ${studentName(student)} · ${minutes} min · ${price} ${existingCurrency(settings)}`,
        meta: { paymentEntry: String(entry._id), expiresAt }
    });

    return {
        purchase: purchase.toObject(),
        entry: entry.toObject()
    };
};

export const listPackagePurchases = async (schoolId, query = {}) => {
    const filter = { school: schoolId };
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        filter.student = query.studentId;
    }
    if (['active', 'exhausted', 'expired', 'cancelled'].includes(String(query.status))) {
        filter.status = String(query.status);
    }
    const docs = await SessionBillingPackagePurchase.find(filter)
        .sort({ purchasedAt: -1 })
        .limit(500)
        .lean();
    const studentIds = [...new Set(docs.map((doc) => String(doc.student)))];
    const students = studentIds.length
        ? await Student.find({ school: schoolId, _id: { $in: studentIds } })
            .select('firstName lastName')
            .lean()
        : [];
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    return {
        purchases: docs.map((doc) => ({
            id: String(doc._id),
            studentId: String(doc.student),
            studentName: studentName(studentById.get(String(doc.student))),
            name: doc.name,
            minutesIncluded: doc.minutesIncluded,
            minutesRemaining: doc.minutesRemaining,
            price: round2(doc.price),
            currency: doc.currency,
            purchasedAt: doc.purchasedAt,
            expiresAt: doc.expiresAt,
            status: doc.status,
            effectiveHourlyRate: packageHourlyRate(doc)
        }))
    };
};

export const cancelPackagePurchase = async (schoolId, purchaseId, { reason } = {}, actor) => {
    const purchase = await SessionBillingPackagePurchase.findOne({ _id: purchaseId, school: schoolId });
    if (!purchase) throw notFound('Package purchase not found.');
    if (purchase.status !== 'active') throw badRequest('This package is no longer active.');
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw badRequest('Say why this package is being cancelled.');

    const settings = await getBillingSettings(schoolId);
    const refundAmount = purchase.minutesIncluded > 0
        ? round2(purchase.price * (purchase.minutesRemaining / purchase.minutesIncluded))
        : 0;
    purchase.status = 'cancelled';
    purchase.note = [purchase.note, `Cancelled: ${trimmedReason}`].filter(Boolean).join(' · ').slice(0, 500);
    await purchase.save();

    let refundEntry = null;
    if (refundAmount > 0) {
        refundEntry = await SessionBillingEntry.create({
            school: schoolId,
            student: purchase.student,
            kind: 'refund',
            occurredAt: new Date(),
            amount: refundAmount,
            currency: existingCurrency(settings),
            method: 'other',
            reference: `Package cancellation: ${purchase.name}`,
            receivedBy: actor?._id || actor,
            createdBy: actor?._id || actor,
            note: trimmedReason.slice(0, 500),
            source: 'manual',
            status: 'active',
            linkedEntry: purchase.paymentEntry
        });
    }

    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'package.cancelled',
        entityType: 'package-purchase',
        entityId: purchase._id,
        student: purchase.student,
        summary: `${purchase.name} cancelled · refunded ${refundAmount} ${existingCurrency(settings)}`,
        meta: { reason: trimmedReason, refundEntry: refundEntry ? String(refundEntry._id) : null }
    });

    return {
        purchase: purchase.toObject(),
        refundEntry: refundEntry ? refundEntry.toObject() : null
    };
};

/* ------------------------------------------------------------------ */
/* Session charging                                                    */
/* ------------------------------------------------------------------ */

export const generateChargesForSession = async (sessionId, schoolId) => {
    const session = await LiveSession.findOne({ _id: sessionId, school: schoolId }).lean();
    if (!session) return { created: 0, skipped: 'session-not-found' };
    if (!session.endedAt) return { created: 0, skipped: 'session-not-ended' };
    if (!(await isSessionBillingEnabled(schoolId))) return { created: 0, skipped: 'disabled' };

    const settings = await getBillingSettings(schoolId);
    const window = getSessionWindow(session);
    if (!window) return { created: 0, skipped: 'no-session-time' };

    const roster = (session.rosterSnapshot || []).filter((entry) => entry?.studentId);
    if (!roster.length) return { created: 0, skipped: 'empty-roster' };

    const [events, students] = await Promise.all([
        LiveSessionEvent.find({ school: schoolId, sessionId: session._id }).sort({ seq: 1 }).lean(),
        Student.find({ school: schoolId, user: { $in: roster.map((entry) => entry.studentId) } })
            .select('_id user firstName lastName')
            .lean()
    ]);

    const studentByUser = new Map(students.map((student) => [String(student.user), student]));
    const studentIds = students.map((student) => student._id);
    const activePurchases = studentIds.length
        ? await SessionBillingPackagePurchase.find({
            school: schoolId,
            student: { $in: studentIds },
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).sort({ purchasedAt: 1 }).lean()
        : [];
    const purchasesByStudent = new Map();
    for (const purchase of activePurchases) {
        const key = String(purchase.student);
        if (!purchasesByStudent.has(key)) purchasesByStudent.set(key, []);
        purchasesByStudent.get(key).push(purchase);
    }

    const presence = getPresenceSegments(events, window);
    const pauses = getPauseWindows(events, session);
    const sessionMinutes = minutesFromMs(
        billableMsFromSegments([[window.start, window.end]], settings.excludePauseTime === false ? [] : pauses)
    );
    const currency = existingCurrency(settings);
    const title = session?.lessonSnapshot?.title || '';
    const rosterStudentIds = new Set(students.map((student) => String(student._id)));

    const operations = [];
    const packagePlans = [];
    let issueCount = 0;

    for (const entry of roster) {
        const student = studentByUser.get(String(entry.studentId));
        const entryName = String(entry.name || '').trim() || 'Roster student';
        if (!student) {
            issueCount += 1;
            await openIssue({
                school: session.school,
                session: session._id,
                classId: session.classId,
                reason: 'missing-student',
                detail: `${entryName} is on the session roster but has no student record, so no charge was created.`,
                studentName: entryName,
                sessionTitle: title,
                occurredAt: session.endedAt
            });
            continue;
        }

        const segments = presence.get(String(entry.studentId)) || [];
        const attendedMs = billableMsFromSegments(segments, []);
        const billableMs = settings.billingBasis === 'session'
            ? billableMsFromSegments(
                [[window.start, window.end]],
                settings.excludePauseTime === false ? [] : pauses
            )
            : billableMsFromSegments(
                segments,
                settings.excludePauseTime === false ? [] : pauses
            );
        const rawMinutes = settings.billingBasis === 'session'
            ? sessionMinutes
            : minutesFromMs(billableMs);
        const pausedMinutes = settings.excludePauseTime === false
            ? 0
            : settings.billingBasis === 'session'
                ? minutesFromMs(billableMsFromSegments([[window.start, window.end]], pauses))
                : minutesFromMs(Math.max(0, attendedMs - billableMs));
        const minutes = roundBillableMinutes(rawMinutes, settings);
        if (minutes <= 0) {
            issueCount += 1;
            await openIssue({
                school: session.school,
                session: session._id,
                student: student._id,
                classId: session.classId,
                reason: 'no-attendance',
                detail: `${studentName(student)} has no billable attendance and the school has no no-show charge.`,
                studentName: studentName(student),
                sessionTitle: title,
                occurredAt: session.endedAt
            });
            continue;
        }

        const normal = resolveHourlyRate(settings, {
            classId: session.classId,
            studentId: student._id,
            at: session.endedAt
        });
        const purchase = rosterStudentIds.has(String(student._id))
            ? findActivePackageForStudent(
                schoolId,
                student._id,
                session.endedAt,
                session.classId,
                purchasesByStudent
            )
            : null;
        const packageRate = purchase ? packageHourlyRate(purchase) : 0;
        const coveredMinutes = purchase ? Math.min(minutes, Number(purchase.minutesRemaining) || 0) : 0;
        const remainingMinutes = minutes - coveredMinutes;
        const packageAmount = amountFromMinutes(coveredMinutes, packageRate);
        const paidAmount = amountFromMinutes(remainingMinutes, normal.rate);
        const amount = round2(packageAmount + paidAmount);
        const grossAmount = amountFromMinutes(minutes, normal.rate);
        const effectiveRate = minutes > 0 ? round2((amount / minutes) * 60) : 0;
        const rateSource = coveredMinutes > 0 ? 'package' : normal.source;

        if (normal.rate <= 0 && packageRate <= 0) {
            issueCount += 1;
            await openIssue({
                school: session.school,
                session: session._id,
                student: student._id,
                classId: session.classId,
                reason: 'missing-rate',
                detail: `${studentName(student)} has ${Math.round(minutes)} billable minutes but no class, student, or school rate is set.`,
                minutes,
                studentName: studentName(student),
                sessionTitle: title,
                occurredAt: session.endedAt
            });
            continue;
        }
        if (amount <= 0) {
            issueCount += 1;
            await openIssue({
                school: session.school,
                session: session._id,
                student: student._id,
                classId: session.classId,
                reason: 'zero-amount',
                detail: `${studentName(student)}'s lesson calculated to a zero charge. Check the rate and rounding rules.`,
                minutes,
                studentName: studentName(student),
                sessionTitle: title,
                occurredAt: session.endedAt
            });
            continue;
        }

        const operation = {
            updateOne: {
                filter: {
                    school: session.school,
                    session: session._id,
                    student: student._id,
                    kind: 'charge',
                    status: 'active'
                },
                update: {
                    $setOnInsert: {
                        school: session.school,
                        student: student._id,
                        studentUser: student.user,
                        kind: 'charge',
                        session: session._id,
                        sessionTitle: title,
                        classId: session.classId,
                        teacherId: session.teacherId,
                        occurredAt: session.endedAt,
                        minutes,
                        hourlyRate: effectiveRate,
                        rateSource,
                        grossAmount,
                        amount,
                        currency,
                        packageCoveredMinutes: coveredMinutes,
                        packagePurchase: purchase?._id,
                        source: 'auto',
                        lessonSource: 'platform',
                        ruleSnapshot: {
                            attendanceMinutes: Math.round(rawMinutes * 10) / 10,
                            pausedMinutes: Math.round(pausedMinutes * 10) / 10,
                            rawMinutes: Math.round(rawMinutes * 10) / 10,
                            roundedMinutes: minutes,
                            roundingMinutes: settings.roundingMinutes,
                            minimumBillableMinutes: settings.minimumBillableMinutes,
                            noShowMinutes: settings.noShowMinutes,
                            graceMinutes: settings.graceMinutes,
                            billingBasis: settings.billingBasis,
                            packageName: purchase?.name || ''
                        },
                        status: 'active'
                    }
                },
                upsert: true
            }
        };
        operations.push(operation);
        packagePlans.push({
            purchase,
            coveredMinutes,
            student: student._id,
            operationIndex: operations.length - 1
        });

        // Surface likely duplicate manual lessons for the same day.
        const manualDuplicate = await SessionBillingEntry.exists({
            school: schoolId,
            student: student._id,
            kind: 'charge',
            source: 'manual',
            status: 'active',
            occurredAt: {
                $gte: startOfDay(session.endedAt),
                $lte: new Date(startOfDay(session.endedAt).getTime() + DAY_MS - 1)
            }
        });
        if (manualDuplicate) {
            issueCount += 1;
            await openIssue({
                school: session.school,
                session: session._id,
                student: student._id,
                classId: session.classId,
                reason: 'duplicate-manual',
                detail: `${studentName(student)} also has a manual lesson on this date. Check whether it is the same lesson.`,
                minutes,
                studentName: studentName(student),
                sessionTitle: title,
                occurredAt: session.endedAt
            });
        }
    }

    if (!operations.length) return { created: 0, skipped: 'nothing-to-bill', issues: issueCount };

    let result;
    try {
        result = await SessionBillingEntry.bulkWrite(operations, { ordered: false });
    } catch (error) {
        const duplicateOnly = error?.code === 11000
            || (Array.isArray(error?.writeErrors) && error.writeErrors.every((writeError) => writeError?.code === 11000));
        if (!duplicateOnly) throw error;
        return { created: 0, candidates: operations.length, skipped: 'already-billed', issues: issueCount };
    }

    const upserted = new Map();
    if (result?.upsertedIds && typeof result.upsertedIds === 'object') {
        for (const [index, id] of Object.entries(result.upsertedIds)) {
            upserted.set(Number(index), id);
        }
    }
    for (const plan of packagePlans) {
        if (!upserted.has(plan.operationIndex)) continue;
        const consumed = await consumePackage(plan.purchase, plan.coveredMinutes);
        if (consumed !== null && consumed !== plan.coveredMinutes) {
            // Availability changed between planning and writing; leave the
            // charge as recorded and flag it for review.
            await SessionBillingIssue.updateOne(
                {
                    school: schoolId,
                    session: session._id,
                    student: plan.student,
                    reason: 'review-hold'
                },
                {
                    $setOnInsert: {
                        school: schoolId,
                        session: session._id,
                        student: plan.student,
                        classId: session.classId,
                        reason: 'review-hold',
                        detail: 'Package minutes changed while the lesson was being billed. Review the charge.',
                        occurredAt: session.endedAt,
                        status: 'open'
                    }
                },
                { upsert: true }
            ).catch(() => {});
            issueCount += 1;
        }
    }

    const created = result?.upsertedCount || 0;
    if (created > 0) {
        await logBillingAudit({
            school: schoolId,
            actor: null,
            action: 'charges.generated',
            entityType: 'session',
            entityId: session._id,
            summary: `${created} lesson charge${created === 1 ? '' : 's'} created for ${title || 'a live lesson'}`,
            meta: { sessionId: String(session._id), created, issues: issueCount }
        });
    }

    return { created, candidates: operations.length, issues: issueCount };
};

/* ------------------------------------------------------------------ */
/* Payments, refunds, adjustments, voids                               */
/* ------------------------------------------------------------------ */

const loadStudent = async (schoolId, studentId) => {
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('_id user firstName lastName currentClass enrolledClasses')
        .lean();
    if (!student) throw notFound('Student not found.');
    return student;
};

export const recordBillingPayment = async (schoolId, payload = {}, actor) => {
    const student = await loadStudent(schoolId, payload.studentId);
    const amount = toNumber(payload.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter a payment amount greater than zero.');
    if (amount > 1000000) throw badRequest('The payment amount is too large.');

    const method = String(payload.method || 'cash');
    if (!PAYMENT_METHODS.includes(method)) throw badRequest('Choose a valid payment method.');
    const settings = await getBillingSettings(schoolId);
    if (!methodValid(method, settings)) throw badRequest('That payment method is turned off for this school.');

    const receivedAt = payload.receivedAt ? parseLocalDate(payload.receivedAt) : new Date();
    if (!receivedAt) throw badRequest('The payment date is not valid.');
    if (receivedAt.getTime() > Date.now() + DAY_MS) {
        throw badRequest('The payment date cannot be in the future.');
    }

    const entry = await SessionBillingEntry.create({
        school: schoolId,
        student: student._id,
        studentUser: student.user,
        kind: 'payment',
        occurredAt: receivedAt,
        amount: round2(amount),
        currency: existingCurrency(settings),
        method,
        reference: String(payload.reference || '').trim().slice(0, 200),
        receivedBy: actor?._id || actor,
        createdBy: actor?._id || actor,
        note: String(payload.note || '').trim().slice(0, 500),
        source: 'manual',
        status: 'active'
    });

    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'payment.recorded',
        entityType: 'entry',
        entityId: entry._id,
        student: student._id,
        summary: `${round2(amount)} ${existingCurrency(settings)} received from ${studentName(student)}`,
        meta: { method, reference: entry.reference }
    });
    return entry.toObject();
};

export const recordBillingRefund = async (schoolId, payload = {}, actor) => {
    const student = await loadStudent(schoolId, payload.studentId);
    const amount = toNumber(payload.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter a refund amount greater than zero.');
    if (amount > 1000000) throw badRequest('The refund amount is too large.');
    const reason = String(payload.reason || payload.note || '').trim();
    if (!reason) throw badRequest('Say why this refund is being issued.');

    const [payments, refunds] = await Promise.all([
        SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), student: student._id, kind: 'payment', status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        SessionBillingEntry.aggregate([
            { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), student: student._id, kind: 'refund', status: 'active' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
    ]);
    const refundable = round2((payments[0]?.total || 0) - (refunds[0]?.total || 0));
    if (round2(amount) > refundable) {
        throw badRequest(`This refund is more than the ${refundable} available to refund.`);
    }

    const settings = await getBillingSettings(schoolId);
    const occurredAt = payload.receivedAt ? parseLocalDate(payload.receivedAt) : new Date();
    if (!occurredAt) throw badRequest('The refund date is not valid.');
    const method = String(payload.method || 'other');
    if (!PAYMENT_METHODS.includes(method)) throw badRequest('Choose a valid refund method.');

    const entry = await SessionBillingEntry.create({
        school: schoolId,
        student: student._id,
        studentUser: student.user,
        kind: 'refund',
        occurredAt,
        amount: round2(amount),
        currency: existingCurrency(settings),
        method,
        reference: String(payload.reference || '').trim().slice(0, 200),
        receivedBy: actor?._id || actor,
        createdBy: actor?._id || actor,
        note: reason.slice(0, 500),
        source: 'manual',
        status: 'active',
        linkedEntry: payload.linkedEntryId || undefined
    });

    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'refund.recorded',
        entityType: 'entry',
        entityId: entry._id,
        student: student._id,
        summary: `${round2(amount)} ${existingCurrency(settings)} refunded to ${studentName(student)}`,
        meta: { reason, method }
    });
    return entry.toObject();
};

export const recordBillingAdjustment = async (schoolId, payload = {}, actor) => {
    const student = await loadStudent(schoolId, payload.studentId);
    const amount = toNumber(payload.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an adjustment amount greater than zero.');
    if (amount > 1000000) throw badRequest('The adjustment amount is too large.');
    const direction = payload.direction === 'debit' ? 'debit' : 'credit';
    const reason = String(payload.reason || payload.note || '').trim();
    if (!reason) throw badRequest('Say why this adjustment is being made.');

    const settings = await getBillingSettings(schoolId);
    const occurredAt = payload.occurredAt ? parseLocalDate(payload.occurredAt) : new Date();
    if (!occurredAt) throw badRequest('The adjustment date is not valid.');

    const entry = await SessionBillingEntry.create({
        school: schoolId,
        student: student._id,
        studentUser: student.user,
        kind: 'adjustment',
        direction,
        occurredAt,
        amount: round2(amount),
        currency: existingCurrency(settings),
        note: reason.slice(0, 500),
        createdBy: actor?._id || actor,
        source: 'manual',
        status: 'active',
        linkedEntry: payload.linkedEntryId || undefined
    });

    await logBillingAudit({
        school: schoolId,
        actor,
        action: 'adjustment.recorded',
        entityType: 'entry',
        entityId: entry._id,
        student: student._id,
        summary: `${direction === 'debit' ? 'Debit' : 'Credit'} adjustment ${round2(amount)} ${existingCurrency(settings)} for ${studentName(student)}`,
        meta: { reason, direction }
    });
    return entry.toObject();
};

const voidEntry = async (entry, { reason, actor }) => {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw badRequest('Say why this entry is being voided.');
    entry.status = 'void';
    entry.voidedAt = new Date();
    entry.voidedBy = actor?._id || actor;
    entry.voidReason = trimmedReason.slice(0, 300);
    await entry.save();
    if (entry.kind === 'charge' && entry.packagePurchase && entry.packageCoveredMinutes > 0) {
        await restorePackage(entry.packagePurchase, entry.packageCoveredMinutes);
    }
    await logBillingAudit({
        school: entry.school,
        actor,
        action: `${entry.kind}.voided`,
        entityType: 'entry',
        entityId: entry._id,
        student: entry.student,
        summary: `${entry.kind} of ${round2(entry.amount)} ${entry.currency} voided`,
        meta: { reason: trimmedReason, entryId: String(entry._id) }
    });
    return entry.toObject();
};

export const voidBillingEntry = async (schoolId, entryId, { reason, actor } = {}) => {
    const entry = await SessionBillingEntry.findOne({ _id: entryId, school: schoolId, status: 'active' });
    if (!entry) throw notFound('This entry is already void or does not exist.');
    return voidEntry(entry, { reason, actor });
};

/* ------------------------------------------------------------------ */
/* Manual lessons                                                      */
/* ------------------------------------------------------------------ */

export const getManualEntryOptions = async (schoolId, user) => {
    const settings = await getBillingSettings(schoolId);
    const base = {
        currency: existingCurrency(settings),
        roundingMinutes: settings.roundingMinutes,
        minimumBillableMinutes: settings.minimumBillableMinutes,
        noShowMinutes: settings.noShowMinutes,
        lateCancellationMinutes: settings.lateCancellationMinutes,
        graceMinutes: settings.graceMinutes,
        paymentMethods: paymentMethodChoices(settings),
        lessonSources: LESSON_SOURCES,
        classes: []
    };

    const classFilter = await staffClassesListQuery(user, schoolId);
    if (!classFilter) return base;

    const classes = await Class.find(classFilter)
        .select('name grade section')
        .sort({ grade: 1, section: 1 })
        .lean();
    if (!classes.length) return base;

    const classIds = classes.map((klass) => klass._id);
    const students = await Student.find({
        school: schoolId,
        status: 'active',
        $or: [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }]
    })
        .select('_id firstName lastName currentClass enrolledClasses')
        .lean();

    const studentIds = students.map((student) => student._id);
    const purchases = studentIds.length
        ? await SessionBillingPackagePurchase.find({
            school: schoolId,
            student: { $in: studentIds },
            status: 'active',
            minutesRemaining: { $gt: 0 }
        }).lean()
        : [];
    const packageByStudent = new Map(purchases.map((purchase) => [String(purchase.student), purchase]));

    const studentsByClass = new Map(classIds.map((id) => [String(id), []]));
    for (const student of students) {
        const memberships = new Set([
            ...(student.currentClass ? [String(student.currentClass)] : []),
            ...(student.enrolledClasses || []).map(String)
        ]);
        for (const classId of memberships) {
            if (studentsByClass.has(classId)) {
                const purchase = packageByStudent.get(String(student._id));
                studentsByClass.get(classId).push({
                    id: String(student._id),
                    name: studentName(student),
                    packageName: purchase?.name || '',
                    packageMinutes: purchase?.minutesRemaining || 0
                });
            }
        }
    }

    return {
        ...base,
        classes: classes.map((klass) => {
            const { rate, source } = resolveHourlyRate(settings, {
                classId: klass._id,
                at: new Date()
            });
            return {
                id: String(klass._id),
                name: klass.name,
                hourlyRate: rate,
                rateSource: source,
                students: (studentsByClass.get(String(klass._id)) || [])
                    .sort((a, b) => a.name.localeCompare(b.name))
            };
        })
    };
};

export const recordManualCharge = async (schoolId, user, payload = {}) => {
    const classId = toObjectId(payload.classId);
    if (!classId) throw badRequest('Choose the class this lesson was for.');

    const access = await staffClassQuery(user, schoolId, classId);
    if (!access) throw forbidden('You can only log lesson time for your own classes.');
    const klass = await Class.findOne(access.query).select('name').lean();
    if (!klass) throw notFound('Class not found.');

    const studentId = toObjectId(payload.studentId);
    if (!studentId) throw badRequest('Choose the student this lesson was for.');
    const student = await Student.findOne({
        _id: studentId,
        school: schoolId,
        $or: [{ currentClass: classId }, { enrolledClasses: classId }]
    })
        .select('_id user firstName lastName')
        .lean();
    if (!student) throw badRequest('That student is not in the selected class.');

    const basis = ['attended', 'no-show', 'late-cancellation'].includes(String(payload.basis))
        ? String(payload.basis)
        : 'attended';
    const enteredMinutes = toNumber(payload.minutes, NaN);
    if (basis === 'attended' && (!Number.isFinite(enteredMinutes) || enteredMinutes <= 0)) {
        throw badRequest('Enter how many minutes the lesson lasted.');
    }
    if (Number.isFinite(enteredMinutes) && enteredMinutes > 600) {
        throw badRequest('A lesson cannot be longer than 600 minutes.');
    }

    const occurredAt = payload.occurredAt ? parseLocalDate(payload.occurredAt) : new Date();
    if (!occurredAt) throw badRequest('The lesson date is not valid.');
    if (occurredAt.getTime() > Date.now() + DAY_MS) {
        throw badRequest('Lesson time cannot be logged for a future date.');
    }

    const settings = await getBillingSettings(schoolId);
    const charge = buildLessonCharge(
        basis === 'attended' ? enteredMinutes : 0,
        settings,
        { classId, studentId, at: occurredAt, basis }
    );
    const lessonSource = LESSON_SOURCES.includes(String(payload.lessonSource))
        ? String(payload.lessonSource)
        : 'other';

    const purchases = await SessionBillingPackagePurchase.find({
        school: schoolId,
        student: student._id,
        status: 'active',
        minutesRemaining: { $gt: 0 }
    }).sort({ purchasedAt: 1 }).lean();
    const purchase = findActivePackageForStudent(
        schoolId,
        student._id,
        occurredAt,
        classId,
        new Map([[String(student._id), purchases]])
    );
    const packageRate = purchase ? packageHourlyRate(purchase) : 0;

    if (charge.hourlyRate <= 0 && packageRate <= 0) {
        throw badRequest(`No hourly rate is set for ${klass.name}. Ask your school admin to add one.`);
    }
    if (charge.minutes <= 0) {
        throw badRequest('This lesson would bill zero minutes. Check the no-show and late-cancellation rules.');
    }

    const coveredMinutes = purchase ? Math.min(charge.minutes, Number(purchase.minutesRemaining) || 0) : 0;
    const remainingMinutes = charge.minutes - coveredMinutes;
    const amount = round2(
        amountFromMinutes(coveredMinutes, packageRate)
        + amountFromMinutes(remainingMinutes, charge.hourlyRate)
    );
    if (amount <= 0) {
        throw badRequest('This lesson would not produce a charge. Check the class rate.');
    }
    const grossAmount = amountFromMinutes(charge.minutes, charge.hourlyRate);
    const effectiveRate = round2((amount / charge.minutes) * 60);

    const warnings = [];
    const sameDay = await SessionBillingEntry.findOne({
        school: schoolId,
        student: student._id,
        kind: 'charge',
        status: 'active',
        occurredAt: {
            $gte: startOfDay(occurredAt),
            $lte: new Date(startOfDay(occurredAt).getTime() + DAY_MS - 1)
        }
    }).select('_id source occurredAt').lean();
    if (sameDay) {
        warnings.push('Another lesson is already charged to this student on the same day. Check it is not a duplicate.');
    }

    const entry = await SessionBillingEntry.create({
        school: schoolId,
        student: student._id,
        studentUser: student.user,
        kind: 'charge',
        sessionTitle: basis === 'no-show'
            ? 'No-show lesson'
            : basis === 'late-cancellation'
                ? 'Late cancellation'
                : 'Off-platform lesson',
        classId,
        teacherId: user._id,
        occurredAt,
        minutes: charge.minutes,
        hourlyRate: effectiveRate,
        rateSource: coveredMinutes > 0 ? 'package' : charge.rateSource,
        grossAmount,
        amount,
        currency: existingCurrency(settings),
        packageCoveredMinutes: coveredMinutes,
        packagePurchase: purchase?._id,
        note: String(payload.note || '').trim().slice(0, 500),
        source: 'manual',
        lessonSource,
        ruleSnapshot: {
            attendanceMinutes: basis === 'attended' ? Math.round(Number(enteredMinutes) || 0) : 0,
            rawMinutes: basis === 'attended' ? Math.round(Number(enteredMinutes) || 0) : 0,
            roundedMinutes: charge.minutes,
            roundingMinutes: settings.roundingMinutes,
            minimumBillableMinutes: settings.minimumBillableMinutes,
            noShowMinutes: settings.noShowMinutes,
            graceMinutes: settings.graceMinutes,
            billingBasis: basis,
            packageName: purchase?.name || ''
        },
        createdBy: user._id,
        status: 'active'
    });

    if (coveredMinutes > 0) await consumePackage(purchase, coveredMinutes);

    await logBillingAudit({
        school: schoolId,
        actor: user,
        action: 'charge.logged',
        entityType: 'entry',
        entityId: entry._id,
        student: student._id,
        summary: `${charge.minutes} min logged for ${studentName(student)} · ${amount} ${existingCurrency(settings)}`,
        meta: { classId: String(classId), basis, lessonSource, package: purchase?.name || '' }
    });

    if (warnings.length) {
        await reportIssue(schoolId, {
            reason: 'duplicate-manual',
            studentId: student._id,
            classId,
            detail: warnings[0],
            minutes: charge.minutes,
            studentName: studentName(student),
            sessionTitle: 'Manual lesson',
            occurredAt
        });
    }

    return { ...entry.toObject(), warnings };
};

export const getManualCharges = async (schoolId, user, { limit = 25 } = {}) => {
    const filter = { school: schoolId, kind: 'charge', source: 'manual' };
    if (user?.role !== 'admin') filter.createdBy = user?._id;

    const cappedLimit = Math.min(Math.max(toNumber(limit, 25), 1), 100);
    const [entries, settings] = await Promise.all([
        SessionBillingEntry.find(filter)
            .sort({ occurredAt: -1, createdAt: -1 })
            .limit(cappedLimit)
            .lean(),
        getBillingSettings(schoolId)
    ]);

    const studentIds = [...new Set(entries.map((entry) => String(entry.student)))];
    const classIds = [...new Set(entries.map((entry) => String(entry.classId || '')).filter(Boolean))];
    const [students, classes] = await Promise.all([
        studentIds.length
            ? Student.find({ school: schoolId, _id: { $in: studentIds } })
                .select('firstName lastName')
                .lean()
            : [],
        classIds.length
            ? Class.find({ school: schoolId, _id: { $in: classIds } })
                .select('name')
                .lean()
            : []
    ]);
    const studentById = new Map(students.map((student) => [String(student._id), student]));
    const classById = new Map(classes.map((klass) => [String(klass._id), klass]));

    return {
        currency: existingCurrency(settings),
        entries: entries.map((entry) => ({
            id: String(entry._id),
            studentId: String(entry.student),
            studentName: studentName(studentById.get(String(entry.student))),
            classId: entry.classId ? String(entry.classId) : '',
            className: classById.get(String(entry.classId))?.name || 'Removed class',
            occurredAt: entry.occurredAt,
            minutes: entry.minutes || 0,
            hourlyRate: entry.hourlyRate || 0,
            amount: round2(entry.amount),
            currency: entry.currency || existingCurrency(settings),
            note: entry.note || '',
            lessonSource: entry.lessonSource || 'manual',
            status: entry.status,
            voidReason: entry.voidReason || '',
            canVoid: entry.status === 'active'
                && (user?.role === 'admin' || String(entry.createdBy || '') === String(user?._id))
        }))
    };
};

export const voidManualCharge = async (schoolId, user, entryId, { reason } = {}) => {
    const entry = await SessionBillingEntry.findOne({
        _id: entryId,
        school: schoolId,
        kind: 'charge',
        source: 'manual',
        status: 'active'
    });
    if (!entry) throw notFound('This lesson is already void or does not exist.');
    if (user?.role !== 'admin' && String(entry.createdBy || '') !== String(user?._id)) {
        throw forbidden('You can only void a lesson you logged yourself.');
    }
    return voidEntry(entry, { reason, actor: user });
};

/* ------------------------------------------------------------------ */
/* Statements and accounts                                             */
/* ------------------------------------------------------------------ */

const loadOptedOutEmails = async (schoolId, emails) => {
    const list = [...new Set((emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return new Set();
    const users = await User.find({ school: schoolId, role: 'parent', email: { $in: list } })
        .select('_id email')
        .lean();
    if (!users.length) return new Set();
    const disabled = await ParentSetting.find({
        school: schoolId,
        user: { $in: users.map((user) => user._id) },
        'notifications.email': false
    }).select('user').lean();
    const disabledIds = new Set(disabled.map((row) => String(row.user)));
    return new Set(
        users
            .filter((user) => disabledIds.has(String(user._id)))
            .map((user) => String(user.email).toLowerCase())
    );
};

export const getStudentContacts = async (student, schoolId) => {
    const contacts = student.getAllContactEmailEntries();
    const optedOut = await loadOptedOutEmails(schoolId, contacts.map((contact) => contact.email));
    return contacts.map((contact) => ({
        email: contact.email,
        type: contact.type,
        name: contact.name || '',
        optedOut: optedOut.has(contact.email.toLowerCase())
    }));
};

const entryView = (entry, running) => ({
    id: String(entry._id),
    kind: entry.kind,
    direction: entry.direction || '',
    amount: round2(entry.amount),
    grossAmount: entry.grossAmount !== undefined ? round2(entry.grossAmount) : null,
    minutes: entry.minutes || 0,
    hourlyRate: entry.hourlyRate || 0,
    rateSource: entry.rateSource || '',
    sessionTitle: entry.sessionTitle || '',
    occurredAt: entry.occurredAt,
    method: entry.method || '',
    reference: entry.reference || '',
    note: entry.note || '',
    source: entry.source || 'auto',
    lessonSource: entry.lessonSource || '',
    status: entry.status,
    voidReason: entry.voidReason || '',
    packageCoveredMinutes: entry.packageCoveredMinutes || 0,
    ruleSnapshot: entry.ruleSnapshot || null,
    balanceAfter: round2(running)
});

export const getStudentStatement = async (schoolId, studentId) => {
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName user currentClass enrolledClasses')
        .lean();
    if (!student) throw notFound('Student not found.');

    const entries = await SessionBillingEntry.find({ school: schoolId, student: student._id })
        .sort({ occurredAt: 1, createdAt: 1 })
        .lean();

    let running = 0;
    const statement = entries.map((entry) => {
        running += balanceDelta(entry);
        return entryView(entry, running);
    });

    const totals = summarizeEntries(entries);
    const settings = await getBillingSettings(schoolId);
    const lastCharge = [...entries].reverse().find((entry) => entry.kind === 'charge' && entry.status === 'active');
    const lastRate = lastCharge?.hourlyRate || settings.defaultHourlyRate;
    const activePurchase = await SessionBillingPackagePurchase.findOne({
        school: schoolId,
        student: student._id,
        status: 'active',
        minutesRemaining: { $gt: 0 }
    }).sort({ purchasedAt: 1 }).lean();

    return {
        student: {
            id: String(student._id),
            name: studentName(student)
        },
        currency: existingCurrency(settings),
        totals: {
            ...totals,
            minutesRemaining: activePurchase
                ? Math.floor(activePurchase.minutesRemaining)
                : estimateMinutesRemaining(totals.balance, lastRate)
        },
        package: activePurchase ? {
            id: String(activePurchase._id),
            name: activePurchase.name,
            minutesRemaining: activePurchase.minutesRemaining,
            minutesIncluded: activePurchase.minutesIncluded,
            expiresAt: activePurchase.expiresAt,
            effectiveHourlyRate: packageHourlyRate(activePurchase)
        } : null,
        entries: statement
    };
};

export const getStudentAccount = async (schoolId, studentId) => {
    const statement = await getStudentStatement(schoolId, studentId);
    const student = await Student.findOne({ _id: studentId, school: schoolId })
        .select('firstName lastName user currentClass enrolledClasses studentEmail email parentInfo')
        .populate('user', 'email');
    if (!student) throw notFound('Student not found.');

    const settings = await getBillingSettings(schoolId);
    const classIds = [...new Set([
        ...(student.currentClass ? [String(student.currentClass)] : []),
        ...(student.enrolledClasses || []).map(String)
    ])];
    const [contacts, classes, notes, purchases, deliveries, rawEntries] = await Promise.all([
        getStudentContacts(student, schoolId),
        classIds.length
            ? Class.find({ school: schoolId, _id: { $in: classIds } }).select('name grade section').lean()
            : [],
        SessionBillingNote.find({ school: schoolId, student: student._id }).sort({ createdAt: -1 }).limit(20).lean(),
        SessionBillingPackagePurchase.find({ school: schoolId, student: student._id })
            .sort({ purchasedAt: -1 })
            .limit(20)
            .lean(),
        SessionBillingEmailDelivery.find({
            school: schoolId,
            student: student._id,
            status: 'sent'
        }).sort({ deliveredAt: -1 }).limit(10).lean(),
        SessionBillingEntry.find({ school: schoolId, student: student._id })
            .select('createdBy receivedBy')
            .lean()
    ]);

    const actorIds = [...new Set(
        rawEntries
            .flatMap((entry) => [entry.createdBy, entry.receivedBy])
            .filter(Boolean)
            .map(String)
    )];
    const actorDocs = actorIds.length
        ? await User.find({ _id: { $in: actorIds } }).select('firstName lastName').lean()
        : [];
    const actorById = new Map(actorDocs.map((actor) => [String(actor._id), userName(actor)]));
    const actorByEntry = new Map(rawEntries.map((entry) => [
        String(entry._id),
        actorById.get(String(entry.createdBy || entry.receivedBy || '')) || ''
    ]));

    const rate = resolveHourlyRate(settings, {
        classId: student.currentClass,
        studentId: student._id,
        at: new Date()
    });
    const classRate = student.currentClass
        ? resolveHourlyRate({ ...settings, studentRates: [] }, { classId: student.currentClass, at: new Date() })
        : null;

    return {
        ...statement,
        entries: statement.entries.map((entry) => ({
            ...entry,
            createdByName: actorByEntry.get(entry.id) || ''
        })),
        profile: {
            classes: classes.map((klass) => ({
                id: String(klass._id),
                name: klass.name,
                grade: klass.grade || '',
                section: klass.section || ''
            })),
            contacts,
            canEmail: contacts.filter((contact) => !contact.optedOut).length > 0
        },
        rate: {
            hourlyRate: rate.rate,
            source: rate.source,
            reason: rate.reason || '',
            classHourlyRate: classRate?.rate || 0,
            defaultHourlyRate: settings.defaultHourlyRate,
            studentRate: (settings.studentRates || []).find(
                (row) => String(row.studentId) === String(student._id)
            ) || null
        },
        rules: {
            roundingMinutes: settings.roundingMinutes,
            minimumBillableMinutes: settings.minimumBillableMinutes,
            noShowMinutes: settings.noShowMinutes,
            lateCancellationMinutes: settings.lateCancellationMinutes,
            graceMinutes: settings.graceMinutes,
            billingBasis: settings.billingBasis,
            excludePauseTime: settings.excludePauseTime
        },
        packages: purchases.map((purchase) => ({
            id: String(purchase._id),
            name: purchase.name,
            minutesIncluded: purchase.minutesIncluded,
            minutesRemaining: purchase.minutesRemaining,
            price: round2(purchase.price),
            purchasedAt: purchase.purchasedAt,
            expiresAt: purchase.expiresAt,
            status: purchase.status
        })),
        notes: notes.map((note) => ({
            id: String(note._id),
            body: note.body,
            createdByName: note.createdByName || '',
            createdAt: note.createdAt
        })),
        statements: deliveries.map((delivery) => ({
            id: String(delivery._id),
            recipientEmail: delivery.recipientEmail,
            recipientType: delivery.recipientType,
            language: delivery.language,
            sentAt: delivery.deliveredAt || delivery.createdAt
        })),
        lastStatementAt: deliveries[0]?.deliveredAt || deliveries[0]?.createdAt || null,
        paymentMethods: paymentMethodChoices(settings),
        currency: existingCurrency(settings)
    };
};

export const addStudentNote = async (schoolId, studentId, body, actor) => {
    const text = String(body || '').trim();
    if (!text) throw badRequest('Write the note first.');
    if (text.length > 1000) throw badRequest('Keep the note under 1,000 characters.');
    const student = await Student.findOne({ _id: studentId, school: schoolId }).select('_id').lean();
    if (!student) throw notFound('Student not found.');
    const note = await SessionBillingNote.create({
        school: schoolId,
        student: student._id,
        body: text,
        createdBy: actor?._id || actor,
        createdByName: userName(actor).slice(0, 160)
    });
    return {
        id: String(note._id),
        body: note.body,
        createdByName: note.createdByName,
        createdAt: note.createdAt
    };
};

export const deleteStudentNote = async (schoolId, studentId, noteId) => {
    const result = await SessionBillingNote.deleteOne({
        _id: noteId,
        school: schoolId,
        student: studentId
    });
    if (!result.deletedCount) throw notFound('Note not found.');
    return { deleted: true };
};

/* ------------------------------------------------------------------ */
/* Audit and family portal                                             */
/* ------------------------------------------------------------------ */

export const listBillingAudit = async (schoolId, query = {}) => {
    const range = parseRange(query);
    const filter = {
        school: schoolId,
        createdAt: { $gte: range.start, $lte: range.end }
    };
    if (query.studentId && mongoose.Types.ObjectId.isValid(String(query.studentId))) {
        filter.student = query.studentId;
    }
    if (query.action) filter.action = String(query.action);
    const docs = await SessionBillingAudit.find(filter)
        .sort({ createdAt: -1 })
        .limit(300)
        .lean();
    return {
        range: { from: range.start, to: range.end },
        entries: docs.map((doc) => ({
            id: String(doc._id),
            action: doc.action,
            actorName: doc.actorName || 'System',
            entityType: doc.entityType || '',
            entityId: doc.entityId ? String(doc.entityId) : '',
            studentId: doc.student ? String(doc.student) : '',
            summary: doc.summary || '',
            meta: doc.meta || null,
            createdAt: doc.createdAt
        }))
    };
};

const findFamilyStudents = async (schoolId, user) => {
    if (!user) return [];
    if (user.role === 'student') {
        const student = await Student.findOne({ school: schoolId, user: user._id })
            .select('_id firstName lastName user currentClass enrolledClasses')
            .lean();
        return student ? [student] : [];
    }
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return [];
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`^${escaped}$`, 'i');
    return Student.find({
        school: schoolId,
        status: 'active',
        $or: [
            { 'parentInfo.fatherEmail': matcher },
            { 'parentInfo.motherEmail': matcher },
            { 'parentInfo.guardianEmail': matcher },
            { studentEmail: matcher },
            { email: matcher }
        ]
    })
        .select('_id firstName lastName user currentClass enrolledClasses')
        .limit(6)
        .lean();
};

export const getFamilyStatement = async (schoolId, user) => {
    const students = await findFamilyStudents(schoolId, user);
    if (!students.length) {
        throw notFound('No lesson account is linked to this sign-in.');
    }
    const settings = await getBillingSettings(schoolId);
    const statements = [];
    for (const student of students) {
        const statement = await getStudentStatement(schoolId, student._id);
        const deliveries = await SessionBillingEmailDelivery.find({
            school: schoolId,
            student: student._id,
            status: 'sent',
            purpose: 'statement'
        }).sort({ deliveredAt: -1 }).limit(3).lean();
        statements.push({
            ...statement,
            lastStatementAt: deliveries[0]?.deliveredAt || null,
            paymentInstructions: settings.statement.paymentInstructions || ''
        });
    }
    return {
        currency: existingCurrency(settings),
        paymentInstructions: settings.statement.paymentInstructions || '',
        students: statements
    };
};

export const getOptedOutEmailSet = loadOptedOutEmails;
export { packageHourlyRate };
