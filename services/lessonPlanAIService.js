/**
 * AI service for lesson plan features: field suggestions, standards detection, and section generation.
 * Uses connectAi (Gemini) and follows patterns from standardsPracticeAIService and newsletterAiService.
 */

import { connectAi } from "../utils/connectAi.js";
import { getLanguageLabel } from "../utils/aiLanguageUtils.js";

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

function buildLessonPromptLanguageRule(requestedLanguages = ["en"]) {
  const normalized = Array.isArray(requestedLanguages) && requestedLanguages.length > 0
    ? requestedLanguages.slice(0, 2)
    : ["en"];
  const primaryLanguage = normalized[0] || "en";
  const primaryLabel = getLanguageLabel(primaryLanguage);

  if (normalized.length > 1) {
    const secondaryLanguage = normalized[1];
    const secondaryLabel = getLanguageLabel(secondaryLanguage);
    return `Write bilingual content in two clear blocks: first ${primaryLabel} (${primaryLanguage}), then ${secondaryLabel} (${secondaryLanguage}). Keep each block complete and avoid mixing languages within the same paragraph.`;
  }

  return `Write all natural-language output in ${primaryLabel} (${primaryLanguage}) only.`;
}

/**
 * Build field-specific instruction for suggest prompts
 */
function getFieldInstruction(field) {
  const instructions = {
    title: "Suggest a clearer, more structured lesson title.",
    summary:
      "Expand into a concise 2-3 sentence lesson summary focused on learning goals and activities.",
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

function normalizeAiStageText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .join(" ")
      .trim();
  }
  if (value && typeof value === "object") {
    const preferred = ["text", "value", "content", "description", "steps"];
    for (const key of preferred) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key].trim();
      }
      if (Array.isArray(value[key]) && value[key].length > 0) {
        return value[key]
          .map((item) => (typeof item === "string" ? item : String(item ?? "")))
          .join(" ")
          .trim();
      }
    }
    return "";
  }
  return "";
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
  requestedLanguages = ["en"],
}) {
  if (!VALID_FIELDS.includes(field)) {
    throw new Error(`Invalid field: ${field}`);
  }

  const { subjectName = "", gradeLevel = "", title = "", summary = "" } =
    context;
  const instruction = getFieldInstruction(field);
  const languageRule = buildLessonPromptLanguageRule(requestedLanguages);

  const prompt = `You are an experienced teacher. Given the following lesson context, suggest an improved or expanded value for the field "${field}".

LANGUAGE REQUIREMENT:
${languageRule}

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
 * Infer standards or skills from lesson content when no subject+grade standards exist.
 * AI extracts learning standards/skills that the lesson addresses, aligned with subject and grade.
 * @param {Object} options
 * @param {string} options.subjectName - Subject name (e.g. Mathematics, ELA)
 * @param {number} options.gradeLevel - Grade level (1-12)
 * @param {string} options.lessonText - Combined lesson content
 */
export async function inferStandardsFromContent({
  subjectName,
  gradeLevel,
  lessonText,
  requestedLanguages = ["en"],
}) {
  if (!lessonText || !(lessonText.trim())) {
    return {
      standards: [],
      tokenUsage: { input: 0, output: 0, total: 0 },
    };
  }

  const languageRule = buildLessonPromptLanguageRule(requestedLanguages);
  const prompt = `You are an expert curriculum analyst. There are NO pre-defined standards for this subject and grade. Your task is to INFER or EXTRACT the learning standards or skills that this lesson clearly addresses, based ONLY on the lesson content below.

RULES:
- Infer standards/skills ONLY from the lesson content. Do not use standards from other subjects.
- Every inferred standard/skill MUST align with the subject "${subjectName}" and grade level ${gradeLevel}.
- Use clear, concise codes (e.g. "1.1", "2.A", "NS.3") and short names. Description should state what the student will know or be able to do.
- Return between 2 and 8 inferred standards/skills. No duplicates.
- Language rule for "name" and "description": ${languageRule}

SUBJECT: ${subjectName}
GRADE LEVEL: ${gradeLevel}

LESSON CONTENT:
${lessonText.trim()}

Output ONLY a valid JSON array. No markdown, no code fences, no extra text. Each item must have: code, name, description.
[
  { "code": "1.1", "name": "Short name", "description": "What the student will know or do." },
  ...
]`;

  const response = await connectAi(prompt);
  const parsed = parseJsonArray(response.text);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      standards: [],
      tokenUsage: {
        input: response.inputtokenCount || 0,
        output: response.outputtokenCount || 0,
        total: response.totalTokenCount || 0,
      },
    };
  }

  const standards = parsed
    .filter((s) => s && (s.code || s.name || s.description))
    .slice(0, 10)
    .map((s, i) => ({
      id: `inferred-${i}`,
      standardId: `inferred-${i}`,
      code: String(s.code || "").trim() || `INF-${i + 1}`,
      name: String(s.name || "").trim(),
      description: String(s.description || "").trim(),
      inferred: true,
    }));

  return {
    standards,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}

/**
 * @param {Object} options
 * @param {string} options.schoolId - School ID (for tenant isolation)
 * @param {string} options.subjectId - Subject ID
 * @param {number} options.gradeLevel - Grade level (1-12)
 * @param {string} options.lessonText - Combined lesson content (title, summary, description, objectives)
 * @param {Object[]} options.standards - Standards to choose from (subject's or same-grade pool)
 * @param {boolean} [options.suggestedPool] - When true, standards are from other subjects (suggested pool)
 */
export async function detectStandardsFromContent({
  schoolId,
  subjectId,
  gradeLevel,
  lessonText,
  standards,
  suggestedPool = false,
  requestedLanguages = ["en"],
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
    description: (s.description || "").trim(),
  }));

  const poolNote = suggestedPool
    ? "These are suggested standards from other subjects for this grade. Select the most relevant for the lesson content."
    : "These are the actual standards for this subject and grade - use their exact _id, code, and description. Do NOT invent, modify, or create any standard.";

  const languageRule = buildLessonPromptLanguageRule(requestedLanguages);
  const prompt = `You are an expert curriculum analyst. You must select standards ONLY from the AVAILABLE STANDARDS list below. ${poolNote}

LESSON CONTENT:
${lessonText || "(No content provided)"}

AVAILABLE STANDARDS (grade ${gradeLevel}) - select ONLY from this list:
${JSON.stringify(standardsList, null, 0)}

For each selected standard, provide:
- standardId (exact _id from the list - must match one of the _id values above)
- relevanceScore (0–1)
- explanation (1 sentence why this standard's code/description matches the lesson, following this language rule: ${languageRule})

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
    .map((m) => {
      const std = standardsById[m.standardId];
      return {
        standardId: m.standardId,
        code: std?.code || "",
        name: std?.name || "",
        description: (std?.description || "").trim(),
        relevanceScore: Math.min(1, Math.max(0, Number(m.relevanceScore) || 0)),
        explanation: (m.explanation || "").trim(),
      };
    })
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

const DEFAULT_STAGE_NAMES = [
  "Warm Up",
  "Presentation of Content",
  "Guided Practice",
  "Individual Practice",
  "Homework/Take Home Material",
];

/**
 * Generate multiple lesson plan sections from minimal input (title + context)
 * Includes all text fields, stages (procedure, materials, timing), and optionally standards.
 * @param {Object} options
 * @param {string} options.title - Lesson title
 * @param {Object} options.context - { subjectName, gradeLevel }
 * @param {string[]} options.sourceFields - Fields to generate (expanded list)
 */
export async function generateSection({
  title,
  context = {},
  requestedLanguages = ["en"],
  sourceFields = [
    "summary",
    "description",
    "teachingObjectives",
    "vocabulary",
    "homework",
    "previousKnowledge",
    "characterTraitLinks",
    "techIntegration",
  ],
}) {
  const { subjectName = "", gradeLevel = "" } = context;
  const languageRule = buildLessonPromptLanguageRule(requestedLanguages);

  const prompt = `You are an experienced teacher. Generate a complete lesson plan from the minimal input below.

INPUT:
- Subject: ${subjectName}
- Grade: ${gradeLevel}
- Title: ${title || "Untitled lesson"}

LANGUAGE REQUIREMENT:
${languageRule}

Generate ALL of the following. Use age-appropriate language and pedagogical best practices.
For stages, include realistic timing (e.g. "5 min", "10 min", "15 min") so the total fits a typical class period.
Output ONLY valid JSON. No markdown, no code fences, no extra text:

{
  "summary": "2-3 sentence lesson summary focused on student learning",
  "description": "Detailed lesson description with key activities",
  "teachingObjectives": "3-5 SMART learning objectives",
  "vocabulary": "5-8 key terms, comma-separated",
  "homework": "Homework or take-home material aligned with the lesson",
  "previousKnowledge": "Prerequisites or prior knowledge students need",
  "characterTraitLinks": "Soft skills or character traits this lesson develops",
  "techIntegration": "Age-appropriate technology integration ideas",
  "stages": [
    { "name": "Warm Up", "procedure": "step-by-step instructions", "materials": "materials needed", "timing": "5 min" },
    { "name": "Presentation of Content", "procedure": "...", "materials": "...", "timing": "15 min" },
    { "name": "Guided Practice", "procedure": "...", "materials": "...", "timing": "15 min" },
    { "name": "Individual Practice", "procedure": "...", "materials": "...", "timing": "10 min" },
    { "name": "Homework/Take Home Material", "procedure": "...", "materials": "...", "timing": "5 min" }
  ]
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

  // Parse stages with procedure, materials, timing
  if (Array.isArray(parsed.stages) && parsed.stages.length > 0) {
    generated.stages = parsed.stages.slice(0, 10).map((s, i) => ({
      name: normalizeAiStageText(s?.name) || DEFAULT_STAGE_NAMES[i] || `Stage ${i + 1}`,
      procedure: normalizeAiStageText(s?.procedure),
      materials: normalizeAiStageText(s?.materials),
      timing: normalizeAiStageText(s?.timing),
    }));
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
