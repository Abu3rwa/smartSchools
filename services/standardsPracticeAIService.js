import { z } from "zod";
import { connectAi } from "../utils/connectAi.js";
import { getLanguageLabel, normalizeRequestedLanguages } from "../utils/aiLanguageUtils.js";

const QUESTION_TYPES = ["multiple_choice", "short_answer", "true_false"];
const MAX_AI_RETRIES = 2;
const MC_LABELS = ["A", "B", "C", "D"];
const AMBIGUOUS_MC_OPTION_PATTERN =
  /\b(all of the above|none of the above|both a and b|both a & b|both b and c|both c and d|all are correct|all are true)\b/i;
const LEGACY_MC_OPTION_SUFFIX_PATTERN =
  /\s*\((?:choice|option)\s*[a-z]?\s*\d+\)\s*$/i;
const CONFUSING_TF_PATTERN =
  /\b(regardless of whether|unless|double negative|both true and false)\b/i;
const SAFE_MC_DISTRACTOR_BANK = [
  "An unrelated detail from a different topic.",
  "A partially correct idea that misses the key concept.",
  "A common mistake that does not match the standard.",
  "A vague statement without enough evidence.",
  "An incorrect interpretation of the main idea.",
  "A response that ignores the required rule.",
];

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

const trueFalsePairSchema = z
  .object({
    trueStatement: z.string().min(1, "trueStatement is required"),
    falseStatement: z.string().min(1, "falseStatement is required"),
    explanationTrue: z.string().default(""),
    explanationFalse: z.string().default(""),
    difficulty: z.string().optional(),
  })
  .strict();

/**
 * Service for Standards Practice
 * Generates questions and evaluates student answers
 */
class StandardsPracticeAIService {
  _resolveRequestedLanguages(requestedLanguages) {
    return normalizeRequestedLanguages(requestedLanguages, {
      max: 2,
      fallback: ["en"],
    });
  }

  _buildPromptLanguageRule(requestedLanguages) {
    const resolved = this._resolveRequestedLanguages(requestedLanguages);
    const primary = resolved[0] || "en";
    const secondary = resolved[1] || null;
    const primaryLabel = getLanguageLabel(primary);
    const secondaryLabel = secondary ? getLanguageLabel(secondary) : null;

    if (!secondary) {
      return `LANGUAGE RULE: Write all natural-language text fields in ${primaryLabel} (${primary}) only.`;
    }

    return `LANGUAGE RULE: Write bilingual text for each natural-language field.
- First segment in ${primaryLabel} (${primary})
- Then " / "
- Then equivalent segment in ${secondaryLabel} (${secondary})
Do not change JSON keys or structural fields.`;
  }

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
      requestedLanguages = ["en"],
      trueFalseTargetAnswer = null,
      previousQuestions = [],
      previousQuestionFingerprints = [],
      recentAttempts = [],
      studentFirstName = "",
      contextHints = {},
      attemptNumber = 1,
    } = options;
    const normalizedTrueFalseTarget =
      this._normalizeTrueFalseToken(trueFalseTargetAnswer);

    if (questionType === "true_false") {
      return this._generateTrueFalseQuestion({
        standard,
        subjectName,
        requestedLanguages,
        difficulty,
        trueFalseTargetAnswer: normalizedTrueFalseTarget,
        previousQuestions,
        previousQuestionFingerprints,
        recentAttempts,
        studentFirstName,
        contextHints,
        attemptNumber,
      });
    }

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
          requestedLanguages,
          difficulty,
          questionType,
          trueFalseTargetAnswer: normalizedTrueFalseTarget,
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
          trueFalseTargetAnswer: normalizedTrueFalseTarget,
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

    console.warn(
      "Question generation used fallback after retries:",
      lastError?.message || "unknown generation error",
    );
    const fallbackQuestion = this._buildFallbackQuestion({
      standard,
      subjectName,
      requestedLanguages,
      difficulty,
      questionType,
      studentFirstName,
      questionMemory,
      contextHints,
      trueFalseTargetAnswer: normalizedTrueFalseTarget,
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
      requestedLanguages = ["en"],
      gradeLevel = standard?.gradeLevel ?? null,
      difficulty = "medium",
      attemptNumber = 1,
      recentPerformance = {},
    } = options;

    const feedbackContext = {
      studentFirstName,
      questionText,
      studentAnswer,
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
      const normalizedStudentAnswer =
        questionType === "multiple_choice"
          ? this._resolveChoiceAnswerLabel(studentAnswer, questionOptions)
          : this._resolveTrueFalseAnswer({
              rawAnswer: studentAnswer,
              rawOptions: questionOptions,
            }) || "";
      const normalizedCorrectAnswer =
        questionType === "multiple_choice"
          ? this._resolveChoiceAnswerLabel(correctAnswer, questionOptions)
          : this._resolveTrueFalseAnswer({
              rawAnswer: correctAnswer,
              rawOptions: questionOptions,
            }) || "";
      const isCorrect =
        String(normalizedStudentAnswer || "").trim().toUpperCase() ===
        String(normalizedCorrectAnswer || "").trim().toUpperCase();
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
          requestedLanguages,
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

    console.warn(
      "Answer evaluation used fallback after retries:",
      lastError?.message || "unknown evaluation error",
    );
    return fallbackResult();
  }

  async _generateTrueFalseQuestion({
    standard,
    subjectName,
    requestedLanguages = ["en"],
    difficulty = "medium",
    trueFalseTargetAnswer = null,
    previousQuestions = [],
    previousQuestionFingerprints = [],
    recentAttempts = [],
    studentFirstName = "",
    contextHints = {},
    attemptNumber = 1,
  }) {
    const questionMemory = this._buildQuestionMemory({
      previousQuestions,
      previousQuestionFingerprints,
      recentAttempts,
    });
    const usage = { input: 0, output: 0, total: 0 };
    let previousFailureNotes = [];
    let lastError = null;
    const targetAnswer =
      this._normalizeTrueFalseToken(trueFalseTargetAnswer) ||
      (Number(attemptNumber) % 2 === 0 ? "False" : "True");

    for (let aiAttempt = 0; aiAttempt <= MAX_AI_RETRIES; aiAttempt += 1) {
      try {
        const prompt = this._buildTrueFalsePairPrompt({
          standard,
          subjectName,
          requestedLanguages,
          difficulty,
          studentFirstName,
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

        const parsedResult = trueFalsePairSchema.safeParse(raw);
        if (!parsedResult.success) {
          const issues = parsedResult.error?.issues ?? [];
          const message = issues
            .map((issue) => issue?.message || "invalid field")
            .join("; ");
          throw new Error(
            `Invalid true_false pair schema: ${message || "schema mismatch"}`,
          );
        }

        const parsed = parsedResult.data;
        const limits = this._getTextLimitsByGrade(standard?.gradeLevel ?? null);
        const trueStatement = this._sanitizeTrueFalseStatement(
          parsed.trueStatement,
          limits.questionMax,
        );
        const falseStatement = this._sanitizeTrueFalseStatement(
          parsed.falseStatement,
          limits.questionMax,
        );
        if (!trueStatement || !falseStatement) {
          throw new Error("true_false statements cannot be empty");
        }
        if (
          this._normalizeForComparison(trueStatement) ===
          this._normalizeForComparison(falseStatement)
        ) {
          throw new Error("true_false statements must be different");
        }
        if (
          this._isConfusingTrueFalseStatement(trueStatement) ||
          this._isConfusingTrueFalseStatement(falseStatement)
        ) {
          throw new Error("true_false statement is potentially confusing");
        }

        let resolvedAnswer = targetAnswer;
        let selectedStatement =
          resolvedAnswer === "True" ? trueStatement : falseStatement;
        const heuristicAnswer = this._inferTrueFalseHeuristic(selectedStatement);
        if (heuristicAnswer && heuristicAnswer !== resolvedAnswer) {
          resolvedAnswer = heuristicAnswer;
          selectedStatement =
            resolvedAnswer === "True" ? trueStatement : falseStatement;
        }
        let questionText = `True or false: ${selectedStatement}`;
        questionText = this._sanitizeText(questionText, {
          maxLength: limits.questionMax,
          sentenceCase: true,
          preserveLineBreaks: true,
        });
        questionText = this._ensureStudentNameInStem(questionText, studentFirstName);

        if (this._isDuplicateQuestion(questionText, questionMemory)) {
          throw new Error(
            "Question is a duplicate or near-duplicate of recent session content",
          );
        }

        const explanationRaw =
          resolvedAnswer === "True"
            ? parsed.explanationTrue
            : parsed.explanationFalse;
        const explanation = this._sanitizeText(
          explanationRaw ||
            (resolvedAnswer === "True"
              ? "This statement is true based on the target standard."
              : "This statement is false because one key detail is incorrect."),
          {
            maxLength: limits.explanationMax,
            sentenceCase: true,
          },
        );

        return {
          questionText,
          questionType: "true_false",
          options: this._shuffleTrueFalseOptionsDeterministic(
            `${standard?.code || ""}|${attemptNumber}|${aiAttempt}|tf`,
          ),
          correctAnswer: resolvedAnswer,
          explanation,
          difficulty: this._sanitizeDifficulty(parsed.difficulty || difficulty),
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

    console.warn(
      "True/False generation used fallback after retries:",
      lastError?.message || "unknown true/false generation error",
    );
    const fallbackQuestion = this._buildFallbackQuestion({
      standard,
      subjectName,
      requestedLanguages,
      difficulty,
      questionType: "true_false",
      trueFalseTargetAnswer: targetAnswer,
      studentFirstName,
      questionMemory,
      contextHints,
    });

    return {
      ...fallbackQuestion,
      tokenUsage: usage,
    };
  }

  _buildTrueFalsePairPrompt({
    standard,
    subjectName,
    requestedLanguages = ["en"],
    difficulty,
    studentFirstName,
    recentAttempts = [],
    contextHints = {},
    retryNotes = [],
  }) {
    const safeName = this._normalizeStudentName(studentFirstName);
    const recentAttemptSummary = recentAttempts
      .slice(0, 5)
      .map((a, index) => {
        const status = a?.isCorrect ? "correct" : "incorrect";
        return `${index + 1}. ${a?.difficulty || "medium"} | ${status}${a?.questionText ? ` | ${a.questionText}` : ""}`;
      })
      .join("\n");
    const topicHints =
      Array.isArray(contextHints?.recentTopics) &&
      contextHints.recentTopics.length > 0
        ? contextHints.recentTopics.slice(0, 4).join(", ")
        : "none";
    const retrySection =
      retryNotes.length > 0
        ? `\nPREVIOUS OUTPUT ISSUES TO FIX:\n- ${retryNotes.join("\n- ")}\n`
        : "";

    return `You are an expert ${subjectName} teacher creating clear, non-tricky true/false practice content.

STUDENT FIRST NAME: ${safeName}
GRADE: ${standard?.gradeLevel ?? "unknown"}
STANDARD CODE: ${standard?.code || "N/A"}
STANDARD NAME: ${standard?.name || "N/A"}
STANDARD DESCRIPTION: ${standard?.description || "N/A"}
REQUESTED DIFFICULTY: ${difficulty}
${this._buildPromptLanguageRule(requestedLanguages)}

TASK:
- Produce one objectively TRUE statement and one objectively FALSE statement about the same concept in this standard.
- Keep each statement clear, direct, and student-friendly.
- FALSE statement must be wrong because of one specific incorrect detail.
- Avoid trick wording, ambiguity, and legalistic phrasing.
- Avoid phrases like "regardless of whether", "unless", or double negatives.
- Do not mention AI.

SESSION CONTEXT:
- Recent topics: ${topicHints}
- Recent attempts:
${recentAttemptSummary || "none"}

Return STRICT JSON only:
{
  "trueStatement": "...",
  "falseStatement": "...",
  "explanationTrue": "...",
  "explanationFalse": "...",
  "difficulty": "${difficulty}"
}
${retrySection}`;
  }

  /**
   * Build the prompt for generating a question
   */
  _buildGeneratePrompt({
    standard,
    subjectName,
    requestedLanguages = ["en"],
    difficulty,
    questionType,
    trueFalseTargetAnswer = null,
    studentFirstName,
    questionMemory,
    recentAttempts,
    contextHints = {},
    retryNotes = [],
  }) {
    const typeInstructions = {
      multiple_choice: `Generate a multiple-choice question with exactly 4 options.
Use labels A, B, C, D only in that order.
The "correctAnswer" must be one of: "A", "B", "C", "D".
Exactly one option can be correct.
Do not use "all of the above", "none of the above", or trick wording where multiple options are true.`,
      short_answer: `Generate a short-answer question.
    Set "options" to [].
    The question must be fully self-contained.
    If the student needs a sentence set, passage excerpt, example, chart, or data to answer, include it directly inside "questionText".
    Never ask the student to identify, revise, compare, or explain a sentence that is not shown.
    For sentence-editing or passage-analysis prompts, place each sentence on its own new line inside "questionText".
    For sentence-based language questions, include a clear task such as "Task: Add the missing commas." or "Task: Rewrite the sentence correctly.".
    The "correctAnswer" should be concise (1-2 sentences max).`,
      true_false: `Generate a true/false question.
Set "options" to exactly:
[{"label":"True","text":"True"},{"label":"False","text":"False"}]
The "correctAnswer" must be "True" or "False".
Write one clear factual statement that is definitely true or definitely false.
Avoid ambiguous or opinion-based wording.`,
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
    const trueFalseTargetInstruction =
      questionType === "true_false" && trueFalseTargetAnswer
        ? `\nTRUE/FALSE TARGET: The correct answer for this question must be "${trueFalseTargetAnswer}".\nWrite a natural statement that makes "${trueFalseTargetAnswer}" correct.`
        : "";

    return `You are an expert ${subjectName} teacher creating one standards-aligned practice question.

GRADE: ${standard?.gradeLevel ?? "unknown"}
STANDARD CODE: ${standard?.code || "N/A"}
STANDARD NAME: ${standard?.name || "N/A"}
STANDARD DESCRIPTION: ${standard?.description || "N/A"}
STANDARD CATEGORY: ${standard?.category || "N/A"}
REQUESTED DIFFICULTY: ${difficulty}
REQUESTED QUESTION TYPE: ${questionType}
${typeInstructions[questionType] || typeInstructions.multiple_choice}
${trueFalseTargetInstruction}
${this._buildPromptLanguageRule(requestedLanguages)}

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
- Do not include a student name in questionText.
- Keep questionText age-appropriate, directly tied to the standard, and complete enough to answer without missing context.
- If the task refers to sentences, evidence, or a passage, include that content inside questionText.
- If questionText includes a sentence, passage, or example, also include a clear instruction telling the student exactly what to do.
- Prefer structured wording for language questions, for example:
  Instruction: Read the sentence.
  Sentence: ...
  Task: Add the missing commas.
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
    requestedLanguages = ["en"],
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
- Focus feedback on the target language skill in the standard and question.
- Do not criticize story choices, realism, topic selection, or creativity unless the question explicitly asks about those.
- For grammar, punctuation, capitalization, spelling, or sentence-structure questions, explain the language mistake directly and briefly.
- If the answer is incorrect, say clearly what language rule was missed or misused.
- Do not give strong praise for an incorrect answer.
- Avoid vague phrases like "great effort" or "fantastic" when the answer is wrong.
- If a likely typo matters, mention it briefly and plainly without turning it into the main feedback.
- ${this._buildPromptLanguageRule(requestedLanguages)}
- Keep "feedback" between ${wordRange.minWords} and ${wordRange.maxWords} words.
- Put first name in feedbackParts.personalGreeting.
- Keep feedbackParts.whatYouDidWell empty if there is no meaningful language success to highlight.
- Keep feedbackParts.correctionOrConfirmation focused on the best answer and the language rule.
- Keep feedbackParts.nextStep to one concrete language-focused action.
- Do not mention AI/model behavior.
- Return STRICT JSON only. No markdown/code fences/extra text.
${retrySection}
Output JSON:
{
  "isCorrect": true or false,
  "feedback": "One concise clear paragraph for the student focused on the language rule",
  "feedbackParts": {
    "headline": "Short verdict headline",
    "personalGreeting": "Friendly line with student first name",
    "whatYouDidWell": "One specific positive language observation, or empty if none",
    "correctionOrConfirmation": "Explain the best answer and the language rule in 1-2 short sentences",
    "nextStep": "One concrete next step focused on the language skill",
    "encouragement": "Short motivational close",
    "displayAnswer": "Student-friendly answer display",
    "explanation": "Quick language-rule explanation",
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
    trueFalseTargetAnswer = null,
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
    // Always respect the requested question type so the student sees the type they chose (e.g. MCQ).
    const resolvedType =
      QUESTION_TYPES.includes(requestedQuestionType)
        ? requestedQuestionType
        : QUESTION_TYPES.includes(parsed.questionType)
          ? parsed.questionType
          : requestedQuestionType || "multiple_choice";
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
      normalizedOptions =
        this._shuffleTrueFalseOptionsDeterministic(attemptSeed);
      const resolvedAnswer = this._resolveTrueFalseAnswer({
        rawAnswer: normalizedCorrectAnswer,
        rawOptions: parsed.options,
      });
      if (!resolvedAnswer) {
        throw new Error(
          "true_false correctAnswer must resolve to True or False",
        );
      }
      if (trueFalseTargetAnswer && resolvedAnswer !== trueFalseTargetAnswer) {
        throw new Error(
          `true_false correctAnswer must match target ${trueFalseTargetAnswer}`,
        );
      }
      normalizedCorrectAnswer = resolvedAnswer;
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
    const rawOptions = Array.isArray(options) ? options.slice(0, 4) : [];
    const normalizedAnswer = String(correctAnswer || "").trim().toUpperCase();
    const preferredCorrectByLabel = rawOptions.find(
      (option) =>
        String(option?.label || "")
          .trim()
          .toUpperCase() === normalizedAnswer,
    );
    const preferredCorrectText = this._sanitizeText(
      this._stripLegacyMcOptionSuffix(
        preferredCorrectByLabel?.text || correctAnswer || "",
      ),
      {
        maxLength: optionMaxLength,
        sentenceCase: true,
      },
    );

    let cleaned = this._ensureDistinctMultipleChoiceOptions(
      rawOptions.map((option, index) => ({
        label: String(option?.label || MC_LABELS[index] || "")
          .trim()
          .toUpperCase(),
        text: this._sanitizeText(this._stripLegacyMcOptionSuffix(option?.text || ""), {
          maxLength: optionMaxLength,
          sentenceCase: true,
        }),
      })),
      optionMaxLength,
    ).slice(0, 4);

    // Remove ambiguous options (e.g. "all of the above") and replace with safe distinct distractors.
    const occupiedTexts = new Set(
      cleaned.map((option) => this._normalizeMcOptionForComparison(option.text)),
    );
    cleaned = cleaned.map((option, index) => {
      if (!AMBIGUOUS_MC_OPTION_PATTERN.test(option.text)) return option;
      occupiedTexts.delete(this._normalizeMcOptionForComparison(option.text));
      const replacementText = this._buildUniqueMcDistractorText({
        occupiedTexts,
        optionMaxLength,
        preferredIndex: index,
      });
      occupiedTexts.add(this._normalizeMcOptionForComparison(replacementText));
      return {
        ...option,
        text: replacementText,
      };
    });

    cleaned = this._ensureDistinctMultipleChoiceOptions(cleaned, optionMaxLength).slice(
      0,
      4,
    );

    let correctIndex = -1;
    const preferredCorrectNormalized = this._normalizeMcOptionForComparison(preferredCorrectText);
    if (preferredCorrectNormalized) {
      correctIndex = cleaned.findIndex(
        (option) =>
          this._normalizeMcOptionForComparison(option.text) === preferredCorrectNormalized,
      );
    }
    if (correctIndex < 0 && MC_LABELS.includes(normalizedAnswer)) {
      correctIndex = MC_LABELS.indexOf(normalizedAnswer);
    }
    if (correctIndex < 0) {
      const normalizedAnswerText = this._normalizeMcOptionForComparison(
        this._sanitizeText(this._stripLegacyMcOptionSuffix(correctAnswer || ""), {
          maxLength: optionMaxLength,
          sentenceCase: true,
        }),
      );
      if (normalizedAnswerText) {
        correctIndex = cleaned.findIndex(
          (option) =>
            this._normalizeMcOptionForComparison(option.text) === normalizedAnswerText,
        );
      }
    }
    if (correctIndex < 0 || correctIndex > 3) {
      correctIndex = 0;
    }

    const shuffled = this._shuffleOptionsDeterministic(cleaned, correctIndex, seed);
    return {
      options: shuffled.options,
      correctAnswer: MC_LABELS[shuffled.correctIndex],
    };
  }

  _sanitizeTrueFalseStatement(value, maxLength = 320) {
    const cleaned = this._sanitizeText(value || "", {
      maxLength,
      sentenceCase: true,
    }).replace(/^\s*true\s*or\s*false\s*:\s*/i, "");
    return cleaned.trim();
  }

  _isConfusingTrueFalseStatement(text) {
    const clean = this._sanitizeText(text || "", {
      maxLength: 600,
      sentenceCase: false,
    });
    if (!clean) return true;
    if (CONFUSING_TF_PATTERN.test(clean)) return true;
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    if (wordCount > 32) return true;
    return false;
  }

  _inferTrueFalseHeuristic(statement) {
    const normalized = this._normalizeForComparison(statement || "").replace(
      /\s+/g,
      "",
    );
    if (!normalized) return null;

    // Mathematical certainty: this pattern is always false because trailing zeros can exceed the power when the multiplicand already ends with zero(s).
    if (
      normalized.includes("multiply") &&
      normalized.includes("10") &&
      normalized.includes("exactly") &&
      normalized.includes("zero") &&
      normalized.includes("regardlessofwhether")
    ) {
      return "False";
    }

    return null;
  }

  resolveTrueFalseCorrectAnswer(questionText, currentCorrectAnswer) {
    const normalizedCurrent =
      this._normalizeTrueFalseToken(currentCorrectAnswer) || "True";
    const heuristic = this._inferTrueFalseHeuristic(questionText);
    return heuristic || normalizedCurrent;
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

  _shuffleTrueFalseOptionsDeterministic(seed) {
    const options = [
      { label: "True", text: "True" },
      { label: "False", text: "False" },
    ];
    const rng = this._createSeededRng(`tf|${seed || "default"}`);
    return rng() >= 0.5 ? [options[1], options[0]] : options;
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

  _stripLegacyMcOptionSuffix(text) {
    return String(text || "").replace(LEGACY_MC_OPTION_SUFFIX_PATTERN, "").trim();
  }

  _normalizeMcOptionForComparison(text) {
    return this._stripLegacyMcOptionSuffix(text)
      .toLowerCase()
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
    questionText = "",
    studentAnswer = "",
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
    const studentAnswerDisplay = this._resolveStudentAnswerDisplay({
      questionType,
      studentAnswer,
      questionOptions,
    });
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
    const conceptTip = this._buildActionableHintFromStandard({
      standardDescription,
      standardName,
      questionType,
      questionText,
    });

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
    const correctionLine = isCorrect
      ? `Your answer is correct: ${displayAnswer}.`
      : studentAnswerDisplay && studentAnswerDisplay !== displayAnswer
        ? `You chose ${studentAnswerDisplay}, but the correct answer is ${displayAnswer}.`
        : `The correct answer is ${displayAnswer}.`;
    const nextStepLine = isCorrect
      ? difficultyLabel === "hard"
        ? "Try another hard challenge and explain why your answer works."
        : shortAnswerTip
      : repeatedStruggle
        ? `${conceptTip} Then try one similar question right away.`
        : `${conceptTip} Use that rule on the next question.`;

    const feedbackParts = {
      headline: isCorrect ? "Nice work!" : "Good attempt. Let's build it.",
      personalGreeting: isCorrect
        ? `${firstName}, nice work on this one.`
        : `${firstName}, good attempt. Mistakes are part of learning.`,
      whatYouDidWell: isCorrect
        ? questionType === "short_answer"
          ? "You explained the idea in a way that shows understanding."
          : "You stayed focused on the important clue in the question."
        : studentAnswerDisplay
          ? `You gave a clear answer (${studentAnswerDisplay}), which makes it easier to improve quickly.`
          : safeAttemptNumber > 1
            ? "You kept working on the target skill, which is exactly how mastery grows."
            : "You completed the question and gave us a clear starting point to improve.",
      correctionOrConfirmation: correctionLine,
      nextStep: nextStepLine,
      encouragement: isCorrect
        ? showingGrowth
          ? "Your recent answers show growth. Keep that momentum."
          : "Keep this momentum going."
        : repeatedStruggle
          ? "You can do this. Small steps will lock this in."
          : "You can do this. One more try will help lock it in.",
      displayAnswer,
      explanation: isCorrect ? explanation : `${explanation} ${conceptTip}`.trim(),
      reviewTag: standardCode || standardName,
      confidenceLevel: isCorrect ? "high" : repeatedStruggle ? "low" : "medium",
      reasonSummary: isCorrect
        ? `You demonstrated the expected concept in ${standardName}.`
        : studentAnswerDisplay && studentAnswerDisplay !== displayAnswer
          ? `Your selected answer did not match the target concept in ${standardName}.`
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
      preserveLineBreaks: true,
    });
    const firstName = this._normalizeStudentName(studentFirstName);
    if (!baseText) return "Solve this standards-aligned question.";
    if (!firstName || firstName === "Student") {
      return baseText.replace(/^student\s*,\s*/i, "");
    }

    const leadingNamePattern = new RegExp(
      `^${this._escapeRegex(firstName)}\\s*,\\s*`,
      "i",
    );
    return baseText.replace(leadingNamePattern, "");
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

  _sanitizeText(
    value,
    { maxLength = 1000, sentenceCase = false, preserveLineBreaks = false } = {},
  ) {
    const stripped = String(value || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[`*_#~]/g, " ");
    const noCodeFences = preserveLineBreaks
      ? stripped
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : stripped.replace(/\s+/g, " ").trim();
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
    const trueFalseAnswer = this._resolveTrueFalseAnswer({
      rawAnswer: correctAnswer,
      rawOptions: questionOptions,
    });
    if (trueFalseAnswer) return trueFalseAnswer;

    const normalized = String(correctAnswer || "").trim().toUpperCase();
    const option =
      Array.isArray(questionOptions) &&
      questionOptions.find(
        (o) => String(o?.label || "").trim().toUpperCase() === normalized,
      );

    if (option?.text) {
      const cleanOptionText = this._stripLegacyMcOptionSuffix(option.text || "");
      const normalizedLabel = this._normalizeForComparison(option.label || "");
      const normalizedText = this._normalizeForComparison(cleanOptionText);
      if (normalizedLabel && normalizedLabel === normalizedText) {
        return this._sanitizeText(cleanOptionText, {
          maxLength: 220,
          sentenceCase: false,
        });
      }
      return `${option.label}. ${cleanOptionText}`;
    }
    return this._sanitizeText(this._stripLegacyMcOptionSuffix(correctAnswer || ""), {
      maxLength: 220,
      sentenceCase: false,
    });
  }

  _resolveStudentAnswerDisplay({
    questionType,
    studentAnswer,
    questionOptions = [],
  } = {}) {
    if (!studentAnswer && studentAnswer !== 0) return "";
    if (questionType === "true_false") {
      return this._resolveTrueFalseAnswer({
        rawAnswer: studentAnswer,
        rawOptions: questionOptions,
      }) || this._sanitizeText(studentAnswer, { maxLength: 30, sentenceCase: false });
    }
    if (questionType === "multiple_choice") {
      const label = this._resolveChoiceAnswerLabel(studentAnswer, questionOptions);
      const matched = Array.isArray(questionOptions)
        ? questionOptions.find(
            (option) =>
              String(option?.label || "").trim().toUpperCase() ===
              String(label || "").trim().toUpperCase(),
          )
        : null;
      if (matched?.text) {
        return `${matched.label}. ${matched.text}`;
      }
      return this._sanitizeText(studentAnswer, { maxLength: 220, sentenceCase: false });
    }
    return this._sanitizeText(studentAnswer, { maxLength: 220, sentenceCase: false });
  }

  _buildActionableHintFromStandard({
    standardDescription = "",
    standardName = "the standard",
    questionType = "",
    questionText = "",
  } = {}) {
    const source = `${standardDescription} ${questionText}`.toLowerCase();

    if (source.includes("power of 10") || (source.includes("zeros") && source.includes("10"))) {
      return "Remember: multiplying by 10, 100, or 1000 shifts digits left and adds 1, 2, or 3 zeros.";
    }
    if (source.includes("place value")) {
      return "Name the place of each digit first, then compare the place values before deciding.";
    }
    if (source.includes("fraction")) {
      return "Check denominator meaning first, then compare numerators only when denominators match.";
    }
    if (source.includes("decimal")) {
      return "Line up decimal places and compare from left to right.";
    }
    if (questionType === "true_false") {
      return `Test the statement against the rule in ${standardName} before choosing True or False.`;
    }
    if (questionType === "multiple_choice") {
      return `Eliminate two wrong options first, then pick the choice that best matches ${standardName}.`;
    }
    return `Use the key rule from ${standardName} and explain one clear reason in your answer.`;
  }

  _resolveChoiceAnswerLabel(answer, questionOptions = []) {
    const normalized = String(answer || "").trim().toUpperCase();
    if (!normalized) return "";
    if (MC_LABELS.includes(normalized)) return normalized;

    const leadingLabel = normalized.match(/^([A-D])[).:\-\s]/);
    if (leadingLabel?.[1]) return leadingLabel[1];

    const anyLabel = normalized.match(/\b([A-D])\b/);
    if (anyLabel?.[1] && normalized.length <= 16) return anyLabel[1];

    const optionMatch =
      Array.isArray(questionOptions) &&
      questionOptions.find(
        (option) =>
          this._normalizeForComparison(option?.text || "") ===
          this._normalizeForComparison(answer),
      );
    if (optionMatch?.label) {
      const label = String(optionMatch.label).trim().toUpperCase();
      if (MC_LABELS.includes(label)) return label;
    }

    return normalized;
  }

  _normalizeTrueFalseToken(value) {
    const normalized = this._normalizeForComparison(value || "").replace(
      /\s+/g,
      "",
    );
    if (!normalized) return null;
    if (
      normalized === "true" ||
      normalized === "t" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "1"
    ) {
      return "True";
    }
    if (
      normalized === "false" ||
      normalized === "f" ||
      normalized === "no" ||
      normalized === "n" ||
      normalized === "0"
    ) {
      return "False";
    }
    if (normalized.includes("true") && !normalized.includes("false")) {
      return "True";
    }
    if (normalized.includes("false") && !normalized.includes("true")) {
      return "False";
    }
    return null;
  }

  _resolveTrueFalseAnswer({ rawAnswer, rawOptions = [] } = {}) {
    const direct = this._normalizeTrueFalseToken(rawAnswer);
    if (direct) return direct;

    const normalizedAnswer = String(rawAnswer || "").trim().toUpperCase();
    if (!normalizedAnswer || !Array.isArray(rawOptions)) return null;

    const matchedByLabel = rawOptions.find(
      (option) => String(option?.label || "").trim().toUpperCase() === normalizedAnswer,
    );
    if (matchedByLabel) {
      return this._normalizeTrueFalseToken(
        matchedByLabel.text || matchedByLabel.label,
      );
    }

    const matchedByText = rawOptions.find(
      (option) =>
        this._normalizeForComparison(option?.text || "") ===
        this._normalizeForComparison(rawAnswer),
    );
    if (matchedByText) {
      return this._normalizeTrueFalseToken(
        matchedByText.text || matchedByText.label,
      );
    }

    return null;
  }

  _buildUniqueMcDistractorText({
    occupiedTexts = new Set(),
    optionMaxLength = 180,
    preferredIndex = 0,
  } = {}) {
    const preferredStart = Number.isFinite(Number(preferredIndex))
      ? Math.max(0, Number(preferredIndex))
      : 0;
    const orderedBank = [
      ...SAFE_MC_DISTRACTOR_BANK.slice(preferredStart),
      ...SAFE_MC_DISTRACTOR_BANK.slice(0, preferredStart),
    ];

    for (const candidate of orderedBank) {
      const sanitized = this._sanitizeText(candidate, {
        maxLength: optionMaxLength,
        sentenceCase: true,
      });
      const normalized = this._normalizeMcOptionForComparison(sanitized);
      if (sanitized && normalized && !occupiedTexts.has(normalized)) {
        return sanitized;
      }
    }

    let counter = 1;
    while (counter <= 50) {
      const fallback = this._sanitizeText(`Alternative option ${counter}`, {
        maxLength: optionMaxLength,
        sentenceCase: true,
      });
      const normalized = this._normalizeMcOptionForComparison(fallback);
      if (fallback && normalized && !occupiedTexts.has(normalized)) {
        return fallback;
      }
      counter += 1;
    }

    return this._sanitizeText("Alternative option", {
      maxLength: optionMaxLength,
      sentenceCase: true,
    });
  }

  _ensureDistinctMultipleChoiceOptions(options = [], optionMaxLength = 180) {
    const normalizedInput = Array.isArray(options) ? options.slice(0, 4) : [];
    const filledOptions = [...normalizedInput];

    while (filledOptions.length < 4) {
      const fallbackIndex = filledOptions.length;
      filledOptions.push({
        label: MC_LABELS[fallbackIndex],
        text: "",
      });
    }

    const seen = new Set();
    return filledOptions.map((option, index) => {
      const label = MC_LABELS[index];
      const rawText = this._sanitizeText(option?.text || "", {
        maxLength: optionMaxLength,
        sentenceCase: true,
      });
      const cleanedRawText = this._sanitizeText(this._stripLegacyMcOptionSuffix(rawText), {
        maxLength: optionMaxLength,
        sentenceCase: true,
      });
      const normalizedRawText = this._normalizeMcOptionForComparison(cleanedRawText);
      const hasRawText = Boolean(cleanedRawText && normalizedRawText);
      const isDuplicateRaw = hasRawText && seen.has(normalizedRawText);
      const isAmbiguousRaw =
        hasRawText && AMBIGUOUS_MC_OPTION_PATTERN.test(cleanedRawText);
      const candidateText = !hasRawText || isDuplicateRaw || isAmbiguousRaw
        ? this._buildUniqueMcDistractorText({
            occupiedTexts: seen,
            optionMaxLength,
            preferredIndex: index,
          })
        : cleanedRawText;

      seen.add(this._normalizeMcOptionForComparison(candidateText));
      return { label, text: candidateText };
    });
  }

  _buildFallbackQuestion({
    standard,
    subjectName,
    difficulty = "medium",
    questionType = "multiple_choice",
    trueFalseTargetAnswer = null,
    studentFirstName = "",
    questionMemory = { fingerprintSet: new Set() },
    contextHints = {},
  }) {
    const standardName = this._normalizeSentence(standard?.name || "this standard");
    const standardCode = this._normalizeSentence(standard?.code || "");
    const description = this._normalizeSentence(standard?.description || "");
    const subject = subjectName || "the subject";
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
    const trueFalseSeed = this._createSeededRng(
      `${standardCode}|${standardName}|${topicHint}|${difficulty}`,
    );
    const fallbackTrueAnswer = trueFalseTargetAnswer
      ? trueFalseTargetAnswer === "True"
      : trueFalseSeed() >= 0.5;

    const candidateQuestions = [];

    if (questionType === "true_false") {
      candidateQuestions.push({
        questionText: fallbackTrueAnswer
          ? `True or false: ${referenceLabel} focuses on ${topicHint}.`
          : `True or false: ${referenceLabel} means students should ignore evidence and rely only on guesses.`,
        questionType: "true_false",
        options: this._shuffleTrueFalseOptionsDeterministic(
          `${standardCode}|fallback|${topicHint}|${difficulty}`,
        ),
        correctAnswer: fallbackTrueAnswer ? "True" : "False",
        explanation: fallbackTrueAnswer
          ? `This is true because ${referenceLabel} centers on ${topicHint}.`
          : `This is false because ${referenceLabel} expects evidence-based thinking, not guessing.`,
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    if (questionType === "short_answer") {
      candidateQuestions.push({
        questionText: `In 1-2 sentences, explain how ${referenceLabel} connects to ${topicHint}.`,
        questionType: "short_answer",
        options: [],
        correctAnswer: `A strong answer explains how ${referenceLabel} connects to ${topicHint}.`,
        explanation: "Focus on the key concept and one clear reason from the standard.",
        difficulty: this._sanitizeDifficulty(difficulty),
      });
    }

    if (questionType === "multiple_choice") {
      candidateQuestions.push({
        questionText: `Which option best matches the key idea in ${referenceLabel}?`,
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
        questionText: `Choose the best evidence-based interpretation of ${referenceLabel}.`,
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
        questionText: `Which choice best matches ${referenceLabel}?`,
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
      const optionMaxLength = this._getTextLimitsByGrade(
        standard?.gradeLevel ?? null,
      ).optionMax;
      try {
        const normalized = this._normalizeMultipleChoicePayload({
          options: selected.options,
          correctAnswer: selected.correctAnswer,
          optionMaxLength,
          seed: `${standardCode}|fallback|${selected.questionText}`,
        });
        selected.options = normalized.options;
        selected.correctAnswer = normalized.correctAnswer;
      } catch (error) {
        const safeOptions = this._ensureDistinctMultipleChoiceOptions(
          selected.options,
          optionMaxLength,
        );
        const normalized = this._normalizeMultipleChoicePayload({
          options: safeOptions,
          correctAnswer: "A",
          optionMaxLength,
          seed: `${standardCode}|fallback-safe|${selected.questionText}`,
        });
        selected.options = normalized.options;
        selected.correctAnswer = normalized.correctAnswer;
        selected.explanation = this._sanitizeText(
          selected.explanation ||
            "Select the option that best matches the standard focus.",
          { maxLength: 320, sentenceCase: true },
        );
      }
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
