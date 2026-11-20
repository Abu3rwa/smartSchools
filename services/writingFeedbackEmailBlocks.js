/**
 * The two blocks that make writing feedback anchored: the student's own draft
 * with the teacher's note under the line it is about, and the class rubric read
 * as words instead of points. Pure string builders — no database, no network.
 * The quote matching and the verdict levels are the same ones the student sees
 * in the workspace, so the email and the screen never disagree.
 */
import { escapeHtml } from '../helpers/schoolEmailShell.js';
import { anchorEssay } from '../client/src/utils/writingAnchors.js';
import { marksShowsNumbers, marksModeOf, rubricRows } from '../client/src/utils/writingRubric.js';
import {
    composeParagraphRuns,
    correctionsBySlot,
    resolveParagraphCorrections,
    sortCorrections,
} from '../client/src/utils/writingMechanics.js';

// Gmail clips a message around 100KB; a pasted novel must not push the button out.
const MAX_DRAFT_CHARS = 6000;
// Corrections must survive clipping; their own block stops at whole parts.
const MAX_LANGUAGE_HTML_CHARS = 40000;

const lineHeight = (language, base = 1.6) => (language === 'ar' ? base + 0.2 : base);

const quoted = (text, language) => (language === 'ar' ? `«${text}»` : `“${text}”`);

const isAction = (note) => Boolean(note?.nextStep || (note?.improvements || []).length);

/**
 * Clip the draft to a sane email size, then anchor the quotes on what is left.
 * Whole paragraphs are kept; a cut one loses its highlight but keeps its note.
 * Correction anchors are resolved on the full canonical paragraph first, so a
 * clipped paragraph can never paint a half spelling or the artificial ellipsis.
 */
export const prepareDraftRows = ({ paragraphs, notes, languageSections = [], maxChars = MAX_DRAFT_CHARS }) => {
    const annotated = resolveParagraphCorrections(
        paragraphs || [],
        correctionsBySlot(languageSections),
    );
    const rows = [];
    let budget = maxChars;
    let truncated = false;
    const shown = new Set();

    for (const paragraph of annotated) {
        if (budget <= 0) {
            truncated = true;
            break;
        }
        const text = String(paragraph.text || '');
        const clipped = text.length > budget
            ? `${text.slice(0, budget).trimEnd()}…`
            : text;
        if (text.length > budget) truncated = true;
        const visible = paragraph.mechanics.filter((row) => row.anchor.end <= text.slice(0, budget).trimEnd().length);
        const numbers = new Set(visible.map((row) => row.number));
        rows.push({
            ...paragraph,
            text: clipped,
            // Only fully displayed spans are painted; the rest stay in the list.
            mechanics: visible,
            hidden: paragraph.mechanicsList.some((row) => row.number && !numbers.has(row.number)),
        });
        shown.add(`${paragraph.key}:${Number(paragraph.index) || 0}`);
        budget -= text.length;
    }

    const labelBySlot = new Map((languageSections || []).map((section) => [
        `${section.key}:${Number(section.index) || 0}`,
        String(section.label || '').trim(),
    ]));
    const omitted = annotated.slice(rows.length)
        .filter((paragraph) => (paragraph.mechanicsList || []).length)
        .map((paragraph) => ({
            key: paragraph.key,
            index: Number(paragraph.index) || 0,
            label: labelBySlot.get(`${paragraph.key}:${Number(paragraph.index) || 0}`) || '',
            mechanicsList: paragraph.mechanicsList,
            mechanicsReview: paragraph.mechanicsReview || null,
        }));

    // A part whose draft row is gone still has published corrections; they are
    // listed without a span rather than dropped with the missing text.
    let next = annotated.reduce(
        (max, paragraph) => (paragraph.mechanicsList || [])
            .reduce((inner, row) => (row.number ? Math.max(inner, row.number) : inner), max),
        0,
    );
    for (const section of languageSections || []) {
        const slot = `${section?.key}:${Number(section?.index) || 0}`;
        if (shown.has(slot) || (section?.mechanics || []).length === 0) continue;
        omitted.push({
            key: section.key,
            index: Number(section.index) || 0,
            label: String(section.label || '').trim(),
            mechanicsList: sortCorrections(section.mechanics).map((row) => {
                if (!row?.category) return { ...row, number: null };
                next += 1;
                return { ...row, number: next };
            }),
            mechanicsReview: section.mechanicsReview || null,
        });
    }

    return { rows: anchorEssay(rows, notes), truncated, omitted };
};

const redText = (text) =>
    `<span style="background-color:#fee2e2;border-bottom:2px solid #dc2626;color:#7f1d1d;padding:0 1px;">${escapeHtml(text)}</span>`;

const correctionMarks = (numbers, copy) => numbers
    .map((number) => `<sup title="${escapeHtml(copy.languageNumber.replace('{{n}}', number))}" style="color:#b91c1c;font-weight:800;font-size:11px;">${number}</sup>`)
    .join('');

/** Both layers in one paragraph: the coaching mark and the red correction spans. */
const paragraphBodyHtml = (row, language, copy) => {
    const action = isAction(row.note);
    const runs = composeParagraphRuns({
        text: row.text,
        coachingSegments: row.segments,
        corrections: row.mechanics,
    });
    return runs
        .map((run, index) => {
            const next = runs[index + 1];
            // One number per correction, printed only where its red span ends,
            // so a coaching mark splitting the span cannot duplicate the digit.
            const ended = run.mechanics.filter(
                (number) => !next || !next.mechanics.includes(number),
            );
            // The number belongs to the word, not to the space before the next one.
            const gap = ended.length ? (run.text.match(/\s+$/) || [''])[0] : '';
            const words = gap ? run.text.slice(0, -gap.length) : run.text;
            const inner = run.mechanics.length ? redText(words) : escapeHtml(words);
            // The comment itself is the highlight; its note card sits right
            // under the paragraph, so the text carries no comment number.
            const coached = run.coachingMark === null
                ? inner
                : `<span style="background-color:${action ? '#fde68a' : '#99f6e4'};padding:1px 3px;border-radius:3px;">${inner}</span>`;
            return coached + correctionMarks(ended, copy) + escapeHtml(gap);
        })
        .join('');
};


const paragraphHtml = (row, language, copy) => {
    const body = paragraphBodyHtml(row, language, copy);
    return '<tr>'
        + `<td dir="auto" style="padding:12px 14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:${lineHeight(language, 1.7)};color:#0f172a;text-align:start;">${body}</td>`
        + '</tr>';
};

const categoryName = (copy, row) =>
    copy.languageCategory[row?.category] || copy.languageCategory.legacy;

/**
 * One part's corrections, always as text: the number, category, exact source,
 * the replacement (or the deletion wording) and the reason. `inline` numbers
 * are already painted in the paragraph; the rest say why no span is shown.
 */
const languageListItems = ({ mechanicsList = [], inline = new Set(), copy }) =>
    (mechanicsList || []).map((row) => {
        const legacy = !row?.category;
        const number = legacy ? null : row.number;
        const head = legacy
            ? categoryName(copy, row)
            : `${copy.languageNumber.replace('{{n}}', number)} — ${categoryName(copy, row)}`;
        const lines = [head];
        lines.push(`${copy.languageOriginal}: ${row?.original || ''}`);
        lines.push(
            `${copy.languageChange}: ${String(row?.correction ?? '') === '' ? copy.languageRemove : row.correction}`,
        );
        if (row?.explanation) lines.push(`${copy.languageWhy}: ${row.explanation}`);
        // A typed row whose exact span is not shown in this email keeps its
        // entry and says why there is no red text above it.
        if (!legacy && number && !inline.has(number)) {
            lines.push(copy.languageSourceNotShown);
        }
        return lines;
    });

const languageBlockHtml = ({ mechanicsList = [], mechanicsReview = null, inline = new Set(), copy, language }) => {
    const rows = languageListItems({ mechanicsList, inline, copy });
    const partial = mechanicsReview?.status === 'partial';
    const unavailable = mechanicsReview?.status === 'unavailable';
    const none = mechanicsReview?.status === 'checked' && !rows.length && !mechanicsList.length;
    if (!rows.length && !partial && !unavailable && !none) return '';
    const items = rows.map((lines) => {
        const [head, ...rest] = lines;
        return '<div style="margin:0 0 7px;">'
            + `<p dir="auto" style="margin:0 0 2px;font-size:12px;font-weight:700;color:#b91c1c;text-align:start;">${escapeHtml(head)}</p>`
            + rest
                .map((line) => `<p dir="auto" style="margin:0 0 1px;font-size:12px;line-height:${lineHeight(language)};color:#334155;text-align:start;">${escapeHtml(line)}</p>`)
                .join('')
            + '</div>';
    }).join('');
    const notice = partial
        ? `<p dir="auto" style="margin:4px 0 0;font-size:12px;line-height:${lineHeight(language)};color:#b45309;text-align:start;">${escapeHtml(copy.languagePartial)}</p>`
        : unavailable
            ? `<p dir="auto" style="margin:4px 0 0;font-size:12px;line-height:${lineHeight(language)};color:#64748b;text-align:start;">${escapeHtml(copy.languageUnavailable)}</p>`
            : none
                ? `<p dir="auto" style="margin:0;font-size:12px;line-height:${lineHeight(language)};color:#64748b;text-align:start;">${escapeHtml(copy.languageNone)}</p>`
                : '';
    return [
        `<h2 style="margin:8px 0 4px;font-size:12px;font-weight:700;color:#b91c1c;${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${escapeHtml(copy.languageTitle)}</h2>`,
        items,
        notice,
    ].join('');
};

export const languageHtml = ({ mechanicsList, mechanicsReview, inline = new Set(), copy, language }) => {
    const block = languageBlockHtml({ mechanicsList, mechanicsReview, inline, copy, language });
    if (!block) return '';
    const hint = (mechanicsList || []).length
        ? `<p dir="auto" style="margin:0 0 6px;font-size:12px;line-height:${lineHeight(language)};color:#0f766e;text-align:start;">${escapeHtml(copy.languageHint)}</p>`
        : '';
    return hint + block;
};

const commentHtml = (row, language, copy, languageRows = '') => {
    const note = row.note;
    if (!note) return '';
    const action = note.nextStep || (note.improvements || []).join(' · ');
    const strengths = (note.strengths || []).join(' · ');
    const good = !action && strengths;
    const accent = good ? '#059669' : '#0f766e';
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
        + `<h3 dir="auto" style="margin:0 0 4px;font-size:12px;font-weight:700;color:${accent};${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${escapeHtml(heading)}</h3>`
        + lines.map((line) => `<p dir="auto" style="margin:0 0 3px;font-size:13px;line-height:${lineHeight(language)};color:${good ? '#065f46' : '#134e4a'};text-align:start;">${escapeHtml(line)}</p>`).join('')
        + languageRows
        + '</td></tr></table></td></tr>';
};

const correctionCardHtml = ({ label = '', block }) => {
    if (!block) return '';
    return '<tr><td style="padding:6px 0 0;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;">'
        + '<tr><td style="padding:10px 14px;">'
        + (label
            ? `<p dir="auto" style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;text-align:start;">${escapeHtml(label)}</p>`
            : '')
        + block
        + '</td></tr></table></td></tr>';
};

/**
 * The draft with, under each part, the teacher's note and its language
 * corrections. Parts left out of the excerpt keep their corrections; the
 * language block is capped at whole parts so no row is ever cut in half.
 */
export const draftHtml = ({ rows, language, copy, truncated = false, omitted = [] }) => {
    if (!rows.length && !omitted.length) return '';
    let languageUsed = 0;
    let overflow = false;
    const spending = (mechanicsList, mechanicsReview, inline) => {
        if (overflow) return '';
        const block = languageHtml({ mechanicsList, mechanicsReview, inline, copy, language });
        if (languageUsed + block.length > MAX_LANGUAGE_HTML_CHARS) {
            overflow = true;
            return '';
        }
        languageUsed += block.length;
        return block;
    };

    const blocks = rows.map((row) => {
        const inline = new Set((row.mechanics || []).map((item) => item.number));
        const languageBlock = spending(row.mechanicsList, row.mechanicsReview, inline);
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">'
            + paragraphHtml(row, language, copy)
            + (row.note
                ? commentHtml(row, language, copy, languageBlock)
                : correctionCardHtml({ block: languageBlock }))
            + '</table>';
    }).join('');

    const omittedBlocks = omitted.map((part) => correctionCardHtml({
        label: part.label,
        block: spending(part.mechanicsList, part.mechanicsReview, new Set()),
    })).join('');

    const note = truncated || overflow || omitted.length
        ? `<p style="margin:0 0 4px;font-size:12px;line-height:${lineHeight(language)};color:#64748b;">${escapeHtml((overflow || omitted.length) ? copy.languageExcerpt : copy.draftTruncated)}</p>`
        : '';

    return blocks + omittedBlocks + note;
};

export const languageTextLines = ({ mechanicsList = [], mechanicsReview = null, copy }) => {
    const rows = mechanicsList || [];
    const partial = mechanicsReview?.status === 'partial';
    const unavailable = mechanicsReview?.status === 'unavailable';
    const none = mechanicsReview?.status === 'checked' && !rows.length;
    if (!rows.length && !partial && !unavailable && !none) return [];
    const lines = [copy.languageTitle];
    for (const row of rows) {
        const legacy = !row?.category;
        lines.push(legacy
            ? categoryName(copy, row)
            : `${copy.languageNumber.replace('{{n}}', row.number)} — ${categoryName(copy, row)}`);
        lines.push(`${copy.languageOriginal}: ${row?.original || ''}`);
        lines.push(`${copy.languageChange}: ${String(row?.correction ?? '') === '' ? copy.languageRemove : row.correction}`);
        if (row?.explanation) lines.push(`${copy.languageWhy}: ${row.explanation}`);
    }
    if (partial) lines.push(copy.languagePartial);
    else if (unavailable) lines.push(copy.languageUnavailable);
    else if (none) lines.push(copy.languageNone);
    return lines;
};

export const draftText = ({ rows, language = 'en', copy, truncated = false, omitted = [] }) => {
    if (!rows.length && !omitted.length) return '';
    const blocks = rows.map((row) => {
        const lines = [row.text];
        const note = row.note;
        if (note) {
            const action = note.nextStep || (note.improvements || []).join(' · ');
            const strengths = (note.strengths || []).join(' · ');
            const heading = [note.label, action ? copy.tryThisLabel : copy.workedLabel].filter(Boolean).join(' · ');
            lines.push(heading);
            if (row.number === 0 && note.evidence) lines.push(`  ${quoted(note.evidence, language)}`);
            if (strengths) lines.push(`  ${copy.workedLabel}: ${strengths}`);
            if (action) lines.push(`  ${copy.tryThisLabel}: ${action}`);
            if (note.why) lines.push(`  ${note.why}`);
        }
        const languageLines = languageTextLines({
            mechanicsList: row.mechanicsList,
            mechanicsReview: row.mechanicsReview,
            copy,
        });
        for (const line of languageLines) lines.push(`  ${line}`);
        return lines.join('\n');
    });

    for (const part of omitted) {
        blocks.push([
            part.label || '',
            ...languageTextLines({
                mechanicsList: part.mechanicsList,
                mechanicsReview: part.mechanicsReview,
                copy,
            }),
        ].filter(Boolean).join('\n'));
    }

    const notice = omitted.length ? copy.languageExcerpt : truncated ? copy.draftTruncated : '';
    return blocks.join('\n\n') + (notice ? `\n\n${notice}` : '');
};

const verdictColor = (level) => (level === 'strong' ? '#047857' : '#b45309');

// A school may show marks to a child ("8/10") or keep them words-only; the
// same verdict line serves the child view, the email and the printout (C4).
const verdictText = (row, mode, copy) => {
    if (mode === 'numbers' && row.score !== undefined) {
        return `${row.score}/${row.maxScore}`;
    }
    const level = copy.rubricLevel[row.level];
    return marksShowsNumbers(mode) && row.score !== undefined
        ? `${level} · ${row.score}/${row.maxScore}`
        : level;
};

export const rubricHtml = ({ scores, language, copy, marks = 'words' }) => {
    const rows = rubricRows(scores, { marks });
    if (!rows.length) return '';
    const mode = marksModeOf(marks);

    const cells = rows.map((row) => {
        const strong = row.level === 'strong';
        const text = row.evidence ? quoted(row.evidence, language) : row.explanation;
        return `<td width="50%" valign="top" style="padding:10px 12px;border:1px solid ${strong ? '#cdeae6' : '#e2e8f0'};border-radius:10px;background-color:${strong ? '#f0fdfa' : '#f8fafc'};">`
            + `<p dir="auto" style="margin:0 0 3px;font-size:12px;font-weight:700;color:#0f172a;text-align:start;">${escapeHtml(row.label)}</p>`
            + `<p style="margin:0;font-size:12px;font-weight:700;color:${verdictColor(row.level)};${language === 'ar' ? '' : 'letter-spacing:.5px;text-transform:uppercase;'}">${escapeHtml(verdictText(row, mode, copy))}</p>`
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

export const rubricText = ({ scores, language = 'en', copy, marks = 'words' }) => {
    const rows = rubricRows(scores, { marks });
    if (!rows.length) return '';
    const mode = marksModeOf(marks);
    return rows.map((row) => {
        const text = row.evidence ? quoted(row.evidence, language) : row.explanation;
        return `- ${row.label}: ${verdictText(row, mode, copy)}${text ? ` — ${text}` : ''}`;
    }).join('\n');
};

const listHtml = (title, items, language, accent) => {
    if (!items.length) return '';
    const pad = language === 'ar' ? 'padding-right' : 'padding-left';
    const list = items.map((item) => `<li style="margin:0 0 3px;">${escapeHtml(item)}</li>`).join('');
    return `<h3 style="margin:10px 0 2px;font-size:12px;font-weight:700;color:${accent};${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${escapeHtml(title)}</h3>`
        + `<ul style="margin:3px 0 0;${pad}:18px;font-size:13px;line-height:${lineHeight(language)};color:#334155;">${list}</ul>`;
};

/**
 * What changed between the two drafts, as the teacher published it. The same
 * content the student sees in the workspace comparison card, in email form.
 */
export const comparisonHtml = ({ comparison, language, copy }) => {
    const detail = comparison?.comparison;
    if (!detail) return '';

    const wordDelta = Number(detail.wordDelta) || 0;
    const improved = (detail.criteriaImproved || []).map((item) => String(item || '').trim()).filter(Boolean);
    const unresolved = (detail.criteriaUnresolved || []).map((item) => String(item || '').trim()).filter(Boolean);
    const newIssues = (detail.newIssues || []).map((item) => String(item || '').trim()).filter(Boolean);
    const spellingWins = (comparison.spellingWins || []).map((row) => String(row?.word || '').trim()).filter(Boolean);
    const changedSections = (detail.changedBySection || [])
        .map((row) => ({
            label: String(row?.label || row?.key || '').trim(),
            summary: String(row?.summary || '').trim(),
            kind: copy.comparisonKind[row?.kind] || copy.comparisonKind.changed
        }))
        .filter((row) => row.label || row.summary);

    if (!detail.encouragement && wordDelta === 0 && !improved.length && !unresolved.length
        && !newIssues.length && !changedSections.length && !spellingWins.length) return '';

    const sign = wordDelta < 0 ? '−' : '+';
    const chips = spellingWins.map((word) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 10px;border-radius:999px;background-color:#ecfdf5;border:1px solid #a7f3d0;font-size:12px;font-weight:700;color:#047857;">${escapeHtml(word)}</span>`).join('');

    const sectionRows = changedSections
        .map((row) => '<tr>'
            + `<td style="padding:8px 0;border-bottom:1px dashed #e2e8f0;">`
            + `<p dir="auto" style="margin:0 0 2px;font-size:12px;font-weight:700;color:#0f172a;text-align:start;">${escapeHtml(row.label)} <span style="font-weight:400;color:#64748b;">· ${escapeHtml(row.kind)}</span></p>`
            + (row.summary ? `<p dir="auto" style="margin:0;font-size:13px;line-height:${lineHeight(language)};color:#334155;text-align:start;">${escapeHtml(row.summary)}</p>` : '')
            + '</td></tr>')
        .join('');

    // The section heading is drawn by the caller; the body starts with the length delta.
    return [
        `<p dir="auto" style="margin:0;font-size:12px;font-weight:700;color:#64748b;">${sign}${Math.abs(wordDelta)} ${escapeHtml(copy.comparisonWordsUnit)}</p>`,
        detail.encouragement
            ? `<p dir="auto" style="margin:8px 0 0;font-size:14px;line-height:${lineHeight(language)};color:#0f172a;text-align:start;">${escapeHtml(detail.encouragement)}</p>`
            : '',
        listHtml(copy.comparisonImproved, improved, language, '#047857'),
        listHtml(copy.comparisonUnresolved, unresolved, language, '#0f766e'),
        listHtml(copy.comparisonNewIssues, newIssues, language, '#b45309'),
        sectionRows
            ? `<h3 style="margin:14px 0 2px;font-size:12px;font-weight:700;color:#0f766e;${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${escapeHtml(copy.comparisonSections)}</h3>`
              + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sectionRows}</table>`
            : '',
        chips
            ? `<h3 style="margin:14px 0 2px;font-size:12px;font-weight:700;color:#047857;${language === 'ar' ? '' : 'letter-spacing:.6px;text-transform:uppercase;'}">${escapeHtml(copy.comparisonWinsLabel)}</h3>${chips}`
            : '',
    ].filter(Boolean).join('');
};

export const comparisonText = ({ comparison, copy, fromNumber, toNumber }) => {
    const detail = comparison?.comparison;
    if (!detail) return '';

    const wordDelta = Number(detail.wordDelta) || 0;
    const improved = (detail.criteriaImproved || []).map((item) => String(item || '').trim()).filter(Boolean);
    const unresolved = (detail.criteriaUnresolved || []).map((item) => String(item || '').trim()).filter(Boolean);
    const newIssues = (detail.newIssues || []).map((item) => String(item || '').trim()).filter(Boolean);
    const spellingWins = (comparison.spellingWins || []).map((row) => String(row?.word || '').trim()).filter(Boolean);
    const changedSections = (detail.changedBySection || [])
        .map((row) => ({
            label: String(row?.label || row?.key || '').trim(),
            summary: String(row?.summary || '').trim(),
            kind: copy.comparisonKind[row?.kind] || copy.comparisonKind.changed
        }))
        .filter((row) => row.label || row.summary);

    if (!detail.encouragement && wordDelta === 0 && !improved.length && !unresolved.length
        && !newIssues.length && !changedSections.length && !spellingWins.length) return '';

    const sign = wordDelta < 0 ? '-' : '+';
    const lines = [copy.comparisonLabel.replace('{{from}}', fromNumber).replace('{{to}}', toNumber)];
    lines.push(`${sign}${Math.abs(wordDelta)} ${copy.comparisonWordsUnit}`);
    if (detail.encouragement) lines.push(detail.encouragement);
    if (improved.length) lines.push(`${copy.comparisonImproved}:\n${improved.map((item) => `- ${item}`).join('\n')}`);
    if (unresolved.length) lines.push(`${copy.comparisonUnresolved}:\n${unresolved.map((item) => `- ${item}`).join('\n')}`);
    if (newIssues.length) lines.push(`${copy.comparisonNewIssues}:\n${newIssues.map((item) => `- ${item}`).join('\n')}`);
    if (changedSections.length) {
        lines.push(`${copy.comparisonSections}:`);
        for (const row of changedSections) {
            lines.push(`- ${row.label} (${row.kind})${row.summary ? `: ${row.summary}` : ''}`);
        }
    }
    if (spellingWins.length) lines.push(`${copy.comparisonWinsLabel}: ${spellingWins.join(', ')}`);
    return lines.join('\n');
};
