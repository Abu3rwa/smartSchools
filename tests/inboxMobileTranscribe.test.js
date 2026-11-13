import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';

import logger from '../utils/logger.js';
import { transcribeAudio } from '../services/voiceSpeech.js';
import { transcribeAudioNote } from '../controllers/inboxAssistantController.js';

const AUDIO = Buffer.from('fake-recording-bytes');
const TRANSCRIPT = 'قل للمعلم إن ابني سيحضر غدا';

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

const withLoggerCaptured = async (run) => {
    const captured = [];
    const original = { warn: logger.warn, error: logger.error, info: logger.info };
    logger.warn = (event, meta) => captured.push([event, meta]);
    logger.error = (event, meta) => captured.push([event, meta]);
    logger.info = (event, meta) => captured.push([event, meta]);
    try {
        return await run(captured);
    } finally {
        Object.assign(logger, original);
    }
};

/** Answers with a transcript and records what would have been sent to the provider. */
const transcribeStub = (transcript = TRANSCRIPT) => {
    const sent = {};
    sent.fetch = async (url, init = {}) => {
        sent.url = url;
        sent.form = init.body;
        sent.signal = init.signal;
        return { ok: true, status: 200, json: async () => ({ text: transcript }) };
    };
    return sent;
};

const failingTranscribe = (status = 503) => async () => ({
    ok: false,
    status,
    json: async () => ({ error: { message: 'The transcription service is busy' } })
});

const callHandler = ({ file, body = {} } = {}) => new Promise((resolve) => {
    const payload = {};
    const errors = [];
    const settle = () => resolve({ payload, errors });
    transcribeAudioNote(
        { file, body },
        { json: (value) => { Object.assign(payload, value); settle(); } },
        (error) => { errors.push(error); settle(); }
    );
});

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a dictated reply note comes back as text only', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        const sent = transcribeStub();
        const { payload, errors } = await withFetch(sent.fetch, () => callHandler({
            file: { buffer: AUDIO, mimetype: 'audio/webm' }
        }));

        assert.deepEqual(errors, []);
        assert.deepEqual(payload, { text: TRANSCRIPT });
        assert.equal(sent.form.get('language'), 'ar');
        assert.equal(sent.form.get('model'), 'gpt-4o-mini-transcribe');
        assert.match(sent.url, /\/audio\/transcriptions$/);
    });
});

test('English dictation is transcribed as English', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        const sent = transcribeStub('Tell the teacher my son will attend.');
        await withFetch(sent.fetch, () => callHandler({
            file: { buffer: AUDIO, mimetype: 'audio/mp4' },
            body: { language: 'en' }
        }));
        assert.equal(sent.form.get('language'), 'en');
    });
});

test('a missing recording is refused before the provider is contacted', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(() => {
            throw new Error('fetch must not run');
        }, async () => {
            const { payload, errors } = await callHandler({});
            assert.deepEqual(payload, {});
            assert.equal(errors.length, 1);
            assert.equal(errors[0].statusCode, 400);
            assert.match(errors[0].message, /Record what the reply should say/);
        });
    });
});

test('a provider failure stays retryable and never logs the words', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withLoggerCaptured(async (captured) => {
            const { errors } = await withFetch(failingTranscribe(), () => callHandler({
                file: { buffer: AUDIO, mimetype: 'audio/webm' }
            }));

            assert.equal(errors.length, 1);
            assert.equal(errors[0].statusCode, 502);
            assert.equal(errors[0].code, 'VOICE_SPEECH_FAILED');

            const logged = JSON.stringify(captured);
            assert.ok(captured.length > 0, 'the failure must be logged');
            assert.doesNotMatch(logged, new RegExp(TRANSCRIPT, 'i'));
        });
    });
});

test('a successful transcription logs nothing about the words spoken', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withLoggerCaptured(async (captured) => {
            const sent = transcribeStub();
            await withFetch(sent.fetch, () => callHandler({
                file: { buffer: AUDIO, mimetype: 'audio/webm' }
            }));
            assert.doesNotMatch(JSON.stringify(captured), new RegExp(TRANSCRIPT, 'i'));
        });
    });
});

test('the note carries its own deadline instead of the two minute default', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        const sent = transcribeStub();
        await withFetch(sent.fetch, () => transcribeAudio({
            buffer: AUDIO,
            mimeType: 'audio/webm',
            language: 'ar',
            timeoutMs: 20
        }));
        assert.ok(sent.signal instanceof AbortSignal);
        await settle(60);
        assert.equal(sent.signal.aborted, true);
        assert.equal(sent.signal.reason?.name, 'TimeoutError');
    });
});

test('the default deadline is still the shared AI timeout', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        const sent = transcribeStub();
        await withFetch(sent.fetch, () => transcribeAudio({ buffer: AUDIO, language: 'ar' }));
        assert.ok(sent.signal instanceof AbortSignal);
        await settle(60);
        assert.equal(sent.signal.aborted, false);
    });
});

test('a recording without speech is a 422 the phone can show', async () => {
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
        await withFetch(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ text: '   ' })
        }), async () => {
            await assert.rejects(
                transcribeAudio({ buffer: AUDIO, language: 'ar' }),
                (error) => error.statusCode === 422
            );
        });
    });
});
