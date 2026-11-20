import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_FAILURE_CODES,
  AI_FAILURE_MESSAGES,
  aiFailureCodeOf,
} from "../services/aiFailureCodes.js";

test("every failure code carries a sentence a teacher may read", () => {
  for (const code of AI_FAILURE_CODES) {
    const message = AI_FAILURE_MESSAGES[code];
    assert.ok(message.length > 10, `${code} needs a readable sentence`);
    // The sentence must not leak the machinery behind the failure.
    assert.equal(
      /stack|undefined|TypeError|ECONN|openai|\.js\b/i.test(message),
      false,
      `${code} leaks internal detail`,
    );
  }
});

test("an explicit code wins over the message text", () => {
  const error = Object.assign(new Error("no credits left"), {
    aiCode: "AI_TIMEOUT",
  });
  assert.equal(aiFailureCodeOf(error), "AI_TIMEOUT");
});

test("an unlabelled exception is classified by what it says", () => {
  const cases = [
    ["Request timed out after 60s", "AI_TIMEOUT"],
    ["The reply was not JSON", "AI_INVALID_REPLY"],
    ["The reply did not meet the school's content rules", "AI_CONTENT_REJECTED"],
    ["connect ECONNREFUSED 10.0.0.1", "AI_PROVIDER_ERROR"],
    ["Maximum call stack size exceeded", "AI_DEPTH_GUARD"],
    ["There are not enough AI credits", "CREDIT_EXHAUSTED"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(aiFailureCodeOf(new Error(message)), expected, message);
  }
});

test("a credit gate keeps its own reason instead of the catch-all credit sentence", () => {
  const cases = [
    ["AI_CREDIT_REQUIRED", "You have no AI credit left.", "CREDIT_EXHAUSTED"],
    ["AI_CREDIT_PAUSED", "Your AI credit is paused by the school admin.", "AI_CREDIT_PAUSED"],
    [
      "AI_CREDIT_PRICING_REQUIRED",
      "The AI credit markup is not configured.",
      "AI_CREDIT_PRICING_REQUIRED",
    ],
  ];
  for (const [code, message, expected] of cases) {
    assert.equal(aiFailureCodeOf(Object.assign(new Error(message), { code })), expected, code);
  }
});

test("the provider running out of balance is never the school's balance", () => {
  const upstream = (message) =>
    Object.assign(new Error(`AI service request failed (gpt-5.4-mini): ${message}`), {
      code: "OPENAI_UPSTREAM_ERROR",
    });
  assert.equal(aiFailureCodeOf(upstream("Insufficient credits")), "AI_PROVIDER_QUOTA");
  assert.equal(
    aiFailureCodeOf(upstream("Your credit balance is too low")),
    "AI_PROVIDER_QUOTA",
  );
  assert.equal(aiFailureCodeOf(upstream("HTTP 500")), "AI_PROVIDER_ERROR");
});

test("an exception that only mentions credit is not a credit refusal", () => {
  assert.equal(
    aiFailureCodeOf(new Error("The AI credit markup is not configured.")),
    "INTERNAL",
  );
});

test("an unknown exception is INTERNAL, never the raw text", () => {
  assert.equal(aiFailureCodeOf(new Error("TypeError: x is not a function")), "INTERNAL");
  assert.equal(aiFailureCodeOf(undefined), "INTERNAL");
});
