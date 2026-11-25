/**
 * Pure traversal rules for spelling progress.
 *
 * The consumed-ID ledger is the source of truth. `lastWordIndex` is only a
 * derived projection for display and backwards compatibility; it must never be
 * used to select the next word.
 */

export const activeWords = (words = []) => words.filter((word) => !word.deletedAt);

export const sortForTraversal = (words = []) => [...words].sort((first, second) => (
    (first.week - second.week)
    || (first.order - second.order)
    || String(first._id).localeCompare(String(second._id))
));

export const eligibleWords = ({ words = [], floorWeek = 1 }) => sortForTraversal(activeWords(words))
    .filter((word) => word.week >= floorWeek);

const consumedSet = (consumedIds) => {
    if (consumedIds instanceof Set) return consumedIds;
    return new Set((consumedIds || []).map((id) => String(id)));
};

export const nextEligibleWord = ({ words = [], consumedIds, floorWeek = 1 }) => {
    const consumed = consumedSet(consumedIds);
    return eligibleWords({ words, floorWeek })
        .find((word) => !consumed.has(String(word._id))) || null;
};

/**
 * The contiguous consumed prefix. Stops before the first eligible unseen word
 * even when later words are consumed, so the pointer never skips a word.
 */
export const projectCompletion = ({ words = [], consumedIds, floorWeek = 1 }) => {
    const consumed = consumedSet(consumedIds);
    const eligible = eligibleWords({ words, floorWeek });
    if (eligible.length === 0) {
        return { week: null, order: null, lastWordIndex: 0, completed: false, total: 0 };
    }
    let lastConsumed = null;
    for (const word of eligible) {
        if (!consumed.has(String(word._id))) break;
        lastConsumed = word;
    }
    if (!lastConsumed) {
        const first = eligible[0];
        return {
            week: first.week,
            order: first.order,
            lastWordIndex: Math.max(0, first.order - 1),
            completed: false,
            total: eligible.length
        };
    }
    const index = eligible.indexOf(lastConsumed);
    return {
        week: lastConsumed.week,
        order: lastConsumed.order,
        lastWordIndex: lastConsumed.order,
        completed: index === eligible.length - 1,
        total: eligible.length
    };
};

export const isGradeTraversalComplete = ({ words = [], consumedIds, floorWeek = 1 }) => {
    const eligible = eligibleWords({ words, floorWeek });
    if (eligible.length === 0) return { complete: false, empty: true };
    return { complete: nextEligibleWord({ words, consumedIds, floorWeek }) === null, empty: false };
};
