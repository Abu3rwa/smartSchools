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
    replaceSchoolWordAudioExample,
    searchSchoolWordAudioExamples
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

test('example search returns only audio for spelling words in the requesting school', async (t) => {
    let spellingFilter;
    let audioFilter;
    const words = [{ word: 'Cat', normalizedWord: 'cat', grade: 'G1' }];
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
        return stubQuery([{ word: 'cat', examples: { longman: ['https://www.ldoceonline.com/ex1.mp3'] } }]);
    });

    const results = await searchSchoolWordAudioExamples({ schoolId: 'school1', query: 'ca' });
    assert.deepEqual(spellingFilter, { school: 'school1', normalizedWord: { $regex: 'ca' } });
    assert.deepEqual(audioFilter, { word: { $in: ['cat'] } });
    assert.deepEqual(results, [{
        word: 'Cat',
        grade: 'G1',
        examples: [{ dictionary: 'longman', url: 'https://www.ldoceonline.com/ex1.mp3' }]
    }]);
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
