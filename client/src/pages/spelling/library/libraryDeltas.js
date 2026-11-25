export const GRADE_ORDER = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

export const WORD_LIMITS = { word: 200, category: 120, definition: 2000 };

const gradeRank = (grade) => {
    const index = GRADE_ORDER.indexOf(grade);
    return index === -1 ? GRADE_ORDER.length : index;
};

export const compareLibraryRows = (first, second) => (
    gradeRank(first.grade) - gradeRank(second.grade)
    || Number(first.week) - Number(second.week)
    || Number(first.order) - Number(second.order)
    || String(first.word || '').localeCompare(String(second.word || ''))
);

export const sortLibraryRows = (rows) => [...rows].sort(compareLibraryRows);

/**
 * Applies a commit response to the rows already on screen. Only the rows the
 * server returned are replaced, so an untouched row keeps both its values and
 * its object identity.
 */
export const applySavedRows = (rows, result = {}) => {
    const removed = new Set((result.removedIds || []).map(String));
    const byId = new Map();
    for (const row of rows) {
        if (!removed.has(String(row._id))) byId.set(String(row._id), row);
    }
    for (const row of [...(result.changedRows || []), ...(result.addedRows || [])]) {
        const id = String(row._id);
        if (removed.has(id)) continue;
        byId.set(id, { ...(byId.get(id) || {}), ...row });
    }
    return sortLibraryRows([...byId.values()]);
};

export const weekRows = (rows, { grade, week }) => sortLibraryRows(
    rows.filter((row) => row.grade === grade && Number(row.week) === Number(week))
);

/** Swaps a word with its neighbour inside its own week; null when it cannot move. */
export const moveWithinWeek = (rows, wordId, direction) => {
    const target = rows.find((row) => String(row._id) === String(wordId));
    if (!target) return null;
    const peers = weekRows(rows, { grade: target.grade, week: target.week });
    const index = peers.findIndex((row) => String(row._id) === String(wordId));
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || nextIndex < 0 || nextIndex >= peers.length) return null;
    const ids = peers.map((row) => String(row._id));
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    return ids;
};

/** Exact order for the week after sending a word to `targetIndex`. */
export const weekPermutationAfterMove = (rows, wordId, targetIndex) => {
    const target = rows.find((row) => String(row._id) === String(wordId));
    if (!target) return null;
    const peers = weekRows(rows, { grade: target.grade, week: target.week });
    const fromIndex = peers.findIndex((row) => String(row._id) === String(wordId));
    if (fromIndex === -1) return null;
    const bounded = Math.min(Math.max(Number(targetIndex) || 0, 0), peers.length - 1);
    if (bounded === fromIndex) return null;
    const ids = peers.map((row) => String(row._id));
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(bounded, 0, moved);
    return ids;
};

export const draftIssues = (draft = {}) => {
    const issues = [];
    const word = String(draft.word ?? '').trim();
    const category = String(draft.category ?? '').trim();
    const definition = String(draft.definition ?? '').trim();
    if (!word) issues.push('WORD_REQUIRED');
    else if (word.length > WORD_LIMITS.word) issues.push('WORD_TOO_LONG');
    if (!category) issues.push('CATEGORY_REQUIRED');
    else if (category.length > WORD_LIMITS.category) issues.push('CATEGORY_TOO_LONG');
    if (definition.length > WORD_LIMITS.definition) issues.push('DEFINITION_TOO_LONG');
    return issues;
};

/** The changed fields only. Null means there is nothing to send. */
export const patchFromDraft = (word, draft = {}) => {
    if (!word) return null;
    const patch = {};
    for (const field of ['word', 'category', 'definition']) {
        const next = String(draft[field] ?? '').trim();
        const current = String(word[field] ?? '').trim();
        if (next !== current) patch[field] = next;
    }
    return Object.keys(patch).length ? patch : null;
};

export const createRequestTracker = () => {
    let current = 0;
    return {
        begin: () => {
            current += 1;
            return current;
        },
        isCurrent: (token) => token === current,
        cancel: () => {
            current += 1;
        }
    };
};

export const newOperationId = () => (
    globalThis.crypto?.randomUUID?.()
        ? globalThis.crypto.randomUUID()
        : `spelling-library-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const rowCanEdit = (row, capabilities) => {
    if (row?.permissions) return row.permissions.canEdit === true;
    if (!capabilities?.canEdit) return false;
    return capabilities.canEditAllGrades === true || (capabilities.grades || []).includes(row?.grade);
};

export const rowPermissionReason = (row, capabilities) => (
    row?.permissions?.reasonCode || capabilities?.reasonCode || null
);

export const IMPACT_FIELDS = [
    'affectedStudents',
    'changedPositions',
    'newlyEligible',
    'removedEligibility',
    'retainedRetests',
    'retestsOnArchivedWords'
];

export const IMPACT_LABELS = {
    affectedStudents: 'library.impactAffectedStudents',
    changedPositions: 'library.impactChangedPositions',
    newlyEligible: 'library.impactNewlyEligible',
    removedEligibility: 'library.impactRemovedEligibility',
    retainedRetests: 'library.impactRetainedRetests',
    retestsOnArchivedWords: 'library.impactRetestsOnArchivedWords'
};

export const impactEntries = (impact = {}) => IMPACT_FIELDS.map((key) => ({
    key,
    value: Number(impact?.[key]) || 0
}));
