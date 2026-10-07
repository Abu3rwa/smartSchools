import test from 'node:test';
import assert from 'node:assert/strict';
import {
    estimateSpellingReplacement,
    parseSpellingCsv,
    validateSpellingRows
} from '../services/spellingImportService.js';

test('estimateSpellingReplacement counts only unmatched existing and imported words', () => {
    const estimate = estimateSpellingReplacement(
        [
            { grade: 'G2', normalizedWord: 'fox' },
            { grade: 'G2', normalizedWord: 'wolf' },
            { grade: 'G3', normalizedWord: 'fox' }
        ],
        [
            { grade: 'G2', normalizedWord: 'fox' },
            { grade: 'G2', normalizedWord: 'bear' },
            { grade: 'G3', normalizedWord: 'fox' }
        ]
    );

    assert.deepEqual(estimate, { removed: 1, added: 1 });
});

test('parseSpellingCsv supports quoted commas and trims row values', () => {
    const rows = parseSpellingCsv([
        'grade,week,category,word,order,definition',
        'G3,2,"Forest, Animals", "red fox" ,1,"a fox that lives in forests, often with reddish fur"'
    ].join('\n'));

    assert.deepEqual(rows, [{
        rowNumber: 2,
        grade: 'G3',
        week: '2',
        category: 'Forest, Animals',
        word: 'red fox',
        order: '1',
        definition: 'a fox that lives in forests, often with reddish fur'
    }]);
});

test('parseSpellingCsv continues to accept legacy files without definitions', () => {
    const rows = parseSpellingCsv('grade,week,category,word,order\nG3,2,Animals,fox,1');
    assert.equal(Object.hasOwn(rows[0], 'definition'), false);
});

test('parseSpellingCsv rejects incorrect headers and unclosed quotes', () => {
    assert.throws(
        () => parseSpellingCsv('grade,week,word\nG3,2,fox'),
        /headers must match/
    );
    assert.throws(
        () => parseSpellingCsv('grade,week,category,word,order,definition\nG3,2,"Animals,fox,1'),
        /quoted value was not closed/
    );
});

test('validateSpellingRows reports invalid and duplicate positions', () => {
    const { validRows, errors } = validateSpellingRows([
        { rowNumber: 2, grade: 'G3', week: '2', category: 'Animals', word: 'fox', order: '1', definition: 'a wild animal' },
        { rowNumber: 3, grade: 'G3', week: '2', category: 'Animals', word: 'wolf', order: '1', definition: 'a wild canine' },
        { rowNumber: 4, grade: 'G9', week: 'x', category: '', word: '', order: '0', definition: '' }
    ]);

    assert.equal(validRows.length, 1);
    assert.equal(validRows[0].normalizedWord, 'fox');
    assert.equal(validRows[0].definition, 'a wild animal');
    assert.equal(errors.some((error) => error.row === 3 && /duplicate/.test(error.message)), true);
    assert.equal(errors.filter((error) => error.row === 4).length, 5);
});
