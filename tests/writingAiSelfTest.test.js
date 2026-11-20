/**
 * I12: the staff self-test. It must prove the writing AI path works without a
 * student draft, report a typed cause, stay unmetered, and never echo the key or
 * the exception text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

import { AI_FAILURE_MESSAGES } from "../services/aiFailureCodes.js";
import { testWritingAi } from "../services/writingAiSelfTestService.js";

const withKey = async (value, run) => {
  const original = process.env.OPENAI_API_KEY;
  if (value === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = value;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
};

test("a missing key is reported before any provider call", async () => {
  await withKey(undefined, async () => {
    let called = false;
    const result = await testWritingAi({
      call: async () => {
        called = true;
        return { text: "{}" };
      },
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "AI_NOT_CONFIGURED");
    assert.equal(result.provider, "openai");
    assert.match(result.message, /key is missing/);
  });
});

test("a good reply reports provider, model and latency without the key", async () => {
  await withKey("sk-test-secret", async () => {
    let seen = null;
    const result = await testWritingAi({
      call: async (prompt, options) => {
        seen = { prompt, options };
        return { text: '{"ok":true,"check":"writing"}', modelName: "gpt-test" };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-test");
    assert.equal(result.errorCode, "");
    assert.ok(Number.isFinite(result.latencyMs) && result.latencyMs >= 0);

    // A diagnostic carries no draft and never reaches the credit ledger.
    assert.equal(seen.options.usage, false);
    assert.equal(seen.options.json, true);
    assert.equal(seen.options.provider, "openai");
    assert.ok(seen.options.maxTokens <= 64);
    assert.ok(!/student|draft/i.test(seen.prompt));

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("sk-test-secret"));
  });
});

test("a reply that is not JSON is an invalid-reply failure", async () => {
  await withKey("sk-test-secret", async () => {
    const result = await testWritingAi({
      call: async () => ({ text: "Sure, the AI works.", modelName: "gpt-test" }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "AI_INVALID_REPLY");
    assert.equal(result.message, AI_FAILURE_MESSAGES.AI_INVALID_REPLY);
    assert.equal(result.model, "gpt-test");
  });
});

test("provider errors are typed and the exception text stays out of the report", async () => {
  await withKey("sk-test-secret", async () => {
    const result = await testWritingAi({
      call: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.1");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "AI_PROVIDER_ERROR");
    assert.equal(result.message, AI_FAILURE_MESSAGES.AI_PROVIDER_ERROR);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("ECONNREFUSED"));
    assert.ok(!serialized.includes("10.0.0.1"));
    assert.ok(!serialized.includes("sk-test-secret"));
  });
});

test("a timeout is reported as a timeout", async () => {
  await withKey("sk-test-secret", async () => {
    const result = await testWritingAi({
      call: async () => {
        throw new Error("Request timed out");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "AI_TIMEOUT");
    assert.equal(result.message, AI_FAILURE_MESSAGES.AI_TIMEOUT);
  });
});
