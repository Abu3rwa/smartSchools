/**
 * I12: one small, unmetered AI call so a configuration problem is diagnosable
 * without waiting for a student draft. The fixed prompt carries no draft and no
 * personal data, the report names the provider, model and latency, and a failure
 * is reported by its typed code with the teacher-safe sentence — never the
 * exception text, which can name a library, a host or a file path.
 */
import { connectAi } from "../utils/connectAi.js";
import logger from "../utils/logger.js";
import { AI_FAILURE_MESSAGES, aiFailureCodeOf } from "./aiFailureCodes.js";
import { WRITING_AI } from "./writingAssistantAssessmentService.js";
import { extractJsonObject } from "./writingAssistantPrompts.js";

export const SELF_TEST_PROMPT =
  'This is a configuration check. Reply with one JSON object only, no other text: {"ok":true,"check":"writing"}';

const report = ({ ok, reply, latencyMs, errorCode = "", message = "" }) => ({
  ok,
  provider: WRITING_AI.provider,
  model: reply?.modelName || "",
  latencyMs,
  errorCode,
  message,
});

export const testWritingAi = async ({ call = connectAi } = {}) => {
  if (!String(process.env.OPENAI_API_KEY || "").trim()) {
    return report({
      ok: false,
      latencyMs: 0,
      errorCode: "AI_NOT_CONFIGURED",
      message:
        "The AI key is missing on this server. Ask your administrator to set it.",
    });
  }

  const startedAt = Date.now();
  let reply = null;
  try {
    reply = await call(SELF_TEST_PROMPT, {
      ...WRITING_AI,
      json: true,
      maxTokens: 64,
      // A diagnostic is not a school's draft: it must never touch the ledger.
      usage: false,
    });
  } catch (error) {
    const errorCode = aiFailureCodeOf(error);
    logger.warn("writing_ai_self_test_failed", {
      errorCode,
      message: error?.message,
    });
    return report({
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorCode,
      message: AI_FAILURE_MESSAGES[errorCode] || AI_FAILURE_MESSAGES.INTERNAL,
    });
  }

  const latencyMs = Date.now() - startedAt;
  if (!extractJsonObject(reply?.text)) {
    return report({
      ok: false,
      reply,
      latencyMs,
      errorCode: "AI_INVALID_REPLY",
      message: AI_FAILURE_MESSAGES.AI_INVALID_REPLY,
    });
  }

  return report({ ok: true, reply, latencyMs });
};
