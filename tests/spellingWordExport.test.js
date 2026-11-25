import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ROUNDTRIP_HEADERS,
    buildSpellingWordAudioCsv,
    buildSpellingWordImportCsv,
    buildSpellingWordRoundtripCsv
} from '../utils/spellingWordExport.js';
import { parseSpellingCsv } from '../services/spellingImportService.js';
import { parseWordAudioCsv } from '../utils/wordAudio.js';

test('spelling word import export returns curriculum-compatible headers', () => {
    const csv = buildSpellingWordImportCsv({
        words: [{
            grade: 'G3',
            week: 2,
            category: 'Forest Animals',
            word: 'otter',
            order: 1,
            definition: 'a mammal that swims and has thick fur'
        }]
    });

    assert.match(csv, /^\uFEFF"Grade","Week","Category","Word","Order","Definition"/);
    assert.match(csv, /"G3","2","Forest Animals","otter","1","a mammal that swims and has thick fur"/);
    assert.equal(csv.split(/\r\n/).length, 2);
});

test('spelling word export escapes CSV values and prevents formula injection', () => {
    const csv = buildSpellingWordImportCsv({
        words: [{
            grade: 'G2',
            week: 1,
            category: 'A "quoted" category',
            word: '=1+1',
            order: 1,
            definition: 'Line one\nLine two'
        }]
    });

    assert.match(csv, /"A ""quoted"" category"/);
    assert.match(csv, /"'=1\+1"/);
    assert.match(csv, /"Line one Line two"/);
});

test('spelling audio export matches the current audio-import contract', () => {
    const csv = buildSpellingWordAudioCsv({
        words: [{
            grade: 'G1',
            week: 2,
            category: 'Animals',
            word: 'Bear',
            order: 1,
            definition: 'A large animal'
        }],
        audioEntries: [{
            word: 'bear',
            examples: {
                longman: ['https://www.ldoceonline.com/example/bear.mp3'],
                oxford: ['https://www.oxfordlearnersdictionaries.com/example/bear.mp3']
            },
            definition: 'A large animal'
        }]
    });

    assert.match(csv, /^\uFEFF"word","status","first week","definition","Longman example 1","Oxford example 1"/);
    assert.doesNotMatch(csv, /Longman US/);
    assert.doesNotMatch(csv, /Phonetic transcription/);
    assert.match(csv, /"Bear"/);

    const imported = parseWordAudioCsv(csv.slice(1));
    assert.equal(imported[0].word, 'Bear');
    assert.equal(imported[0].definition, 'A large animal');
    assert.deepEqual(imported[0].examples.longman, ['https://www.ldoceonline.com/example/bear.mp3']);
    assert.deepEqual(imported[0].examples.oxford, ['https://www.oxfordlearnersdictionaries.com/example/bear.mp3']);
});

test('roundtrip export uses the encoded header contract and survives a reimport parse', () => {
    const words = [
        {
            grade: 'G3',
            week: 2,
            category: 'Forest, Animals',
            word: 'red "fox"',
            order: 1,
            definition: 'Line one\nLine two'
        },
        {
            grade: 'G2',
            week: 1,
            category: 'مراجعة',
            word: 'كتاب',
            order: 2,
            definition: 'ما يُقرأ'
        }
    ];

    const csv = buildSpellingWordRoundtripCsv({ words });
    assert.equal(
        csv.split(/\r\n/)[0],
        `\uFEFF${ROUNDTRIP_HEADERS.map((header) => `"${header}"`).join(',')}`
    );

    const parsed = parseSpellingCsv(csv);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].category, 'Forest, Animals');
    assert.equal(parsed[0].word, 'red "fox"');
    assert.equal(parsed[0].definition, 'Line one\nLine two');
    assert.equal(parsed[1].category, 'مراجعة');
    assert.equal(parsed[1].word, 'كتاب');
    assert.equal(parsed[1].week, '1');
    assert.equal(parsed[1].order, '2');
    assert.equal(parsed[1].cellError, undefined);
});

test('roundtrip export never lets a formula or apostrophe reach the spreadsheet as a formula', () => {
    const csv = buildSpellingWordRoundtripCsv({
        words: [{
            grade: 'G2',
            week: 1,
            category: '=HYPERLINK("x")',
            word: "'otter",
            order: 1,
            definition: '@SUM(1,1)'
        }]
    });

    assert.doesNotMatch(csv, /,"'=/);
    assert.doesNotMatch(csv, /,"'@/);
    assert.match(csv, /"""=HYPERLINK/);
    assert.match(csv, /"""'otter"""/);
    const parsed = parseSpellingCsv(csv);
    assert.equal(parsed[0].category, '=HYPERLINK("x")');
    assert.equal(parsed[0].word, "'otter");
    assert.equal(parsed[0].definition, '@SUM(1,1)');
});

test('spelling audio export keeps the formula guard', () => {
    const csv = buildSpellingWordAudioCsv({
        words: [{
            grade: 'G1',
            week: 2,
            category: 'Animals',
            word: '=HYPERLINK("x")',
            order: 1,
            definition: '@SUM(1,1)'
        }],
        audioEntries: []
    });

    assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
    assert.match(csv, /"'@SUM\(1,1\)"/);
});
