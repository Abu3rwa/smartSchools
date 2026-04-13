import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

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

    const response = await ai.models.generateContent({
      model: modelName,
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
      modelName,
    };
  } catch (error) {
    logger.error("AI API Error:", error);
    throw error;
  }
}
