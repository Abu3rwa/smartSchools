import { GoogleGenAI } from "@google/genai";

const modelName = "gemini-2.5-flash-lite";
const apiKey =
  process.env.GEMINI_API_KEY_TWO || "AIzaSyDTXLa32vwUm5w81wMz2w67JPjkp3HRQK0";

export async function connectAi(prompt) {
  if (!apiKey) {
    console.warn("GEMINI_API_KEY_TWO is not set in .env");
    throw new Error("AI Service is not configured (missing API Key)");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey });

  console.log(
    "Using API Key starting with:",
    ai.apiKey?.substring(0, 10) + "...",
  );

  // --- Step 1: Count the Tokens ---
  const countResult = await ai.models.countTokens({
    model: modelName,
    contents: prompt,
  });

  console.log(`Total Tokens: ${countResult.totalTokens}`);

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
