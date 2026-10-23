/**
 * The shared shell for school-to-family email.
 *
 * Behaviour notices, PLP progress updates and any future family email render
 * through this so a parent sees one look per school, not one per module. Only
 * the chrome is here: every caller supplies already-selected content, and the
 * shell escapes whatever it is handed.
 */

export const EMAIL_FONT = "'Segoe UI', Roboto, Tahoma, Arial, sans-serif";

export const EMAIL_COLORS = {
    page: '#eef2f7',
    card: '#ffffff',
    header: '#0f172a',
    eyebrow: '#5eead4',
    ink: '#0f172a',
    body: '#334155',
    muted: '#64748b',
    faint: '#94a3b8',
    line: '#e2e8f0',
    panel: '#f8fafc',
    accent: '#0f766e'
};

const HEX_COLOR = /^#[0-9a-fA-F]{3,6}$/;
// A relative or http logo path is meaningless to a mail client, and a broken
// image is worse than no image.
const ABSOLUTE_LOGO = /^https:\/\/\S+$/i;

export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const isRtl = (language) => language === 'ar';

export const emailParagraphs = (text) => String(text || '')
    .trim()
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:${EMAIL_COLORS.body};">`
        + `${paragraph.split('\n').map(escapeHtml).join('<br />')}</p>`)
    .join('\n');

export const emailSectionTitle = (title) => `<p style="margin:24px 0 10px;font-size:12px;font-weight:700;`
    + `letter-spacing:0.8px;color:${EMAIL_COLORS.muted};">${escapeHtml(title)}</p>`;

/**
 * A two-column label/value list. Built from tables because mail clients ignore
 * flex and grid entirely.
 */
export const emailDetailRows = (rows) => {
    const visible = rows.filter((row) => String(row?.value ?? '') !== '');
    if (!visible.length) return '';
    const cells = visible.map((row, index) => {
        const edge = index < visible.length - 1 ? `border-bottom:1px solid ${EMAIL_COLORS.line};` : '';
        return `<tr>`
            + `<td style="${edge}padding:10px 14px;font-size:13px;color:${EMAIL_COLORS.muted};vertical-align:top;">${escapeHtml(row.label)}</td>`
            + `<td style="${edge}padding:10px 14px;font-size:14px;font-weight:600;color:${row.color || EMAIL_COLORS.ink};vertical-align:top;">${escapeHtml(row.value)}</td>`
            + `</tr>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `
        + `bgcolor="${EMAIL_COLORS.panel}" style="margin:0 0 20px;background-color:${EMAIL_COLORS.panel};`
        + `border:1px solid ${EMAIL_COLORS.line};border-radius:10px;border-collapse:separate;">${cells}</table>`;
};

const preheader = (subject) => {
    const text = String(subject || '').trim().slice(0, 140);
    if (!text) return '';
    // Gmail shows whatever follows the subject; without this it grabs the first
    // words of the message.
    return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;`
        + `font-size:1px;line-height:1px;color:${EMAIL_COLORS.page};">${escapeHtml(text)}</div>`;
};

/**
 * Letter-spacing and capitalisation are Latin-only tricks; on Arabic they pull
 * the joined script apart, so the eyebrow is styled per direction.
 */
const eyebrowStyle = (rtl) => rtl
    ? `margin:0 0 10px;font-size:13px;font-weight:700;color:${EMAIL_COLORS.eyebrow};`
    : `margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${EMAIL_COLORS.eyebrow};`;

export const renderSchoolEmailShell = ({
    language = 'en',
    school = null,
    subject = '',
    eyebrow = '',
    bodyHtml = '',
    footer = []
} = {}) => {
    const rtl = isRtl(language);
    const dir = rtl ? 'rtl' : 'ltr';
    const align = rtl ? 'right' : 'left';
    const schoolName = String(school?.name || '').trim();
    const accent = HEX_COLOR.test(String(school?.branding?.primaryColor || ''))
        ? school.branding.primaryColor
        : EMAIL_COLORS.accent;
    const logo = ABSOLUTE_LOGO.test(String(school?.branding?.logoUrl || ''))
        ? school.branding.logoUrl
        : '';
    const footerLines = (Array.isArray(footer) ? footer : [footer])
        .map((line) => String(line || '').trim())
        .filter(Boolean);

    return `<!doctype html>
<html dir="${dir}" lang="${language}">
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.page}" style="background-color:${EMAIL_COLORS.page};">
<tr><td align="center" style="padding:28px 12px;">
${preheader(subject)}
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" dir="${dir}" lang="${language}" style="width:100%;max-width:600px;text-align:${align};direction:${dir};font-family:${EMAIL_FONT};color:${EMAIL_COLORS.ink};background-color:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.line};border-top:4px solid ${accent};border-radius:16px;overflow:hidden;">
<tr><td bgcolor="${EMAIL_COLORS.header}" style="background-color:${EMAIL_COLORS.header};padding:26px 30px;">
${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(schoolName)}" width="44" height="44" style="display:block;width:44px;height:44px;object-fit:contain;border-radius:9px;margin-bottom:14px;">` : ''}
${schoolName || eyebrow ? `<p style="${eyebrowStyle(rtl)}text-align:${align};">${escapeHtml([schoolName, eyebrow].filter(Boolean).join(' · '))}</p>` : ''}
<h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:700;color:#ffffff;text-align:${align};">${escapeHtml(subject)}</h1>
</td></tr>
<tr><td style="padding:28px 30px 8px;background-color:${EMAIL_COLORS.card};">
${bodyHtml}
</td></tr>
${footerLines.length ? `<tr><td style="padding:18px 30px 24px;background-color:${EMAIL_COLORS.card};border-top:1px solid ${EMAIL_COLORS.line};">
${footerLines.map((line, index) => `<p style="margin:0 0 ${index === footerLines.length - 1 ? '0' : '6px'};font-size:12px;line-height:1.6;color:${index ? EMAIL_COLORS.faint : EMAIL_COLORS.muted};text-align:${align};">${escapeHtml(line)}</p>`).join('\n')}
</td></tr>` : ''}
</table>
</td></tr>
</table>
</body>
</html>`;
};
