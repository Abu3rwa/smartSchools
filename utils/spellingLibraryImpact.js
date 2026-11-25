import {
    eligibleWords,
    nextEligibleWord,
    projectCompletion
} from '../services/spellingTraversal.js';

const idSet = (words) => new Set((words || []).map((word) => String(word._id)));

const eligibleIdSet = ({ words, floorWeek, consumedIds }) => {
    const consumed = new Set((consumedIds || []).map((id) => String(id)));
    return idSet(eligibleWords({ words, floorWeek }).filter((word) => !consumed.has(String(word._id))));
};

/**
 * Pure before/after comparison. It reports aggregates only - never student IDs
 * or names - so the same summary is safe in an API response and in the UI.
 */
export const computeLibraryImpact = ({
    beforeWords = [],
    afterWords = [],
    students = [],
    retests = [],
    archivedIds = []
} = {}) => {
    const archived = new Set((archivedIds || []).map((id) => String(id)));
    let changedPositions = 0;
    let newlyEligible = 0;
    let removedEligibility = 0;
    const affectedStudents = students.length;

    for (const student of students) {
        const floorWeek = student.floorWeek || 1;
        const consumed = student.consumedIds || [];
        const beforeEligible = eligibleIdSet({ words: beforeWords, floorWeek, consumedIds: consumed });
        const afterEligible = eligibleIdSet({ words: afterWords, floorWeek, consumedIds: consumed });

        for (const id of afterEligible) if (!beforeEligible.has(id)) newlyEligible += 1;
        for (const id of beforeEligible) if (!afterEligible.has(id)) removedEligibility += 1;

        const beforeNext = nextEligibleWord({ words: beforeWords, consumedIds: consumed, floorWeek });
        const afterNext = nextEligibleWord({ words: afterWords, consumedIds: consumed, floorWeek });
        if (String(beforeNext?._id || '') !== String(afterNext?._id || '')) changedPositions += 1;
    }

    const unresolved = (retests || []).filter((item) => (
        ['pending', 'practice-mastered'].includes(item.status) && !item.suppressedAt
    ));
    const archiveSet = new Set([...archived].map(String));
    const forWordArchive = (item) => archiveSet.has(String(item.sourceWord || item.wordId || ''));

    return {
        affectedStudents,
        changedPositions,
        newlyEligible,
        removedEligibility,
        retainedRetests: unresolved.length,
        retestsOnArchivedWords: unresolved.filter(forWordArchive).length
    };
};

/** Projection summary used to explain that a pointer may move backwards. */
export const summarizeProjectionChange = ({ beforeWords, afterWords, consumedIds, floorWeek = 1 }) => ({
    before: projectCompletion({ words: beforeWords, consumedIds, floorWeek }),
    after: projectCompletion({ words: afterWords, consumedIds, floorWeek })
});
