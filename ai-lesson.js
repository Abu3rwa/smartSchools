// Scratch file for learning the GPT API. Run from this folder: node ai-lesson.js "your question"
import "dotenv/config";

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = "https://api.openai.com/v1";
const model = "gpt-5.4-mini";

// The template: change these three to experiment.
const systemPrompt =
  "You are a friendly tutor. Explain simply in two or three short sentences.";
const userPrompt = "Good Morning";
const wantJson = false; // true asks for a JSON object back

async function askGpt({ system, user, json = false }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (check server/.env)");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Request failed with status ${response.status}`,
    );
  }
  return {
    text: payload.choices?.[0]?.message?.content?.trim() || "",
    tokens: payload.usage?.total_tokens ?? 0,
  };
}

try {
  const { text, tokens } = await askGpt({
    system: systemPrompt,
    user: userPrompt,
    json: wantJson,
  });
  console.log(
    `\nModel: ${model}\nQ: ${userPrompt}\n\n${text}\n\nTokens used: ${tokens}`,
  );
} catch (error) {
  console.error("GPT call failed:", error.message);
  process.exitCode = 1;
}
