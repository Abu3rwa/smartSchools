import { z } from "zod";
import { connectAi } from "../utils/connectAi.js";

const QUESTION_TYPES = ["multiple_choice", "short_answer", "true_false"];
const MAX_AI_RETRIES = 2;
const MC_LABELS = ["A", "B", "C", "D"];

const GRADE_WORD_BANDS = [
  { min: 1, max: 3, minWords: 30, maxWords: 60 },
  { min: 4, max: 6, minWords: 50, maxWords: 90 },
  { min: 7, max: 9, minWords: 70, maxWords: 120 },
  { min: 10, max: 12, minWords: 90, maxWords: 160 },
];

const TEXT_LIMIT_BANDS = [
  {
    min: 1,
    max: 3,
    questionMax: 220,
    optionMax: 110,
    explanationMax: 200,
    feedbackPartMax: 170,
  },
  {
    min: 4,
    max: 6,
    questionMax: 280,
    optionMax: 130,
    explanationMax: 220,
    feedbackPartMax: 190,
  },
  {
    min: 7,
    max: 9,
    questionMax: 340,
    optionMax: 150,
    explanationMax: 260,
    feedbackPartMax: 220,
  },
  {
    min: 10,
    max: 12,
    questionMax: 420,
    optionMax: 180,
    explanationMax: 320,
    feedbackPartMax: 260,
  },
];

const FEEDBACK_STRING_FIELDS = [
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

const SHORT_ANSWER_STOP_WORDS = new Set([
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

const QUESTION_STOP_WORDS = new Set([
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

const practiceQuestionSchema = z
  .object({
    questionText: z.string().min(1, "questionText is required"),
    questionType: z.enum(QUESTION_TYPES).optional(),
    options: z.array(optionSchema).default([]),
    correctAnswer: z.string().min(1, "correctAnswer is required"),
    explanation: z.string().default(""),
    difficulty: z.string().optional(),
  })
  .strict();

const evaluateResponseSchema = z
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

/**
 * Service for Standards Practice
 * Generates questions and evaluates student answers
 */
class StandardsPracticeAIService {
  /**
   * Generate a practice question for a given standard
   * @param {Object} options
   * @param {Object} options.standard - The standard object (code, name, description, gradeLevel)
   * @param {String} options.subjectName - Name of the subject
   * @param {String} options.difficulty - easy, medium, hard
   * @param {String} options.questionType - multiple_choice, short_answer, true_false
   * @param {Array}  options.previousQuestions - array of previous questionText strings to avoid repeats
   * @returns {Promise<Object>} Structured question object
   */
  async generateQuestion(options) {
    const {
      standard,
      subjectName,
      difficulty = "medium",
      questionType = "multiple_choice",
      previousQuestions = [],
      previousQuestionFingerprints = [],
      recentAttempts = [],
      studentFirstName = "",
      contextHints = {},
      attemptNumber = 1,
    } = options;

    const questionMemory = this._buildQuestionMemory({
      previousQuestions,
      previousQuestionFingerprints,
      recentAttempts,
    });

    const usage = { input: 0, output: 0, total: 0 };
    let previousFailureNotes = [];
    let lastError = null;

    for (let aiAttempt = 0; aiAttempt <= MAX_AI_RETRIES; aiAttempt += 1) {
      try {
        const prompt = this._buildGeneratePrompt({
          standard,
          subjectName,
          difficulty,
          questionType,
          studentFirstName,
          questionMemory,
          recentAttempts,
          contextHints,
          retryNotes: previousFailureNotes,
        });

        const response = await connectAi(prompt);
        usage.input += response.inputtokenCount || 0;
        usage.output += response.outputtokenCount || 0;
        usage.total += response.totalTokenCount || 0;

        const raw = this._parseJSON(response.text);
        if (!raw) {
          throw new Error("AI response was not valid JSON");
        }

        const normalized = this._normalizeAndValidateQuestion({
          raw,
          requestedQuestionType: questionType,
          requestedDifficulty: difficulty,
          gradeLevel: standard?.gradeLevel ?? null,
          studentFirstName,
          questionMemory,
          standardCode: standard?.code || "",
          attemptSeed: `${standard?.code || ""}|${attemptNumber}|${aiAttempt}`,
        });

        return {
          ...normalized,
          tokenUsage: usage,
        };
      } catch (error) {
        lastError = error;
        previousFailureNotes = [
          ...previousFailureNotes,
          this._normalizeSentence(error?.message || "Invalid response"),
        ].slice(-3);
      }
    }

    console.error("Question generation failed after retries:", lastError);
    const fallbackQuestion = this._buildFallbackQuestion({
      standard,
      subjectName,
      difficulty,
      questionType,
      studentFirstName,
      questionMemory,
      contextHints,
    });

    return {
      ...fallbackQuestion,
      tokenUsage: usage,
    };
  }

  /**
   * Evaluate a student's answer using AI
   * @param {Object} options
   * @param {String} options.questionText - The question
   * @param {String} options.correctAnswer - The correct answer
   * @param {String} options.studentAnswer - Student's answer
   * @param {String} options.questionType - Type of question
   * @param {Object} options.standard - The standard object
   * @param {Array}  options.questionOptions - options for multiple choice/true-false
   * @param {String} options.studentFirstName - first name for personalization
   * @returns {Promise<Object>} Evaluation result
   */
  async evaluateAnswer(options) {
    const {
      questionText,
      correctAnswer,
      studentAnswer,
      questionType,
      standard,
      questionOptions = [],
      studentFirstName = "",
      subjectName = "",
      gradeLevel = standard?.gradeLevel ?? null,
      difficulty = "medium",
      attemptNumber = 1,
      recentPerformance = {},
    } = options;

    const feedbackContext = {
      studentFirstName,
      standard,
      correctAnswer,
      questionOptions,
      questionType,
      gradeLevel,
      difficulty,
      attemptNumber,
      recentPerformance,
      subjectName,
    };

    if (questionType === "multiple_choice" || questionType === "true_false") {
      const isCorrect =
        String(studentAnswer || "").trim().toUpperCase() ===
        String(correctAnswer || "").trim().toUpperCase();
      const deterministic = this._buildDeterministicFeedback({
        isCorrect,
        ...feedbackContext,
      });
      return {
        isCorrect,
        feedback: deterministic.feedback,
        feedbackParts: deterministic.feedbackParts,
        tokenUsage: { input: 0, output: 0, total: 0 },
      };
    }

    const usage = { input: 0, output: 0, total: 0 };
    let previousFailureNotes = [];
    let lastError = null;

    const fallbackResult = () => {
      const isCorrect = this._isLikelyEquivalentShortAnswer(
        studentAnswer,
        correctAnswer,
      );
      const deterministic = this._buildDeterministicFeedback({
        isCorrect,
        ...feedbackContext,
      });
      return {
        isCorrect,
        feedback: deterministic.feedback,
        feedbackParts: deterministic.feedbackParts,
        tokenUsage: usage,
      };
    };

    for (let aiAttempt = 0; aiAttempt <= MAX_AI_RETRIES; aiAttempt += 1) {
      try {
        const prompt = this._buildEvaluatePrompt({
          questionText,
          correctAnswer,
          studentAnswer,
          standard,
          studentFirstName,
          subjectName,
          questionType,
          difficulty,
          gradeLevel,
          attemptNumber,
          recentPerformance,
          retryNotes: previousFailureNotes,
        });

        const response = await connectAi(prompt);
        usage.input += response.inputtokenCount || 0;
        usage.output += response.outputtokenCount || 0;
        usage.total += response.totalTokenCount || 0;

        const raw = this._parseJSON(response.text);
        if (!raw) {
          throw new Error("AI response was not valid JSON");
        }

        const result = evaluateResponseSchema.safeParse(raw);
        if (!result.success) {
          const issues = result.error?.issues ?? [];
          const msg = issues.map((issue) => issue?.message || "invalid field").join("; ");
          throw new Error(`Invalid evaluation format: ${msg || "schema mismatch"}`);
        }

        const parsed = result.data;
        const deterministic = this._buildDeterministicFeedback({
          isCorrect: parsed.isCorrect,
          ...feedbackContext,
        });
        const mergedFeedbackParts = this._mergeFeedbackParts(
          deterministic.feedbackParts,
          parsed.feedbackParts,
          gradeLevel,
          studentFirstName,
        );
        const finalFeedback = this._ensureFeedbackPersonalization(
          this._normalizeFeedback(
            parsed.feedback?.trim() ||
              this._buildFeedbackSummary(mergedFeedbackParts),
            gradeLevel,
          ),
          studentFirstName,
        );

        return {
          isCorrect: parsed.isCorrect,
          feedback: finalFeedback || deterministic.feedback,
          feedbackParts: mergedFeedbackParts,
          tokenUsage: usage,
        };
      } catch (error) {
        lastError = error;
        previousFailureNotes = [
          ...previousFailureNotes,
          this._normalizeSentence(error?.message || "Invalid response"),
        ].slice(-3);
      }
    }

    console.error("Answer evaluation failed after retries:", lastError);
    return fallbackResult();
  }

  /**
   * Build the prompt for generating a question
   */
  _buildGeneratePrompt({
    standard,
    subjectName,
    difficulty,
    questionType,
    studentFirstName,
    questionMemory,
    recentAttempts,
    contextHints = {},
    retryNotes = [],
  }) {
    const safeName = this._normalizeStudentName(studentFirstName);
    const typeInstructions = {
      multiple_choice: `Generate a multiple-choice question with exactly 4 options.
Use labels A, B, C, D only in that order.
The "correctAnswer" must be one of: "A", "B", "C", "D".`,
      short_answer: `Generate a short-answer question.
Set "options" to [].
The "correctAnswer" should be concise (1-2 sentences max).`,
      true_false: `Generate a true/false question.
Set "options" to exactly:
[{"label":"True","text":"True"},{"label":"False","text":"False"}]
The "correctAnswer" must be "True" or "False".`,
    };

    const avoidExamples = questionMemory.recentQuestions
      .slice(0, 8)
      .map((q, index) => `${index + 1}. ${q}`)
      .join("\n");
    const recentAttemptSummary = recentAttempts
      .slice(0, 6)
      .map((a, index) => {
        const status = a?.isCorrect ? "correct" : "incorrect";
        return `${index + 1}. ${a?.questionType || "unknown"} | ${a?.difficulty || "medium"} | ${status}${a?.topic ? ` | topic: ${a.topic}` : ""}`;
      })
      .join("\n");
    const topicHints =
      Array.isArray(contextHints?.recentTopics) &&
      contextHints.recentTopics.length > 0
        ? contextHints.recentTopics.slice(0, 4).join(", ")
        : "none";
    const mistakeHints =
      Array.isArray(contextHints?.recentMistakes) &&
      contextHints.recentMistakes.length > 0
        ? contextHints.recentMistakes.slice(0, 4).join(", ")
        : "none";
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";
    const outputOptionsShape =
      questionType === "multiple_choice"
        ? `[{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}]`
        : questionType === "true_false"
          ? `[{"label":"True","text":"True"},{"label":"False","text":"False"}]`
          : "[]";

    return `You are an expert ${subjectName} teacher creating one standards-aligned practice question.

STUDENT FIRST NAME: ${safeName}
GRADE: ${standard?.gradeLevel ?? "unknown"}
STANDARD CODE: ${standard?.code || "N/A"}
STANDARD NAME: ${standard?.name || "N/A"}
STANDARD DESCRIPTION: ${standard?.description || "N/A"}
STANDARD CATEGORY: ${standard?.category || "N/A"}
REQUESTED DIFFICULTY: ${difficulty}
REQUESTED QUESTION TYPE: ${questionType}
${typeInstructions[questionType] || typeInstructions.multiple_choice}

SESSION AWARENESS:
- Recent topics practiced: ${topicHints}
- Recent mistakes to avoid repeating directly: ${mistakeHints}
- Recent attempt pattern:
${recentAttemptSummary || "none"}

REPEAT AVOIDANCE:
- Do not produce exact or near-duplicate wording of any previous question.
- Avoid reusing the same scenario/context if only numbers or names change.
- Prior question stems:
${avoidExamples || "none"}

REQUIRED OUTPUT BEHAVIOR:
- Include the student's first name naturally in the questionText exactly once.
- Keep questionText concise, age-appropriate, and directly tied to the standard.
- Keep explanations clear and teacher-like.
- Do not mention AI or model behavior.
- Return STRICT JSON only. No markdown, no code fences, no extra text.
${retrySection}
OUTPUT JSON SHAPE:
{
  "questionText": "...",
  "questionType": "${questionType}",
  "options": ${outputOptionsShape},
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": "${difficulty}"
}`;
  }

  /**
   * Build the prompt for evaluating a short answer
   */
  _buildEvaluatePrompt({
    questionText,
    correctAnswer,
    studentAnswer,
    standard,
    studentFirstName,
    subjectName,
    questionType,
    difficulty,
    gradeLevel,
    attemptNumber,
    recentPerformance = {},
    retryNotes = [],
  }) {
    const studentName = this._normalizeStudentName(studentFirstName);
    const resolvedGradeLevel =
      Number(gradeLevel) || standard?.gradeLevel || "unknown";
    const subject = subjectName || "the subject";
    const standardCode = standard?.code || "N/A";
    const standardName = standard?.name || "Unnamed Standard";
    const sameCodeAndName =
      standardCode &&
      standardName &&
      String(standardCode).trim() === String(standardName).trim();
    const standardLabel = sameCodeAndName
      ? standardName
      : `${standardCode} - ${standardName}`;
    const wordRange = this._getWordRangeByGrade(resolvedGradeLevel);
    const incorrectStreak = recentPerformance?.incorrectStreak || 0;
    const correctStreak = recentPerformance?.correctStreak || 0;
    const safeAttemptNumber = Number.isFinite(Number(attemptNumber))
      ? Math.max(1, Number(attemptNumber))
      : 1;
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";

    return `You are evaluating a student's short-answer response.

STUDENT FIRST NAME: ${studentName}
GRADE LEVEL: ${resolvedGradeLevel}
SUBJECT: ${subject}
QUESTION TYPE: ${questionType}
STANDARD: ${standardLabel}
DIFFICULTY: ${difficulty}
ATTEMPT NUMBER: ${safeAttemptNumber}
RECENT CORRECT STREAK: ${correctStreak}
RECENT INCORRECT STREAK: ${incorrectStreak}
QUESTION: ${questionText}
EXPECTED ANSWER: ${correctAnswer}
STUDENT'S ANSWER: ${studentAnswer}

Rules:
- Be fair on wording differences if concept is correct.
- Personalize warmly for a student by first name.
- Keep language age-appropriate and teacher-like.
- Keep "feedback" between ${wordRange.minWords} and ${wordRange.maxWords} words.
- Put first name in feedbackParts.personalGreeting.
- Do not mention AI/model behavior.
- Return STRICT JSON only. No markdown/code fences/extra text.
${retrySection}
Output JSON:
{
  "isCorrect": true or false,
  "feedback": "One concise encouraging paragraph for the student",
  "feedbackParts": {
    "headline": "Short verdict headline",
    "personalGreeting": "Friendly line with student first name",
    "whatYouDidWell": "One specific positive observation",
    "correctionOrConfirmation": "Explain what is correct and why",
    "nextStep": "One concrete next step",
    "encouragement": "Short motivational close",
    "displayAnswer": "Student-friendly answer display",
    "explanation": "Quick concept explanation",
    "reviewTag": "Short topic to review",
    "confidenceLevel": "low or medium or high",
    "reasonSummary": "One short sentence describing why this was correct/incorrect",
    "conceptChecks": {
      "matched": ["concept phrase"],
      "missing": ["concept phrase"]
    }
  }
}`;
  }

  _normalizeAndValidateQuestion({
    raw,
    requestedQuestionType,
    requestedDifficulty,
    gradeLevel,
    studentFirstName,
    questionMemory,
    standardCode = "",
    attemptSeed = "",
  }) {
    const parsedResult = practiceQuestionSchema.safeParse(raw);
    if (!parsedResult.success) {
      const issues = parsedResult.error?.issues ?? [];
      const message = issues
        .map((issue) => issue?.message || "invalid field")
        .join("; ");
      throw new Error(`Invalid question schema: ${message || "schema mismatch"}`);
    }

    const parsed = parsedResult.data;
    const resolvedType = parsed.questionType || requestedQuestionType;
    if (!QUESTION_TYPES.includes(resolvedType)) {
      throw new Error(`Unsupported questionType: ${resolvedType}`);
    }

    const limits = this._getTextLimitsByGrade(gradeLevel);
    let questionText = this._sanitizeText(parsed.questionText, {
      maxLength: limits.questionMax,
      sentenceCase: true,
    });
    questionText = this._ensureStudentNameInStem(questionText, studentFirstName);

    const explanation = this._sanitizeText(parsed.explanation || "", {
      maxLength: limits.explanationMax,
      sentenceCase: true,
    });

    let normalizedOptions = [];
    let normalizedCorrectAnswer = this._sanitizeText(parsed.correctAnswer, {
      maxLength: 20,
      sentenceCase: false,
    });

    if (resolvedType === "multiple_choice") {
      const normalized = this._normalizeMultipleChoicePayload({
        options: parsed.options,
        correctAnswer: normalizedCorrectAnswer,
        optionMaxLength: limits.optionMax,
        seed: `${attemptSeed}|${standardCode}|${questionText}`,
      });
      normalizedOptions = normalized.options;
      normalizedCorrectAnswer = normalized.correctAnswer;
    } else if (resolvedType === "true_false") {
      normalizedOptions = [
        { label: "True", text: "True" },
        { label: "False", text: "False" },
      ];
      const answerLower = String(normalizedCorrectAnswer).trim().toLowerCase();
      normalizedCorrectAnswer = answerLower === "false" ? "False" : "True";
    } else {
      normalizedOptions = [];
      normalizedCorrectAnswer = this._sanitizeText(normalizedCorrectAnswer, {
        maxLength: Math.max(80, Math.floor(limits.explanationMax * 0.8)),
        sentenceCase: true,
      });
    }

    if (this._isDuplicateQuestion(questionText, questionMemory)) {
      throw new Error(
        "Question is a duplicate or near-duplicate of recent session content",
      );
    }

    return {
      questionText,
      questionType: resolvedType,
      options: normalizedOptions,
      correctAnswer: normalizedCorrectAnswer,
      explanation,
      difficulty: this._sanitizeDifficulty(parsed.difficulty || requestedDifficulty),
    };
  }

  _normalizeMultipleChoicePayload({
    options = [],
    correctAnswer,
    optionMaxLength,
    seed,
  }) {
    const cleaned = Array.isArray(options)
      ? options.slice(0, 4).map((option, index) => ({
          label: String(option?.label || MC_LABELS[index] || "")
            .trim()
            .toUpperCase(),
          text: this._sanitizeText(option?.text || "", {
            maxLength: optionMaxLength,
            sentenceCase: true,
          }),
          originalIndex: index,
        }))
      : [];

    if (cleaned.length !== 4 || cleaned.some((option) => !option.text)) {
      throw new Error(
        "Multiple-choice questions require exactly 4 non-empty options",
      );
    }

    const normalizedAnswer = String(correctAnswer || "").trim().toUpperCase();
    let correctIndex = cleaned.findIndex(
      (option) => option.label === normalizedAnswer,
    );
    if (correctIndex < 0) {
      correctIndex = cleaned.findIndex(
        (option) => option.text.toUpperCase() === normalizedAnswer,
      );
    }
    if (correctIndex < 0) {
      throw new Error(
        "correctAnswer must map to one of the option labels or texts",
      );
    }

    const shuffled = this._shuffleOptionsDeterministic(cleaned, correctIndex, seed);
    return {
      options: shuffled.options,
      correctAnswer: MC_LABELS[shuffled.correctIndex],
    };
  }

  _shuffleOptionsDeterministic(options, correctIndex, seed) {
    const rng = this._createSeededRng(seed);
    const pool = options.map((option, index) => ({
      text: option.text,
      originalIndex: index,
    }));

    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    let newCorrectIndex = 0;
    const shuffledOptions = pool.map((option, index) => {
      if (option.originalIndex === correctIndex) {
        newCorrectIndex = index;
      }
      return {
        label: MC_LABELS[index],
        text: option.text,
      };
    });

    return { options: shuffledOptions, correctIndex: newCorrectIndex };
  }

  _buildQuestionMemory({
    previousQuestions = [],
    previousQuestionFingerprints = [],
    recentAttempts = [],
  }) {
    const memoryEntries = [];
    const fingerprints = new Set();

    const pushQuestion = (text) => {
      const cleaned = this._sanitizeText(text || "", {
        maxLength: 450,
        sentenceCase: false,
      });
      if (!cleaned) return;
      const fingerprint = this._buildQuestionFingerprint(cleaned);
      if (!fingerprint || fingerprints.has(fingerprint)) return;
      fingerprints.add(fingerprint);
      memoryEntries.push({
        text: cleaned,
        fingerprint,
        tokenSet: this._buildSemanticTokenSet(cleaned),
      });
    };

    previousQuestions.forEach(pushQuestion);
    recentAttempts.forEach((attempt) => pushQuestion(attempt?.questionText));
    previousQuestionFingerprints.forEach((fingerprint) => {
      const normalized = this._normalizeForComparison(fingerprint || "");
      if (normalized) fingerprints.add(normalized);
    });

    return {
      entries: memoryEntries.slice(0, 40),
      fingerprintSet: fingerprints,
      recentQuestions: memoryEntries.map((entry) => entry.text).slice(0, 20),
    };
  }

  _isDuplicateQuestion(questionText, questionMemory) {
    const fingerprint = this._buildQuestionFingerprint(questionText);
    if (!fingerprint) return false;
    if (questionMemory.fingerprintSet.has(fingerprint)) return true;

    const candidateTokenSet = this._buildSemanticTokenSet(questionText);
    for (const existing of questionMemory.entries) {
      if (
        this._isNearDuplicateQuestion(
          candidateTokenSet,
          questionText,
          existing,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  _isNearDuplicateQuestion(candidateTokenSet, candidateText, existingEntry) {
    const similarity = this._jaccardSimilarity(
      candidateTokenSet,
      existingEntry.tokenSet,
    );
    if (similarity >= 0.78) return true;

    const normalizedCandidate = this._normalizeForComparison(candidateText);
    const normalizedExisting = existingEntry.fingerprint;
    if (!normalizedCandidate || !normalizedExisting) return false;
    if (normalizedCandidate === normalizedExisting) return true;

    return (
      normalizedCandidate.length >= 40 &&
      normalizedExisting.length >= 40 &&
      (normalizedCandidate.includes(normalizedExisting) ||
        normalizedExisting.includes(normalizedCandidate))
    );
  }

  _jaccardSimilarity(setA, setB) {
    if (!setA?.size || !setB?.size) return 0;
    let intersection = 0;
    setA.forEach((item) => {
      if (setB.has(item)) intersection += 1;
    });
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  _buildSemanticTokenSet(text) {
    const normalized = this._normalizeForComparison(text);
    if (!normalized) return new Set();
    return new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token && !QUESTION_STOP_WORDS.has(token)),
    );
  }

  _buildQuestionFingerprint(text) {
    const normalized = this._normalizeForComparison(text);
    if (!normalized) return "";
    return normalized
      .split(" ")
      .filter((token) => token && !QUESTION_STOP_WORDS.has(token))
      .slice(0, 40)
      .join(" ");
  }

  _normalizeForComparison(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[`*_#>\-~]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  _mergeFeedbackParts(
    baseParts,
    incomingParts,
    gradeLevel = null,
    studentFirstName = "",
  ) {
    const merged = {
      ...baseParts,
      ...(incomingParts || {}),
    };
    const limits = this._getTextLimitsByGrade(gradeLevel);

    FEEDBACK_STRING_FIELDS.forEach((key) => {
      if (typeof merged[key] === "string") {
        const sentenceCase = key !== "reviewTag" && key !== "displayAnswer";
        merged[key] = this._sanitizeText(merged[key], {
          maxLength: limits.feedbackPartMax,
          sentenceCase,
        });
      }
    });

    merged.personalGreeting = this._ensureFeedbackPersonalization(
      merged.personalGreeting,
      studentFirstName,
    );

    if (merged.conceptChecks) {
      const normalizeConceptList = (value) => {
        if (!Array.isArray(value)) return [];
        return value
          .map((item) =>
            this._sanitizeText(item, {
              maxLength: 80,
              sentenceCase: false,
            }),
          )
          .filter(Boolean);
      };

      merged.conceptChecks = {
        matched: normalizeConceptList(merged.conceptChecks.matched),
        missing: normalizeConceptList(merged.conceptChecks.missing),
      };
    }

    return merged;
  }

  _buildDeterministicFeedback({
    isCorrect,
    studentFirstName,
    correctAnswer,
    questionOptions = [],
    standard,
    questionType,
    gradeLevel,
    difficulty,
    attemptNumber,
    recentPerformance = {},
    subjectName = "",
  }) {
    const firstName = this._normalizeStudentName(studentFirstName);
    const standardName = standard?.name || "this standard";
    const standardCode = standard?.code || "";
    const standardDescription = this._normalizeSentence(
      standard?.description || "",
    );
    const subject = subjectName || "this subject";
    const displayAnswer = this._resolveDisplayAnswer(correctAnswer, questionOptions);
    const incorrectStreak = recentPerformance?.incorrectStreak || 0;
    const correctStreak = recentPerformance?.correctStreak || 0;
    const repeatedStruggle = !isCorrect && incorrectStreak >= 2;
    const showingGrowth = isCorrect && correctStreak >= 2;
    const safeAttemptNumber = Number.isFinite(Number(attemptNumber))
      ? Math.max(1, Number(attemptNumber))
      : 1;
    const explanation = isCorrect
      ? `You matched the key concept in ${standardName}.`
      : standardDescription
        ? `Review this idea: ${standardDescription}`
        : `Review the key idea in ${standardName}.`;

    const standardReference = standardCode
      ? `${standardCode} (${standardName})`
      : standardName;
    const difficultyLabel = difficulty || "medium";
    const shortAnswerTip =
      questionType === "short_answer"
        ? "Name the key concept and connect it to one clear reason."
        : "Use the evidence in the question before choosing an answer.";
    const retryTip = repeatedStruggle
      ? `Take 30 seconds to review ${standardReference}, then solve one similar ${subject} question.`
      : `Review ${standardReference} and apply it on the next question.`;

    const feedbackParts = {
      headline: isCorrect ? "Nice work!" : "Good attempt. Let's build it.",
      personalGreeting: isCorrect
        ? `${firstName}, nice work on this one.`
        : `${firstName}, good attempt. Mistakes are part of learning.`,
      whatYouDidWell: isCorrect
        ? questionType === "short_answer"
          ? "You explained the idea in a way that shows understanding."
          : "You stayed focused on the important clue in the question."
        : safeAttemptNumber > 1
          ? "You kept trying, which builds stronger understanding."
          : "You finished the question and gave us a clear next step.",
      correctionOrConfirmation: isCorrect
        ? `Your answer is correct: ${displayAnswer}.`
        : `The best answer is ${displayAnswer}.`,
      nextStep: isCorrect
        ? difficultyLabel === "hard"
          ? "Try another hard challenge and explain why your answer works."
          : shortAnswerTip
        : repeatedStruggle
          ? `Start with one focused step: ${shortAnswerTip}`
          : retryTip,
      encouragement: isCorrect
        ? showingGrowth
          ? "Your recent answers show growth. Keep that momentum."
          : "Keep this momentum going."
        : repeatedStruggle
          ? "You can do this. Small steps will lock this in."
          : "You can do this. One more try will help lock it in.",
      displayAnswer,
      explanation,
      reviewTag: standardCode || standardName,
      confidenceLevel: isCorrect ? "high" : questionType === "short_answer" ? "medium" : "high",
      reasonSummary: isCorrect
        ? `You demonstrated the expected concept in ${standardName}.`
        : `Your answer missed part of the target concept in ${standardName}.`,
      conceptChecks: {
        matched: isCorrect ? [standardName] : [],
        missing: isCorrect ? [] : [standardName],
      },
    };

    const mergedFeedbackParts = this._mergeFeedbackParts(
      feedbackParts,
      {},
      gradeLevel,
      studentFirstName,
    );
    const feedback = this._ensureFeedbackPersonalization(
      this._normalizeFeedback(
        this._buildFeedbackSummary(mergedFeedbackParts),
        gradeLevel,
      ),
      studentFirstName,
    );

    return { feedback, feedbackParts: mergedFeedbackParts };
  }

  _buildFeedbackSummary(feedbackParts) {
    return [
      feedbackParts.personalGreeting,
      feedbackParts.correctionOrConfirmation,
      feedbackParts.nextStep,
      feedbackParts.encouragement,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  _normalizeFeedback(text, gradeLevel) {
    const collapsed = this._sanitizeText(text || "", {
      maxLength: 900,
      sentenceCase: false,
    });
    if (!collapsed) return "";
    const range = this._getWordRangeByGrade(gradeLevel);
    return this._truncateWords(collapsed, range.maxWords);
  }

  _ensureFeedbackPersonalization(text, studentFirstName) {
    const cleaned = this._sanitizeText(text || "", {
      maxLength: 340,
      sentenceCase: true,
    });
    const firstName = this._normalizeStudentName(studentFirstName);
    const namePattern = new RegExp(`\\b${this._escapeRegex(firstName)}\\b`, "i");
    if (namePattern.test(cleaned)) return cleaned;
    if (!cleaned) return `${firstName}, keep going.`;
    return `${firstName}, ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }

  _ensureStudentNameInStem(questionText, studentFirstName) {
    const baseText = this._sanitizeText(questionText || "", {
      maxLength: 420,
      sentenceCase: true,
    });
    const firstName = this._normalizeStudentName(studentFirstName);
    const namePattern = new RegExp(`\\b${this._escapeRegex(firstName)}\\b`, "i");
    if (namePattern.test(baseText)) return baseText;
    if (!baseText) return `${firstName}, solve this standards-aligned question.`;
    return `${firstName}, ${baseText.charAt(0).toLowerCase()}${baseText.slice(1)}`;
  }

  _truncateWords(text, maxWords) {
    const words = String(text || "")
      .split(/\s+/)
      .filter(Boolean);
    if (!maxWords || words.length <= maxWords) return words.join(" ");
    return `${words.slice(0, maxWords).join(" ")}...`;
  }

  _getWordRangeByGrade(gradeLevel) {
    const grade = Number(gradeLevel);
    if (!Number.isFinite(grade)) {
      return { minWords: 50, maxWords: 90 };
    }
    const band = GRADE_WORD_BANDS.find((entry) => grade >= entry.min && grade <= entry.max);
    return band || { minWords: 70, maxWords: 120 };
  }

  _getTextLimitsByGrade(gradeLevel) {
    const grade = Number(gradeLevel);
    if (!Number.isFinite(grade)) return TEXT_LIMIT_BANDS[1];
    return (
      TEXT_LIMIT_BANDS.find((entry) => grade >= entry.min && grade <= entry.max) ||
      TEXT_LIMIT_BANDS[2]
    );
  }

  _sanitizeText(value, { maxLength = 1000, sentenceCase = false } = {}) {
    const noCodeFences = String(value || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[`*_#~]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!noCodeFences) return "";
    const capped =
      noCodeFences.length > maxLength
        ? `${noCodeFences.slice(0, Math.max(0, maxLength - 3)).trim()}...`
        : noCodeFences;
    if (!sentenceCase) return capped;
    return this._toSentenceCase(capped);
  }

  _toSentenceCase(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  _sanitizeDifficulty(value) {
    const raw = String(value || "").toLowerCase();
    if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
    return "medium";
  }

  _normalizeStudentName(name) {
    const cleaned = this._sanitizeText(name || "", {
      maxLength: 40,
      sentenceCase: true,
    });
    return cleaned || "Student";
  }

  _escapeRegex(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeSentence(text) {
    return this._sanitizeText(text, { maxLength: 800, sentenceCase: false });
  }

  _isLikelyEquivalentShortAnswer(studentAnswer, correctAnswer) {
    const normalize = (value) =>
      (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const student = normalize(studentAnswer);
    const expected = normalize(correctAnswer);
    if (!student || !expected) return false;
    if (student === expected) return true;
    if (student.includes(expected) || expected.includes(student)) {
      return Math.min(student.length, expected.length) >= 8;
    }

    const tokenize = (text) =>
      text
        .split(" ")
        .filter((token) => token && !SHORT_ANSWER_STOP_WORDS.has(token));

    const studentTokens = tokenize(student);
    const expectedTokens = tokenize(expected);
    if (expectedTokens.length === 0) return false;

    const studentSet = new Set(studentTokens);
    const overlap = expectedTokens.filter((token) => studentSet.has(token)).length;
    return overlap / expectedTokens.length >= 0.7;
  }

  _resolveDisplayAnswer(correctAnswer, questionOptions = []) {
    const normalized = String(correctAnswer || "").trim().toUpperCase();
    const option =
      Array.isArray(questionOptions) &&
      questionOptions.find(
        (o) => String(o?.label || "").trim().toUpperCase() === normalized,
      );

    if (option?.text) {
      return `${option.label}. ${option.text}`;
    }
    return this._sanitizeText(correctAnswer || "", {
      maxLength: 220,
      sentenceCase: false,
    });
  }

  _buildFallbackQuestion({
    standard,
    subjectName,
    difficulty = "medium",
    questionType = "multiple_choice",
    studentFirstName = "",
    questionMemory = { fingerprintSet: new Set() },
    contextHints = {},
  }) {
    const standardName = this._normalizeSentence(standard?.name || "this standard");
    const standardCode = this._normalizeSentence(standard?.code || "");
    const description = this._normalizeSentence(standard?.description || "");
    const subject = subjectName || "the subject";
    const student = this._normalizeStudentName(studentFirstName);
    const keyIdea = description.split(/[.!?]/)[0]?.trim() || standardName;
    const sameCodeAndName =
      standardCode && standardName && standardCode.trim() === standardName.trim();
    const referenceLabel = sameCodeAndName
      ? standardName
      : standardCode
        ? `${standardCode}: ${standardName}`
        : standardName;
    const topicHint =
      Array.isArray(contextHints?.recentTopics) && contextHints.recentTopics[0]
        ? contextHints.recentTopics[0]
        : keyIdea;

    const candidateQuestions = [];

    if (questionType === "true_false") {
      candidateQuestions.push({
        questionText: `${student}, true or false: ${referenceLabel} focuses on ${topicHint}.`,
        questionType: "true_false",
        options: [
          { label: "True", text: "True" },
          { label: "False", text: "False" },
        ],
        correctAnswer: "True",
        explanation: `This is true because ${referenceLabel} centers on ${topicHint}.`,
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    if (questionType === "short_answer") {
      candidateQuestions.push({
        questionText: `${student}, in 1-2 sentences explain how ${referenceLabel} connects to ${topicHint}.`,
        questionType: "short_answer",
        options: [],
        correctAnswer: `A strong answer explains how ${referenceLabel} connects to ${topicHint}.`,
        explanation: "Focus on the key concept and one clear reason from the standard.",
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    if (questionType === "multiple_choice") {
      candidateQuestions.push({
        questionText: `${student}, which option best matches the key idea in ${referenceLabel}?`,
        questionType: "multiple_choice",
        options: [
          { label: "A", text: keyIdea },
          { label: "B", text: `An unrelated detail from a different ${subject} topic.` },
          { label: "C", text: "A statement that is too broad and does not match the standard." },
          { label: "D", text: "A partially correct idea that misses the core concept." },
        ],
        correctAnswer: "A",
        explanation: `Option A is best because it directly matches the focus of ${referenceLabel}.`,
        difficulty: this._sanitizeDifficulty(difficulty),
      });
      candidateQuestions.push({
        questionText: `${student}, choose the best evidence-based interpretation of ${referenceLabel}.`,
        questionType: "multiple_choice",
        options: [
          { label: "A", text: "A detail that does not address the standard directly." },
          { label: "B", text: `The core idea: ${keyIdea}` },
          { label: "C", text: "An opinion not tied to the required concept." },
          { label: "D", text: "A vague statement without standard alignment." },
        ],
        correctAnswer: "B",
        explanation: `Option B is the only option that clearly aligns with ${referenceLabel}.`,
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    if (candidateQuestions.length === 0) {
      candidateQuestions.push({
        questionText: `${student}, which choice best matches ${referenceLabel}?`,
        questionType: "multiple_choice",
        options: [
          { label: "A", text: keyIdea },
          { label: "B", text: `A detail from another ${subject} topic.` },
          { label: "C", text: "A statement that is too broad for this standard." },
          { label: "D", text: "A statement missing the main concept." },
        ],
        correctAnswer: "A",
        explanation: `Option A is the best match for ${referenceLabel}.`,
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    const nonDuplicate = candidateQuestions.find((candidate) => {
      const fingerprint = this._buildQuestionFingerprint(candidate.questionText);
      return fingerprint && !questionMemory.fingerprintSet?.has(fingerprint);
    });
    const selected = nonDuplicate || candidateQuestions[0];

    if (selected.questionType === "multiple_choice") {
      const normalized = this._normalizeMultipleChoicePayload({
        options: selected.options,
        correctAnswer: selected.correctAnswer,
        optionMaxLength: this._getTextLimitsByGrade(standard?.gradeLevel ?? null).optionMax,
        seed: `${standardCode}|fallback|${selected.questionText}`,
      });
      selected.options = normalized.options;
      selected.correctAnswer = normalized.correctAnswer;
    }

    return selected;
  }

  _createSeededRng(seed) {
    const source = String(seed || "fallback-seed");
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
    }
    let state = hash || 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /**
   * Parse JSON from AI response, handling common formatting issues
   */
  _parseJSON(text) {
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          // continue to next attempt
        }
      }

      // Try to find JSON object in the text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (e3) {
          // continue
        }
      }

      console.error("Failed to parse JSON response:", text.substring(0, 200));
      return null;
    }
  }
}

export default new StandardsPracticeAIService();
