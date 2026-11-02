/**
 * Word-level Needleman–Wunsch alignment between what the student saw and the
 * words the speech model heard. Code, not an LLM: the same recording always
 * gets the same marks.
 */
export const STATUS = Object.freeze({
    CORRECT: 'c',
    ENDING: 'e',
    SWAPPED: 's',
    SKIPPED: 'k'
});

const MAX_SUBSTITUTION_COST = 1.6;
const ENDING_COST = 0.45;
const EPSILON = 1e-9;
const ENDING_SUFFIXES = new Set(['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ies', 'ves']);

const levenshtein = (left, right) => {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        previous = current;
    }
    return previous[b.length];
};

const substitutionCost = (left, right) => {
    if (left === right) return 0;
    const longest = Math.max(left.length, right.length, 1);
    return Math.min(MAX_SUBSTITUTION_COST, 0.35 + (1.25 * levenshtein(left, right)) / longest);
};

const isEndingDifference = (left, right) => {
    if (!left || !right || left === right) return false;
    const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
    if (shorter.length < 3 || !longer.startsWith(shorter)) return false;
    return ENDING_SUFFIXES.has(longer.slice(shorter.length));
};

const scoreVariant = (variant, heardTokens) => {
    if (variant.length !== heardTokens.length) return null;
    let cost = 0;
    let differences = 0;
    let endings = 0;
    for (let index = 0; index < variant.length; index += 1) {
        const expected = variant[index];
        const heard = heardTokens[index];
        if (expected === heard) continue;
        differences += 1;
        if (isEndingDifference(expected, heard)) {
            cost += ENDING_COST;
            endings += 1;
        } else {
            cost += substitutionCost(expected, heard);
        }
    }
    if (!differences) return { cost: 0, status: STATUS.CORRECT };
    const endingOnly = endings === differences;
    return {
        cost,
        status: endingOnly ? STATUS.ENDING : STATUS.SWAPPED
    };
};

const sharedStart = (left, right, length = 3) => (
    left.length >= length && right.length >= length && left.slice(0, length) === right.slice(0, length)
);

const similarity = (left, right) => {
    const longest = Math.max(left.length, right.length, 1);
    return 1 - levenshtein(left, right) / longest;
};

const classifyInsertions = ({ heard, insertionIndices, matches, reference, refByHeard }) => {
    let repeats = 0;
    let corrections = 0;
    const insertions = insertionIndices.map((heardIndex) => {
        const word = heard[heardIndex];
        const previous = heard[heardIndex - 1];
        let kind = 'extra';

        if (previous && previous.normalized === word.normalized) {
            kind = 'repeat';
            repeats += 1;
        } else {
            const nextIndex = heardIndex + 1;
            const correctedToMatch = matches.find((match) => match.heardStart === nextIndex);
            const correctedTo = heard[nextIndex];
            const nearbyRefIndex = refByHeard.get(heardIndex - 1) ?? refByHeard.get(heardIndex + 1);
            const nearbyRef = nearbyRefIndex != null ? (reference.words[nearbyRefIndex]?.variants?.[0] || []) : [];
            const nearbyWord = nearbyRef.join(' ');

            if (
                (correctedToMatch && correctedTo && (
                    sharedStart(word.normalized, correctedTo.normalized)
                    || similarity(word.normalized, correctedTo.normalized) >= 0.6
                ))
                || (nearbyWord && similarity(word.normalized, nearbyWord) >= 0.6)
            ) {
                kind = 'self-correction';
                corrections += 1;
            }
        }

        return {
            heard: word.display,
            kind,
            at: refByHeard.get(heardIndex - 1) ?? null
        };
    });

    return { insertions, repeats, corrections };
};

const collectIssues = ({ statuses, matches, heard, lastReached }) => {
    const heardByRef = new Map();
    for (const match of matches) {
        heardByRef.set(match.refIndex, heard
            .slice(match.heardStart, match.heardEnd + 1)
            .map((word) => word.display)
            .join(' '));
    }
    const issues = [];
    for (let index = 0; index <= lastReached; index += 1) {
        if (statuses[index] === STATUS.CORRECT) continue;
        issues.push({
            i: index,
            heard: statuses[index] === STATUS.SKIPPED ? '' : (heardByRef.get(index) || '')
        });
    }
    return issues;
};

/**
 * @returns {{
 *   statusMap: string, issues: Array, matches: Array, insertions: Array,
 *   insertionCount: number, repeats: number, selfCorrections: number,
 *   wordsAttempted: number, wordsCorrect: number, errors: number,
 *   alignedCount: number
 * }}
 */
export const alignReferenceToTranscript = (reference, transcript) => {
    const refs = reference?.words || [];
    const heard = transcript?.words || [];
    const rowCount = refs.length;
    const columnCount = heard.length;

    const dp = Array.from({ length: rowCount + 1 }, () => new Array(columnCount + 1).fill(Infinity));
    const choice = Array.from({ length: rowCount + 1 }, () => new Array(columnCount + 1).fill(null));
    dp[0][0] = 0;

    for (let j = 1; j <= columnCount; j += 1) {
        dp[0][j] = j;
        choice[0][j] = { type: 'insert' };
    }
    for (let i = 1; i <= rowCount; i += 1) {
        dp[i][0] = i;
        choice[i][0] = { type: 'skip' };
    }

    for (let i = 1; i <= rowCount; i += 1) {
        const variants = refs[i - 1]?.variants || [];
        for (let j = 1; j <= columnCount; j += 1) {
            let best = dp[i - 1][j] + 1;
            let selected = { type: 'skip' };

            const inserted = dp[i][j - 1] + 1;
            if (inserted < best - EPSILON) {
                best = inserted;
                selected = { type: 'insert' };
            }

            for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
                const variant = variants[variantIndex];
                if (variant.length > j) continue;
                const heardTokens = heard
                    .slice(j - variant.length, j)
                    .map((word) => word.normalized);
                const scored = scoreVariant(variant, heardTokens);
                if (!scored) continue;
                const cost = dp[i - 1][j - variant.length] + scored.cost;
                if (cost < best - EPSILON) {
                    best = cost;
                    selected = {
                        type: 'match',
                        length: variant.length,
                        status: scored.status
                    };
                }
            }

            dp[i][j] = best;
            choice[i][j] = selected;
        }
    }

    const statuses = new Array(rowCount).fill(STATUS.SKIPPED);
    const matches = [];
    const insertionIndices = [];
    let i = rowCount;
    let j = columnCount;

    while (i > 0 || j > 0) {
        const selected = choice[i]?.[j];
        if (!selected) {
            if (i > 0) i -= 1;
            else j -= 1;
            continue;
        }
        if (selected.type === 'match') {
            statuses[i - 1] = selected.status;
            matches.push({
                refIndex: i - 1,
                heardStart: j - selected.length,
                heardEnd: j - 1,
                status: selected.status
            });
            i -= 1;
            j -= selected.length;
        } else if (selected.type === 'skip') {
            i -= 1;
        } else {
            insertionIndices.push(j - 1);
            j -= 1;
        }
    }

    matches.sort((left, right) => left.refIndex - right.refIndex);
    insertionIndices.sort((left, right) => left - right);

    const refByHeard = new Map();
    for (const match of matches) {
        for (let index = match.heardStart; index <= match.heardEnd; index += 1) {
            refByHeard.set(index, match.refIndex);
        }
    }

    let lastReached = -1;
    for (let index = 0; index < rowCount; index += 1) {
        if (statuses[index] !== STATUS.SKIPPED) lastReached = index;
    }

    const wordsAttempted = lastReached + 1;
    const wordsCorrect = statuses
        .slice(0, wordsAttempted)
        .filter((status) => status === STATUS.CORRECT).length;
    const alignedCount = statuses.filter((status) => status !== STATUS.SKIPPED).length;
    const { insertions, repeats, corrections } = classifyInsertions({
        heard,
        insertionIndices,
        matches,
        reference,
        refByHeard
    });

    return {
        statusMap: statuses.join(''),
        statuses,
        issues: collectIssues({ statuses, matches, heard, lastReached }),
        matches,
        insertions,
        insertionCount: insertions.length,
        repeats,
        selfCorrections: repeats + corrections,
        wordsAttempted,
        wordsCorrect,
        errors: wordsAttempted - wordsCorrect,
        alignedCount,
        lastReached,
        refByHeard
    };
};
