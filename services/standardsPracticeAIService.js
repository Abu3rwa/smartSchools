import { z } from "zod";
import { connectAi } from "../utils/connectAi.js";

// ─── Structured output schemas (Zod) ───────────────────────────────────────

const GRADE_WORD_BANDS = [
  { min: 1, max: 3, minWords: 30, maxWords: 60 },
  { min: 4, max: 6, minWords: 50, maxWords: 90 },
  { min: 7, max: 9, minWords: 70, maxWords: 120 },
  { min: 10, max: 12, minWords: 90, maxWords: 160 },
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

const optionSchema = z.object({
  label: z.string(),
  text: z.string(),
});

const practiceQuestionSchema = z
  .object({
    questionText: z.string().min(1, "questionText is required"),
    questionType: z.string().optional(),
    options: z.array(optionSchema).default([]),
    correctAnswer: z.string(),
    explanation: z.string().default(""),
    difficulty: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.options.length >= 2) {
        const labels = data.options.map((o) => o.label);
        return labels.includes(data.correctAnswer);
      }
      return true;
    },
    { message: "correctAnswer must match one of the option labels" }
  );

const evaluateResponseSchema = z.object({
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
});

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
    } = options;

    const avoidList =
      previousQuestions.length > 0
        ? `\n\nIMPORTANT: Do NOT repeat any of these previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
        : "";

    const prompt = this._buildGeneratePrompt({
      standard,
      subjectName,
      difficulty,
      questionType,
      avoidList,
    });

    try {
      const response = await connectAi(prompt);
      const raw = this._parseJSON(response.text);
      if (!raw) {
        throw new Error("AI response was not valid JSON");
      }

      const result = practiceQuestionSchema.safeParse(raw);
      if (!result.success) {
        const issues = result.error?.issues ?? result.error?.errors ?? [];
        const msg = issues.map((e) => e.message ?? "Invalid field").join("; ");
        console.error("Question validation failed:", msg, result.error?.flatten?.());
        throw new Error(`Invalid question format: ${msg}`);
      }
      const parsed = result.data;

      // Shuffle multiple-choice options so the correct answer isn't always in the same position
      let finalOptions = parsed.options;
      let finalCorrectAnswer = parsed.correctAnswer;

      if (
        (parsed.questionType || questionType) === "multiple_choice" &&
        finalOptions.length > 1
      ) {
        const shuffled = this._shuffleOptions(finalOptions, finalCorrectAnswer);
        finalOptions = shuffled.options;
        finalCorrectAnswer = shuffled.correctAnswer;
      }

      return {
        questionText: parsed.questionText,
        questionType: parsed.questionType || questionType,
        options: finalOptions,
        correctAnswer: finalCorrectAnswer,
        explanation: parsed.explanation || "",
        difficulty: parsed.difficulty || difficulty,
        tokenUsage: {
          input: response.inputtokenCount || 0,
          output: response.outputtokenCount || 0,
          total: response.totalTokenCount || 0,
        },
      };
    } catch (error) {
      console.error("Question Generation Error:", error);
      const fallbackQuestion = this._buildFallbackQuestion({
        standard,
        subjectName,
        difficulty,
        questionType,
      });

      if (fallbackQuestion) {
        return {
          ...fallbackQuestion,
          tokenUsage: { input: 0, output: 0, total: 0 },
        };
      }

      throw new Error("Failed to load practice question. Please try again.");
    }
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

    // For multiple choice and true/false, do exact match (no AI needed)
    if (questionType === "multiple_choice" || questionType === "true_false") {
      const isCorrect =
        studentAnswer.trim().toUpperCase() ===
        correctAnswer.trim().toUpperCase();
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

    // For short answer, use AI to evaluate
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
    });

    try {
      const response = await connectAi(prompt);
      const raw = this._parseJSON(response.text);

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
          tokenUsage: {
            input: response.inputtokenCount || 0,
            output: response.outputtokenCount || 0,
            total: response.totalTokenCount || 0,
          },
        };
      };

      if (!raw) {
        return fallbackResult();
      }

      const result = evaluateResponseSchema.safeParse(raw);
      if (!result.success) {
        console.error("Evaluate response validation failed:", result.error.flatten());
        return fallbackResult();
      }
      const parsed = result.data;
      const deterministic = this._buildDeterministicFeedback({
        isCorrect: parsed.isCorrect,
        ...feedbackContext,
      });
      const mergedFeedbackParts = this._mergeFeedbackParts(
        deterministic.feedbackParts,
        parsed.feedbackParts,
      );
      const finalFeedback = this._normalizeFeedback(
        parsed.feedback?.trim() || this._buildFeedbackSummary(mergedFeedbackParts),
        gradeLevel,
      );

      return {
        isCorrect: parsed.isCorrect,
        feedback: finalFeedback || deterministic.feedback,
        feedbackParts: mergedFeedbackParts,
        tokenUsage: {
          input: response.inputtokenCount || 0,
          output: response.outputtokenCount || 0,
          total: response.totalTokenCount || 0,
        },
      };
    } catch (error) {
      console.error("Answer Evaluation Error:", error);
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
        tokenUsage: { input: 0, output: 0, total: 0 },
      };
    }
  }

  /**
   * Build the prompt for generating a question
   */
  _buildGeneratePrompt({
    standard,
    subjectName,
    difficulty,
    questionType,
    avoidList,
  }) {
    const typeInstructions = {
      multiple_choice: `Generate a multiple-choice question with exactly 4 options (A, B, C, D). Include an "options" array with objects like: [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}]
The "correctAnswer" should be the label letter (e.g., "A", "B", "C", or "D").`,
      short_answer: `Generate a short-answer question.
The "correctAnswer" should be a concise answer (1-3 sentences max).
Set "options" to an empty array [].`,
      true_false: `Generate a true/false question.
Include "options" as: [{"label": "True", "text": "True"}, {"label": "False", "text": "False"}]
The "correctAnswer" should be exactly "True" or "False".`,
    };

    return `You are an expert ${subjectName} teacher creating a practice question for a Grade ${standard.gradeLevel} student.

STANDARD:
- Code: ${standard.code}
- Name: ${standard.name}
- Description: ${standard.description}
${standard.category ? `- Category: ${standard.category}` : ""}

DIFFICULTY: ${difficulty}
QUESTION TYPE: ${questionType}

${typeInstructions[questionType] || typeInstructions.multiple_choice}

RULES:
- The question MUST directly assess the standard described above.
- When referring to the standard in the question text, use a single clear label (e.g. "L.5.1B" or the standard name). Do NOT repeat the same identifier twice (e.g. avoid "L.5.1B - L.5.1B"). Do NOT add the subject name into the question if it is redundant.
- Use age-appropriate language for Grade ${standard.gradeLevel}.
- Do not include any references to AI, artificial intelligence, or that this question was generated. Write as a professional teacher would.
- Difficulty "${difficulty}" means: easy = recall/basic, medium = application, hard = analysis/synthesis.
- IMPORTANT: Randomly vary which option (A, B, C, or D) is the correct answer. Do NOT always make the same letter correct.
- Include a clear, educational explanation of WHY the correct answer is correct.
- Do NOT mention AI, artificial intelligence, or that this question was generated. Write as a professional teacher would.
- Output ONLY valid JSON. No markdown, no code fences, no extra text.
${avoidList}

OUTPUT FORMAT (strict JSON):
{
  "questionText": "...",
  "questionType": "${questionType}",
  "options": [...],
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
  }) {
    const studentName = studentFirstName?.trim() || "Student";
    const resolvedGradeLevel = Number(gradeLevel) || standard?.gradeLevel || "unknown";
    const subject = subjectName || "the subject";
    const standardCode = standard?.code || "N/A";
    const standardName = standard?.name || "Unnamed Standard";
    const sameCodeAndName = standardCode && standardName && String(standardCode).trim() === String(standardName).trim();
    const standardLabel = sameCodeAndName ? standardName : `${standardCode} - ${standardName}`;
    const wordRange = this._getWordRangeByGrade(resolvedGradeLevel);
    const incorrectStreak = recentPerformance?.incorrectStreak || 0;
    const correctStreak = recentPerformance?.correctStreak || 0;
    const safeAttemptNumber = Number.isFinite(Number(attemptNumber))
      ? Math.max(1, Number(attemptNumber))
      : 1;

    return `You are evaluating a student's answer to a practice question.

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

Evaluate whether the student's answer is correct and coach the student.
Be fair: accept answers that demonstrate understanding even if wording differs.
Minor spelling errors are acceptable if the concept is correct.
Use warm teacher tone and age-appropriate language for Grade ${resolvedGradeLevel}.
Personalize naturally using the first name in "personalGreeting".
Keep "feedback" between ${wordRange.minWords} and ${wordRange.maxWords} words.
Use this fixed section order in "feedbackParts":
1) headline
2) personalGreeting
3) whatYouDidWell
4) correctionOrConfirmation
5) nextStep
6) encouragement
7) displayAnswer
8) explanation
9) reviewTag
10) confidenceLevel
11) reasonSummary
12) conceptChecks

Rules by outcome:
- If correct: celebrate effort, confirm why the idea is right, then give a next challenge.
- If incorrect: reassure first, then teach the correct idea and one focused next step.
- If RECENT INCORRECT STREAK >= 2: nextStep must be extra small and concrete.
- If RECENT CORRECT STREAK >= 2: encouragement should acknowledge growth.
- displayAnswer must be student-friendly (full answer text, not a label only).
- conceptChecks.matched and conceptChecks.missing must be short concept phrases.
- If uncertain, set confidenceLevel to "low" and use softer language.

Do not mention AI or model behavior.
Return concise, school-appropriate content only.
Return ONLY valid JSON with double-quoted keys.

Output ONLY valid JSON:
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

  _mergeFeedbackParts(baseParts, incomingParts) {
    const merged = {
      ...baseParts,
      ...(incomingParts || {}),
    };

    FEEDBACK_STRING_FIELDS.forEach((key) => {
      if (typeof merged[key] === "string") {
        merged[key] = merged[key].trim();
      }
    });

    if (merged.conceptChecks) {
      const normalizeConceptList = (value) => {
        if (!Array.isArray(value)) return [];
        return value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
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
    const firstName = studentFirstName?.trim() || "Student";
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

    const feedback = this._normalizeFeedback(
      this._buildFeedbackSummary(feedbackParts),
      gradeLevel,
    );

    return { feedback, feedbackParts };
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
    const collapsed = (text || "").replace(/\s+/g, " ").trim();
    if (!collapsed) return "";
    const range = this._getWordRangeByGrade(gradeLevel);
    return this._truncateWords(collapsed, range.maxWords);
  }

  _truncateWords(text, maxWords) {
    const words = (text || "").split(/\s+/).filter(Boolean);
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

  _normalizeSentence(text) {
    if (!text || typeof text !== "string") return "";
    return text.replace(/\s+/g, " ").trim();
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
    const normalized = (correctAnswer || "").trim().toUpperCase();
    const option =
      Array.isArray(questionOptions) &&
      questionOptions.find(
        (o) => (o?.label || "").trim().toUpperCase() === normalized,
      );

    if (option?.text) {
      return `${option.label}. ${option.text}`;
    }
    return correctAnswer;
  }

  _buildFallbackQuestion({
    standard,
    subjectName,
    difficulty = "medium",
    questionType = "multiple_choice",
  }) {
    const standardName = this._normalizeSentence(standard?.name || "this standard");
    const standardCode = this._normalizeSentence(standard?.code || "");
    const description = this._normalizeSentence(standard?.description || "");
    const subject = subjectName || "the subject";
    const keyIdea = description.split(/[.!?]/)[0]?.trim() || standardName;
    // Avoid "L.5.1B - L.5.1B" when code and name are the same
    const sameCodeAndName = standardCode && standardName && standardCode.trim() === standardName.trim();
    const referenceLabel = sameCodeAndName ? standardName : (standardCode ? `${standardCode}: ${standardName}` : standardName);

    if (questionType === "true_false") {
      return {
        questionText: `True or False: ${referenceLabel} focuses on this idea: ${keyIdea}.`,
        questionType: "true_false",
        options: [
          { label: "True", text: "True" },
          { label: "False", text: "False" },
        ],
        correctAnswer: "True",
        explanation: `This statement is true because ${referenceLabel} centers on ${keyIdea}.`,
        difficulty,
      };
    }

    if (questionType === "short_answer") {
      const shortRef = referenceLabel.length > 40 ? standardName : referenceLabel;
      const hasConcreteIdea = keyIdea && keyIdea.length > 15 && keyIdea !== shortRef;
      const questionText = hasConcreteIdea
        ? `In 1-2 sentences, explain: ${keyIdea}`
        : `In 1-2 sentences, explain the main idea of ${shortRef}.`;
      return {
        questionText,
        questionType: "short_answer",
        options: [],
        correctAnswer: keyIdea,
        explanation: `A strong answer should clearly explain this idea: ${keyIdea}.`,
        difficulty,
      };
    }

    return {
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
      difficulty,
    };
  }

  /**
   * Shuffle multiple-choice options and update the correct answer label accordingly.
   * Uses Fisher-Yates shuffle for uniform randomness.
   */
  _shuffleOptions(options, correctAnswer) {
    // Find the correct option's text before shuffling
    const correctOption = options.find((o) => o.label === correctAnswer);
    if (!correctOption) return { options, correctAnswer };

    const correctText = correctOption.text;

    // Fisher-Yates shuffle
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Re-assign labels (A, B, C, D) in order after shuffle
    const labels = ["A", "B", "C", "D"];
    let newCorrectAnswer = correctAnswer;
    shuffled.forEach((opt, idx) => {
      opt.label = labels[idx];
      if (opt.text === correctText) {
        newCorrectAnswer = labels[idx];
      }
    });

    return { options: shuffled, correctAnswer: newCorrectAnswer };
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
