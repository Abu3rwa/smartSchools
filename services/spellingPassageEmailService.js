import {
    TONES,
    block,
    button,
    escapeHtml,
    formatEmailDate,
    noteBlock,
    paragraph,
    sanitizeSpellingEmailHtml,
    sectionTitle,
    wordChips,
    wrapSpellingEmail
} from '../helpers/spellingEmailLayout.js';

const MARK_STYLE = `background:${TONES.warning.border};color:${TONES.warning.text};padding:1px 4px;border-radius:4px;font-weight:700;`;

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
        escaped = escaped.replace(pattern, `<mark style="${MARK_STYLE}">$1</mark>`);
    });

    return escaped;
};

export function buildSpellingPassageEmail({ passage, session, studentName = '', portalUrl = '' }) {
    const missedWords = passage.missedWords || [];
    const name = String(studentName || '').trim();
    const isSentenceList = passage.style === 'sentence-list';
    const lines = String(passage.content || '').split('\n').filter(Boolean);
    const highlightedContent = isSentenceList
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines.map((line, index) => `<tr><td width="28" style="${index < lines.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}padding:10px 0;font-size:16px;line-height:1.7;font-weight:700;color:#94a3b8;vertical-align:top">${index + 1}.</td><td style="${index < lines.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}padding:10px 0;font-size:16px;line-height:1.7;color:#0f172a;vertical-align:top">${highlightMissedWords(line, missedWords)}</td></tr>`).join('')}</table>`
        : lines.map((line) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#0f172a">${highlightMissedWords(line, missedWords)}</p>`).join('');
    const completedDate = formatEmailDate(session.completedAt || session.startedAt);
    const kindLabel = isSentenceList ? 'practice sentences' : 'practice passage';
    const subject = `${isSentenceList ? 'Practice sentences' : 'Practice passage'}${name ? ` for ${name}` : ''} (${completedDate})`;
    const text = `${isSentenceList ? 'Practice Sentences' : 'Practice Passage'}\n${name ? `For ${name}\n` : ''}From the spelling check on ${completedDate}\n\nWords to practice: ${missedWords.join(', ') || 'None'}\n\n${passage.content || ''}\n\nCopy this into your spelling notebook and practice it a few times before the next session.${portalUrl ? `\nOpen portal: ${portalUrl}` : ''}`;

    const bodyHtml = [
        paragraph(`Here ${isSentenceList ? 'are some' : 'is a short'} ${kindLabel} built around the words ${name ? `<strong>${escapeHtml(name.split(/\s+/)[0])}</strong>` : 'you'} missed in the last spelling check. The practice words are highlighted.`),
        sectionTitle('Words to practice'),
        block(wordChips(missedWords, TONES.warning, 'None'), 16),
        sectionTitle(isSentenceList ? 'Practice sentences' : 'Practice passage'),
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td bgcolor="#f8fafc" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${TONES.accent.strong};border-radius:10px;padding:18px 22px 8px">${highlightedContent}</td></tr></table>`,
        noteBlock('<strong>How to practice:</strong> read it aloud once, copy it into your spelling notebook, then cover the highlighted words and write them again from memory. Repeat a few times before the next session.', TONES.accent),
        button(portalUrl, 'Open spelling portal')
    ].join('');

    const html = sanitizeSpellingEmailHtml(wrapSpellingEmail({
        preheader: `${missedWords.length} ${missedWords.length === 1 ? 'word' : 'words'} to practice from the spelling check on ${completedDate}.`,
        eyebrow: 'Spelling practice',
        title: isSentenceList ? 'Your practice sentences' : 'Your practice passage',
        subtitle: [name ? `For ${name}` : '', completedDate ? `From the spelling check on ${completedDate}` : ''].filter(Boolean).join(' · '),
        bodyHtml,
        footer: 'This passage was generated automatically to support spelling practice. It is not a graded assignment.'
    }));

    return { subject, html, text };
}
