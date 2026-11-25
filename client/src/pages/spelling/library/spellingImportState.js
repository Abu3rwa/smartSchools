export const RETRY_PREVIEW_CODES = new Set([
    'IMPORT_EXPIRED',
    'IMPACT_EXPIRED',
    'IMPACT_CHANGED',
    'STALE_LIBRARY',
    'IMPORT_MODE_CHANGED'
]);

export const RETRY_SAVE_CODE = 'WRITE_FAILED';

export const MESSAGE_KEYS = {
    'grade must be KG or G1-G5': 'invalidImportGrade',
    'week must be a valid week for this grade': 'invalidImportWeekRange',
    'category is required and must be at most 120 characters': 'invalidImportCategory',
    'word is required and must be at most 200 characters': 'invalidImportWord',
    'word must contain letters or numbers': 'invalidImportWordCharacters',
    'word must be at most 200 characters after normalization': 'invalidImportWord',
    'definition must be at most 2000 characters': 'invalidImportDefinition',
    'order must be a positive integer': 'invalidImportOrder',
    'duplicate grade/week/order in file': 'duplicateImportPosition',
    'duplicate word in this grade and week': 'duplicateImportWord',
    'wrong number of columns': 'invalidColumnCount',
    'encoded value is not valid JSON': 'invalidEncodedCell'
};

export const messageKey = (message) => MESSAGE_KEYS[message] || null;

/**
 * Builds the explicit mapping list for the selected candidate of every
 * ambiguous row. Returns null until each ambiguous row has a valid choice.
 */
export const mappingsFromSelections = (ambiguities = [], selections = {}) => {
    const mappings = [];
    for (const ambiguity of ambiguities) {
        const selectedId = selections[ambiguity.row];
        if (!selectedId) return null;
        const candidate = (ambiguity.candidates || [])
            .find((entry) => String(entry.wordId) === String(selectedId));
        if (!candidate) return null;
        mappings.push({
            rowNumber: Number(ambiguity.row),
            wordId: candidate.wordId,
            expectedRevision: candidate.revision
        });
    }
    return mappings.sort((first, second) => first.rowNumber - second.rowNumber);
};

export const ambiguitiesResolved = (ambiguities = [], selections = {}) => (
    ambiguities.length > 0 && mappingsFromSelections(ambiguities, selections) !== null
);

export const importPreviewReady = (preview) => Boolean(
    preview
    && preview.committable === true
    && preview.importId
);

export const plannedEntries = (planned) => ([
    { key: 'added', value: Number(planned?.added) || 0 },
    { key: 'updated', value: Number(planned?.updated) || 0 },
    { key: 'removed', value: Number(planned?.removed) || 0 },
    { key: 'reusedArchived', value: Number(planned?.reusedArchived) || 0 }
]);

export const plannedIsEmpty = (planned) => plannedEntries(planned)
    .every((entry) => entry.value === 0);
