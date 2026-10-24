/**
 * The family-facing body of one behavior email.
 *
 * Only the content belongs here. The subject and body come from the school's own
 * ladder template — or from an approver's edit of it — and every string is
 * escaped before it is placed, so nothing a school types can become markup.
 * The school→family chrome lives in helpers/schoolEmailShell.js so a parent sees
 * one look per school, not one per module.
 *
 * The letter is prose, but a parent scanning it needs the facts of the incident in
 * one place, so the row's stored facts are laid out as a summary panel above it —
 * the same panel the PLP progress notice uses. Facts first, because this is a
 * notice with an action in it, not a conversation.
 */

import {
    emailDetailRows,
    emailParagraphs,
    emailSectionTitle,
    isRtl,
    renderSchoolEmailShell,
    schoolAccent
} from '../../helpers/schoolEmailShell.js';

// A parent reading Arabic should not get an English sentence wedged into the
// middle of it, so the chrome is translated even though the message is not.
const CHROME = {
    en: {
        eyebrow: 'Behavior and communication',
        summary: 'At a glance',
        labels: {
            student: 'Student',
            school: 'School',
            date: 'Incident date',
            behavior: 'Behavior',
            nextStep: 'Next step',
            dueBy: 'Due by'
        },
        footer: [
            'This notice was released by the school after review.',
            'Questions about it belong with the school office.'
        ]
    },
    ar: {
        eyebrow: 'السلوك والتواصل',
        summary: 'لمحة سريعة',
        labels: {
            student: 'الطالب',
            school: 'المدرسة',
            date: 'تاريخ الموقف',
            behavior: 'السلوك',
            nextStep: 'الخطوة التالية',
            dueBy: 'المطلوب إنجازه قبل'
        },
        footer: [
            'صدر هذا الإشعار من المدرسة بعد المراجعة.',
            'أي سؤال عن هذا الإشعار يُوجَّه إلى إدارة المدرسة.'
        ]
    }
};

// Only the two lines a family has to act on are tinted, so the panel has one job.
const factRows = (facts, labels, color = null) => [
    { label: labels.student, value: facts?.student },
    { label: labels.school, value: facts?.school },
    { label: labels.date, value: facts?.date },
    { label: labels.behavior, value: facts?.behavior },
    { label: labels.nextStep, value: facts?.nextStep, color },
    { label: labels.dueBy, value: facts?.dueBy, color }
];

export const renderBehaviorEmailHtml = ({
    subject = '',
    body = '',
    language = 'en',
    school = null,
    facts = null
} = {}) => {
    const rtl = isRtl(language);
    const chrome = CHROME[rtl ? 'ar' : 'en'];
    const panel = emailDetailRows(factRows(facts, chrome.labels, schoolAccent(school)));

    const bodyHtml = [
        panel ? `${emailSectionTitle(chrome.summary)}${panel}` : '',
        emailParagraphs(body)
    ].filter(Boolean).join('\n');

    return renderSchoolEmailShell({
        language,
        school,
        subject,
        eyebrow: chrome.eyebrow,
        bodyHtml: `<div dir="${rtl ? 'rtl' : 'ltr'}" style="text-align:${rtl ? 'right' : 'left'};">`
            + `${bodyHtml}</div>`,
        footer: chrome.footer
    });
};

/**
 * The plain-text twin of the panel. A reader whose client ignores html still has to
 * see the step and its deadline, which the letter itself no longer repeats.
 */
export const renderBehaviorEmailText = ({ body = '', language = 'en', facts = null } = {}) => {
    const chrome = CHROME[isRtl(language) ? 'ar' : 'en'];
    const rows = factRows(facts, chrome.labels).filter((row) => String(row.value || '').trim());
    if (!rows.length) return body;
    // Same order as the html, so a reader on either part meets the facts first.
    return `${chrome.summary}\n${rows.map((row) => `- ${row.label}: ${row.value}`).join('\n')}\n\n${body}`;
};

export default renderBehaviorEmailHtml;
