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
    if (needle.length < 4) return false;
    return normalizeText(text).toLowerCase().includes(needle.toLowerCase());
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

    // A partial demonstration is real evidence, so it counts half. Level 0
    // ("Not Demonstrated") is reserved for a student who never showed the
    // standard at all; two "partly" pieces must never publish as 0.
    if (met === 0 && partly === 0) {
        return { counts, status: 'fragile', proposedLevel: 0 };
    }
    const score = (met + partly * 0.5) / applicable.length;
    if (score < 0.5) {
        return { counts, status: 'fragile', proposedLevel: 1 };
    }
    if (score < 0.75) {
        return { counts, status: 'developing', proposedLevel: 2 };
    }
    if (score < 1) {
        return {
            counts,
            status: 'developing',
            proposedLevel: latestMet ? 3 : 2
        };
    }
    if (applicable.length >= 4 && typesMet >= 2) {
        return { counts, status: 'transfer', proposedLevel: 4 };
    }
    return { counts, status: 'consistent', proposedLevel: 3 };
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

    const standards = (standardSnapshot || []).map((standard) => {
        const rows = ordered.map((piece) => {
            const result = resultByDraft.get(String(piece.draft));
            const entry = (result?.standards || []).find(
                (row) => String(row?.standard || '') === String(standard.standard || '')
            );
            return {
                draft: piece.draft,
                submittedAt: piece.submittedAt || null,
                writingType: piece.writingType || '',
                opportunity: entry?.opportunity === true,
                judgment: ['met', 'partly', 'not_met'].includes(entry?.judgment)
                    ? entry.judgment
                    : 'none',
                absence: entry?.absence === true,
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
            pieces: rows,
            counts,
            status,
            proposedLevel,
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
        quotesDropped: runs.reduce((sum, row) => sum + (Number(row?.quotesDropped) || 0), 0),
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
        minPieces: 4
    };
    if (ordered.length < 4) return empty;

    const size = Math.max(2, Math.ceil(ordered.length / 3));
    const early = ordered.slice(0, size);
    const late = ordered.slice(-size);
    if (early.length < 2 || late.length < 2) return empty;

    const issuesByDraft = new Map();
    for (const result of pieceResults || []) {
        const categories = new Set(
            (result?.patterns || [])
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
    return {
        usable: true,
        direction: directionOf(earlyIssues, lateIssues),
        early: earlyIssues,
        late: lateIssues,
        pieces: ordered.length,
        minPieces: 4,
        categories: PATTERN_CATEGORIES.map((category) => ({
            category,
            direction: directionOf(countIssues(early, category), countIssues(late, category)),
            early: countIssues(early, category),
            late: countIssues(late, category)
        }))
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
