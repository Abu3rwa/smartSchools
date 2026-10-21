import xss from 'xss';

export const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const COLORS = {
    navy: '#0f172a',
    ink: '#0f172a',
    body: '#334155',
    muted: '#64748b',
    faint: '#94a3b8',
    line: '#e2e8f0',
    panel: '#f8fafc',
    accent: '#0d9488',
    accentDark: '#0f766e',
    accentSoft: '#f0fdfa',
    accentBorder: '#ccfbf1',
    eyebrow: '#5eead4'
};

export const TONES = {
    success: { text: '#166534', bg: '#dcfce7', border: '#bbf7d0', strong: '#16834a' },
    danger: { text: '#991b1b', bg: '#fee2e2', border: '#fecaca', strong: '#dc2626' },
    warning: { text: '#92400e', bg: '#fffbeb', border: '#fde68a', strong: '#d97706' },
    neutral: { text: COLORS.ink, bg: COLORS.panel, border: COLORS.line, strong: COLORS.ink },
    accent: { text: COLORS.accentDark, bg: COLORS.accentSoft, border: COLORS.accentBorder, strong: COLORS.accentDark }
};

export const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const formatEmailDate = (value, options = {}) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...options });
};

export const sectionTitle = (title, hint = '') => `<p style="margin:0 0 ${hint ? '2px' : '10px'};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted}">${escapeHtml(title)}</p>${hint ? `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(hint)}</p>` : ''}`;

export const paragraph = (html) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${COLORS.body}">${html}</p>`;

export const block = (html, bottom = 24) => `<div style="margin:0 0 ${bottom}px">${html}</div>`;

export const noteBlock = (html, tone = TONES.warning) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td bgcolor="${tone.bg}" style="background:${tone.bg};border:1px solid ${tone.border};border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;color:${tone.text}">${html}</td></tr></table>`;

// Trailing &nbsp; keeps chips from running together in clients that drop inline-block margins.
export const wordChips = (words, tone = TONES.warning, emptyText = 'None') => {
    if (!words.length) return `<span style="font-size:14px;color:${COLORS.muted}">${escapeHtml(emptyText)}</span>`;
    return words
        .map((word) => `<span style="display:inline-block;margin:0 4px 8px 0;padding:6px 12px;border-radius:999px;background:${tone.bg};border:1px solid ${tone.border};font-size:14px;font-weight:600;color:${tone.text}">${escapeHtml(word)}</span>&nbsp;`)
        .join('');
};

export const resultPill = (correct) => {
    const tone = correct ? TONES.success : TONES.danger;
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${tone.bg};font-size:12px;font-weight:700;color:${tone.text}">${correct ? 'Correct' : 'Incorrect'}</span>`;
};

export const detailsPanel = (rows) => {
    const visible = rows.filter((row) => row.value !== '' && row.value !== null && row.value !== undefined);
    if (!visible.length) return '';
    const cells = visible.map((row, index) => {
        const border = index < visible.length - 1 ? `border-bottom:1px solid ${COLORS.line};` : '';
        return `<tr><td width="120" style="${border}padding:12px 16px;font-size:13px;color:${COLORS.muted};vertical-align:top">${escapeHtml(row.label)}</td><td style="${border}padding:12px 16px;font-size:14px;font-weight:600;color:${row.color || COLORS.ink};vertical-align:top">${escapeHtml(row.value)}</td></tr>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.panel}" style="margin:0 0 24px;background:${COLORS.panel};border:1px solid ${COLORS.line};border-radius:10px;border-collapse:separate">${cells}</table>`;
};

export const statTiles = (tiles) => {
    const gapPct = 3;
    const width = Math.floor((100 - gapPct * (tiles.length - 1)) / tiles.length);
    const cells = tiles.map((tile, index) => {
        const tone = tile.tone || TONES.neutral;
        const gap = index < tiles.length - 1 ? `<td width="${gapPct}%" style="font-size:0;line-height:0">&nbsp;</td>` : '';
        return `<td width="${width}%" align="center" bgcolor="${tone.bg}" style="background:${tone.bg};border:1px solid ${tone.border};border-radius:10px;padding:16px 8px"><p style="margin:0;font-size:26px;line-height:1.1;font-weight:700;color:${tone.strong}">${escapeHtml(tile.value)}</p><p style="margin:6px 0 0;font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${tone.text}">${escapeHtml(tile.label)}</p></td>${gap}`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate"><tr>${cells}</tr></table>`;
};

export const scoreCard = ({ score, total, label = 'Score' }) => {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const filled = Math.max(0, Math.min(100, pct));
    const bar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>${filled > 0 ? `<td width="${filled}%" bgcolor="${COLORS.accent}" style="background:${COLORS.accent};height:8px;border-radius:999px;font-size:0;line-height:0">&nbsp;</td>` : ''}${filled < 100 ? `<td bgcolor="${COLORS.line}" style="background:${COLORS.line};height:8px;border-radius:999px;font-size:0;line-height:0">&nbsp;</td>` : ''}</tr></table>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td bgcolor="${COLORS.accentSoft}" style="background:${COLORS.accentSoft};border:1px solid ${COLORS.accentBorder};border-radius:12px;padding:20px 22px">
<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted}">${escapeHtml(label)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:34px;line-height:1.1;font-weight:700;color:${COLORS.ink}">${score}<span style="font-size:18px;font-weight:600;color:${COLORS.faint}"> / ${total}</span></td><td align="right" style="font-size:22px;font-weight:700;color:${COLORS.accentDark}">${pct}%</td></tr></table>
${bar}
</td></tr></table>`;
};

export const dataTable = (headers, rows) => {
    const th = headers.map((header) => `<td${header.align ? ` align="${header.align}"` : ''} bgcolor="${COLORS.panel}" style="background:${COLORS.panel};padding:10px 14px;border-bottom:1px solid ${COLORS.line};font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${COLORS.muted}">${escapeHtml(header.label)}</td>`).join('');
    const body = rows.map((cells, index) => {
        const border = index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.line};` : '';
        return `<tr>${cells.map((cell, cellIndex) => `<td${headers[cellIndex]?.align ? ` align="${headers[cellIndex].align}"` : ''} style="${border}padding:10px 14px;font-size:14px;color:${cellIndex === 0 ? COLORS.ink : COLORS.body};${cellIndex === 0 ? 'font-weight:600;' : ''}vertical-align:middle">${cell}</td>`).join('')}</tr>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid ${COLORS.line};border-radius:10px;border-collapse:separate"><tr>${th}</tr>${body}</table>`;
};

export const button = (url, label) => {
    if (!/^https?:\/\//i.test(String(url || ''))) return '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr><td bgcolor="${COLORS.accent}" style="background:${COLORS.accent};border-radius:8px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)} &rarr;</a></td></tr></table>`;
};

export const wrapSpellingEmail = ({ preheader = '', eyebrow, title, subtitle = '', bodyHtml, footer }) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9">
<tr><td align="center" style="padding:32px 12px">
${preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f1f5f9">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${FONT};color:${COLORS.ink}">
<tr><td bgcolor="${COLORS.navy}" style="background:${COLORS.navy};padding:28px 32px;border-radius:16px 16px 0 0">
<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${COLORS.eyebrow}">${escapeHtml(eyebrow)}</p>
<h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;color:#ffffff">${escapeHtml(title)}</h1>
${subtitle ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#cbd5e1">${escapeHtml(subtitle)}</p>` : ''}
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:28px 32px 32px;border-radius:0 0 16px 16px">
${bodyHtml}
</td></tr>
<tr><td align="center" style="padding:20px 24px 0;font-size:12px;line-height:1.5;color:${COLORS.faint}">${escapeHtml(footer || 'This is an automated spelling update. Sign in to the portal to view full details.')}</td></tr>
</table>
</td></tr>
</table>`;

const CSS_WHITELIST = {
    ...xss.getDefaultCSSWhiteList(),
    'line-height': true,
    'vertical-align': true,
    'white-space': true,
    overflow: true,
    opacity: true,
    'mso-hide': true
};

const TAG_WHITELIST = {
    table: ['role', 'width', 'cellpadding', 'cellspacing', 'border', 'bgcolor', 'style', 'align'],
    tr: [],
    td: ['style', 'width', 'align', 'bgcolor', 'aria-label'],
    div: ['style'],
    p: ['style'],
    h1: ['style'],
    span: ['style'],
    strong: ['style'],
    mark: ['style'],
    br: [],
    a: ['href', 'style']
};

export const sanitizeSpellingEmailHtml = (html) => xss(html, { whiteList: TAG_WHITELIST, css: { whiteList: CSS_WHITELIST } });
