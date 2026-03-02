import { connectAi } from "../utils/connectAi.js";
import { AITokenUsage } from "../models/AITokenUsage.js";

const MODEL_NAME = "gemini-2.5-flash-lite";
const PROMPT_VERSION = "v1";

function stripCodeFences(text) {
  let t = (text || "").toString().trim();
  t = t.replace(/```json\s*/gi, "```");
  t = t.replace(/```/g, "");
  return t.trim();
}

function extractLikelyJson(text) {
  const t = stripCodeFences(text);
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return t;
  return t.slice(firstBrace, lastBrace + 1);
}

export function parseNewsletterJson(text) {
  const candidate = extractLikelyJson(text);
  return JSON.parse(candidate);
}

export function countWords(s) {
  const words = (s || "")
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length;
}

function trimToMaxWords(text, maxWords) {
  const words = (text || "").toString().trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return (text || "").toString().trim();
  const trimmed = words.slice(0, maxWords).join(" ");
  // Try to end cleanly.
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function compactLessonPlansForPrompt(lessonPlans, maxPlans = 8) {
  const plans = Array.isArray(lessonPlans) ? lessonPlans.slice(0, maxPlans) : [];
  return plans
    .map((lp, idx) => {
      const title = lp?.title || "Untitled lesson";
      const summary = lp?.summary || lp?.description || "";
      const objectives = lp?.teachingObjectives || "";
      const vocab = lp?.vocabulary || "";
      const homework = lp?.homework || "";
      return [
        `Lesson_${idx + 1}_Title: ${title}`,
        summary ? `Lesson_${idx + 1}_Summary: ${summary}` : "",
        objectives ? `Lesson_${idx + 1}_Objectives: ${objectives}` : "",
        vocab ? `Lesson_${idx + 1}_Vocabulary: ${vocab}` : "",
        homework ? `Lesson_${idx + 1}_Homework: ${homework}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function buildNewsletterSectionPrompt({
  classDoc,
  subjectDoc,
  weekStart,
  weekEnd,
  lessonPlans = [],
  language = "english",
  customPrompt = "",
  adminFeedback = "",
  minWords = 100,
  maxWords = 120,
}) {
  const className = classDoc?.name || "Class";
  const grade = classDoc?.grade ? `Grade ${classDoc.grade}` : "";
  const section = classDoc?.section ? `${classDoc.section}` : "";
  const subjectName = subjectDoc?.name || "Subject";

  const weekStartStr = new Date(weekStart).toLocaleDateString();
  const weekEndStr = new Date(weekEnd).toLocaleDateString();

  const lessonsBlock = compactLessonPlansForPrompt(lessonPlans);
  const teacherInstruction = (customPrompt || "").toString().trim();
  const reviewFeedback = (adminFeedback || "").toString().trim();

  const languageRule =
    language === "arabic"
      ? "Write the content in Arabic."
      : language === "bilingual"
        ? "Write two short paragraphs: first English, then Arabic."
        : "Write the content in English.";

  return `
You are an experienced K-12 teacher writing a weekly class newsletter for parents.

VERY IMPORTANT OUTPUT RULES:
- Output ONLY valid JSON. No Markdown. No code fences. No extra commentary.
- The JSON must have these keys exactly:
  content (string), wordCount (number), keyTopics (array of strings), homeworkMentioned (boolean)
- The content must be between ${minWords} and ${maxWords} words (inclusive).
- Tone: warm, professional, clear for parents.
- Mention what students learned this week in ${subjectName}.
- Include 1 sentence: how parents can support at home.
- Avoid student names and any sensitive info.
- Keep it simple.

LANGUAGE:
${languageRule}

CONTEXT:
- Class: ${className} ${[grade, section].filter(Boolean).join(" ")}
- Subject: ${subjectName}
- Week: ${weekStartStr} to ${weekEndStr}

LESSON PLANS INCLUDED (this week / selected by teacher):
${lessonsBlock || "(No lesson plan text provided; infer a generic weekly summary for the subject.)"}

${teacherInstruction ? `TEACHER CUSTOM INSTRUCTIONS:\n${teacherInstruction}` : ""}
${reviewFeedback ? `ADMIN FEEDBACK FROM PREVIOUS REJECTION:\n${reviewFeedback}` : ""}

Return JSON only.
  `.trim();
}

async function rewriteToFitWordCount({
  previousContent,
  language,
  minWords,
  maxWords,
}) {
  const prompt = `
Rewrite the following newsletter text to be between ${minWords} and ${maxWords} words (inclusive).

Rules:
- Keep the same meaning and key topics.
- Keep warm, professional tone for parents.
- ${language === "arabic" ? "Arabic only." : language === "bilingual" ? "English then Arabic." : "English only."}
- Output ONLY JSON with keys: content (string), wordCount (number), keyTopics (array of strings), homeworkMentioned (boolean)

TEXT:
${previousContent}
  `.trim();

  const res = await connectAi(prompt);
  const parsed = parseNewsletterJson(res.text);
  return { parsed, ai: res };
}

/**
 * Generate a weekly newsletter section (100–120 words) for one subject.
 * Returns structured JSON ready to store in DB.
 */
export async function generateNewsletterSection({
  classDoc,
  subjectDoc,
  weekStart,
  weekEnd,
  lessonPlans = [],
  language = "english",
  customPrompt = "",
  adminFeedback = "",
  schoolId,
  userId,
  minWords = 100,
  maxWords = 120,
}) {
  const prompt = buildNewsletterSectionPrompt({
    classDoc,
    subjectDoc,
    weekStart,
    weekEnd,
    lessonPlans,
    language,
    customPrompt,
    adminFeedback,
    minWords,
    maxWords,
  });

  const aiRes = await connectAi(prompt);
  let parsed = parseNewsletterJson(aiRes.text);

  // Normalize + validate
  parsed.content = (parsed.content || "").toString().trim();
  const wc = countWords(parsed.content);
  parsed.wordCount = Number.isFinite(parsed.wordCount) ? parsed.wordCount : wc;
  parsed.wordCount = wc; // enforce accurate count based on stored content
  parsed.keyTopics = Array.isArray(parsed.keyTopics)
    ? parsed.keyTopics.map((t) => (t || "").toString().trim()).filter(Boolean)
    : [];
  parsed.homeworkMentioned = Boolean(parsed.homeworkMentioned);

  // Enforce word bounds: retry once; then trim if still too long.
  if (wc < minWords || wc > maxWords) {
    try {
      const retry = await rewriteToFitWordCount({
        previousContent: parsed.content,
        language,
        minWords,
        maxWords,
      });
      parsed = retry.parsed;
      parsed.content = (parsed.content || "").toString().trim();
      parsed.wordCount = countWords(parsed.content);
      parsed.keyTopics = Array.isArray(parsed.keyTopics)
        ? parsed.keyTopics.map((t) => (t || "").toString().trim()).filter(Boolean)
        : [];
      parsed.homeworkMentioned = Boolean(parsed.homeworkMentioned);
    } catch {
      // If retry fails, continue with best-effort.
    }
  }

  if (parsed.wordCount > maxWords) {
    parsed.content = trimToMaxWords(parsed.content, maxWords);
    parsed.wordCount = countWords(parsed.content);
  }

  // Centralize token counting: store in AITokenUsage (single source of truth)
  let aiTokenUsageId = null;
  if (schoolId && userId) {
    try {
      const tokenUsage = await AITokenUsage.create({
        model: MODEL_NAME,
        feature: "newsletter_section",
        school: schoolId,
        user: userId,
        reportType: "custom",
        language,
        dateRange: { startDate: weekStart, endDate: weekEnd },
        inputTokens: aiRes.inputtokenCount || 0,
        outputTokens: aiRes.outputtokenCount || 0,
        totalTokens: aiRes.totalTokenCount || 0,
        schoolId: schoolId.toString(),
        promptVersion: PROMPT_VERSION,
        metadata: {
          classId: classDoc?._id,
          subjectId: subjectDoc?._id,
          lessonPlanCount: Array.isArray(lessonPlans) ? lessonPlans.length : 0,
        },
      });
      aiTokenUsageId = tokenUsage._id;
    } catch {
      // Non-fatal: generation should still succeed even if tracking fails.
      aiTokenUsageId = null;
    }
  }

  return {
    content: parsed.content,
    wordCount: parsed.wordCount,
    keyTopics: parsed.keyTopics,
    homeworkMentioned: parsed.homeworkMentioned,
    aiTokenUsageId,
  };
}
