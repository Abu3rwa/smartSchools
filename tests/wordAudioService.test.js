import test from 'node:test';
import assert from 'node:assert/strict';
import SpellingAudioSettings from '../models/SpellingAudioSettings.js';
import SpellingWord from '../models/SpellingWord.js';
import WordAudio from '../models/WordAudio.js';
import {
    attachAudioToCurrentItem,
    buildAudioPayload,
    decorateItemWithAudio,
    removeSchoolWordAudioExample,
    replaceSchoolWordPronunciation,
    replaceSchoolWordAudioExample,
    searchSchoolWordAudio
} from '../services/wordAudioService.js';

const item = { wordId: 'w1', sequence: 1, word: 'Cat', definition: 'a pet', grade: 'G1', week: 1, category: 'CVC', order: 1, isRetest: false };
const doc = {
    word: 'cat',
    longmanUS: 'https://www.ldoceonline.com/a.mp3',
    oxfordUK: 'https://www.oxfordlearnersdictionaries.com/b.mp3',
    examples: { longman: ['https://www.ldoceonline.com/ex1.mp3'] },
    definition: 'a small furry pet'
};

const stubQuery = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value });

test('word payload is unchanged (same object) when there is no audio or the flag is off', () => {
    assert.equal(decorateItemWithAudio(item, true, null), item);
    assert.equal(decorateItemWithAudio(item, true, { word: 'cat' }), item);
    assert.equal(decorateItemWithAudio(item, false, doc), item);
    assert.equal(Object.hasOwn(item, 'audio'), false);
});

test('buildAudioPayload only exposes dictionaries that have data', () => {
    const audio = buildAudioPayload(doc);
    assert.deepEqual(Object.keys(audio.dictionaries).sort(), ['longman', 'oxford']);
    assert.deepEqual(audio.dictionaries.oxford, { uk: doc.oxfordUK });
    assert.deepEqual(audio.dictionaries.longman.examples, doc.examples.longman);
    assert.equal(audio.definition, 'a small furry pet');
    const googleUrl = 'https://ssl.gstatic.com/dictionary/static/pronunciation/2024-04-19/audio/do/dogs_en_gb_1.mp3';
    assert.deepEqual(buildAudioPayload({ word: 'dogs', googleUK: googleUrl }), {
        dictionaries: { google: { uk: googleUrl } }
    });
});

test('decorateItemWithAudio adds only an audio field and keeps every existing field', () => {
    const result = decorateItemWithAudio(item, true, doc);
    const { audio, ...rest } = result;
    assert.deepEqual(rest, item);
    assert.ok(audio.dictionaries.longman);
});

test('attachAudioToCurrentItem returns the identical result when the grade flag is OFF', async (t) => {
    t.mock.method(SpellingAudioSettings, 'findOne', () => stubQuery(null));
    const lookup = t.mock.method(WordAudio, 'findOne', () => stubQuery(doc));
    const result = { session: { _id: 's1' }, item };
    assert.equal(await attachAudioToCurrentItem(result, 'school1'), result);
    assert.equal(lookup.mock.callCount(), 0);
});

test('attachAudioToCurrentItem adds audio when the flag is ON and never breaks on errors', async (t) => {
    t.mock.method(SpellingAudioSettings, 'findOne', () => stubQuery({ enabled: true }));
    const lookup = t.mock.method(WordAudio, 'findOne', () => stubQuery(doc));
    const result = { session: { _id: 's1' }, item };
    const withAudio = await attachAudioToCurrentItem(result, 'school1');
    assert.ok(withAudio.item.audio);
    assert.equal(lookup.mock.calls[0].arguments[0].word, 'cat');

    lookup.mock.mockImplementation(() => { throw new Error('db down'); });
    assert.equal(await attachAudioToCurrentItem(result, 'school1'), result);
    assert.equal((await attachAudioToCurrentItem({ session: {}, item: null }, 'school1')).item, null);
});

test('audio search returns pronunciation and example audio for spelling words in the requesting school', async (t) => {
    let spellingFilter;
    let audioFilter;
    const words = [
        { word: 'Cat', normalizedWord: 'cat', grade: 'G1' },
        { word: 'Dog', normalizedWord: 'dog', grade: 'G1' }
    ];
    t.mock.method(SpellingWord, 'find', (filter) => {
        spellingFilter = filter;
        return {
            select: () => ({
                sort: () => ({
                    limit: () => ({ lean: async () => words })
                })
            })
        };
    });
    t.mock.method(WordAudio, 'find', (filter) => {
        audioFilter = filter;
        return stubQuery([{
            word: 'cat',
            longmanUS: 'https://www.ldoceonline.com/us.mp3',
            oxfordUK: 'https://www.oxfordlearnersdictionaries.com/uk.mp3',
            examples: { longman: ['https://www.ldoceonline.com/ex1.mp3'] }
        }]);
    });

    const results = await searchSchoolWordAudio({ schoolId: 'school1', query: 'ca' });
    assert.deepEqual(spellingFilter, { school: 'school1', normalizedWord: { $regex: 'ca' } });
    assert.deepEqual(audioFilter, { word: { $in: ['cat', 'dog'] } });
    assert.deepEqual(results, [{
        word: 'Cat',
        grade: 'G1',
        pronunciations: {
            longmanUS: 'https://www.ldoceonline.com/us.mp3',
            longmanUK: '',
            oxfordUS: '',
            oxfordUK: 'https://www.oxfordlearnersdictionaries.com/uk.mp3',
            websterUS: '',
            googleUS: '',
            googleUK: ''
        },
        examples: [{ dictionary: 'longman', url: 'https://www.ldoceonline.com/ex1.mp3' }]
    }, {
        word: 'Dog',
        grade: 'G1',
        pronunciations: { longmanUS: '', longmanUK: '', oxfordUS: '', oxfordUK: '', websterUS: '', googleUS: '', googleUK: '' },
        examples: []
    }]);
});

test('pronunciation replacement validates and atomically updates the selected field', async (t) => {
    let audioFilter;
    let update;
    t.mock.method(SpellingWord, 'exists', async () => true);
    t.mock.method(WordAudio, 'updateOne', async () => ({ acknowledged: true }));
    t.mock.method(WordAudio, 'findOneAndUpdate', (filter, updateDoc) => {
        audioFilter = filter;
        update = updateDoc;
        return {
            select: () => ({
                lean: async () => ({
                    word: 'cat',
                    longmanUS: 'https://www.ldoceonline.com/new-us.mp3',
                    oxfordUK: 'https://www.oxfordlearnersdictionaries.com/uk.mp3'
                })
            })
        };
    });

    const result = await replaceSchoolWordPronunciation({
        schoolId: 'school1',
        word: 'Cat',
        field: 'longmanUS',
        currentUrl: 'https://www.ldoceonline.com/old-us.mp3',
        replacementUrl: 'https://www.ldoceonline.com/new-us.mp3'
    });
    assert.deepEqual(audioFilter, { word: 'cat', longmanUS: 'https://www.ldoceonline.com/old-us.mp3' });
    assert.equal(update.$set.longmanUS, 'https://www.ldoceonline.com/new-us.mp3');
    assert.deepEqual(result.pronunciations, {
        longmanUS: 'https://www.ldoceonline.com/new-us.mp3',
        longmanUK: '',
        oxfordUS: '',
        oxfordUK: 'https://www.oxfordlearnersdictionaries.com/uk.mp3',
        websterUS: '',
        googleUS: '',
        googleUK: ''
    });
});

test('pronunciation replacement can clear a selected URL', async (t) => {
    let update;
    t.mock.method(SpellingWord, 'exists', async () => true);
    t.mock.method(WordAudio, 'updateOne', async () => ({ acknowledged: true }));
    t.mock.method(WordAudio, 'findOneAndUpdate', (_filter, updateDoc) => {
        update = updateDoc;
        return { select: () => ({ lean: async () => ({ word: 'cat' }) }) };
    });

    await replaceSchoolWordPronunciation({
        schoolId: 'school1',
        word: 'Cat',
        field: 'oxfordUS',
        currentUrl: 'https://www.oxfordlearnersdictionaries.com/us.mp3',
        replacementUrl: ''
    });
    assert.equal(update.$unset.oxfordUS, 1);
});

test('Google pronunciation URLs can be imported and played as a distinct source', async (t) => {
    const url = 'https://ssl.gstatic.com/dictionary/static/pronunciation/2024-04-19/audio/do/dogs_en_gb_1.mp3';
    let update;
    t.mock.method(SpellingWord, 'exists', async () => true);
    t.mock.method(WordAudio, 'updateOne', async () => ({ acknowledged: true }));
    t.mock.method(WordAudio, 'findOneAndUpdate', (_filter, updateDoc) => {
        update = updateDoc;
        return {
            select: () => ({
                lean: async () => ({ word: 'dogs', googleUK: url })
            })
        };
    });

    const result = await replaceSchoolWordPronunciation({
        schoolId: 'school1',
        word: 'dogs',
        field: 'googleUK',
        currentUrl: '',
        replacementUrl: url
    });

    assert.equal(update.$set.googleUK, url);
    assert.deepEqual(result.pronunciations, {
        longmanUS: '',
        longmanUK: '',
        oxfordUS: '',
        oxfordUK: '',
        websterUS: '',
        googleUS: '',
        googleUK: url
    });
});

test('example audio deletion is limited to a school word and exact dictionary URL', async (t) => {
    let spellingFilter;
    let audioFilter;
    let update;
    t.mock.method(SpellingWord, 'exists', async (filter) => {
        spellingFilter = filter;
        return true;
    });
    t.mock.method(WordAudio, 'findOneAndUpdate', (filter, updateDoc) => {
        audioFilter = filter;
        update = updateDoc;
        return stubQuery({ word: 'cat', examples: { longman: [], oxford: ['https://www.oxfordlearnersdictionaries.com/ex2.mp3'] } });
    });

    const result = await removeSchoolWordAudioExample({
        schoolId: 'school1',
        word: 'Cat',
        dictionary: 'longman',
        url: 'https://www.ldoceonline.com/ex1.mp3'
    });
    assert.deepEqual(spellingFilter, { school: 'school1', normalizedWord: 'cat' });
    assert.deepEqual(audioFilter, { word: 'cat', 'examples.longman': 'https://www.ldoceonline.com/ex1.mp3' });
    assert.equal(update.$pull['examples.longman'], 'https://www.ldoceonline.com/ex1.mp3');
    assert.deepEqual(result.examples, [{ dictionary: 'oxford', url: 'https://www.oxfordlearnersdictionaries.com/ex2.mp3' }]);
});

test('example audio replacement validates provider URL and atomically replaces only the selected example', async (t) => {
    let spellingFilter;
    let audioFilter;
    let update;
    t.mock.method(SpellingWord, 'exists', async (filter) => {
        spellingFilter = filter;
        return true;
    });
    t.mock.method(WordAudio, 'findOneAndUpdate', (filter, updateDoc) => {
        audioFilter = filter;
        update = updateDoc;
        return stubQuery({
            word: 'cat',
            examples: {
                longman: ['https://www.ldoceonline.com/new.mp3'],
                oxford: ['https://www.oxfordlearnersdictionaries.com/keep.mp3']
            }
        });
    });

    const result = await replaceSchoolWordAudioExample({
        schoolId: 'school1',
        word: 'Cat',
        dictionary: 'longman',
        url: 'https://www.ldoceonline.com/old.mp3',
        replacementUrl: 'https://www.ldoceonline.com/new.mp3'
    });
    assert.deepEqual(spellingFilter, { school: 'school1', normalizedWord: 'cat' });
    assert.deepEqual(audioFilter, {
        word: 'cat',
        $and: [
            { 'examples.longman': 'https://www.ldoceonline.com/old.mp3' },
            { 'examples.longman': { $ne: 'https://www.ldoceonline.com/new.mp3' } }
        ]
    });
    assert.equal(update.$set['examples.longman.$'], 'https://www.ldoceonline.com/new.mp3');
    assert.deepEqual(result.examples, [
        { dictionary: 'longman', url: 'https://www.ldoceonline.com/new.mp3' },
        { dictionary: 'oxford', url: 'https://www.oxfordlearnersdictionaries.com/keep.mp3' }
    ]);
});

test('example audio replacement rejects URLs outside approved dictionary hosts', async () => {
    await assert.rejects(
        replaceSchoolWordAudioExample({
            schoolId: 'school1',
            word: 'Cat',
            dictionary: 'longman',
            url: 'https://www.ldoceonline.com/old.mp3',
            replacementUrl: 'https://attacker.example/audio.mp3'
        }),
        /Host not allowed/
    );
});
