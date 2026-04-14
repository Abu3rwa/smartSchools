import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const FALLBACK_MODELS = [
  process.env.GEMINI_FALLBACK_MODEL,
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
].filter(Boolean);

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

export async function connectAi(prompt, options = {}) {
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

        return {
          text,
          inputtokenCount: usage.promptTokenCount || 0,
          outputtokenCount: usage.candidatesTokenCount || 0,
          totalTokenCount: usage.totalTokenCount || 0,
          modelName: candidateModel,
        };
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
