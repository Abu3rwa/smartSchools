/**
 * AI service for lesson plan features: field suggestions, standards detection, and section generation.
 * Uses connectAi (Gemini) and follows patterns from standardsPracticeAIService and newsletterAiService.
 */

import { connectAi } from "../utils/connectAi.js";

const VALID_FIELDS = [
  "title",
  "summary",
  "description",
  "homework",
  "teachingObjectives",
  "vocabulary",
  "previousKnowledge",
  "characterTraitLinks",
  "techIntegration",
  "stageProcedure",
];

/**
 * Build field-specific instruction for suggest prompts
 */
function getFieldInstruction(field) {
  const instructions = {
    title: "Suggest a clearer, more structured lesson title.",
    summary:
      "Expand into a concise 2–3 sentence summary suitable for parents.",
    description:
      "Expand into a detailed lesson description with key activities.",
    teachingObjectives:
      "Convert to formal learning objectives (SMART format).",
    vocabulary:
      "Suggest 5–8 age-appropriate vocabulary terms, comma-separated.",
    homework: "Generate homework aligned with the lesson content.",
    previousKnowledge:
      "Expand into prerequisites or prior knowledge students need.",
    characterTraitLinks:
      "Suggest soft skills or character traits this lesson develops.",
    techIntegration:
      "Suggest age-appropriate technology integration ideas.",
    stageProcedure:
      "Expand into step-by-step procedure instructions.",
  };
  return instructions[field] || "Improve or expand the content.";
}

/**
 * Suggest content for a single lesson plan field
 * @param {Object} options
 * @param {string} options.field - Field name (title, summary, description, etc.)
 * @param {string} options.currentValue - Current value in the field
 * @param {Object} options.context - { subjectName, gradeLevel, title, summary, stageIndex }
 */
export async function suggestFieldContent({
  field,
  currentValue,
  context = {},
}) {
  if (!VALID_FIELDS.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  const { subjectName = "", gradeLevel = "", title = "", summary = "" } =
    context;
  const instruction = getFieldInstruction(field);

  const prompt = `You are an experienced teacher. Given the following lesson context, suggest an improved or expanded value for the field "${field}".

CONTEXT:
- Subject: ${subjectName}
- Grade: ${gradeLevel}
- Lesson title: ${title}
- Current value: ${currentValue || "(empty)"}

TASK: ${instruction}

Provide ONLY the suggested text. No explanation, no quotes, no markdown.`;

  const response = await connectAi(prompt);
  const suggestion = (response.text || "").trim();

  return {
    text: suggestion,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}

/**
 * Extract JSON array from AI response, handling markdown and extra text
 */
function parseJsonArray(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  // Try direct parse
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : parsed.matches || null;
  } catch (_) {
    // Try to extract from markdown code blocks
    const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try {
        const parsed = JSON.parse(codeMatch[1].trim());
        return Array.isArray(parsed) ? parsed : parsed.matches || null;
      } catch (_2) {
        // fall through
      }
    }
    // Try to find array in text
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (_3) {
        // fall through
      }
    }
  }
  return null;
}

/**
 * Detect standards that align with lesson content
 * @param {Object} options
 * @param {string} options.schoolId - School ID (for tenant isolation)
 * @param {string} options.subjectId - Subject ID
 * @param {number} options.gradeLevel - Grade level (1-12)
 * @param {string} options.lessonText - Combined lesson content (title, summary, description, objectives)
 */
export async function detectStandardsFromContent({
  schoolId,
  subjectId,
  gradeLevel,
  lessonText,
  standards,
}) {
  if (!Array.isArray(standards) || standards.length === 0) {
    return {
      standards: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
    };
  }

  const maxStandards = 50;
  const standardsList = standards.slice(0, maxStandards).map((s) => ({
    _id: s._id.toString(),
    code: s.code || "",
    name: s.name || "",
    description: (s.description || "").slice(0, 200),
  }));

  const prompt = `You are an expert curriculum analyst. Given the following lesson content and list of standards, select the top 5–10 standards that BEST align with this lesson.

LESSON CONTENT:
${lessonText || "(No content provided)"}

AVAILABLE STANDARDS (subject, grade ${gradeLevel}):
${JSON.stringify(standardsList, null, 0)}

For each selected standard, provide:
- standardId (exact _id from the list)
- relevanceScore (0–1)
- explanation (1 sentence why it matches)

Output ONLY a valid JSON array. No markdown, no code fences, no extra text:
[
  { "standardId": "...", "relevanceScore": 0.92, "explanation": "..." },
  ...
]`;

  const response = await connectAi(prompt);
  const matches = parseJsonArray(response.text);

  if (!Array.isArray(matches) || matches.length === 0) {
    return {
      standards: [],
      tokenUsage: {
        input: response.inputtokenCount || 0,
        output: response.outputtokenCount || 0,
        total: response.totalTokenCount || 0,
      },
    };
  }

  const standardsById = Object.fromEntries(
    standards.map((s) => [s._id.toString(), s])
  );

  const result = matches
    .filter((m) => m?.standardId && standardsById[m.standardId])
    .map((m) => ({
      standardId: m.standardId,
      code: standardsById[m.standardId]?.code || "",
      name: standardsById[m.standardId]?.name || "",
      description: standardsById[m.standardId]?.description || "",
      relevanceScore: Math.min(1, Math.max(0, Number(m.relevanceScore) || 0)),
      explanation: (m.explanation || "").trim(),
    }))
    .slice(0, 10);

  return {
    standards: result,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}

/**
 * Generate multiple lesson plan sections from minimal input (title + context)
 * @param {Object} options
 * @param {string} options.title - Lesson title
 * @param {Object} options.context - { subjectName, gradeLevel }
 * @param {string[]} options.sourceFields - Fields to generate: summary, description, teachingObjectives, vocabulary
 */
export async function generateSection({
  title,
  context = {},
  sourceFields = ["summary", "description", "teachingObjectives", "vocabulary"],
}) {
  const { subjectName = "", gradeLevel = "" } = context;

  const prompt = `You are an experienced teacher. Generate lesson plan sections from the minimal input below.

INPUT:
- Subject: ${subjectName}
- Grade: ${gradeLevel}
- Title: ${title || "Untitled lesson"}

Generate the following fields. Use age-appropriate language and pedagogical best practices.
Output ONLY valid JSON. No markdown, no code fences, no extra text:
{
  "summary": "...",
  "description": "...",
  "teachingObjectives": "...",
  "vocabulary": "..."
}`;

  const response = await connectAi(prompt);
  let parsed = null;

  try {
    const raw = (response.text || "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (_) {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      generated: {},
      tokenUsage: {
        input: response.inputtokenCount || 0,
        output: response.outputtokenCount || 0,
        total: response.totalTokenCount || 0,
      },
    };
  }

  const generated = {};
  for (const key of sourceFields) {
    if (typeof parsed[key] === "string") {
      generated[key] = parsed[key].trim();
    }
  }

  return {
    generated,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}
