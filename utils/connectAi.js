import {GoogleGenAI} from '@google/genai';
const keys = {
 main: "AIzaSyDTXLa32vwUm5w81wMz2w67JPjkp3HRQK0",
 secondary: "AIzaSyBBrYJ965sMrlt_wYlIcYRF4dPBQfsYUdk",
 third:"AIzaSyCAquHJg6pmVYkMz6ZmcztES783NMusA7I",
 forth:  "AIzaSyB6u4-Vf39uvXhH3hZAbQFlNK516XxAW5A" // Backup key. from the school's email
};

const apiKey = process.env.NEW_GEMINI_API_KEY || keys.main;
 
export async function connectAi(prompt) {
   if (!apiKey) {
            console.warn('NEW_GEMINI_API_KEY is not set in .env');
            throw new Error("AI Service is not configured (missing API Key)");
        }
const ai = new GoogleGenAI({apiKey: apiKey});

console.log("Using API Key starting with:", ai.apiKey?.substring(0, 10) + "...");

  const modelName = 'gemini-2.5-flash'; // Note: check valid model names (e.g., 1.5 or 2.0)

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

  return {text: response.text,
     inputtokenCount: usage.promptTokenCount, 
     outputtokenCount: usage.candidatesTokenCount, 
     totalTokenCount: usage.totalTokenCount};
}
 