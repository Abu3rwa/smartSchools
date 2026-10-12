import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpellingWordLibraryCsv } from '../utils/spellingWordExport.js';
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
