import {
  QUESTION_TYPES,
  MC_LABELS,
  AMBIGUOUS_MC_OPTION_PATTERN,
  LEGACY_MC_OPTION_SUFFIX_PATTERN,
  CONFUSING_TF_PATTERN,
  SAFE_MC_DISTRACTOR_BANK,
  QUESTION_STOP_WORDS,
  practiceQuestionSchema,
} from "./constants.js";

export default {
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

    const instruction = this._sanitizeText(parsed.instruction || "", {
      maxLength: limits.questionMax,
      sentenceCase: true,
    });

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
      instruction,
      questionText,
      questionType: resolvedType,
      options: normalizedOptions,
      correctAnswer: normalizedCorrectAnswer,
      explanation,
      difficulty: this._sanitizeDifficulty(parsed.difficulty || requestedDifficulty),
      skill: this._sanitizeText(parsed.skill || "", { maxLength: 60, sentenceCase: false }),
      subskill: this._sanitizeText(parsed.subskill || "", { maxLength: 60, sentenceCase: false }),
      gradingMode: parsed.gradingMode || "conceptual",
      acceptableAnswers: Array.isArray(parsed.acceptableAnswers) ? parsed.acceptableAnswers.filter(Boolean) : [],
      evaluationCriteria: this._sanitizeText(parsed.evaluationCriteria || "", { maxLength: 300, sentenceCase: false }),
    };
  },

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
  },

  _sanitizeTrueFalseStatement(value, maxLength = 320) {
    const cleaned = this._sanitizeText(value || "", {
      maxLength,
      sentenceCase: true,
    }).replace(/^\s*true\s*or\s*false\s*:\s*/i, "");
    return cleaned.trim();
  },

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
  },

  _inferTrueFalseHeuristic(statement) {
    const normalized = this._normalizeForComparison(statement || "").replace(
      /\s+/g,
      "",
    );
    if (!normalized) return null;

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
  },

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
  },

  _shuffleTrueFalseOptionsDeterministic(seed) {
    const options = [
      { label: "True", text: "True" },
      { label: "False", text: "False" },
    ];
    const rng = this._createSeededRng(`tf|${seed || "default"}`);
    return rng() >= 0.5 ? [options[1], options[0]] : options;
  },

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
  },

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
  },

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
  },

  _buildSemanticTokenSet(text) {
    const normalized = this._normalizeForComparison(text);
    if (!normalized) return new Set();
    return new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token && !QUESTION_STOP_WORDS.has(token)),
    );
  },

  _buildQuestionFingerprint(text) {
    const normalized = this._normalizeForComparison(text);
    if (!normalized) return "";
    return normalized
      .split(" ")
      .filter((token) => token && !QUESTION_STOP_WORDS.has(token))
      .slice(0, 40)
      .join(" ");
  },

  _stripLegacyMcOptionSuffix(text) {
    return String(text || "").replace(LEGACY_MC_OPTION_SUFFIX_PATTERN, "").trim();
  },

  _normalizeMcOptionForComparison(text) {
    return this._stripLegacyMcOptionSuffix(text)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
        instruction: "Determine whether the following statement is true or false.",
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
        skill: "",
        subskill: "",
      });
    }

    if (questionType === "short_answer") {
      candidateQuestions.push({
        instruction: `Explain the connection between the standard and the topic.`,
        questionText: `In 1-2 sentences, explain how ${referenceLabel} connects to ${topicHint}.`,
        questionType: "short_answer",
        options: [],
        correctAnswer: `A strong answer explains how ${referenceLabel} connects to ${topicHint}.`,
        explanation: "Focus on the key concept and one clear reason from the standard.",
        difficulty: this._sanitizeDifficulty(difficulty),
        skill: "",
        subskill: "",
      });
    }

    if (questionType === "multiple_choice") {
      candidateQuestions.push({
        instruction: `Select the option that best matches the standard.`,
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
        skill: "",
        subskill: "",
      });
      candidateQuestions.push({
        instruction: `Choose the best interpretation of the standard.`,
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
        skill: "",
        subskill: "",
      });
    }

    if (candidateQuestions.length === 0) {
      candidateQuestions.push({
        instruction: `Select the best match for the standard.`,
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
        skill: "",
        subskill: "",
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
  },

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
  },
};
