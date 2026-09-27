import xss from 'xss';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Escape first, then highlight exact target-word matches in the safe text.
const highlightMissedWords = (text, words) => {
    let escaped = escapeHtml(text);
    const sortedWords = [...new Set(words || [])]
        .map((word) => String(word || '').trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);

    sortedWords.forEach((word) => {
        const escapedWord = escapeHtml(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!escapedWord) return;
        const pattern = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
        escaped = escaped.replace(pattern, '<mark style="background:#fff3b0;color:#5a4300;padding:1px 4px;border-radius:4px;font-weight:700;">$1</mark>');
    });

    return escaped;
};

export function buildSpellingPassageEmail({ passage, session, portalUrl = '' }) {
    const missedWords = passage.missedWords || [];
    const wordBadges = missedWords.map((word) => `<span style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;font-size:12px;font-weight:600;padding:5px 9px;border-radius:6px;margin:2px 4px 2px 0;">${escapeHtml(word)}</span>`).join('');
    const isSentenceList = passage.style === 'sentence-list';
    const highlightedContent = isSentenceList
        ? String(passage.content || '').split('\n').filter(Boolean).map((line, index) => `<div style="padding:8px 0;border-bottom:1px solid #f0f1f4;font-size:14px;line-height:1.6;color:#1a2436;"><span style="color:#9aa4b2;font-weight:600;margin-right:8px;">${index + 1}.</span>${highlightMissedWords(line, missedWords)}</div>`).join('')
        : `<div style="font-size:14px;line-height:1.9;color:#1a2436;">${highlightMissedWords(passage.content, missedWords)}</div>`;
    const completedDate = new Date(session.completedAt || session.startedAt).toLocaleDateString();
    const subject = `Practice passage - ${completedDate}`;
    const text = `Practice Passage\nFrom the spelling check on ${completedDate}\n\nWords to practice: ${missedWords.join(', ') || 'None'}\n\n${passage.content || ''}\n\nCopy this into your spelling notebook and practice it a few times before the next session.${portalUrl ? `\nOpen portal: ${portalUrl}` : ''}`;
    const html = xss(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;">
  <tr><td style="background:#4338ca;padding:28px 32px;">
    <div style="color:#ffffff;font-size:20px;font-weight:600;">Practice Passage</div>
    <div style="color:#e0e0fb;font-size:13px;padding-top:4px;">From the spelling check on ${escapeHtml(completedDate)}</div>
  </td></tr>
  <tr><td style="padding:20px 32px 4px;font-size:13px;color:#4a5568;">
    Use this ${isSentenceList ? 'set of practice sentences' : 'short passage'} to copy into your spelling notebook and practice the words below.
  </td></tr>
  <tr><td style="padding:16px 32px 4px;">
    <div style="font-size:13px;font-weight:700;color:#1a2436;margin-bottom:8px;">Words to practice</div>
    <div style="font-size:13px;line-height:1.8;">${wordBadges || '<span style="color:#6b7280;">None</span>'}</div>
  </td></tr>
  <tr><td style="padding:16px 32px 8px;">
    <div style="background:#f8f9fc;border:1px solid #e4e7f0;border-radius:8px;padding:18px 20px;">${highlightedContent}</div>
  </td></tr>
  <tr><td style="padding:4px 32px 4px;">
    <div style="background:#fff8e6;border:1px solid #f0dca0;border-radius:8px;padding:12px 14px;font-size:13px;color:#7a5b00;">Copy this into your spelling notebook and practice it a few times before the next session.</div>
  </td></tr>
  ${portalUrl ? `<tr><td style="padding:20px 32px 28px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4338ca;border-radius:6px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:11px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open Spelling Portal</a></td></tr></table></td></tr>` : ''}
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #eef0f4;"><div style="font-size:11px;color:#9aa4b2;">This passage was generated automatically to support spelling practice. It is not a graded assignment.</div></td></tr>
</table>
</td></tr></table>`, {
        whiteList: {
            table: ['role', 'width', 'cellpadding', 'cellspacing', 'style', 'align'],
            tr: [],
            td: ['style', 'width', 'align'],
            div: ['style'],
            span: ['style'],
            a: ['href', 'style'],
            mark: ['style']
        }
    });

    return { subject, html, text };
}
