import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeWordKey,
    parseWordAudioCsv,
    planWordAudioImport,
    validateAudioUrl
} from '../utils/wordAudio.js';

const LONGMAN_US = 'https://www.ldoceonline.com/media/english/ameProns/cat.mp3';
const OXFORD_UK = 'https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/c/cat/cat__/cat__gb_1.mp3';
const WEBSTER = 'https://media.merriam-webster.com/audio/prons/en/us/mp3/c/cat00001.mp3';

test('normalizeWordKey trims, lowercases, collapses spaces and keeps apostrophes', () => {
    assert.equal(normalizeWordKey('  Ice   Cream '), 'ice cream');
    assert.equal(normalizeWordKey("Don\u2019t"), "don't");
    assert.equal(normalizeWordKey('JANUARY'), 'january');
    assert.equal(normalizeWordKey(null), '');
    assert.equal(normalizeWordKey('ice-cream'), 'ice cream');
    assert.equal(normalizeWordKey(' Living - Room '), 'living room');
});

test('validateAudioUrl accepts allowed https hosts and rejects everything else', () => {
    assert.equal(validateAudioUrl(LONGMAN_US).ok, true);
    assert.equal(validateAudioUrl('').empty, true);
    assert.equal(validateAudioUrl('http://www.ldoceonline.com/a.mp3').ok, false);
    assert.equal(validateAudioUrl('https://evil.example.com/a.mp3').ok, false);
    assert.equal(validateAudioUrl('https://www.ldoceonline.com.evil.com/a.mp3').ok, false);
    assert.equal(validateAudioUrl('https://user:pw@www.ldoceonline.com/a.mp3').ok, false);
    assert.equal(validateAudioUrl('javascript:alert(1)').ok, false);
    assert.equal(validateAudioUrl('not a url').ok, false);
});

test('parseWordAudioCsv reads sheet columns, definition and per-dictionary examples', () => {
    const rows = parseWordAudioCsv([
        'word,Longman US,Longman UK,Oxford US,Oxford UK,Webster US,status,first week,definition,Longman example 1,Longman example 2,Oxford example 1',
        `Cat,${LONGMAN_US},,,${OXFORD_UK},${WEBSTER},ok,1,"a small pet, furry",${LONGMAN_US}|${OXFORD_UK},,${OXFORD_UK}`,
        'Ice  Cream,,,,,,Longman no audio; Webster page 404,3,,,,'
    ].join('\r\n'));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].definition, 'a small pet, furry');
    assert.equal(rows[0].pronunciations.longmanUS, LONGMAN_US);
    assert.equal(rows[0].pronunciations.longmanUK, '');
    assert.equal(rows[0].examples.longman.length, 2);
    assert.deepEqual(rows[0].examples.oxford, [OXFORD_UK]);
    assert.equal(rows[1].status, 'Longman no audio; Webster page 404');
    assert.throws(() => parseWordAudioCsv('foo,bar\n1,2'), /"word" column/);
});

const sampleRows = () => parseWordAudioCsv([
    'word,Longman US,Longman UK,Oxford US,Oxford UK,Webster US,status,first week,Longman example 1',
    `Cat,${LONGMAN_US},,,${OXFORD_UK},,ok,1,${LONGMAN_US}`,
    'dog,https://evil.example.com/dog.mp3,,,,,ok,1,',
    ',,,,,,,1,',
    'Cat,,,,,,ok,2,'
].join('\n'));

test('planWordAudioImport reports rejected URLs and skipped rows, merging duplicate words', () => {
    const { operations, report } = planWordAudioImport(sampleRows());
    assert.equal(report.rowsRead, 4);
    assert.equal(report.rowsSkipped, 1);
    assert.equal(report.urlsRejected.length, 1);
    assert.equal(report.urlsRejected[0].word, 'dog');
    assert.equal(report.rowsWithAudio, 1);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].word, 'cat');
    assert.equal(operations[0].isNew, true);
    assert.equal(operations[0].set.longmanUS, LONGMAN_US);
    assert.deepEqual(operations[0].set['examples.longman'], [LONGMAN_US]);
});

test('planWordAudioImport is idempotent: re-running against stored data changes nothing', () => {
    const first = planWordAudioImport(sampleRows());
    const stored = new Map();
    for (const op of first.operations) {
        const doc = { word: op.word, examples: {} };
        for (const [path, value] of Object.entries(op.set)) {
            if (path.startsWith('examples.')) doc.examples[path.slice(9)] = value;
            else doc[path] = value;
        }
        stored.set(op.word, doc);
    }
    const second = planWordAudioImport(sampleRows(), stored);
    assert.equal(second.operations.length, 0);
    assert.equal(second.unchanged, 1);
});

test('planWordAudioImport never overwrites a stored URL with an empty cell or drops examples', () => {
    const stored = new Map([['cat', {
        word: 'cat', longmanUS: LONGMAN_US, oxfordUK: OXFORD_UK, definition: 'pet',
        examples: { longman: [LONGMAN_US] }
    }]]);
    const rows = parseWordAudioCsv('word,Longman US,Oxford UK,definition,Longman example 1\ncat,,,,\n');
    const { operations, unchanged } = planWordAudioImport(rows, stored);
    assert.equal(operations.length, 0);
    assert.equal(unchanged, 0);
});

test('planWordAudioImport appends new example URLs without removing existing ones', () => {
    const stored = new Map([['cat', { word: 'cat', examples: { longman: [LONGMAN_US] } }]]);
    const rows = parseWordAudioCsv(`word,Longman example 1\ncat,${WEBSTER.replace('media.merriam-webster.com', 'www.ldoceonline.com')}\n`);
    const { operations } = planWordAudioImport(rows, stored);
    assert.equal(operations[0].set['examples.longman'].length, 2);
    assert.equal(operations[0].set['examples.longman'][0], LONGMAN_US);
});
