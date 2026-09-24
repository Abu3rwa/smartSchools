import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpellingCsv, validateSpellingRows } from '../services/spellingImportService.js';

test('parseSpellingCsv supports quoted commas and trims row values', () => {
    const rows = parseSpellingCsv([
        'grade,week,category,word,order',
        'G3,2,"Forest, Animals", "red fox" ,1'
    ].join('\n'));

    assert.deepEqual(rows, [{
        rowNumber: 2,
        grade: 'G3',
        week: '2',
        category: 'Forest, Animals',
        word: 'red fox',
        order: '1'
    }]);
});

test('parseSpellingCsv rejects incorrect headers and unclosed quotes', () => {
    assert.throws(
        () => parseSpellingCsv('grade,week,word\nG3,2,fox'),
        /headers must exactly match/
    );
    assert.throws(
        () => parseSpellingCsv('grade,week,category,word,order\nG3,2,"Animals,fox,1'),
        /quoted value was not closed/
    );
});

test('validateSpellingRows reports invalid and duplicate positions', () => {
    const { validRows, errors } = validateSpellingRows([
        { rowNumber: 2, grade: 'G3', week: '2', category: 'Animals', word: 'fox', order: '1' },
        { rowNumber: 3, grade: 'G3', week: '2', category: 'Animals', word: 'wolf', order: '1' },
        { rowNumber: 4, grade: 'G9', week: 'x', category: '', word: '', order: '0' }
    ]);

    assert.equal(validRows.length, 1);
    assert.equal(validRows[0].normalizedWord, 'fox');
    assert.equal(errors.some((error) => error.row === 3 && /duplicate/.test(error.message)), true);
    assert.equal(errors.filter((error) => error.row === 4).length, 5);
});
