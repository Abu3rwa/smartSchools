import aiService from "./aiservice.js";
import { CONTENT_RULES, PRIVACY_RULES, inspectGeneratedText } from "./aiPromptSafety.js";
import { logAIUsage } from "../utils/aiUsageTracker.js";

/**
 * Suggested marks for the live lesson mark sheet.
 *
 * A written answer has no key, so it waits for a teacher to read it. This reads the same answers the
 * teacher sees and writes a first mark and a comment for each one, but it never saves anything: every
 * suggestion lands in the mark sheet as an unsaved value the teacher has to approve with Save.
 *
 * The caller can only ever get back entries for the answers it handed over, because the model sees
 * anonymous refs (a1, a2) rather than student ids, and each ref is checked against that list.
 */

// One call drafts one question for the whole class. Beyond this the prompt would carry more answers
// than a session normally holds, so the teacher is told to mark the rest by hand instead.
export const MAX_DRAFT_ANSWERS = 60;
const MAX_ANSWER_CHARS = 900;
const MAX_QUESTION_CHARS = 600;
const MAX_FEEDBACK_CHARS = 400;
const MARK_STEP = 0.25;

const CONFIDENCE_LEVELS = ["high", "medium", "low"];

const draftModelName = () => (
  process.env.LIVE_LESSON_MARK_AI_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini"
);

const clampMarks = (value, maxMarks) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const steps = Math.round(Math.max(0, Math.min(maxMarks, parsed)) / MARK_STEP);
  return Number(Math.min(maxMarks, steps * MARK_STEP).toFixed(2));
};

const normalizeConfidence = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return CONFIDENCE_LEVELS.includes(normalized) ? normalized : "low";
};

const trim = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

const toPromptEntry = (entry, index) => ({
  ref: `a${index + 1}`,
  level: trim(entry?.level, 60) || undefined,
  question: trim(entry?.prompt, MAX_QUESTION_CHARS),
  markingNotes: trim(entry?.guidance, 400) || undefined,
  expectedAnswer: trim(entry?.expected, 400) || undefined,
  studentAnswer: trim(entry?.answer, MAX_ANSWER_CHARS),
});

// A 429 means the school has run out of its monthly allowance, which is worth telling the teacher in
// its own words; every other failure is simply "not available right now".
const failureReason = (error) => (
  Number(error?.statusCode ?? error?.status) === 429 ? "credit_limit" : "unavailable"
);

class LiveLessonMarkDraftService {
  /**
   * @param {Object} options
   * @param {number} options.maxMarks - what the question is worth, so suggestions share the allocation
   * @param {Array} options.entries - one per answer awaiting a mark
   * @param {string} options.schoolId
   * @param {string} options.userId
   * @returns {Promise<{drafts: Array, unavailable: boolean, reason: string}>}
   */
  async draftMarks({ maxMarks, entries = [], schoolId, userId } = {}) {
    const list = (Array.isArray(entries) ? entries : []).slice(0, MAX_DRAFT_ANSWERS);
    if (!list.length) {
      return { drafts: [], unavailable: false, reason: "nothing_to_draft" };
    }

    const refs = new Map(list.map((entry, index) => [`a${index + 1}`, entry]));
    const modelName = draftModelName();
    const prompt = `You are marking one question from a live classroom quiz on behalf of the teacher, who will approve or change every mark you suggest.

The question is worth ${maxMarks} marks. Judge only the words the student wrote; never invent work that is not shown, and never assume anything about the student.
Give every answer you are shown exactly one entry, using the ref values below and nothing else.
"marks" must be a number between 0 and ${maxMarks} in steps of ${MARK_STEP}.
"feedback" must be at most ${MAX_FEEDBACK_CHARS} characters, written to the student, one or two sentences, naming the one thing to fix next.
"confidence" is your honest read of the suggestion: use "low" when the answer is cut short, ambiguous or in a language you cannot judge fairly.
An answer that is empty or does not address the question gets 0 marks and a plain comment saying so.

${PRIVACY_RULES}

${CONTENT_RULES}

Answers:
${JSON.stringify(list.map(toPromptEntry), null, 2)}

Required JSON schema:
{
  "drafts": [
    { "ref": "string", "marks": 0, "confidence": "high | medium | low", "feedback": "string" }
  ]
}`;

    let result = null;
    try {
      result = await aiService.generateStructuredJson({ prompt, modelName, maxRetries: 1 });
    } catch (error) {
      return { drafts: [], unavailable: true, reason: failureReason(error) };
    }

    await logAIUsage({
      model: result.modelName || modelName,
      feature: "live_lesson_mark_draft",
      schoolId,
      userId,
      entityType: "LiveSessionQuestion",
      metadata: { answers: list.length },
      response: {
        inputtokenCount: result.tokenUsage?.input || 0,
        outputtokenCount: result.tokenUsage?.output || 0,
        totalTokenCount: result.tokenUsage?.total || 0,
      },
    });

    const seen = new Set();
    const drafts = (Array.isArray(result?.parsed?.drafts) ? result.parsed.drafts : [])
      .map((draft) => {
        const ref = String(draft?.ref || "").trim();
        const entry = refs.get(ref);
        if (!entry || seen.has(ref)) return null;
        seen.add(ref);
        const feedback = trim(draft?.feedback, MAX_FEEDBACK_CHARS);
        const safeFeedback = feedback && !inspectGeneratedText(feedback).ok
          ? "Check this answer against the question before saving the mark."
          : feedback;
        return {
          studentId: String(entry.studentId),
          marks: clampMarks(draft?.marks, maxMarks),
          feedback: safeFeedback,
          confidence: normalizeConfidence(draft?.confidence),
        };
      })
      .filter(Boolean);

    if (!drafts.length) {
      return { drafts: [], unavailable: true, reason: "unavailable" };
    }

    return { drafts, unavailable: false, reason: "" };
  }
}

export default new LiveLessonMarkDraftService();
