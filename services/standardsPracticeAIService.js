import { connectAi } from "../utils/connectAi.js";
import {
  MAX_AI_RETRIES,
  evaluateResponseSchema,
  trueFalsePairSchema,
} from "./standards_practice_ai_service/constants.js";
import textUtils from "./standards_practice_ai_service/textUtils.js";
import promptBuilder from "./standards_practice_ai_service/promptBuilder.js";
import questionAssembly from "./standards_practice_ai_service/questionAssembly.js";
import feedbackBuilder from "./standards_practice_ai_service/feedbackBuilder.js";
import gradingGuards from "./standards_practice_ai_service/gradingGuards.js";

/**
 * Standards Practice AI Service
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
      gradingMode = "conceptual",
      acceptableAnswers = [],
      evaluationCriteria = "",
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

    // Deterministic path for exact_match / normalized_match grading modes
    if (gradingMode === "exact_match" || gradingMode === "normalized_match") {
      const normalizeExact = (s) =>
        String(s || "")
          .trim()
          .toLowerCase()
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/\s+/g, " ");
      const normalizeLoose = (s) =>
        normalizeExact(s).replace(/[^a-z0-9\s]/g, "");
      const studentNorm =
        gradingMode === "exact_match"
          ? normalizeExact(studentAnswer)
          : normalizeLoose(studentAnswer);
      const candidateList = [
        correctAnswer,
        ...(Array.isArray(acceptableAnswers) ? acceptableAnswers : []),
      ];
      const isCorrect = candidateList.some((ans) => {
        const ansNorm =
          gradingMode === "exact_match"
            ? normalizeExact(ans)
            : normalizeLoose(ans);
        return ansNorm === studentNorm;
      });
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
      const relevance = this._applyTargetSkillRelevanceGuard({
        questionType,
        isCorrect,
        questionText,
        studentAnswer,
        correctAnswer,
        standard,
        subjectName,
      });
      const deterministic = this._buildDeterministicFeedback({
        isCorrect: relevance.isCorrect,
        ...feedbackContext,
      });
      let fallbackFeedbackParts = relevance.guardApplied
        ? this._mergeFeedbackParts(
            deterministic.feedbackParts,
            relevance.feedbackPartsPatch,
            gradeLevel,
            studentFirstName,
          )
        : deterministic.feedbackParts;

      // Grammar exact-match guard for fallback path
      let fallbackIsCorrect = relevance.isCorrect;
      const grammarGuard = this._applyGrammarExactMatchGuard({
        questionText,
        studentAnswer,
        correctAnswer,
        isCorrect: relevance.isCorrect,
        subjectName,
      });
      if (grammarGuard.guardApplied) {
        fallbackIsCorrect = grammarGuard.isCorrect;
        const grammarDeterministic = this._buildDeterministicFeedback({
          isCorrect: grammarGuard.isCorrect,
          ...feedbackContext,
        });
        fallbackFeedbackParts = this._mergeFeedbackParts(
          grammarDeterministic.feedbackParts,
          grammarGuard.feedbackPartsPatch,
          gradeLevel,
          studentFirstName,
        );
      }

      const finalFeedback = this._ensureFeedbackPersonalization(
        this._normalizeFeedback(
          this._buildFeedbackSummary(fallbackFeedbackParts),
          gradeLevel,
        ),
        studentFirstName,
      );

      return {
        isCorrect: fallbackIsCorrect,
        feedback: finalFeedback || deterministic.feedback,
        feedbackParts: fallbackFeedbackParts,
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
          evaluationCriteria,
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
        const relevance = this._applyTargetSkillRelevanceGuard({
          questionType,
          isCorrect: parsed.isCorrect,
          questionText,
          studentAnswer,
          correctAnswer,
          standard,
          subjectName,
        });

        const deterministic = this._buildDeterministicFeedback({
          isCorrect: relevance.isCorrect,
          ...feedbackContext,
        });
        let mergedFeedbackParts = this._mergeFeedbackParts(
          deterministic.feedbackParts,
          parsed.feedbackParts,
          gradeLevel,
          studentFirstName,
        );
        if (relevance.guardApplied) {
          mergedFeedbackParts = this._mergeFeedbackParts(
            mergedFeedbackParts,
            relevance.feedbackPartsPatch,
            gradeLevel,
            studentFirstName,
          );
        }
        const guarded = this._applyShortAnswerLanguageGuard({
          questionType,
          isCorrect: relevance.isCorrect,
          questionText,
          studentAnswer,
          correctAnswer,
          feedbackParts: mergedFeedbackParts,
          gradeLevel,
          studentFirstName,
        });
        let finalIsCorrect = guarded.feedbackParts
          ? relevance.isCorrect
          : relevance.isCorrect;
        let finalFeedbackParts = guarded.feedbackParts;

        // Grammar exact-match guard: override AI leniency for fill-in-blank / word-selection ELA questions
        const grammarGuard = this._applyGrammarExactMatchGuard({
          questionText,
          studentAnswer,
          correctAnswer,
          isCorrect: relevance.isCorrect,
          subjectName,
        });
        if (grammarGuard.guardApplied) {
          finalIsCorrect = grammarGuard.isCorrect;
          const grammarDeterministic = this._buildDeterministicFeedback({
            isCorrect: grammarGuard.isCorrect,
            ...feedbackContext,
          });
          finalFeedbackParts = this._mergeFeedbackParts(
            grammarDeterministic.feedbackParts,
            grammarGuard.feedbackPartsPatch,
            gradeLevel,
            studentFirstName,
          );
        }

        const feedbackSourceText = guarded.guardApplied || relevance.guardApplied || grammarGuard.guardApplied
          ? this._buildFeedbackSummary(finalFeedbackParts)
          : parsed.feedback?.trim() || this._buildFeedbackSummary(finalFeedbackParts);
        const finalFeedback = this._ensureFeedbackPersonalization(
          this._normalizeFeedback(
            feedbackSourceText,
            gradeLevel,
          ),
          studentFirstName,
        );

        return {
          isCorrect: finalIsCorrect,
          feedback: finalFeedback || deterministic.feedback,
          feedbackParts: finalFeedbackParts,
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
          instruction: "Determine whether the following statement is true or false.",
          questionText,
          questionType: "true_false",
          options: this._shuffleTrueFalseOptionsDeterministic(
            `${standard?.code || ""}|${attemptNumber}|${aiAttempt}|tf`,
          ),
          correctAnswer: resolvedAnswer,
          explanation,
          difficulty: this._sanitizeDifficulty(parsed.difficulty || difficulty),
          skill: "",
          subskill: "",
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

  resolveTrueFalseCorrectAnswer(questionText, currentCorrectAnswer) {
    const normalizedCurrent =
      this._normalizeTrueFalseToken(currentCorrectAnswer) || "True";
    const heuristic = this._inferTrueFalseHeuristic(questionText);
    return heuristic || normalizedCurrent;
  }

  ensureInstructionalCompleteness(question, { standard, questionType } = {}) {
    if (!question) return question;
    const q = { ...question };

    // Guarantee instruction field exists and is non-empty
    if (!q.instruction || !q.instruction.trim()) {
      if (questionType === "true_false" || q.questionType === "true_false") {
        q.instruction = "Determine whether the following statement is true or false.";
      } else if (questionType === "short_answer" || q.questionType === "short_answer") {
        q.instruction = "Read carefully and write your answer.";
      } else {
        q.instruction = "Read the question and select the best answer.";
      }
    }

    // Guarantee skill/subskill have at least a fallback from the standard
    if (!q.skill) {
      q.skill = standard?.category || standard?.name || "";
    }
    if (!q.subskill) {
      q.subskill = "";
    }

    return q;
  }
}

Object.assign(
  StandardsPracticeAIService.prototype,
  textUtils,
  promptBuilder,
  questionAssembly,
  feedbackBuilder,
  gradingGuards,
);

export default new StandardsPracticeAIService();
