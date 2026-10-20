import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpellingWordAudioCsv, buildSpellingWordImportCsv, buildSpellingWordLibraryCsv } from '../utils/spellingWordExport.js';
import { parseWordAudioCsv } from '../utils/wordAudio.js';

test('spelling word export combines curriculum, audio, and cached dictionary details', () => {
    const csv = buildSpellingWordLibraryCsv({
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
            longmanUS: 'https://www.ldoceonline.com/audio/bear.mp3',
            definition: 'A large animal',
            examples: { longman: ['https://www.ldoceonline.com/example/bear.mp3'] }
        }],
        dictionaryEntries: [{
            word: 'bear',
            phonetic: '/beə/',
            audioUrl: 'https://dictionary.example/bear.mp3',
            status: 'found',
            definitions: [{ partOfSpeech: 'noun', definition: 'A large animal', example: 'A bear lives here.' }]
        }]
    });

    assert.match(csv, /^\uFEFF/);
    assert.match(csv, /"Dictionary definition 1"/);
    assert.match(csv, /"Phonetic transcription"/);
    const imported = parseWordAudioCsv(csv.slice(1));
    assert.equal(imported[0].word, 'Bear');
    assert.equal(imported[0].pronunciations.longmanUS, 'https://www.ldoceonline.com/audio/bear.mp3');
    assert.deepEqual(imported[0].examples.longman, ['https://www.ldoceonline.com/example/bear.mp3']);
    assert.equal(imported[0].definition, 'A large animal');
});

test('spelling word export escapes CSV values and prevents formula injection', () => {
    const csv = buildSpellingWordLibraryCsv({
        words: [{
            grade: 'G2',
            week: 1,
            category: 'A "quoted" category',
            word: '=1+1',
            order: 1,
            definition: 'Line one\nLine two'
        }],
        audioEntries: [],
        dictionaryEntries: []
    });

    assert.match(csv, /"A ""quoted"" category"/);
    assert.match(csv, /"'=1\+1"/);
    assert.match(csv, /"Line one Line two"/);
    assert.equal(csv.split(/\r\n/).length, 2);
});

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
    assert.match(csv, /"otter"/);
    assert.doesNotThrow(() => parseWordAudioCsv('word,Longman US\nBear,https://www.ldoceonline.com/audio/bear.mp3\n'));
});

test('spelling audio export matches the import CSV contract', () => {
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
            longmanUS: 'https://www.ldoceonline.com/audio/bear.mp3',
            longmanUK: 'https://www.ldoceonline.com/audio/bear-uk.mp3',
            oxfordUS: 'https://www.oxfordlearnersdictionaries.com/audio/bear-us.mp3',
            googleUK: 'https://ssl.gstatic.com/dictionary/audio/bear_en_gb_1.mp3',
            examples: {
                longman: ['https://www.ldoceonline.com/example/bear.mp3'],
                oxford: ['https://www.oxfordlearnersdictionaries.com/example/bear.mp3']
            },
            definition: 'A large animal'
        }]
    });

    assert.match(csv, /^\uFEFF"word","Longman US","Longman UK","Oxford US","Oxford UK","Webster US","Google US","Google UK","status","first week","definition"/);
    assert.match(csv, /"Bear"/);
    assert.match(csv, /https:\/\/www\.ldoceonline\.com\/audio\/bear\.mp3/);
    const imported = parseWordAudioCsv(csv.slice(1));
    assert.equal(imported[0].word, 'Bear');
    assert.equal(imported[0].pronunciations.longmanUS, 'https://www.ldoceonline.com/audio/bear.mp3');
    assert.equal(imported[0].pronunciations.googleUK, 'https://ssl.gstatic.com/dictionary/audio/bear_en_gb_1.mp3');
    assert.deepEqual(imported[0].examples.longman, ['https://www.ldoceonline.com/example/bear.mp3']);
    assert.equal(imported[0].definition, 'A large animal');
});
