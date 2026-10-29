import { GoogleGenAI } from "@google/genai";
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

const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = [
  process.env.GEMINI_FALLBACK_MODEL,
  "gemini-3.1-pro-preview",
].filter(Boolean);

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_TIMEOUT_MS = () => Number(process.env.OPENAI_TIMEOUT_MS) || 120000;

const isRetryableAiError = (error) => {
  const status = Number(error?.status || error?.code);
  const apiStatus = String(error?.error?.status || "").toUpperCase();
  return status === 429 || status === 503 || apiStatus === "UNAVAILABLE" || apiStatus === "RESOURCE_EXHAUSTED";
};

const toSafeAiError = (error, modelName) => {
  const status = Number(error?.status || error?.code || 503);
  const upstreamMessage =
    error?.error?.message ||
    error?.message ||
    "AI service is temporarily unavailable. Please try again.";

  const wrapped = new Error(`AI service request failed (${modelName}): ${upstreamMessage}`);
  wrapped.statusCode = status >= 400 && status < 600 ? status : 503;
  wrapped.code = error?.error?.status || error?.code || "AI_UPSTREAM_ERROR";
  return wrapped;
};

/**
 * Infer MIME type from a URL or file extension.
 */
function inferMime(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

/**
 * Fetch a remote image and return it as a base64 string with its MIME type.
 */
async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || inferMime(url);
  return { data: buffer.toString('base64'), mimeType };
}

/**
 * OpenAI Chat Completions provider. Kept behind an explicit option so only the
 * callers that ask for it leave Gemini; no global switch, no silent cross-provider
 * fallback when the key is missing or the request fails.
 */
async function connectOpenAi(prompt, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = options.modelName || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

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
    const error = new Error("Image input is not supported for this AI provider");
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

const isRetryableOpenAiStatus = (status) => status === 429 || status >= 500;

const openAiError = (status, message, modelName) => {
  const error = new Error(`AI service request failed (${modelName}): ${message}`);
  error.statusCode = status >= 400 && status < 600 ? status : 502;
  error.status = status;
  error.code = "OPENAI_UPSTREAM_ERROR";
  return error;
};

export async function connectAi(prompt, options = {}) {
  await gateAiCredit(options);

  const provider = String(options.provider || "gemini").toLowerCase();
  if (provider === "openai") return meterReply(await connectOpenAi(prompt, options), options);
  if (provider !== "gemini") {
    const error = new Error(`Unknown AI provider: ${provider}`);
    error.status = 400;
    throw error;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  const modelName = options.modelName || DEFAULT_MODEL_NAME;

  if (!apiKey) {
    logger.error("GEMINI_API_KEY is not set in environment variables");
    const error = new Error("AI Service is not configured (missing API Key)");
    error.status = 500;
    throw error;
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    const error = new Error("AI prompt must be a non-empty string");
    error.status = 400;
    throw error;
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build contents: support optional image URLs for vision tasks
    let contents;
    if (options.imageUrls?.length) {
      const parts = [{ text: prompt }];
      for (const url of options.imageUrls) {
        const img = await fetchImageAsBase64(url);
        parts.push({
          inlineData: {
            data: img.data,
            mimeType: img.mimeType
          }
        });
      }
      contents = [{ role: 'user', parts }];
    } else {
      contents = prompt;
    }

    const modelsToTry = [modelName, ...FALLBACK_MODELS.filter((m) => m !== modelName)];
    let lastError = null;

    for (const candidateModel of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: candidateModel,
          contents,
        });
        const usage = response?.usageMetadata || {};
        const text =
          typeof response?.text === "function"
            ? response.text()
            : response?.text || "";

        return meterReply({
          text,
          inputtokenCount: usage.promptTokenCount || 0,
          outputtokenCount: usage.candidatesTokenCount || 0,
          totalTokenCount: usage.totalTokenCount || 0,
          modelName: candidateModel,
        }, options);
      } catch (candidateError) {
        lastError = candidateError;
        logger.warn("AI model attempt failed", {
          model: candidateModel,
          status: candidateError?.status || candidateError?.code,
          apiStatus: candidateError?.error?.status,
          message: candidateError?.message,
        });

        // Skip fallback unless failure is likely transient/capacity related.
        if (!isRetryableAiError(candidateError)) {
          break;
        }
      }
    }

    throw toSafeAiError(lastError || new Error("Unknown AI error"), modelName);
  } catch (error) {
    logger.error("AI API Error:", error);
    if (error?.statusCode) throw error;
    throw toSafeAiError(error, modelName);
  }
}
