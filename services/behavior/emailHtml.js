/**
 * The family-facing shell for one behavior email.
 *
 * Only the shell belongs to us. The subject and body come from the school's own
 * ladder template — or from an approver's edit of it — and are escaped before
 * they are placed, so nothing a school types can become markup.
 */

const FONT = "'Segoe UI', Roboto, Tahoma, Arial, sans-serif";

const COLORS = {
    page: '#eef2f7',
    card: '#ffffff',
    header: '#0f172a',
    eyebrow: '#5eead4',
    ink: '#0f172a',
    body: '#334155',
    muted: '#64748b',
    faint: '#94a3b8',
    line: '#e2e8f0',
    accent: '#0f766e'
};

// A parent reading Arabic should not get an English sentence wedged into the
// middle of it, so the chrome is translated even though the message is not.
const CHROME = {
    en: {
        schoolLine: (school) => `${school} · Behavior and communication`,
        footer: 'This notice was released by the school after review.',
        reply: 'Questions about it belong with the school office.'
    },
    ar: {
        schoolLine: (school) => `${school} · السلوك والتواصل`,
        footer: 'صدر هذا الإشعار من المدرسة بعد المراجعة.',
        reply: 'أي سؤال عن هذا الإشعار يُوجَّه إلى إدارة المدرسة.'
    }
};

const HEX_COLOR = /^#[0-9a-fA-F]{3,6}$/;
// A relative or http logo path is meaningless to a mail client, and a broken
// image is worse than no image.
const ABSOLUTE_LOGO = /^https:\/\/\S+$/i;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Blank lines start a new paragraph; a single newline is a line break inside it.
const toParagraphs = (text) => String(text || '')
    .trim()
    .split(/\n{2,}/)
    .filter((block) => block.trim())
    .map((block) => `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${COLORS.body}">`
        + `${block.split('\n').map(escapeHtml).join('<br />')}</p>`)
    .join('\n');

const chromeFor = (language) => CHROME[language === 'ar' ? 'ar' : 'en'];

// Gmail shows whatever text follows the subject line; without this it grabs the
// first words of the message body.
const preheader = (subject) => {
    const text = String(subject || '').trim().slice(0, 140);
    if (!text) return '';
    return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};">${escapeHtml(text)}</div>`;
};

export const renderBehaviorEmailHtml = ({
    subject = '',
    body = '',
    language = 'en',
    school = null
} = {}) => {
    const rtl = language === 'ar';
    const dir = rtl ? 'rtl' : 'ltr';
    const align = rtl ? 'right' : 'left';
    const chrome = chromeFor(language);
    const schoolName = String(school?.name || '').trim();
    const accent = HEX_COLOR.test(String(school?.branding?.primaryColor || ''))
        ? school.branding.primaryColor
        : COLORS.accent;
    const logo = ABSOLUTE_LOGO.test(String(school?.branding?.logoUrl || ''))
        ? school.branding.logoUrl
        : '';
    // Letter-spacing and capitalisation are Latin-only tricks; on Arabic they
    // break the joined script apart.
    const eyebrowStyle = rtl
        ? 'margin:0 0 10px;font-size:13px;font-weight:700;color:' + COLORS.eyebrow
        : 'margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:' + COLORS.eyebrow;
    const paragraphs = toParagraphs(body);

    return `<!doctype html>
<html dir="${dir}" lang="${language}">
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding:28px 12px;">
${preheader(subject)}
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" dir="${dir}" lang="${language}" style="width:100%;max-width:600px;text-align:${align};direction:${dir};font-family:${FONT};color:${COLORS.ink};background-color:${COLORS.card};border:1px solid ${COLORS.line};border-top:4px solid ${accent};border-radius:16px;overflow:hidden;">
<tr><td bgcolor="${COLORS.header}" style="background-color:${COLORS.header};padding:26px 30px;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(schoolName)}" width="44" height="44" style="display:block;width:44px;height:44px;object-fit:contain;border-radius:9px;margin-bottom:14px;">` : ''}
${schoolName ? `<p style="${eyebrowStyle};text-align:${align};">${escapeHtml(chrome.schoolLine(schoolName))}</p>` : ''}
<h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:700;color:#ffffff;text-align:${align};">${escapeHtml(subject)}</h1>
</td></tr>
<tr><td style="padding:28px 30px 8px;background-color:${COLORS.card};">
${paragraphs}
</td></tr>
<tr><td style="padding:18px 30px 24px;background-color:${COLORS.card};border-top:1px solid ${COLORS.line};">
<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${COLORS.muted};text-align:${align};">${escapeHtml(chrome.footer)}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.faint};text-align:${align};">${escapeHtml(chrome.reply)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

export default renderBehaviorEmailHtml;
