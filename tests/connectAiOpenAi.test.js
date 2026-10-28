import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { connectAi } from '../utils/connectAi.js';

const KEYS = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_FALLBACK_MODEL'];

const withOpenAiEnv = (t, values = {}) => {
    const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
    process.env.OPENAI_API_KEY = 'sk-test';
    Object.assign(process.env, values);
    t.after(() => {
        for (const key of KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });
};

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const openAiReply = (text = '{"ok":true}') => ({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 }
});

test('openai provider refuses to run without a key', async (t) => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    t.after(() => {
        if (saved === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = saved;
    });

    await assert.rejects(
        () => connectAi('Write JSON.', { provider: 'openai' }),
        (error) => error.status === 500 && /OpenAI API Key/.test(error.message)
    );
});

test('openai provider posts the prompt and returns usage and the model used', async (t) => {
    withOpenAiEnv(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        calls.push({ url, init });
        return jsonResponse(openAiReply());
    });

    const reply = await connectAi('Write JSON.', { provider: 'openai', modelName: 'gpt-test-mini' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'gpt-test-mini');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Write JSON.' }]);

    assert.equal(reply.text, '{"ok":true}');
    assert.equal(reply.modelName, 'gpt-test-mini');
    assert.equal(reply.inputtokenCount, 120);
    assert.equal(reply.outputtokenCount, 40);
    assert.equal(reply.totalTokenCount, 160);
});

test('a rate-limited call surfaces the upstream status on the error', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(
        { error: { message: 'Rate limit reached for gpt-test-mini' } },
        429
    ));

    await assert.rejects(
        () => connectAi('Write JSON.', { provider: 'openai', modelName: 'gpt-test-mini' }),
        (error) => error.statusCode === 429 && /Rate limit/.test(error.message)
    );
});

test('a retryable failure moves to the fallback model when one is configured', async (t) => {
    withOpenAiEnv(t, { OPENAI_FALLBACK_MODEL: 'gpt-test-nano' });
    const models = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        const model = JSON.parse(init.body).model;
        models.push(model);
        if (model === 'gpt-test-mini') return jsonResponse({ error: { message: 'Overloaded' } }, 503);
        return jsonResponse(openAiReply('{"ok":true}'));
    });

    const reply = await connectAi('Write JSON.', { provider: 'openai', modelName: 'gpt-test-mini' });

    assert.deepEqual(models, ['gpt-test-mini', 'gpt-test-nano']);
    assert.equal(reply.modelName, 'gpt-test-nano');
});

test('an unknown provider is rejected instead of falling back silently', async () => {
    await assert.rejects(
        () => connectAi('Write JSON.', { provider: 'nonsense' }),
        (error) => error.status === 400 && /Unknown AI provider/.test(error.message)
    );
});
