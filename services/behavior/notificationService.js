import BehaviorNotification from '../../models/BehaviorNotification.js';
import BehaviorEmailTemplate from '../../models/BehaviorEmailTemplate.js';
import User from '../../models/User.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from './auditService.js';

/**
 * Composes what goes out: an email row per language plus a portal row. This file
 * renders and records; it never hands a message to a mail transport. That is
 * services/behavior/emailDeliveryService.js, which only reads rows left here in
 * `draft` status.
 */

export const BEHAVIOR_DEFAULT_TEMPLATES = {
    'parent-notification': {
        en: {
            subject: 'About {{studentFirstName}}: {{behavior}}',
            body: [
                'Dear parent or guardian,',
                '',
                '{{studentFirstName}} was involved in an incident at {{schoolName}} on {{date}}: {{behavior}}.',
                'The agreed next step is {{consequence}}.',
                '',
                'We are working with {{studentFirstName}} on this. Mistakes are for learning, not for shame.',
                'If you would like to talk it through, please reply to this message.'
            ].join('\n')
        },
        ar: {
            subject: 'بخصوص {{studentFirstName}}: {{behavior}}',
            body: [
                'ولي أمر عزيز,',
                '',
                'وقع موقف ل{{studentFirstName}} في {{schoolName}} بتاريخ {{date}}: {{behavior}}.',
                'الخطوة التالية المتفق عليها هي: {{consequence}}.',
                '',
                'نحن نعمل مع {{studentFirstName}} على هذا الأمر. الأخطاء فرصة للتعلم لا للخجل.',
                'يسعدنا الحديث معكم عند الحاجة.'
            ].join('\n')
        }
    }
};

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export const renderBehaviorTemplate = (template = '', variables = {}) => String(template)
    .replace(TOKEN_PATTERN, (match, key) => (
        Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key] ?? '') : ''
    ));

// Each row is one language, and a parent reading Arabic should not get English
// month names inside it. Latin digits keep the date readable in both.
const DATE_LOCALES = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

const formatEmailDate = (value, language) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    try {
        return new Intl.DateTimeFormat(DATE_LOCALES[language] || 'en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
        }).format(date);
    } catch {
        return '';
    }
};

const DUE_LINE_PREFIX = { en: 'The work is due by ', ar: 'المطلوب إنجازه قبل ' };

const formatDueLine = (dueAt, language) => {
    const label = formatEmailDate(dueAt, language);
    if (!label) return '';
    return `\n${(DUE_LINE_PREFIX[language] || DUE_LINE_PREFIX.en)}${label}.`;
};

export const buildBehaviorVariables = ({
    student, behaviorType, incident, step, school, staff, earliestDueAt, language = 'en'
}) => ({
    studentFirstName: student?.firstName || '',
    schoolName: school?.name || '',
    behavior: behaviorType?.name || '',
    date: formatEmailDate(incident?.occurredAt || Date.now(), language),
    consequence: step?.title || '',
    stepNumber: step?.order || '',
    dueDate: earliestDueAt ? new Date(earliestDueAt).toISOString().slice(0, 10) : '',
    dueLabel: formatEmailDate(earliestDueAt, language),
    dueLine: formatDueLine(earliestDueAt, language).trim(),
    teacherFirstName: staff?.firstName || ''
});

/**
 * The facts behind the message, kept beside the rendered prose so the email can
 * show a scannable summary without the delivery layer re-reading the incident.
 */
const buildNotificationFacts = (variables) => ({
    student: variables.studentFirstName,
    school: variables.schoolName,
    date: variables.date,
    behavior: variables.behavior,
    nextStep: variables.consequence,
    dueBy: variables.dueLabel
});

/**
 * Guardian emails come from the student record. Missing addresses are flagged
 * on the incident instead of failing silently.
 */
export const resolveParentRecipients = (student) => {
    const entries = typeof student?.getAllContactEmailEntries === 'function'
        ? student.getAllContactEmailEntries()
        : [];

    return (entries || [])
        .filter((entry) => entry?.email && entry.type !== 'student')
        .map((entry) => ({
            name: entry.name || '',
            email: entry.email,
            relation: entry.type,
            hasEmail: Boolean(entry.email)
        }));
};

// Resolving the cc list means a user query per incident; cache it briefly.
const ccCache = new Map();
const CC_CACHE_TTL_MS = 30 * 1000;

const resolveCcEntries = async ({ schoolId, roles, settings }) => {
    const wanted = [...new Set([
        ...(roles || []),
        ...(settings?.cc?.roles || [])
    ])].filter(Boolean);
    if (!wanted.length) return [];

    const cacheKey = `${schoolId}:${wanted.slice().sort().join(',')}`;
    const cached = ccCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CC_CACHE_TTL_MS) return cached.value;

    const users = await User.find({ school: schoolId, role: { $in: wanted } })
        .select('firstName lastName email role')
        .limit(50)
        .lean();

    const value = users.map((user) => ({
        role: user.role,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || ''
    }));
    ccCache.set(cacheKey, { value, ts: Date.now() });
    return value;
};

// The key must appear in exactly one update operator: MongoDB rejects an update
// that sets a path $setOnInsert already claims.
const upsertNotification = async ({ idempotencyKey, ...fields }) => BehaviorNotification.findOneAndUpdate(
    { idempotencyKey },
    { $set: fields, $setOnInsert: { idempotencyKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
);

// A retried release must reuse the same row instead of creating a second draft.
const notificationKey = ({ incident, step, channel, language = null }) => [
    'behavior',
    incident._id,
    step?.order ?? 0,
    channel,
    language
].join(':');

const loadTemplate = async ({ schoolId, key, language }) => {
    if (key) {
        const stored = await BehaviorEmailTemplate.findOne({ school: schoolId, key, language, active: true }).lean();
        if (stored) return stored;
    }
    const fallback = BEHAVIOR_DEFAULT_TEMPLATES[key] || BEHAVIOR_DEFAULT_TEMPLATES['parent-notification'];
    const variant = fallback?.[language] || fallback?.en || { subject: '', body: '' };
    return { key: key || 'parent-notification', subject: variant.subject, body: variant.body };
};

/**
 * Writes the email draft and the portal entry for a step. Nothing is released
 * while an approval is outstanding.
 */
export const releaseIncidentCommunications = async ({
    incident,
    step,
    student,
    behaviorType,
    school,
    staff,
    settings,
    tasks = [],
    approvalCleared = true,
    draftEdits = null,
    actor = null
}) => {
    const languages = settings?.emailDelivery?.supportedLanguages?.length
        ? settings.emailDelivery.supportedLanguages
        : [settings?.emailDelivery?.defaultLanguage || 'en'];
    const earliestDueAt = tasks
        .map((task) => task.dueAt)
        .filter(Boolean)
        .sort()[0] || null;

    const showInPortal = step?.actions?.showInPortal !== false;
    const emailWanted = step?.actions?.emailParents === true;
    const deliveryEnabled = settings?.emailDelivery?.enabled === true;
    const recipients = resolveParentRecipients(student);
    const cc = await resolveCcEntries({
        schoolId: incident.school,
        roles: step?.actions?.ccRoles || [],
        settings
    });
    const readyAt = settings?.sendDelayMinutes
        ? new Date(Date.now() + settings.sendDelayMinutes * 60 * 1000)
        : null;
    const draftStatus = !approvalCleared
        ? 'suppressed'
        : (emailWanted && deliveryEnabled ? 'draft' : 'suppressed');
    const draftReason = !approvalCleared
        ? 'AWAITING_APPROVAL'
        : (!emailWanted ? 'STEP_HAS_NO_EMAIL' : (deliveryEnabled ? null : 'DELIVERY_DISABLED'));

    // An approver may correct the wording of the single draft they reviewed, so
    // the edit applies to that language only and the other stays as rendered.
    const edited = {
        language: draftEdits?.language || incident.emailDraft?.language || 'en',
        subject: String(draftEdits?.subject || '').trim(),
        body: String(draftEdits?.body || '').trim()
    };
    const hasEdits = Boolean(draftEdits && (edited.subject || edited.body));
    const applyEdit = (field, language, rendered) => (
        hasEdits && edited.language === language && edited[field] ? edited[field] : rendered
    );

    const written = [];
    for (const language of languages) {
        const template = await loadTemplate({
            schoolId: incident.school,
            key: step?.emailTemplateKey || 'parent-notification',
            language
        });
        const idempotencyKey = notificationKey({ incident, step, channel: 'email', language });
        const variables = buildBehaviorVariables({
            student, behaviorType, incident, step, school, staff, earliestDueAt, language
        });
        const existing = await BehaviorNotification.findOne({ idempotencyKey }).select('status').lean();
        // A message that already reached a family is never re-queued by a second
        // release of the same step; only its stored text is refreshed.
        const alreadySent = existing?.status === 'sent';

        written.push(await upsertNotification({
            idempotencyKey,
            school: incident.school,
            incident: incident._id,
            stepOrder: step?.order || null,
            channel: 'email',
            language,
            subject: applyEdit('subject', language, renderBehaviorTemplate(template.subject, variables)),
            body: applyEdit('body', language, renderBehaviorTemplate(template.body, variables)),
            facts: buildNotificationFacts(variables),
            recipients,
            cc,
            readyAt,
            ...(alreadySent ? {} : {
                status: draftStatus,
                blockedReason: draftReason,
                attempts: 0,
                error: null,
                nextAttemptAt: readyAt || new Date()
            })
        }));
    }

    written.push(await upsertNotification({
        idempotencyKey: notificationKey({ incident, step, channel: 'portal' }),
        school: incident.school,
        incident: incident._id,
        stepOrder: step?.order || null,
        channel: 'portal',
        subject: `${behaviorType?.name || 'Behavior'} - step ${step?.order || 1}`,
        body: step?.summary || step?.title || '',
        status: approvalCleared && showInPortal ? 'visible' : 'suppressed',
        blockedReason: approvalCleared
            ? (showInPortal ? null : 'STEP_HIDDEN_FROM_PORTAL')
            : 'AWAITING_APPROVAL',
        recipients: [],
        cc: []
    }));

    const emailDraft = written.find((row) => row.channel === 'email') || null;
    incident.emailDraft = emailDraft ? {
        language: emailDraft.language,
        subject: emailDraft.subject,
        body: emailDraft.body,
        recipients: emailDraft.recipients,
        cc: emailDraft.cc,
        missingParentEmail: emailWanted && recipients.length === 0,
        templateKey: emailDraft.subject ? (step?.emailTemplateKey || 'parent-notification') : null,
        readyAt
    } : incident.emailDraft;
    if (approvalCleared && showInPortal) incident.portalReleased = true;
    await incident.save();

    await recordBehaviorAudit({
        schoolId: incident.school,
        action: BEHAVIOR_AUDIT_ACTIONS.NOTIFICATION_DRAFTED,
        actor,
        incidentId: incident._id,
        after: {
            rows: written.map((row) => ({ channel: row.channel, status: row.status })),
            missingParentEmail: incident.emailDraft?.missingParentEmail === true
        }
    });

    return { notifications: written, missingParentEmail: incident.emailDraft?.missingParentEmail === true };
};
