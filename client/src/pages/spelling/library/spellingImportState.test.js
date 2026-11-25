import assert from 'node:assert/strict';
import test from 'node:test';
import {
    RETRY_PREVIEW_CODES,
    RETRY_SAVE_CODE,
    ambiguitiesResolved,
    importPreviewReady,
    mappingsFromSelections,
    messageKey,
    plannedEntries,
    plannedIsEmpty
} from './spellingImportState.js';

const ambiguity = (overrides = {}) => ({
    row: 2,
    candidates: [
        { wordId: 'word-1', word: 'red fox', week: 1, category: 'Review', revision: 3, archived: false },
        { wordId: 'word-2', word: 'red fox', week: 1, category: 'Review', revision: 5, archived: true }
    ],
    ...overrides
});

test('every import row error the server can return has copy for it', () => {
    assert.equal(messageKey('grade must be KG or G1-G5'), 'invalidImportGrade');
    assert.equal(messageKey('week must be a valid week for this grade'), 'invalidImportWeekRange');
    assert.equal(messageKey('word must contain letters or numbers'), 'invalidImportWordCharacters');
    assert.equal(messageKey('duplicate word in this grade and week'), 'duplicateImportWord');
    assert.equal(messageKey('wrong number of columns'), 'invalidColumnCount');
    assert.equal(messageKey('encoded value is not valid JSON'), 'invalidEncodedCell');
    assert.equal(messageKey('some new server message'), null);
});

test('a mapping is only built when every ambiguous row has a candidate selected', () => {
    assert.equal(mappingsFromSelections([ambiguity()], {}), null);
    assert.equal(mappingsFromSelections([ambiguity()], { 2: 'missing' }), null);
    assert.deepEqual(mappingsFromSelections([ambiguity()], { 2: 'word-2' }), [{
        rowNumber: 2,
        wordId: 'word-2',
        expectedRevision: 5
    }]);
});

test('mappings are ordered by row and resolution needs at least one ambiguity', () => {
    const first = ambiguity({ row: 4 });
    const second = ambiguity({ row: 2 });

    assert.deepEqual(
        mappingsFromSelections([first, second], { 4: 'word-1', 2: 'word-2' }).map((mapping) => mapping.rowNumber),
        [2, 4]
    );
    assert.equal(ambiguitiesResolved([first, second], { 4: 'word-1', 2: 'word-2' }), true);
    assert.equal(ambiguitiesResolved([first, second], { 4: 'word-1' }), false);
    assert.equal(ambiguitiesResolved([], {}), false);
});

test('a preview is only ready to save when it is committable and has an import id', () => {
    assert.equal(importPreviewReady(null), false);
    assert.equal(importPreviewReady({ importId: null, committable: false }), false);
    assert.equal(importPreviewReady({ importId: 'job-1', committable: false }), false);
    assert.equal(importPreviewReady({ importId: 'job-1', committable: true }), true);
});

test('planned changes are listed as explicit totals and an empty plan is recognised', () => {
    assert.deepEqual(plannedEntries({ added: 2, updated: 1, removed: 3, reusedArchived: 1 }), [
        { key: 'added', value: 2 },
        { key: 'updated', value: 1 },
        { key: 'removed', value: 3 },
        { key: 'reusedArchived', value: 1 }
    ]);
    assert.equal(plannedIsEmpty({ added: 0, updated: 0, removed: 0, reusedArchived: 0 }), true);
    assert.equal(plannedIsEmpty({ added: 1, updated: 0, removed: 0, reusedArchived: 0 }), false);
    assert.equal(plannedIsEmpty(null), true);
});

test('stale or expired previews and transient save failures are recognised for retry', () => {
    for (const code of ['IMPORT_EXPIRED', 'IMPACT_EXPIRED', 'IMPACT_CHANGED', 'STALE_LIBRARY', 'IMPORT_MODE_CHANGED']) {
        assert.equal(RETRY_PREVIEW_CODES.has(code), true, code);
    }
    assert.equal(RETRY_PREVIEW_CODES.has('WRITE_FAILED'), false);
    assert.equal(RETRY_SAVE_CODE, 'WRITE_FAILED');
});
