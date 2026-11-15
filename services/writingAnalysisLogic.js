/**
 * Pure rules for Writing Analysis. Nothing here touches Mongo or the AI, so the
 * selection rules and the level table can be tested without a database.
 *
 * The level is never taken from the model. The model supplies evidence per piece;
 * this file counts that evidence and applies one fixed table. See
 * docs/plans/writing-analysis/01-architecture.md section 3.1.
 */

export const ANALYSIS_LIMITS = Object.freeze({
    maxPieces: 24,
    /** Standards pre-ticked on the setup page — a default, not a ceiling. */
    defaultStandards: 12,
    minWords: 30,
    maxQuoteWords: 25,
    maxCharsPerPiece: 6000,
    maxNoteChars: 200
});

export const PATTERN_CATEGORIES = Object.freeze([
    'ideas',
    'organisation',
    'sentence',
    'vocabulary',
    'conventions',
    'audience'
]);

export const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/** A quote only counts when it is literally in the piece (whitespace-normalised). */
export const quoteIsReal = (quote, text) => {
    const needle = normalizeText(quote);
    if (!needle) return false;
    const haystack = normalizeText(text).toLowerCase();
    const lower = needle.toLowerCase();
    if (lower.length >= 4) return haystack.includes(lower);
    // A three-letter word can be real evidence: "AND" in capitals shows
    // inconsistent spelling. It has to be a whole word, so "cat" inside
    // "education" is not a quote.
    if (lower.length < 3 || /\s/.test(lower)) return false;
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(haystack);
};

export const pieceText = (draft) => (draft?.sections || [])
    .map((section) => String(section?.text || ''))
    .filter(Boolean)
    .join('\n\n');

const submittedTime = (value) => {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
};

const inWindow = (value, from, to) => {
    if (!from && !to) return true;
    const time = submittedTime(value);
    if (!time) return false;
    if (from && time < new Date(from).getTime()) return false;
    if (to && time > new Date(to).getTime()) return false;
    return true;
};

/**
 * One piece of evidence per writing project: the student's final submission.
 * Revisions of the same project are deliberately not independent evidence.
 */
export const selectPieces = ({
    projects = [],
    drafts = [],
    from = null,
    to = null,
    limits = ANALYSIS_LIMITS
} = {}) => {
    const projectById = new Map(projects.map((project) => [String(project._id), project]));
    const byProject = new Map();
    for (const draft of drafts || []) {
        const key = String(draft?.project || '');
        if (!key) continue;
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key).push(draft);
    }

    const included = [];
    const excluded = [];

    for (const [projectId, rows] of byProject) {
        const project = projectById.get(projectId);
        if (!project) continue;
        const latest = (rows || []).reduce((best, row) => (
            !best || Number(row?.number || 0) > Number(best?.number || 0) ? row : best
        ), null);
        if (!latest) continue;
        if (!inWindow(latest.submittedAt, from, to)) continue;

        const base = {
            draft: latest._id,
            project: project._id,
            assignment: project.assignment?._id || project.assignment || null,
            title: project.assignment?.title || latest.title || '',
            writingType: project.assignment?.writingType || '',
            submittedAt: latest.submittedAt || null,
            totalWords: Number(latest.totalWords) || 0
        };

        if (latest.submissionSource === 'teacher') {
            excluded.push({ ...base, reason: 'teacher_submitted' });
        } else if (base.totalWords < limits.minWords) {
            excluded.push({ ...base, reason: 'too_short' });
        } else {
            included.push(base);
        }
    }

    included.sort((a, b) => submittedTime(b.submittedAt) - submittedTime(a.submittedAt));
    while (included.length > limits.maxPieces) {
        const over = included.pop();
        excluded.push({ ...over, reason: 'over_cap' });
    }

    return { included, excluded };
};

/**
 * A standard code is the parent of another when the child extends it:
 * "ELA.5.L.2" covers "ELA.5.L.2.B", and "L.5.2" covers "L.5.2B". A number
 * after the parent code is a different standard, not a child.
 */
export const isChildCode = (parentCode, childCode) => {
    const parent = String(parentCode || '').trim().toUpperCase();
    const child = String(childCode || '').trim().toUpperCase();
    if (!parent || !child || parent === child) return false;
    if (!child.startsWith(parent)) return false;
    const rest = child.slice(parent.length);
    if (rest.startsWith('.')) return rest.length > 1;
    return /^[A-Z]/.test(rest);
};

/**
 * When a parent standard and one of its children are both chosen, the child
 * carries the evidence and the parent is covered. Judging both would charge
 * one slip to two standards and put the same weakness in the counts twice.
 */
export const coverParentStandards = (standards = []) => {
    const rows = (standards || []).map((row) => ({ ...row, coveredBy: [] }));
    for (const parent of rows) {
        const code = String(parent.code || '').trim();
        if (!code) continue;
        const children = rows
            .filter((row) => row !== parent && isChildCode(code, row.code))
            .map((row) => String(row.code || '').trim())
            .filter(Boolean);
        if (children.length) parent.coveredBy = children;
    }
    return rows;
};

/**
 * The standards that are put to the model. A parent covered by its parts is
 * left out: judging both would charge one slip to two standards.
 */
export const standardsToJudge = (standards = []) =>
    coverParentStandards(standards).filter((row) => !(row.coveredBy || []).length);

/**
 * The fixed conversion from evidence counts to a status and a proposed level.
 * `rows` must be ordered oldest to newest; only rows with `opportunity` count.
 */
export const levelForStandard = ({ rows = [] } = {}) => {
    const applicable = (rows || []).filter((row) => row?.opportunity === true);
    const met = applicable.filter((row) => row.judgment === 'met').length;
    const partly = applicable.filter((row) => row.judgment === 'partly').length;
    const notMet = applicable.filter((row) => row.judgment === 'not_met').length;
    const counts = { applicable: applicable.length, met, partly, notMet };

    if (applicable.length === 0) {
        return { counts, status: 'not_observed', proposedLevel: null };
    }
    if (applicable.length === 1) {
        return { counts, status: 'insufficient_evidence', proposedLevel: null };
    }

    const latestMet = applicable[applicable.length - 1]?.judgment === 'met';
    const typesMet = new Set(
        applicable.filter((row) => row.judgment === 'met').map((row) => row.writingType || 'unknown')
    ).size;

    // The table is the agreed one in docs/plans/writing-analysis/01-architecture.md
    // §3.1: fractions count `met` only, level 0 needs zero `met`, level 3 needs
    // three pieces at 60%, level 4 needs four at 80% across two writing types.
    // `partly` stays visible in the counts but never lifts a level.
    if (met === 0) {
        return { counts, status: 'not_shown', proposedLevel: 0 };
    }
    const metShare = met / applicable.length;
    if (applicable.length >= 4 && metShare >= 0.8 && latestMet && typesMet >= 2) {
        return { counts, status: 'transfer', proposedLevel: 4 };
    }
    if (applicable.length >= 3 && metShare >= 0.6 && latestMet) {
        return { counts, status: 'consistent', proposedLevel: 3 };
    }
    if (metShare >= 0.5) {
        return { counts, status: 'developing', proposedLevel: 2 };
    }
    return { counts, status: 'fragile', proposedLevel: 1 };
};

/**
 * The same quoted line judged two ways across pieces. The teacher has to look
 * at it: one of the two readings is wrong.
 */
const conflictIn = (rows = []) => {
    const byQuote = new Map();
    for (const row of rows || []) {
        const quote = normalizeText(row?.quote).toLowerCase();
        if (quote.length < 8) continue;
        const list = byQuote.get(quote) || [];
        list.push(row.judgment);
        byQuote.set(quote, list);
    }
    for (const [quote, judgments] of byQuote) {
        const distinct = [...new Set(judgments)];
        if (distinct.length > 1) return { quote, judgments: distinct };
    }
    return null;
};

/**
 * Builds the saved result from validated per-piece evidence. Pieces are ordered
 * oldest to newest so "the latest piece" is unambiguous.
 */
export const aggregateAnalysis = ({
    standardSnapshot = [],
    pieces = [],
    pieceResults = [],
    limits = ANALYSIS_LIMITS
} = {}) => {
    const ordered = [...pieces].sort((a, b) => submittedTime(a.submittedAt) - submittedTime(b.submittedAt));
    const resultByDraft = new Map(
        (pieceResults || []).map((row) => [String(row?.draft || ''), row])
    );

    const standards = coverParentStandards(standardSnapshot || []).map((standard) => {
        // A parent whose child was also chosen is judged by that child; it
        // carries no evidence of its own and never counts.
        const covered = (standard.coveredBy || []).length > 0;
        const rows = ordered.map((piece) => {
            const result = resultByDraft.get(String(piece.draft));
            const entry = (result?.standards || []).find(
                (row) => String(row?.standard || '') === String(standard.standard || '')
            );
            return {
                draft: piece.draft,
                submittedAt: piece.submittedAt || null,
                writingType: piece.writingType || '',
                opportunity: covered ? false : entry?.opportunity === true,
                judgment: ['met', 'partly', 'not_met'].includes(entry?.judgment)
                    ? entry.judgment
                    : 'none',
                absence: entry?.absence === true,
                // The words could not be found in the piece, so there is
                // nothing for the teacher to check on this row.
                unverifiable: entry?.unverifiable === true,
                quote: normalizeText(entry?.quote).slice(0, 400),
                note: normalizeText(entry?.note).slice(0, limits.maxNoteChars)
            };
        });
        const { counts, status, proposedLevel } = levelForStandard({ rows });
        return {
            standard: standard.standard,
            code: standard.code || '',
            name: standard.name || '',
            category: standard.category || '',
            coveredBy: covered ? standard.coveredBy : [],
            pieces: rows,
            counts,
            status,
            proposedLevel,
            conflict: covered ? null : conflictIn(rows),
            teacherLevel: null,
            teacherNote: ''
        };
    });

    const patternMap = new Map();
    for (const result of pieceResults || []) {
        for (const pattern of result?.patterns || []) {
            const category = String(pattern?.category || '').trim();
            const kind = pattern?.kind === 'strength' ? 'strength' : 'issue';
            if (!PATTERN_CATEGORIES.includes(category)) continue;
            const key = `${category}|${kind}`;
            if (!patternMap.has(key)) {
                patternMap.set(key, { category, kind, drafts: new Set(), note: '', quote: '' });
            }
            const row = patternMap.get(key);
            row.drafts.add(String(result.draft || ''));
            const note = normalizeText(pattern?.note);
            const quote = normalizeText(pattern?.quote);
            // One note and one quote per pattern; the newest piece wins.
            if (note) row.note = note;
            if (quote) row.quote = quote;
        }
    }
    const patternRows = [...patternMap.values()]
        .map((row) => ({
            category: row.category,
            kind: row.kind,
            pieces: row.drafts.size,
            notes: row.note ? [row.note] : [],
            quotes: row.quote ? [row.quote] : []
        }))
        .sort((a, b) => b.pieces - a.pieces || a.category.localeCompare(b.category));

    // "Recurring" means the pattern appeared in at least two pieces. One-piece
    // observations are kept but labelled, never presented as a trend.
    const pickPatterns = (kind) => {
        const forKind = patternRows.filter((row) => row.kind === kind);
        const recurring = forKind
            .filter((row) => row.pieces >= 2)
            .slice(0, 2)
            .map((row) => ({ ...row, recurring: true }));
        const single = forKind
            .filter((row) => row.pieces < 2)
            .slice(0, 2)
            .map((row) => ({ ...row, recurring: false }));
        return [...recurring, ...single];
    };
    const patterns = [...pickPatterns('strength'), ...pickPatterns('issue')];

    const growth = buildGrowth({ pieces: ordered, pieceResults });

    const runs = pieceResults || [];
    const usablePieces = runs.filter((row) => row?.aiStatus === 'done').length;
    const summary = {
        pieces: ordered.length,
        piecesAnalysed: usablePieces,
        unusablePieces: runs.filter((row) => row?.aiStatus === 'unusable').length,
        failedPieces: runs.filter((row) => row?.aiStatus === 'failed').length,
        standards: standards.length,
        withProposal: standards.filter((row) => row.proposedLevel !== null).length,
        notObserved: standards.filter((row) => row.status === 'not_observed').length,
        notShown: standards.filter((row) => row.status === 'not_shown').length,
        covered: standards.filter((row) => (row.coveredBy || []).length > 0).length,
        conflicts: standards.filter((row) => row.conflict).length,
        quotesDropped: runs.reduce((sum, row) => sum + (Number(row?.quotesDropped) || 0), 0),
        notesDropped: runs.reduce((sum, row) => sum + (Number(row?.notesDropped) || 0), 0),
        vagueNotes: runs.reduce((sum, row) => sum + (Number(row?.vagueNotes) || 0), 0)
    };

    return { standards, patterns, growth, summary };
};

/**
 * Direction only, never a growth percentage. Needs at least two pieces in each
 * third, otherwise the answer is "uncertain".
 */
export const buildGrowth = ({ pieces = [], pieceResults = [] }) => {
    const ordered = [...pieces].sort((a, b) => submittedTime(a.submittedAt) - submittedTime(b.submittedAt));
    const empty = {
        usable: false,
        direction: 'uncertain',
        early: 0,
        late: 0,
        categories: [],
        pieces: ordered.length,
        readable: 0,
        needed: 4,
        focusCategory: '',
        earlyQuote: '',
        lateQuote: '',
        minPieces: 4
    };
    // A piece whose run failed or was unusable has no issue evidence. Counting
    // it as "no issues" would turn missing data into an improving trend, so the
    // thirds are built from pieces the model actually read.
    const statusByDraft = new Map(
        (pieceResults || []).map((row) => [String(row?.draft || ''), row?.aiStatus])
    );
    const usable = ordered.filter((piece) => statusByDraft.get(String(piece.draft)) === 'done');
    if (usable.length < 4) return { ...empty, readable: usable.length };

    const size = Math.max(2, Math.ceil(usable.length / 3));
    const early = usable.slice(0, size);
    const late = usable.slice(-size);
    if (early.length < 2 || late.length < 2) return { ...empty, readable: usable.length };

    const issuesByDraft = new Map();
    const patternsByDraft = new Map();
    for (const result of pieceResults || []) {
        const patterns = result?.patterns || [];
        patternsByDraft.set(String(result?.draft || ''), patterns);
        const categories = new Set(
            patterns
                .filter((row) => row?.kind !== 'strength')
                .map((row) => String(row?.category || ''))
                .filter((category) => PATTERN_CATEGORIES.includes(category))
        );
        issuesByDraft.set(String(result?.draft || ''), categories);
    }

    const countIssues = (rows, category = null) => rows.filter((piece) => {
        const categories = issuesByDraft.get(String(piece.draft)) || new Set();
        return category ? categories.has(category) : categories.size > 0;
    }).length;

    const directionOf = (earlyCount, lateCount) => {
        if (lateCount < earlyCount) return 'improving';
        if (lateCount > earlyCount) return 'declining';
        return 'stable';
    };

    const earlyIssues = countIssues(early);
    const lateIssues = countIssues(late);
    const direction = directionOf(earlyIssues, lateIssues);

    const categories = PATTERN_CATEGORIES.map((category) => ({
        category,
        direction: directionOf(countIssues(early, category), countIssues(late, category)),
        early: countIssues(early, category),
        late: countIssues(late, category)
    }));

    // The category that moved most between the two ends is the one the teacher
    // is shown, with a quote from each end so the direction can be checked.
    const moved = [...categories].sort((a, b) => {
        const deltaA = direction === 'declining' ? a.late - a.early : a.early - a.late;
        const deltaB = direction === 'declining' ? b.late - b.early : b.early - b.late;
        return deltaB - deltaA || (b.early + b.late) - (a.early + a.late);
    });
    const focus = moved[0]?.category || '';

    const quoteFor = (rows, category, kinds) => {
        for (const piece of rows) {
            for (const pattern of patternsByDraft.get(String(piece.draft)) || []) {
                if (category && String(pattern?.category || '') !== category) continue;
                if (!kinds.includes(pattern?.kind)) continue;
                const quote = normalizeText(pattern?.quote);
                if (quote) return quote;
            }
        }
        return '';
    };

    const earlyQuote = direction === 'declining'
        ? quoteFor(early, focus, ['strength', 'issue'])
        : quoteFor(early, focus, ['issue', 'strength']);
    const lateQuote = direction === 'declining'
        ? quoteFor(late, focus, ['issue', 'strength'])
        : quoteFor(late, focus, ['strength', 'issue']);

    return {
        usable: true,
        direction,
        early: earlyIssues,
        late: lateIssues,
        pieces: ordered.length,
        readable: usable.length,
        needed: 4,
        focusCategory: focus,
        earlyQuote,
        lateQuote,
        minPieces: 4,
        categories
    };
};

/** Character cap per piece, on a word boundary, so one long draft cannot dominate the bill. */
export const promptTextFor = (text, limit = ANALYSIS_LIMITS.maxCharsPerPiece) => {
    const value = String(text || '').trim();
    if (value.length <= limit) return { text: value, truncated: false };
    const cut = value.slice(0, limit);
    const boundary = cut.lastIndexOf(' ');
    return { text: `${boundary > 200 ? cut.slice(0, boundary) : cut}\n[…truncated]`, truncated: true };
};

export const estimateRun = ({ pieces = [], standardCount = 0, limits = ANALYSIS_LIMITS } = {}) => {
    const perPieceInput = 900 + Math.max(0, standardCount) * 90;
    const perPieceOutput = 260 + Math.max(0, standardCount) * 130;
    let inputTokens = 0;
    let outputTokens = 0;
    for (const piece of pieces) {
        const chars = Math.min(
            Number(piece?.totalWords || 0) * 6,
            limits.maxCharsPerPiece
        );
        inputTokens += perPieceInput + Math.round(chars / 4);
        outputTokens += perPieceOutput;
    }
    return {
        pieces: pieces.length,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
    };
};
