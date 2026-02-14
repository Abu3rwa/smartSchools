import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const modelName = "gemini-2.5-flash-lite";
const apiKey = process.env.GEMINI_API_KEY_TWO;

export async function connectAi(prompt, options) {
  if (!apiKey) {
    logger.error("GEMINI_API_KEY_TWO is not set in environment variables");
    throw new Error("AI Service is not configured (missing API Key)");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // --- Step 2: Generate Content (Optional) ---
  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
  });
  // usageMetadata is the property you want!
  const usage = response.usageMetadata;

  return {
    text: response.text,
    inputtokenCount: usage.promptTokenCount,
    outputtokenCount: usage.candidatesTokenCount,
    totalTokenCount: usage.totalTokenCount,
    modelName: modelName,
  };
}
