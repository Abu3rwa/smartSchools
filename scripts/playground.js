import {GoogleGenAI} from '@google/genai';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const ai = new GoogleGenAI({apiKey: GOOGLE_API_KEY});

async function main() {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'What is the time in libya now',
    maxOutputTokens: 10,
  });
 console.log(response.text)
}

main();