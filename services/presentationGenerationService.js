import { connectAiWithUsage } from "../utils/aiClientWithUsage.js";
import logger from "../utils/logger.js";
import {
  VALID_SLIDE_LAYOUTS,
  ALLOWED_HTML_TAGS,
} from "../config/presentationLimits.js";
import {
  DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
  PRESENTATION_LAYOUT_SYSTEM_MAP,
} from "../config/presentationLayoutSystems.js";

// ─── Token budget allocation ────────────────────────────────────────────────
const TOKEN_BUDGET = {
  lessonPlan: 2000,
  extractedMaterials: 3000,
  teacherPrompt: 500,
};

const CHARS_PER_TOKEN_ESTIMATE = 4;

// ─── Context assembly ───────────────────────────────────────────────────────

export function buildContext({
  lessonPlan,
  extractions,
  template,
  layoutSystem,
  prompt,
  standards,
  requestedLanguages,
}) {
  const context = {};
  const resolvedLayoutSystem =
    PRESENTATION_LAYOUT_SYSTEM_MAP[layoutSystem] ||
    PRESENTATION_LAYOUT_SYSTEM_MAP[DEFAULT_PRESENTATION_LAYOUT_SYSTEM];

  if (lessonPlan) {
    const parts = [
      lessonPlan.title && `Title: ${lessonPlan.title}`,
      lessonPlan.summary && `Summary: ${lessonPlan.summary}`,
      lessonPlan.description && `Description: ${lessonPlan.description}`,
      lessonPlan.homework && `Homework: ${lessonPlan.homework}`,
    ]
      .filter(Boolean)
      .join("\n");

    context.lessonPlan = truncateToCharBudget(
      parts,
      TOKEN_BUDGET.lessonPlan * CHARS_PER_TOKEN_ESTIMATE
    );
  }

  if (standards?.length) {
    context.standards = standards
      .slice(0, 10)
      .map((s) => `- ${s.code || ""}: ${s.name || s.description || ""}`)
      .join("\n");
  }

  if (extractions?.length) {
    const allChunks = extractions.flatMap((ext) =>
      (ext.chunks || []).map((chunk) => ({
        ...chunk,
        source: ext.originalName,
      }))
    );
    context.materials = selectChunksWithinBudget(
      allChunks,
      TOKEN_BUDGET.extractedMaterials * CHARS_PER_TOKEN_ESTIMATE
    );
  }

  if (template?.slideStructure?.length) {
    context.templateStructure = template.slideStructure;
  } else if (resolvedLayoutSystem?.slideStructure?.length) {
    context.templateStructure = resolvedLayoutSystem.slideStructure;
  }

  context.layoutSystem = resolvedLayoutSystem;

  context.teacherPrompt = sanitizeTeacherPrompt(prompt);
  context.requestedLanguages = requestedLanguages || ["en"];

  return context;
}

// ─── Prompt construction ────────────────────────────────────────────────────

export function buildGenerationPrompt(context, slideCount) {
  const count = slideCount || context.templateStructure?.length || 10;

  const languageRule =
    context.requestedLanguages.length > 1
      ? `Generate content in ${context.requestedLanguages[0]} as primary language, with ${context.requestedLanguages[1]} translations in parentheses for key terms.`
      : `Generate all content in ${context.requestedLanguages[0]}.`;

  const templateBlock = context.templateStructure
    ? context.templateStructure
        .map(
          (s, i) =>
            `Slide ${i}: layout="${s.layout}", purpose="${s.purpose}" — ${s.promptHint || ""}`
        )
        .join("\n")
    : `Generate ${count} slides with a natural lesson flow: opener → objectives → content → activity → assessment → summary → closer.`;

  const layoutSystemBlock = context.layoutSystem
    ? `## LAYOUT SYSTEM
Selected layout system: ${context.layoutSystem.name} (${context.layoutSystem.id})
Description: ${context.layoutSystem.description}
Design guidance: ${context.layoutSystem.promptGuidance}`
    : "";

  const sections = [
    `You are an expert educational content designer. Create a classroom presentation as a valid JSON array of slides.

## STRICT OUTPUT FORMAT
Return ONLY a valid JSON array. No markdown, no code fences, no explanation.
Each slide must match this exact schema:
{
  "order": <number, 0-indexed>,
  "layout": "<one of: ${VALID_SLIDE_LAYOUTS.join(", ")}>",
  "title": "<string, max 100 chars>",
  "subtitle": "<string, max 150 chars, only for title slides>",
  "bodyHtml": "<string, valid HTML using only: ${ALLOWED_HTML_TAGS.join(", ")} tags>",
  "bodyHtml2": "<string, only for two-column or comparison layouts>",
  "speakerNotes": "<string, plain text, 1-3 sentences of teacher guidance>",
  "citations": [{"source": "<filename>", "page": "<page number if known>"}]
}

## CONTENT RULES
1. ${languageRule}
2. Every slide MUST have a non-empty title.
3. Speaker notes should contain teacher delivery guidance, NOT repeat slide content.
4. Bullets: use concise phrases (5-10 words each), max 6 bullets per slide.
5. Citations: reference uploaded materials by filename when content is drawn from them.
6. Content must be educationally accurate and age-appropriate.
7. Do NOT invent facts, statistics, or dates not present in the source materials.
8. Do NOT include any student personal information.
9. Do NOT reproduce verbatim passages exceeding 30 words from source materials.

## SLIDE STRUCTURE (${count} slides)
${templateBlock}`,
  ];

  if (layoutSystemBlock) {
    sections.push(layoutSystemBlock);
  }

  if (context.lessonPlan) {
    sections.push(`## LESSON CONTEXT\n${context.lessonPlan}`);
  }

  if (context.standards) {
    sections.push(`## ALIGNED STANDARDS\n${context.standards}`);
  }

  if (context.materials?.length) {
    const materialsText = context.materials
      .map((m) => `--- From: ${m.source} ---\n${m.text}`)
      .join("\n\n");
    sections.push(
      `## UPLOADED MATERIALS (reference these for accuracy)\n${materialsText}`
    );
  }

  if (context.teacherPrompt) {
    sections.push(`## TEACHER INSTRUCTIONS\n${context.teacherPrompt}`);
  }

  sections.push(
    `Generate exactly ${count} slides now. Return ONLY the JSON array.`
  );

  return sections.join("\n\n");
}

// ─── Generate full presentation ─────────────────────────────────────────────

export async function generateSlides({
  context,
  slideCount,
  schoolId,
  userId,
  modelName,
}) {
  const prompt = buildGenerationPrompt(context, slideCount);
  const startTime = Date.now();

  const response = await connectAiWithUsage(
    prompt,
    { modelName },
    {
      feature: "presentation_generate",
      schoolId,
      userId,
      entityType: "Presentation",
    }
  );

  const durationMs = Date.now() - startTime;
  const slides = parseAndValidateSlides(response.text, slideCount);

  return {
    slides: scanAndRedactPII(slides),
    generation: {
      modelName: response.modelName || modelName,
      inputTokens: response.inputtokenCount || 0,
      outputTokens: response.outputtokenCount || 0,
      totalTokens: response.totalTokenCount || 0,
      generatedAt: new Date(),
      durationMs,
    },
  };
}

// ─── Regenerate single slide ────────────────────────────────────────────────

export async function regenerateSingleSlide({
  presentation,
  slideIndex,
  teacherPrompt,
  keepLayout,
  schoolId,
  userId,
  modelName,
}) {
  const slide = presentation.slides[slideIndex];
  const layoutSystem =
    PRESENTATION_LAYOUT_SYSTEM_MAP[presentation.layoutSystem] ||
    PRESENTATION_LAYOUT_SYSTEM_MAP[DEFAULT_PRESENTATION_LAYOUT_SYSTEM];
  if (!slide) {
    throw Object.assign(new Error("Slide not found at given index"), {
      status: 404,
    });
  }

  const prevSlide =
    slideIndex > 0 ? presentation.slides[slideIndex - 1] : null;
  const nextSlide =
    slideIndex < presentation.slides.length - 1
      ? presentation.slides[slideIndex + 1]
      : null;

  const prompt = `You are regenerating slide ${slideIndex + 1} of ${presentation.slides.length} in a presentation titled "${presentation.title}".

## CONTEXT
${prevSlide ? `Previous slide: "${prevSlide.title}" — ${prevSlide.speakerNotes || ""}` : "This is the first slide."}
${nextSlide ? `Next slide: "${nextSlide.title}" — ${nextSlide.speakerNotes || ""}` : "This is the last slide."}

## CURRENT SLIDE (to be regenerated)
Layout: ${slide.layout}
Title: ${slide.title}
Content: ${slide.bodyHtml || ""}

## PRESENTATION DESIGN SYSTEM
Layout system: ${layoutSystem?.name || DEFAULT_PRESENTATION_LAYOUT_SYSTEM}
Guidance: ${layoutSystem?.promptGuidance || "Keep the slide visually consistent with the rest of the deck."}

## TEACHER INSTRUCTION
${sanitizeTeacherPrompt(teacherPrompt) || "Improve this slide while maintaining consistency with surrounding slides."}

## OUTPUT
Return a single JSON object (NOT an array) matching this schema:
{
  "order": ${slideIndex},
  "layout": "${keepLayout ? slide.layout : `<one of: ${VALID_SLIDE_LAYOUTS.join(", ")}>`}",
  "title": "<string>",
  "subtitle": "<string>",
  "bodyHtml": "<string, valid HTML using only: ${ALLOWED_HTML_TAGS.join(", ")} tags>",
  "bodyHtml2": "<string, only for two-column>",
  "speakerNotes": "<string, 1-3 sentences>",
  "citations": []
}

Return ONLY the JSON object. No markdown, no code fences.`;

  const response = await connectAiWithUsage(
    prompt,
    { modelName },
    {
      feature: "presentation_regenerate_slide",
      schoolId,
      userId,
      entityType: "Presentation",
      entityId: presentation._id,
    }
  );

  const parsed = parseSingleSlide(response.text, slideIndex, keepLayout ? slide.layout : null);
  const [sanitized] = scanAndRedactPII([parsed]);

  return {
    slide: sanitized,
    tokenUsage: {
      input: response.inputtokenCount || 0,
      output: response.outputtokenCount || 0,
      total: response.totalTokenCount || 0,
    },
  };
}

// ─── Response parsing & validation ──────────────────────────────────────────

export function parseAndValidateSlides(rawText, expectedCount) {
  let jsonStr = (rawText || "").trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let slides;
  try {
    slides = JSON.parse(jsonStr);
  } catch {
    logger.warn("presentation:generate:parse-failure", {
      rawLength: rawText?.length,
    });
    throw Object.assign(new Error("AI returned invalid JSON"), { status: 422 });
  }

  if (!Array.isArray(slides) || slides.length === 0) {
    throw Object.assign(new Error("AI returned empty or non-array response"), {
      status: 422,
    });
  }

  return slides.map((slide, i) => validateSlide(slide, i));
}

function parseSingleSlide(rawText, expectedIndex, forceLayout) {
  let jsonStr = (rawText || "").trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let slide;
  try {
    slide = JSON.parse(jsonStr);
  } catch {
    throw Object.assign(new Error("AI returned invalid JSON for slide"), {
      status: 422,
    });
  }

  // If AI returned an array, take first element
  if (Array.isArray(slide)) {
    slide = slide[0];
  }

  return validateSlide(slide, expectedIndex, forceLayout);
}

function validateSlide(slide, index, forceLayout) {
  return {
    order: index,
    layout: forceLayout || (VALID_SLIDE_LAYOUTS.includes(slide.layout) ? slide.layout : "title-body"),
    title: sanitizeText(slide.title || `Slide ${index + 1}`, 200),
    subtitle: sanitizeText(slide.subtitle || "", 300),
    bodyHtml: sanitizeSlideHtml(slide.bodyHtml || ""),
    bodyHtml2: sanitizeSlideHtml(slide.bodyHtml2 || ""),
    speakerNotes: sanitizeText(slide.speakerNotes || "", 2000),
    citations: validateCitations(slide.citations),
    aiGenerated: true,
  };
}

// ─── Sanitization utilities ─────────────────────────────────────────────────

function sanitizeText(text, maxLength) {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .substring(0, maxLength)
    .trim();
}

function sanitizeSlideHtml(html) {
  if (!html) return "";
  // Allow only whitelisted tags
  const tagPattern = ALLOWED_HTML_TAGS.join("|");
  const allowRegex = new RegExp(
    `<(?!\/?(?:${tagPattern})(?:\\s|>|\\/))[^>]*>`,
    "gi"
  );
  return String(html).replace(allowRegex, "").substring(0, 5000);
}

function validateCitations(citations) {
  if (!Array.isArray(citations)) return [];
  return citations
    .filter((c) => c && typeof c.source === "string")
    .map((c) => ({
      source: sanitizeText(c.source, 200),
      page: sanitizeText(c.page || "", 20),
    }))
    .slice(0, 10);
}

// ─── PII scanning ───────────────────────────────────────────────────────────

const PII_PATTERNS = [
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, // SSN
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // email
  /\b\d{10,}\b/g, // phone-like numbers
];

export function scanAndRedactPII(slides) {
  return slides.map((slide) => ({
    ...slide,
    title: redactMatches(slide.title),
    subtitle: redactMatches(slide.subtitle),
    bodyHtml: redactMatches(slide.bodyHtml),
    bodyHtml2: redactMatches(slide.bodyHtml2),
    speakerNotes: redactMatches(slide.speakerNotes),
  }));
}

function redactMatches(text) {
  if (!text) return text;
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ─── Prompt injection defense ───────────────────────────────────────────────

export function sanitizeTeacherPrompt(rawPrompt) {
  if (!rawPrompt || typeof rawPrompt !== "string") return "";
  let cleaned = rawPrompt.substring(0, 2000);
  cleaned = cleaned
    .replace(/[<>{}]/g, "")
    .replace(/(?:system|assistant|user)\s*:/gi, "")
    .replace(
      /(?:ignore|forget|disregard)\s+(?:all|previous|above)/gi,
      "[filtered]"
    )
    .replace(/```/g, "")
    .trim();
  return cleaned;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateToCharBudget(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.substring(0, maxChars) + "…" : text;
}

function selectChunksWithinBudget(chunks, maxChars) {
  const selected = [];
  let charCount = 0;
  for (const chunk of chunks) {
    if (charCount + chunk.text.length > maxChars) break;
    selected.push(chunk);
    charCount += chunk.text.length;
  }
  return selected;
}
