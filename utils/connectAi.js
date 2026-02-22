import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const DEFAULT_MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export async function connectAi(prompt, options = {}) {
  // const apiKey = process.env.GEMINI_API_KEY 
  const apiKey = "AIzaSyDqh0yjSlSGkRrZMO8Iz0S9YP6RCKlmUc0";
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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
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
