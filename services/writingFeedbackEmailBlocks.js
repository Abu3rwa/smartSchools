/**
 * The two blocks that make writing feedback anchored: the student's own draft
 * with the teacher's note under the line it is about, and the class rubric read
 * as words instead of points. Pure string builders — no database, no network.
 * The quote matching and the verdict levels are the same ones the student sees
 * in the workspace, so the email and the screen never disagree.
 */
import { escapeHtml } from '../helpers/schoolEmailShell.js';
import { anchorEssay } from '../client/src/utils/writingAnchors.js';
import { rubricRows } from '../client/src/utils/writingRubric.js';

// Gmail clips a message around 100KB; a pasted novel must not push the button out.
const MAX_DRAFT_CHARS = 6000;

const lineHeight = (language, base = 1.6) => (language === 'ar' ? base + 0.2 : base);

const quoted = (text, language) => (language === 'ar' ? `«${text}»` : `“${text}”`);

const isAction = (note) => Boolean(note?.nextStep || (note?.improvements || []).length);

/**
 * Clip the draft to a sane email size, then anchor the quotes on what is left.
 * Whole paragraphs are kept; a cut one loses its highlight but keeps its note.
 */
export const prepareDraftRows = ({ paragraphs, notes, maxChars = MAX_DRAFT_CHARS }) => {
    const rows = [];
    let budget = maxChars;
    let truncated = false;

    for (const paragraph of paragraphs || []) {
        if (budget <= 0) {
            truncated = true;
            break;
        }
        const text = String(paragraph.text || '');
        if (text.length > budget) {
            truncated = true;
            rows.push({ ...paragraph, text: `${text.slice(0, budget).trimEnd()}…` });
        } else {
            rows.push({ ...paragraph, text });
        }
        budget -= text.length;
    }

    return { rows: anchorEssay(rows, notes), truncated };
};

const highlightHtml = (segment, action) => {
    const background = action ? '#fde68a' : '#99f6e4';
    const color = action ? '#b45309' : '#0f766e';
    return `<span style="background-color:${background};padding:1px 3px;border-radius:3px;">${escapeHtml(segment.text)}</span>`
        + `<sup style="color:${color};font-weight:800;font-size:11px;">${segment.mark}</sup>`;
};

const paragraphHtml = (row, language) => {
    const body = row.segments
        .map((segment) => (segment.mark === null
            ? escapeHtml(segment.text)
            : highlightHtml(segment, isAction(row.note))))
        .join('');
    return '<tr>'
        + `<td dir="auto" style="padding:12px 14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:${lineHeight(language, 1.7)};color:#0f172a;text-align:start;">${body}</td>`
        + '</tr>';
};

const commentHtml = (row, language, copy) => {
    const note = row.note;
    if (!note) return '';
    const action = note.nextStep || (note.improvements || []).join(' · ');
    const strengths = (note.strengths || []).join(' · ');
    const good = !action && strengths;
    const accent = good ? '#059669' : '#0f766e';
    const badge = row.number > 0
        ? `<span style="display:inline-block;width:18px;height:18px;border-radius:9px;background-color:${accent};color:#ffffff;font-size:10px;text-align:center;line-height:18px;">${row.number}</span> `
        : '';
    const heading = [note.label, action ? copy.tryThisLabel : copy.workedLabel]
        .filter(Boolean)
        .join(' · ');

    const lines = [];
    if (strengths && action) lines.push(`${copy.workedLabel}: ${strengths}`);
    if (action) lines.push(`${copy.tryThisLabel}: ${action}`);
    else if (strengths) lines.push(strengths);
    if (note.why) lines.push(note.why);
    // No highlight survived the clip, so the note carries its own quote.
    if (row.number === 0 && note.evidence) lines.unshift(quoted(note.evidence, language));

    const side = language === 'ar' ? 'right' : 'left';
    const radius = language === 'ar' ? '10px 0 0 10px' : '0 10px 10px 0';
    return '<tr><td style="padding:6px 0 0;">'
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${good ? '#ecfdf5' : '#f0fdfa'};border-${side}:3px solid ${accent};border-radius:${radius};">`
        + '<tr><td style="padding:10px 14px;">'
        + `<p dir="auto" style="margin:0 0 4px;font-size:11px;font-weight:700;color:${accent};${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${badge}${escapeHtml(heading)}</p>`
        + lines.map((line) => `<p dir="auto" style="margin:0 0 3px;font-size:13px;line-height:${lineHeight(language)};color:${good ? '#065f46' : '#134e4a'};text-align:start;">${escapeHtml(line)}</p>`).join('')
        + '</td></tr></table></td></tr>';
};

export const draftHtml = ({ rows, language, copy, truncated = false }) => {
    if (!rows.length) return '';
    const blocks = rows.map((row) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">'
        + paragraphHtml(row, language)
        + commentHtml(row, language, copy)
        + '</table>').join('');
    return blocks + (truncated
        ? `<p style="margin:0 0 4px;font-size:12px;line-height:${lineHeight(language)};color:#64748b;">${escapeHtml(copy.draftTruncated)}</p>`
        : '');
};

export const draftText = ({ rows, language = 'en', copy, truncated = false }) => {
    if (!rows.length) return '';
    const blocks = rows.map((row) => {
        const lines = [row.text];
        const note = row.note;
        if (note) {
            const action = note.nextStep || (note.improvements || []).join(' · ');
            const strengths = (note.strengths || []).join(' · ');
            const heading = [note.label, action ? copy.tryThisLabel : copy.workedLabel].filter(Boolean).join(' · ');
            lines.push(`${row.number > 0 ? `[${row.number}] ` : ''}${heading}`);
            if (row.number === 0 && note.evidence) lines.push(`  ${quoted(note.evidence, language)}`);
            if (strengths) lines.push(`  ${copy.workedLabel}: ${strengths}`);
            if (action) lines.push(`  ${copy.tryThisLabel}: ${action}`);
            if (note.why) lines.push(`  ${note.why}`);
        }
        return lines.join('\n');
    });
    return blocks.join('\n\n') + (truncated ? `\n\n${copy.draftTruncated}` : '');
};

const verdictColor = (level) => (level === 'strong' ? '#047857' : '#b45309');

export const rubricHtml = ({ scores, language, copy }) => {
    const rows = rubricRows(scores);
    if (!rows.length) return '';

    const cells = rows.map((row) => {
        const strong = row.level === 'strong';
        const text = row.evidence ? quoted(row.evidence, language) : row.explanation;
        return `<td width="50%" valign="top" style="padding:10px 12px;border:1px solid ${strong ? '#cdeae6' : '#e2e8f0'};border-radius:10px;background-color:${strong ? '#f0fdfa' : '#f8fafc'};">`
            + `<p dir="auto" style="margin:0 0 3px;font-size:12px;font-weight:700;color:#0f172a;text-align:start;">${escapeHtml(row.label)}</p>`
            + `<p style="margin:0;font-size:11px;font-weight:700;color:${verdictColor(row.level)};${language === 'ar' ? '' : 'letter-spacing:.5px;text-transform:uppercase;'}">${escapeHtml(copy.rubricLevel[row.level])}</p>`
            + (text ? `<p dir="auto" style="margin:6px 0 0;font-size:12px;line-height:${lineHeight(language, 1.5)};color:#334155;text-align:start;">${escapeHtml(text)}</p>` : '')
            + '</td>';
    });

    const pairs = [];
    for (let index = 0; index < cells.length; index += 2) {
        pairs.push(`<tr>${cells[index]}${cells[index + 1] || '<td width="50%"></td>'}</tr>`);
    }
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:6px;">'
        + pairs.join('')
        + '</table>';
};

export const rubricText = ({ scores, language = 'en', copy }) => {
    const rows = rubricRows(scores);
    if (!rows.length) return '';
    return rows.map((row) => {
        const text = row.evidence ? quoted(row.evidence, language) : row.explanation;
        return `- ${row.label}: ${copy.rubricLevel[row.level]}${text ? ` — ${text}` : ''}`;
    }).join('\n');
};