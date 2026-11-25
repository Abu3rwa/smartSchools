import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertImportRowLimit,
    estimateSpellingReplacement,
    parseSpellingCsv,
    validateSpellingRows
} from '../services/spellingImportService.js';
import { buildSpellingWordRoundtripCsv } from '../utils/spellingWordExport.js';

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

test('parseSpellingCsv keeps multiline quoted definitions and physical row numbers', () => {
    const rows = parseSpellingCsv([
        'grade,week,category,word,order,definition',
        'G3,2,Animals,fox,1,"a wild animal',
        'with a bushy tail"',
        '',
        'G3,2,Animals,wolf,2,"a wild canine"'
    ].join('\n'));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].definition, 'a wild animal\nwith a bushy tail');
    assert.equal(rows[0].rowNumber, 3);
    assert.equal(rows[1].rowNumber, 5);
});

test('parseSpellingCsv continues to accept legacy files without definitions', () => {
    const rows = parseSpellingCsv('grade,week,category,word,order\nG3,2,Animals,fox,1');
    assert.equal(Object.hasOwn(rows[0], 'definition'), false);
});

test('parseSpellingCsv rejects incorrect headers and unclosed quotes with a domain code', () => {
    assert.throws(
        () => parseSpellingCsv('grade,week,word\nG3,2,fox'),
        (error) => error.code === 'CSV_INVALID'
            && error.details.some((detail) => detail.field === 'header')
    );
    assert.throws(
        () => parseSpellingCsv('grade,week,category,word,order,definition\nG3,2,"Animals,fox,1'),
        (error) => error.code === 'CSV_INVALID'
    );
});

test('parseSpellingCsv marks a row with the wrong column count instead of dropping it', () => {
    const rows = parseSpellingCsv('grade,week,category,word,order\nG3,2,Animals,fox');
    assert.equal(rows[0].columnError, 'wrong number of columns');

    const { validRows, errors } = validateSpellingRows(rows);
    assert.equal(validRows.length, 0);
    assert.equal(errors.some((error) => error.row === 2 && error.message === 'wrong number of columns'), true);
});

test('parseSpellingCsv accepts the encoded reimport contract and decodes every cell', () => {
    const csv = buildSpellingWordRoundtripCsv({
        words: [{
            grade: 'G2',
            week: 1,
            category: 'Forest, Animals',
            word: 'red "fox"',
            order: 1,
            definition: 'Line one\nLine two'
        }]
    });

    const rows = parseSpellingCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowNumber, 2);
    assert.equal(rows[0].grade, 'G2');
    assert.equal(rows[0].week, '1');
    assert.equal(rows[0].category, 'Forest, Animals');
    assert.equal(rows[0].word, 'red "fox"');
    assert.equal(rows[0].definition, 'Line one\nLine two');
    assert.equal(rows[0].order, '1');
});

test('parseSpellingCsv rejects a partial encoded header set', () => {
    assert.throws(
        () => parseSpellingCsv('Grade,Week,CategoryEncoded,WordEncoded,Order\nG3,2,"Animals","fox",1'),
        (error) => error.code === 'CSV_INVALID'
            && error.details.some((detail) => detail.field === 'header')
    );
});

test('parseSpellingCsv reports a row whose encoded cell is not JSON', () => {
    const rows = parseSpellingCsv([
        'Grade,Week,CategoryEncoded,WordEncoded,Order,DefinitionEncoded',
        'G3,2,{bad},"fox",1,"a wild animal"'
    ].join('\n'));

    assert.equal(rows[0].cellError, 'encoded value is not valid JSON');
    const { validRows, errors } = validateSpellingRows(rows);
    assert.equal(validRows.length, 0);
    assert.equal(errors.some((error) => error.row === 2 && error.message === 'encoded value is not valid JSON'), true);
});

test('assertImportRowLimit accepts 5,000 rows and rejects 5,001 before any write', () => {
    assert.equal(assertImportRowLimit(new Array(5000).fill({})).length, 5000);
    assert.throws(
        () => assertImportRowLimit(new Array(5001).fill({})),
        (error) => error.code === 'IMPORT_TOO_LARGE'
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

test('validateSpellingRows rejects punctuation-only words and duplicate text in a week', () => {
    const { validRows, errors } = validateSpellingRows([
        { rowNumber: 2, grade: 'G3', week: '2', category: 'Animals', word: '!!!', order: '1' },
        { rowNumber: 3, grade: 'G3', week: '2', category: 'Animals', word: 'fox', order: '2' },
        { rowNumber: 4, grade: 'G3', week: '2', category: 'Nature', word: 'Fox!', order: '3' },
        { rowNumber: 5, grade: 'G3', week: '3', category: 'Nature', word: 'fox', order: '1' }
    ]);

    assert.equal(errors.some((error) => error.row === 2 && /letters or numbers/.test(error.message)), true);
    assert.equal(errors.some((error) => error.row === 4 && /duplicate word/.test(error.message)), true);
    assert.deepEqual(validRows.map((row) => `${row.grade}:${row.week}:${row.word}`), ['G3:2:fox', 'G3:3:fox']);
});

test('validateSpellingRows enforces week ceilings per grade', () => {
    const { validRows, errors } = validateSpellingRows([
        { rowNumber: 2, grade: 'KG', week: '40', category: 'Animals', word: 'cat', order: '1' },
        { rowNumber: 3, grade: 'KG', week: '41', category: 'Animals', word: 'dog', order: '1' }
    ]);

    assert.equal(validRows.length, 1);
    assert.equal(errors.some((error) => error.row === 3 && /valid week/.test(error.message)), true);
});
