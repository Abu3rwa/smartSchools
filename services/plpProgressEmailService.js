import { buildFamilySafeProgressUpdate } from './plpPrivacyService.js';

const EMAIL_FIELDS = [
    { email: 'parentInfo.fatherEmail', name: 'parentInfo.fatherName', type: 'father' },
    { email: 'parentInfo.motherEmail', name: 'parentInfo.motherName', type: 'mother' },
    { email: 'parentInfo.guardianEmail', name: 'parentInfo.guardianName', type: 'guardian' },
    { email: 'studentEmail', type: 'student' },
    { email: 'email', type: 'student' },
    { email: 'user.email', type: 'student' },
];

const getValue = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
}[character]));

export const buildPlpEmailRecipientCandidates = (student, consents = []) => {
    const consentByEmail = new Map(
        consents.map((consent) => [String(consent.recipientEmail).trim().toLowerCase(), consent])
    );
    const candidates = new Map();
    for (const { email: emailField, name: nameField, type } of EMAIL_FIELDS) {
        const email = String(getValue(student, emailField) || '').trim().toLowerCase();
        if (!email) continue;
        const consent = consentByEmail.get(email);
        if (consent && !consent.optedIn && consent.revokedAt) continue;
        if (!candidates.has(email)) candidates.set(email, {
            email,
            type,
            name: type === 'student'
                ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
                : String(getValue(student, nameField) || type).trim(),
            optedIn: Boolean(consent?.optedIn),
        });
    }
    return Array.from(candidates.values());
};

export const getPlpEmailDeliveryAttempt = (previous, { resend = false, now = Date.now() } = {}) => {
    if (previous?.status === 'sent' && !resend) {
        return { blocked: true, reason: 'duplicate_blocked', attempt: previous.attempt };
    }
    if (previous?.status === 'sending' && now - new Date(previous.startedAt).getTime() < 10 * 60 * 1000) {
        return { blocked: true, reason: 'sending', attempt: previous.attempt };
    }
    return { blocked: false, reason: '', attempt: (previous?.attempt || 0) + 1 };
};

export const buildPlpProgressEmail = ({ student, record, goals, tasks }) => {
    const update = buildFamilySafeProgressUpdate({ student, record, goals, tasks });
    const studentName = update.studentName.replace(/[\r\n]+/g, ' ').slice(0, 120);
    const roundTitle = update.roundTitle.replace(/[\r\n]+/g, ' ').slice(0, 120);
    const subject = `${studentName}'s PLP progress update - ${roundTitle}`;
    const lines = [
        `Hello,`,
        ``,
        `Here is ${studentName}'s Personal Learning Plan update for ${roundTitle} (${update.academicYear}).`,
        ``,
        'Goals:',
        ...(update.goals.length
            ? update.goals.map((goal) => `- ${goal.title} - ${goal.status}${goal.successCriteria ? `; success criteria: ${goal.successCriteria}` : ''}`)
            : ['No goals are recorded for this reporting period.']),
        ``,
        'Next tasks:',
        ...(update.nextTasks.length
            ? update.nextTasks.map((task) => `- ${task.title}${task.dueDate ? ` - due ${new Date(task.dueDate).toLocaleDateString('en-GB', { timeZone: 'UTC' })}` : ''}${task.instructions ? `; ${task.instructions}` : ''}`)
            : ['No outstanding tasks.']),
        ``,
        "This update was shared by the student's teacher.",
    ];
    const text = lines.join('\n');
    const html = `<div>${lines.map((line) => line ? `<p>${escapeHtml(line)}</p>` : '<br>').join('')}</div>`;
    return { subject, text, html };
};
