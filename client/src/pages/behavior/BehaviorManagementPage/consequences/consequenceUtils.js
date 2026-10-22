/** Mirrors the server's word rule so the on-screen counter matches the check. */
export const countWords = (text = '') => String(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;

export const formatDate = (value, locale) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

export const formatDateTime = (value, locale) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/** Local <input type="datetime-local"> value for a timestamp. */
export const toDateTimeInput = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const toIsoDateInput = (value = new Date()) => toDateTimeInput(value).slice(0, 10);

/**
 * "3h" style waiting time for the approval queue. Avoids `count`: i18next would
 * demand plural forms. `now` is captured once per fetch so render stays pure.
 */
export const formatElapsed = (from, t, now = 0) => {
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return '';
    const minutes = Math.max(Math.round((now - start.getTime()) / 60000), 0);
    if (minutes < 60) return t('common.elapsedMinutes', { value: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('common.elapsedHours', { value: hours });
    return t('common.elapsedDays', { value: Math.floor(hours / 24) });
};

export const elapsedHours = (from, now = 0) => {
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return 0;
    return Math.max((now - start.getTime()) / 3600000, 0);
};

export const isOverdue = (dueAt, status, now) => Boolean(dueAt)
    && status !== 'completed'
    && status !== 'waived'
    && new Date(dueAt).getTime() < now;

export const studentLabel = (student) => {
    if (!student) return '';
    if (typeof student === 'string') return student;
    const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
    return student.studentId ? `${name} (${student.studentId})` : name;
};

/**
 * Fills {{token}} placeholders for the draft preview. The preview is indicative:
 * the server renders the text that is actually sent.
 */
export const fillTemplateTokens = (template = '', variables = {}) => String(template)
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key] ?? '') : ''
    ));

export const STATUS_TONE = {
    logged: 'secondary',
    pending_approval: 'warning',
    approved: 'success',
    notified: 'success',
    in_progress: 'warning',
    closed: 'success',
    consequence_rejected: 'danger',
    voided: 'secondary',
    merged: 'secondary'
};

export const TASK_TONE = {
    assigned: 'secondary',
    submitted: 'warning',
    needs_revision: 'danger',
    completed: 'success',
    overdue: 'danger',
    waived: 'secondary'
};
