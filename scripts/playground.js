/**
 * Structured Outputs Playground (Gemini)
 *
 * What you learn here:
 * - How to force Gemini to output valid JSON that matches a JSON Schema
 * - How to parse the result with JSON.parse safely
 *
 * Run:
 *   node scripts/playground.js
 *
 * Requirements:
 * - Set an API key in .env (recommended) OR rely on your existing env setup.
 *
 * See also: node scripts/tenantIsolationPlayground.js for how tenant isolation works (school-scoped queries).
 */

import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";

if (!apiKey) {
  throw new Error(
    "Missing API key. Set GEMINI_API_KEY in server/.env",
  );
}

const ai = new GoogleGenAI({ apiKey });
const model = "gemini-2.5-flash-lite";

// 1) Write your prompt like normal (the schema controls the output format).
const prompt = `
Write a short weekly class newsletter section for parents about Social Studies.
It should mention what students learned and how parents can help at home.
Keep it between 100 and 120 words.
`.trim();

// 2) Define a JSON Schema for the *exact* structure you want back.
// Gemini will output JSON matching this schema (no markdown, no extra text).
const newsletterSectionSchema = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "The newsletter section text (30-40 words).",
    },
    keyTopics: {
      type: "array",
      items: { type: "string" },
      description: "Main topics covered in the section.",
      minItems: 0,
      maxItems: 8,
    },
    homeworkMentioned: {
      type: "boolean",
      description: "True if homework was mentioned.",
    },
  },
  required: ["content", "wordCount", "keyTopics", "homeworkMentioned"],
  additionalProperties: false,
};

// 3) Call Gemini with structured output config.
const response = await ai.models.generateContent({
  model,
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: newsletterSectionSchema,
  },
});

// 4) The response is a JSON string. Parse it.
const structured = JSON.parse(response.text);

// 5) (Optional) Validate a business rule yourself (schema does NOT guarantee this).
const words = structured.content.trim().split(/\s+/).filter(Boolean);

console.log("Raw JSON text from Gemini:");
console.log(response.text);
console.log("\nParsed object:");
console.log(structured);
