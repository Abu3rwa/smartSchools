import { GoogleGenAI } from "@google/genai";
import logger from "./logger.js";

const modelName = "gemini-2.5-flash-lite";
 const apiKey = "AIzaSyB6u4-Vf39uvXhH3hZAbQFlNK516XxAW5A";

export async function connectAi(prompt, options) {
  if (!apiKey) {
    logger.error("GEMINI_API_KEY is not set in environment variables");
    const error = new Error("AI Service is not configured (missing API Key)");
    error.status = 500;
    throw error;
  }
  
  try {
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
  } catch (error) {
    logger.error("AI API Error:", error);
    // Preserve the error status and message for better error handling upstream
    throw error;
  }
}
