import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AI_AUDIO_ENV,
    instructionFor,
    isAiAudioAllowed,
    pronunciationKey,
    pronunciationUrl,
    resolveTtsConfig
} from '../services/spellingPronunciationService.js';

const base = {
    word: 'castle',
    accent: 'us',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    instructions: instructionFor('us')
};

test('AI word audio is off unless the platform switch is on', () => {
    assert.equal(AI_AUDIO_ENV, 'SPELLING_AI_AUDIO');
    assert.equal(isAiAudioAllowed({}), false);
    assert.equal(isAiAudioAllowed({ [AI_AUDIO_ENV]: 'false' }), false);
    assert.equal(isAiAudioAllowed({ [AI_AUDIO_ENV]: 'true' }), true);
});

test('the TTS model and both voices can be overridden per deployment', () => {
    const defaults = resolveTtsConfig({});
    assert.equal(defaults.model, 'gpt-4o-mini-tts');
    assert.notEqual(defaults.voices.us, defaults.voices.uk);

    const overridden = resolveTtsConfig({
        SPELLING_TTS_MODEL: 'tts-test',
        SPELLING_TTS_VOICE_US: 'voice-a',
        SPELLING_TTS_VOICE_UK: 'voice-b'
    });
    assert.deepEqual(overridden, { model: 'tts-test', voices: { us: 'voice-a', uk: 'voice-b' } });
});

test('one instruction per accent, and it names the accent', () => {
    assert.notEqual(instructionFor('us'), instructionFor('uk'));
    assert.match(instructionFor('us'), /American English/);
    assert.match(instructionFor('uk'), /British English/);
});

test('the clip key ignores case, spacing and hyphens in the word', () => {
    const key = pronunciationKey(base);
    assert.equal(pronunciationKey({ ...base, word: '  CASTLE  ' }), key);
    assert.equal(pronunciationKey({ ...base, word: 'ice-cream' }), pronunciationKey({ ...base, word: 'Ice Cream' }));
});

test('the clip key changes with every voice input', () => {
    const key = pronunciationKey(base);
    assert.notEqual(pronunciationKey({ ...base, accent: 'uk', instructions: instructionFor('uk') }), key);
    assert.notEqual(pronunciationKey({ ...base, model: 'other-model' }), key);
    assert.notEqual(pronunciationKey({ ...base, voice: 'fable' }), key);
    assert.notEqual(pronunciationKey({ ...base, instructions: 'Say it slowly.' }), key);
});

test('pronunciation URLs point at the public audio route', () => {
    assert.equal(pronunciationUrl('abcdef'), '/api/spelling/pronunciation/abcdef');
});
