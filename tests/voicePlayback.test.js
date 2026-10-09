import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getVoiceOptions,
    playWithFallback,
    readStoredVoice,
    resolveVoice,
    storeVoice
} from '../client/src/utils/voicePlayback.js';

const audio = {
    dictionaries: {
        longman: { us: 'https://www.ldoceonline.com/us.mp3', examples: ['https://www.ldoceonline.com/e1.mp3'] },
        oxford: { uk: 'https://www.oxfordlearnersdictionaries.com/uk.mp3' }
    }
};

test('getVoiceOptions lists only the voices that exist for the word', () => {
    assert.deepEqual(getVoiceOptions(audio).map((option) => option.id), ['longman-us', 'oxford-uk']);
    assert.deepEqual(getVoiceOptions(undefined), []);
});

test('resolveVoice falls back to Default (null) when the choice is default or missing for the word', () => {
    assert.equal(resolveVoice(audio, 'default'), null);
    assert.equal(resolveVoice(audio, 'webster-us'), null);
    assert.equal(resolveVoice(audio, 'oxford-uk').url, audio.dictionaries.oxford.uk);
    assert.equal(resolveVoice(null, 'oxford-uk'), null);
});

test('voice choice is stored and read back, defaulting safely', () => {
    const memory = new Map();
    const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
    assert.equal(readStoredVoice(storage), 'default');
    storeVoice('oxford-uk', storage);
    assert.equal(readStoredVoice(storage), 'oxford-uk');
    assert.equal(readStoredVoice({ getItem: () => { throw new Error('blocked'); } }), 'default');
});

const fakeAudioFactory = (behaviour) => (src) => {
    const element = { src, pause() {}, play: () => behaviour(element) };
    return element;
};

test('playWithFallback uses Default immediately when there is no URL', () => {
    let defaults = 0;
    const result = playWithFallback({ url: null, playDefault: () => { defaults += 1; } });
    assert.equal(result.usedDefault, true);
    assert.equal(defaults, 1);
});

test('playWithFallback falls back to Default once when the file errors', async () => {
    let defaults = 0;
    let messages = 0;
    playWithFallback({
        url: 'https://www.ldoceonline.com/us.mp3',
        playDefault: () => { defaults += 1; },
        onFallback: () => { messages += 1; },
        createAudio: fakeAudioFactory((element) => { setTimeout(() => element.onerror(), 0); return Promise.resolve(); })
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(defaults, 1);
    assert.equal(messages, 1);
});

test('playWithFallback falls back when play() is rejected or the file times out', async () => {
    let defaults = 0;
    playWithFallback({
        url: 'https://www.ldoceonline.com/us.mp3',
        playDefault: () => { defaults += 1; },
        createAudio: fakeAudioFactory(() => Promise.reject(new Error('blocked')))
    });
    playWithFallback({
        url: 'https://www.ldoceonline.com/us.mp3',
        timeoutMs: 10,
        playDefault: () => { defaults += 1; },
        createAudio: fakeAudioFactory(() => new Promise(() => {}))
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(defaults, 2);
});

test('playWithFallback does not fall back when the custom audio ends normally', async () => {
    let defaults = 0;
    let ended = 0;
    playWithFallback({
        url: 'https://www.ldoceonline.com/us.mp3',
        playDefault: () => { defaults += 1; },
        onEnded: () => { ended += 1; },
        createAudio: fakeAudioFactory((element) => { setTimeout(() => element.onended(), 0); return Promise.resolve(); })
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(defaults, 0);
    assert.equal(ended, 1);
});
