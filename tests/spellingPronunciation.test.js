import test from 'node:test';
import assert from 'node:assert/strict';
import AiCreditSetting from '../models/AiCreditSetting.js';
import {
    AI_AUDIO_ENV,
    getPlatformSpellingAudioSettings,
    instructionFor,
    isAiAudioAllowed,
    isEnvForcedOff,
    normalizeStoredAudio,
    pronunciationKey,
    pronunciationUrl,
    resolveTtsConfig,
    savePlatformSpellingAudioSettings
} from '../services/spellingPronunciationService.js';

const stubQuery = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value });

const base = {
    word: 'castle',
    accent: 'us',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    instructions: instructionFor('us')
};

test('the deployment can only force AI word audio off', () => {
    assert.equal(AI_AUDIO_ENV, 'SPELLING_AI_AUDIO');
    assert.equal(isEnvForcedOff({}), false);
    assert.equal(isEnvForcedOff({ [AI_AUDIO_ENV]: '' }), false);
    assert.equal(isEnvForcedOff({ [AI_AUDIO_ENV]: 'true' }), false);
    assert.equal(isEnvForcedOff({ [AI_AUDIO_ENV]: 'false' }), true);
    assert.equal(isAiAudioAllowed({}), true);
    assert.equal(isAiAudioAllowed({ [AI_AUDIO_ENV]: 'false' }), false);
});

test('the platform switch is stored once and covers every school', async (t) => {
    let update;
    t.mock.method(AiCreditSetting, 'findOneAndUpdate', async (filter, mutation) => {
        update = { filter, mutation };
        return {};
    });
    t.mock.method(AiCreditSetting, 'findOne', () => stubQuery({ spellingAudio: { enabled: true } }));

    const saved = await savePlatformSpellingAudioSettings({ enabled: true, updatedBy: 'u1', env: {} });
    assert.deepEqual(update.filter, { key: 'default' });
    assert.equal(update.mutation.$set['spellingAudio.enabled'], true);
    assert.deepEqual(saved, { enabled: true, envForcedOff: false, available: true });

    t.mock.method(AiCreditSetting, 'findOne', () => stubQuery(null));
    assert.deepEqual(await getPlatformSpellingAudioSettings({}), { enabled: false, envForcedOff: false, available: false });
});

test('the deployment override beats the platform switch', async (t) => {
    t.mock.method(AiCreditSetting, 'findOne', () => stubQuery({ spellingAudio: { enabled: true } }));
    assert.deepEqual(
        await getPlatformSpellingAudioSettings({ [AI_AUDIO_ENV]: 'false' }),
        { enabled: true, envForcedOff: true, available: false }
    );
});

test('the platform switch rejects a missing boolean', async () => {
    await assert.rejects(() => savePlatformSpellingAudioSettings({ enabled: 'yes' }), /true or false/);
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
    assert.equal(pronunciationUrl('abcdef'), '/api/spelling/pronunciation/abcdef?v=2');
});

test('stored clips are served as real audio bytes, including rows saved as base64', () => {
    const mp3 = Buffer.from([0xff, 0xf3, 0xc4, 0xc4, 0x00, 0x5c, 0xa4, 0x39]);
    assert.deepEqual(normalizeStoredAudio(mp3), mp3);
    assert.deepEqual(normalizeStoredAudio(Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00])), Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]));
    assert.deepEqual(normalizeStoredAudio({ buffer: new Uint8Array(mp3) }), mp3);
    const quoted = Buffer.from(`"${mp3.toString('base64')}"`);
    assert.deepEqual(normalizeStoredAudio(quoted), mp3);
    const plain = Buffer.from(mp3.toString('base64'));
    assert.deepEqual(normalizeStoredAudio(plain), mp3);
    assert.equal(normalizeStoredAudio(null), null);
    const notAudio = Buffer.from('hello there');
    assert.deepEqual(normalizeStoredAudio(notAudio), notAudio);
});
