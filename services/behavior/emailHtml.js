/**
 * The family-facing body of one behavior email.
 *
 * Only the content belongs here. The subject and body come from the school's own
 * ladder template — or from an approver's edit of it — and every string is
 * escaped before it is placed, so nothing a school types can become markup.
 * The school→family chrome lives in helpers/schoolEmailShell.js so a parent sees
 * one look per school, not one per module.
 */

import { emailParagraphs, isRtl, renderSchoolEmailShell } from '../../helpers/schoolEmailShell.js';

// A parent reading Arabic should not get an English sentence wedged into the
// middle of it, so the chrome is translated even though the message is not.
const CHROME = {
    en: {
        eyebrow: 'Behavior and communication',
        footer: [
            'This notice was released by the school after review.',
            'Questions about it belong with the school office.'
        ]
    },
    ar: {
        eyebrow: 'السلوك والتواصل',
        footer: [
            'صدر هذا الإشعار من المدرسة بعد المراجعة.',
            'أي سؤال عن هذا الإشعار يُوجَّه إلى إدارة المدرسة.'
        ]
    }
};

export const renderBehaviorEmailHtml = ({
    subject = '',
    body = '',
    language = 'en',
    school = null
} = {}) => {
    const chrome = CHROME[isRtl(language) ? 'ar' : 'en'];

    return renderSchoolEmailShell({
        language,
        school,
        subject,
        eyebrow: chrome.eyebrow,
        bodyHtml: emailParagraphs(body),
        footer: chrome.footer
    });
};

export default renderBehaviorEmailHtml;
