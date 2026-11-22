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
    assert.equal(body.service_tier, 'default');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Write JSON.' }]);

    assert.equal(reply.text, '{"ok":true}');
    assert.equal(reply.modelName, 'gpt-test-mini');
    assert.equal(reply.inputtokenCount, 120);
    assert.equal(reply.outputtokenCount, 40);
    assert.equal(reply.totalTokenCount, 160);
});

test('openai returns cached usage and the actual model snapshot without double-counting reasoning', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse({
        ...openAiReply(),
        model: 'gpt-5.4-mini-2026-03-17',
        usage: {
            prompt_tokens: 1200,
            prompt_tokens_details: { cached_tokens: 1024 },
            completion_tokens: 300,
            completion_tokens_details: { reasoning_tokens: 200 },
            total_tokens: 1500
        }
    }));
    const reply = await connectAi('Write JSON.', { provider: 'openai' });
    assert.equal(reply.modelName, 'gpt-5.4-mini-2026-03-17');
    assert.equal(reply.inputtokenCount, 1200);
    assert.equal(reply.cachedInputtokenCount, 1024);
    assert.equal(reply.outputtokenCount, 300);
    assert.equal(reply.totalTokenCount, 1500);
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

test('a requested reasoning effort travels with the advanced body', async (t) => {
    withOpenAiEnv(t);
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        calls.push(init);
        return jsonResponse(openAiReply());
    });

    await connectAi('Design a slide.', { provider: 'openai', json: true, maxTokens: 900, reasoningEffort: 'Medium' });

    const body = JSON.parse(calls[0].body);
    assert.equal(body.reasoning_effort, 'medium');
    assert.equal(body.max_completion_tokens, 900);
    assert.deepEqual(body.response_format, { type: 'json_object' });
});

test('an endpoint that refuses reasoning_effort gets the plain request instead of failing', async (t) => {
    withOpenAiEnv(t);
    const bodies = [];
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1) {
            return jsonResponse({ error: { message: "Unsupported parameter: 'reasoning_effort'" } }, 400);
        }
        return jsonResponse(openAiReply());
    });

    const reply = await connectAi('Design a slide.', { provider: 'openai', json: true, reasoningEffort: 'medium' });

    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].reasoning_effort, 'medium');
    assert.equal('reasoning_effort' in bodies[1], false);
    assert.equal(reply.text, '{"ok":true}');
});

test('an unknown reasoning effort is rejected before any provider call', async (t) => {
    withOpenAiEnv(t);
    let called = false;
    t.mock.method(globalThis, 'fetch', async () => {
        called = true;
        return jsonResponse(openAiReply());
    });

    await assert.rejects(
        () => connectAi('Design a slide.', { provider: 'openai', reasoningEffort: 'extreme' }),
        (error) => error.status === 400 && /reasoningEffort/.test(error.message)
    );
    assert.equal(called, false);
});

test('deferCharge skips the credit gate and returns token counts to the caller', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply()));

    const reply = await connectAi('Design a slide.', {
        provider: 'openai',
        deferCharge: true,
        usage: { schoolId: '665f1f77bcf86cd799439011', userId: '665f1f77bcf86cd799439012', billable: true }
    });

    assert.equal(reply.inputtokenCount, 120);
    assert.equal(reply.outputtokenCount, 40);
    assert.equal(reply.usage, undefined);
});

test('an unknown provider is rejected instead of falling back silently', async () => {
    await assert.rejects(
        () => connectAi('Write JSON.', { provider: 'nonsense' }),
        (error) => error.status === 400 && /Unknown AI provider/.test(error.message)
    );
});
