import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { estimateSpeechSeconds, synthesizeSpeech, transcribeAudio } from '../services/voiceSpeech.js';

const withEnv = async (values, run) => {
    const previous = {};
    for (const [key, value] of Object.entries(values)) {
        previous[key] = process.env[key];
        process.env[key] = value;
    }
    try {
        return await run();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
};

const withFetch = async (fake, run) => {
    const original = globalThis.fetch;
    globalThis.fetch = fake;
    try {
        return await run();
    } finally {
        globalThis.fetch = original;
    }
};

test('a spoken reply is priced from about 2.5 words a second', () => {
    assert.equal(estimateSpeechSeconds(''), 0);
    assert.equal(estimateSpeechSeconds('one two three four five'), 2);
    assert.equal(estimateSpeechSeconds('word '.repeat(50)), 20);
});

test('an empty recording is rejected before any provider is contacted', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(() => { throw new Error('fetch must not run'); }, async () => {
            await assert.rejects(
                transcribeAudio({ buffer: Buffer.alloc(0) }),
                (error) => error.statusCode === 422
            );
        });
    });
});

test('a missing provider key tells the student the tutor is not set up', async () => {
    await withEnv({ OPENAI_API_KEY: '' }, async () => {
        await withFetch(() => { throw new Error('fetch must not run'); }, async () => {
            await assert.rejects(
                transcribeAudio({ buffer: Buffer.from('audio') }),
                (error) => error.code === 'VOICE_NOT_CONFIGURED'
                    && error.statusCode === 422
                    && /not set up yet/.test(error.message)
            );
        });
    });
});

test('a transcript comes back trimmed', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(async (url) => {
            assert.match(String(url), /\/audio\/transcriptions$/);
            return new globalThis.Response(JSON.stringify({ text: '  the nile flooded  ' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }, async () => {
            const result = await transcribeAudio({ buffer: Buffer.from('audio'), mimeType: 'audio/webm' });
            assert.deepEqual(result, { text: 'the nile flooded' });
        });
    });
});

test('a failed transcription never returns a guess', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(async () => new globalThis.Response(JSON.stringify({ error: { message: 'bad' } }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        }), async () => {
            await assert.rejects(
                transcribeAudio({ buffer: Buffer.from('audio') }),
                (error) => error.statusCode === 502
            );
        });
    });
});

test('speech is fetched once and then served from the cache', async () => {
    let calls = 0;
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(async () => {
            calls += 1;
            return new globalThis.Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }, async () => {
            const first = await synthesizeSpeech({ text: 'A sentence read aloud once.' });
            const second = await synthesizeSpeech({ text: 'A sentence read aloud once.' });
            assert.equal(calls, 1);
            assert.equal(first.contentType, 'audio/mpeg');
            assert.deepEqual([...second.buffer], [1, 2, 3]);
        });
    });
});

test('nothing to read is a 400, not an empty audio file', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(() => { throw new Error('fetch must not run'); }, async () => {
            await assert.rejects(
                synthesizeSpeech({ text: '   ' }),
                (error) => error.statusCode === 400
            );
        });
    });
});
