import { z } from "zod";

export const QUESTION_TYPES = ["multiple_choice", "short_answer", "true_false"];
export const MAX_AI_RETRIES = 2;
export const MC_LABELS = ["A", "B", "C", "D"];
export const AMBIGUOUS_MC_OPTION_PATTERN =
  /\b(all of the above|none of the above|both a and b|both a & b|both b and c|both c and d|all are correct|all are true)\b/i;
export const LEGACY_MC_OPTION_SUFFIX_PATTERN =
  /\s*\((?:choice|option)\s*[a-z]?\s*\d+\)\s*$/i;
export const CONFUSING_TF_PATTERN =
  /\b(regardless of whether|unless|double negative|both true and false)\b/i;
export const SAFE_MC_DISTRACTOR_BANK = [
  "An unrelated detail from a different topic.",
  "A partially correct idea that misses the key concept.",
  "A common mistake that does not match the standard.",
  "A vague statement without enough evidence.",
  "An incorrect interpretation of the main idea.",
  "A response that ignores the required rule.",
];

export const GRADE_WORD_BANDS = [
  { min: 1, max: 3, minWords: 30, maxWords: 60 },
  { min: 4, max: 6, minWords: 50, maxWords: 90 },
  { min: 7, max: 9, minWords: 70, maxWords: 120 },
  { min: 10, max: 12, minWords: 90, maxWords: 160 },
];

export const TEXT_LIMIT_BANDS = [
  {
    min: 1,
    max: 3,
    questionMax: 220,
    questionTextMax: 500,
    optionMax: 110,
    explanationMax: 200,
    feedbackPartMax: 170,
  },
  {
    min: 4,
    max: 6,
    questionMax: 280,
    questionTextMax: 700,
    optionMax: 130,
    explanationMax: 220,
    feedbackPartMax: 190,
  },
  {
    min: 7,
    max: 9,
    questionMax: 340,
    questionTextMax: 900,
    optionMax: 150,
    explanationMax: 260,
    feedbackPartMax: 220,
  },
  {
    min: 10,
    max: 12,
    questionMax: 420,
    questionTextMax: 1200,
    optionMax: 180,
    explanationMax: 320,
    feedbackPartMax: 260,
  },
];

export const FEEDBACK_STRING_FIELDS = [
  "headline",
  "personalGreeting",
  "whatYouDidWell",
  "correctionOrConfirmation",
  "nextStep",
  "encouragement",
  "displayAnswer",
  "explanation",
  "reviewTag",
  "reasonSummary",
];

export const SHORT_ANSWER_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "was",
  "were",
  "with",
]);

export const QUESTION_STOP_WORDS = new Set([
  ...SHORT_ANSWER_STOP_WORDS,
  "this",
  "which",
  "what",
  "when",
  "where",
  "why",
  "how",
  "your",
  "you",
  "student",
  "name",
  "grade",
]);

const optionSchema = z.object({
  label: z.string(),
  text: z.string(),
});

export const GRADING_MODES = ["exact_match", "normalized_match", "conceptual"];

export const practiceQuestionSchema = z
  .object({
    instruction: z.string().default(""),
    questionText: z.string().min(1, "questionText is required"),
    questionType: z.enum(QUESTION_TYPES).optional(),
    options: z.array(optionSchema).default([]),
    correctAnswer: z.string().min(1, "correctAnswer is required"),
    explanation: z.string().default(""),
    difficulty: z.string().optional(),
    skill: z.string().default(""),
    subskill: z.string().default(""),
    gradingMode: z.enum(GRADING_MODES).default("conceptual"),
    acceptableAnswers: z.array(z.string()).default([]),
    evaluationCriteria: z.string().default(""),
  })
  .strict();

export const evaluateResponseSchema = z
  .object({
    isCorrect: z.boolean(),
    feedback: z.string().default(""),
    feedbackParts: z
      .object({
        headline: z.string().optional(),
        personalGreeting: z.string().optional(),
        whatYouDidWell: z.string().optional(),
        correctionOrConfirmation: z.string().optional(),
        nextStep: z.string().optional(),
        encouragement: z.string().optional(),
        displayAnswer: z.string().optional(),
        explanation: z.string().optional(),
        reviewTag: z.string().optional(),
        confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
        reasonSummary: z.string().optional(),
        conceptChecks: z
          .object({
            matched: z.array(z.string()).optional(),
            missing: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

export const trueFalsePairSchema = z
  .object({
    trueStatement: z.string().min(1, "trueStatement is required"),
    falseStatement: z.string().min(1, "falseStatement is required"),
    explanationTrue: z.string().default(""),
    explanationFalse: z.string().default(""),
    difficulty: z.string().optional(),
  })
  .strict();
