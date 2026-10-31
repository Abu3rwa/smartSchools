import logger from "./logger.js";
import { getAiUsageContext } from "./aiUsageContext.js";

/** True when this call belongs to a user request that must be billed. */
const isMetered = (options) =>
  options.usage !== false && (Boolean(options.usage) || Boolean(getAiUsageContext()));

/** Block a billable call with no credit before any provider is contacted. */
const gateAiCredit = async (options) => {
  if (!isMetered(options)) return;
  const { assertAiCredit } = await import("../services/aiUsageMeter.js");
  await assertAiCredit(options);
};

/** Record the finished reply on the credit ledger. Never breaks the AI answer. */
const meterReply = async (reply, options) => {
  if (!isMetered(options)) return reply;
  try {
    const { meterAiCall } = await import("../services/aiUsageMeter.js");
    const usage = await meterAiCall({ options, reply });
    return usage ? { ...reply, usage } : reply;
  } catch (error) {
    logger.warn("ai_usage_meter_failed", { error: error?.message });
    return reply;
  }
};

const DEFAULT_MODEL_NAME = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_TIMEOUT_MS = () => Number(process.env.OPENAI_TIMEOUT_MS) || 120000;

const isRetryableOpenAiStatus = (status) => status === 429 || status >= 500;

const openAiError = (status, message, modelName) => {
  const error = new Error(`AI service request failed (${modelName}): ${message}`);
  error.statusCode = status >= 400 && status < 600 ? status : 502;
  error.status = status;
  error.code = "OPENAI_UPSTREAM_ERROR";
  return error;
};

async function connectOpenAi(prompt, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = options.modelName || DEFAULT_MODEL_NAME;

  if (!apiKey) {
    logger.error("OPENAI_API_KEY is not set in environment variables");
    const error = new Error("AI Service is not configured (missing OpenAI API Key)");
    error.status = 500;
    throw error;
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    const error = new Error("AI prompt must be a non-empty string");
    error.status = 400;
    throw error;
  }

  if (options.imageUrls?.length) {
    const error = new Error("Image input is not supported.");
    error.status = 400;
    throw error;
  }

  const baseUrl = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const modelsToTry = [modelName, process.env.OPENAI_FALLBACK_MODEL]
    .filter((model, index, all) => model && all.indexOf(model) === index);

  let lastError = null;

  for (const candidateModel of modelsToTry) {
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          service_tier: "default",
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS()),
      });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      lastError = openAiError(timedOut ? 504 : 502, timedOut ? "Request timed out" : error?.message, candidateModel);
      logger.warn("OpenAI request failed", { model: candidateModel, message: error?.message });
      break;
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.error?.message || `HTTP ${response.status}`;
      logger.warn("OpenAI model attempt failed", {
        model: candidateModel,
        status: response.status,
        message,
      });
      lastError = openAiError(response.status, message, candidateModel);
      if (!isRetryableOpenAiStatus(response.status)) break;
      continue;
    }

    const text = payload?.choices?.[0]?.message?.content || "";
    if (!text.trim()) {
      lastError = openAiError(502, "The model returned an empty reply.", candidateModel);
      break;
    }

    const usage = payload?.usage || {};
    return {
      text,
      inputtokenCount: usage.prompt_tokens || 0,
      cachedInputtokenCount: usage.prompt_tokens_details?.cached_tokens || 0,
      outputtokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
      modelName: payload.model || candidateModel,
    };
  }

  throw lastError || openAiError(502, "Unknown AI error", modelName);
}

/**
 * Single AI gateway. GPT models only; `provider` is accepted for older callers
 * and must be "openai".
 */
export async function connectAi(prompt, options = {}) {
  await gateAiCredit(options);

  const provider = String(options.provider || "openai").toLowerCase();
  if (provider !== "openai") {
    const error = new Error(`Unknown AI provider: ${provider}`);
    error.status = 400;
    throw error;
  }

  return meterReply(await connectOpenAi(prompt, options), options);
}
