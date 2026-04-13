import { FEEDBACK_STRING_FIELDS } from "./constants.js";

export default {
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
  },

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
    const guarded = this._applyShortAnswerLanguageGuard({
      questionType,
      isCorrect,
      questionText,
      studentAnswer,
      correctAnswer,
      feedbackParts: mergedFeedbackParts,
      gradeLevel,
      studentFirstName,
    });
    const finalFeedbackParts = guarded.feedbackParts;
    const feedback = this._ensureFeedbackPersonalization(
      this._normalizeFeedback(
        this._buildFeedbackSummary(finalFeedbackParts),
        gradeLevel,
      ),
      studentFirstName,
    );

    return { feedback, feedbackParts: finalFeedbackParts };
  },

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
  },

  _normalizeFeedback(text, gradeLevel) {
    const collapsed = this._sanitizeText(text || "", {
      maxLength: 900,
      sentenceCase: false,
    });
    if (!collapsed) return "";
    const range = this._getWordRangeByGrade(gradeLevel);
    return this._truncateWords(collapsed, range.maxWords);
  },

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
  },

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
  },

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
          maxLength: 800,
          sentenceCase: false,
        });
      }
      return `${option.label}. ${cleanOptionText}`;
    }
    return this._sanitizeText(this._stripLegacyMcOptionSuffix(correctAnswer || ""), {
      maxLength: 800,
      sentenceCase: false,
    });
  },

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
  },
};
