import { SHORT_ANSWER_STOP_WORDS } from "./constants.js";

export default {
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

    if (this._areNumericallyEquivalent(studentAnswer, correctAnswer)) return true;

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
  },

  _areNumericallyEquivalent(a, b) {
    const parseNumeric = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return null;

      const fractionMatch = text.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
      if (fractionMatch) {
        const denom = Number(fractionMatch[2]);
        if (denom === 0) return null;
        return Number(fractionMatch[1]) / denom;
      }

      const mixedMatch = text.match(/^\s*(-?\d+)\s+(\d+)\s*\/\s*(\d+)\s*$/);
      if (mixedMatch) {
        const whole = Number(mixedMatch[1]);
        const denom = Number(mixedMatch[3]);
        if (denom === 0) return null;
        const sign = whole < 0 ? -1 : 1;
        return whole + sign * (Number(mixedMatch[2]) / denom);
      }

      const percentMatch = text.match(/^\s*(-?[\d.]+)\s*%\s*$/);
      if (percentMatch) return Number(percentMatch[1]) / 100;

      const cleaned = text.replace(/,/g, "").replace(/\s/g, "");
      const num = Number(cleaned);
      if (!Number.isNaN(num) && cleaned !== "") return num;

      return null;
    };

    const numA = parseNumeric(a);
    const numB = parseNumeric(b);
    if (numA === null || numB === null) return false;
    return Math.abs(numA - numB) < 1e-9;
  },

  _applyTargetSkillRelevanceGuard({
    questionType,
    isCorrect,
    questionText,
    studentAnswer,
    correctAnswer,
    standard,
    subjectName = "",
  }) {
    if (questionType !== "short_answer" || isCorrect) {
      return {
        isCorrect,
        guardApplied: false,
        feedbackPartsPatch: null,
      };
    }

    const targetSkills = this._detectTargetLanguageSkills({
      questionText,
      standard,
      subjectName,
    });
    if (targetSkills.size === 0) {
      return {
        isCorrect,
        guardApplied: false,
        feedbackPartsPatch: null,
      };
    }

    const diff = this._analyzeShortAnswerDifferences({
      studentAnswer,
      correctAnswer,
    });
    if (diff.categories.size === 0) {
      return {
        isCorrect,
        guardApplied: false,
        feedbackPartsPatch: null,
      };
    }

    const relevantBySkill = {
      // ELA
      punctuation: new Set(["punctuation"]),
      spelling: new Set(["spelling"]),
      capitalization: new Set(["capitalization"]),
      grammar: new Set(["wording"]),
      sentence_structure: new Set(["wording"]),
      vocabulary: new Set(["wording"]),
      // Math
      computation: new Set(["numeric", "wording"]),
      fractions: new Set(["numeric", "wording"]),
      decimals: new Set(["numeric", "wording"]),
      percentages: new Set(["numeric", "wording"]),
      geometry: new Set(["numeric", "wording"]),
      algebra: new Set(["numeric", "wording"]),
      measurement: new Set(["numeric", "wording"]),
      patterns: new Set(["numeric", "wording"]),
      word_problems: new Set(["numeric", "wording"]),
      // Science
      scientific_method: new Set(["wording"]),
      classification: new Set(["wording"]),
      cause_effect: new Set(["wording"]),
      ecology: new Set(["wording"]),
      life_science: new Set(["wording"]),
      physical_science: new Set(["numeric", "wording"]),
      earth_science: new Set(["wording"]),
      chemistry: new Set(["numeric", "wording"]),
      // Social studies
      chronology: new Set(["numeric", "wording"]),
      geography: new Set(["wording"]),
      civics: new Set(["wording"]),
      economics: new Set(["numeric", "wording"]),
      history: new Set(["wording"]),
      culture: new Set(["wording"]),
    };

    const relevantCategories = new Set();
    targetSkills.forEach((skill) => {
      const related = relevantBySkill[skill];
      if (!related) return;
      related.forEach((category) => relevantCategories.add(category));
    });

    const hasRelevantIssue = [...diff.categories].some((category) =>
      relevantCategories.has(category),
    );
    if (hasRelevantIssue) {
      return {
        isCorrect,
        guardApplied: false,
        feedbackPartsPatch: null,
      };
    }

    const targetLabel = this._humanizeTargetSkillLabel(targetSkills);
    const issueDescription = this._buildOffTargetIssueDescription(diff);

    return {
      isCorrect: true,
      guardApplied: true,
      feedbackPartsPatch: {
        correctionOrConfirmation: `You met the ${targetLabel} target, so this answer is marked correct.`,
        explanation: `Note: there is an additional ${issueDescription}, but it is outside the skill being graded here.`,
        reasonSummary: `Marked correct for ${targetLabel}. Non-target issue noted: ${issueDescription}.`,
        nextStep: `Keep the ${targetLabel} rule, and then clean up the ${issueDescription}.`,
        reviewTag: targetLabel,
        confidenceLevel: "medium",
        conceptChecks: {
          matched: [targetLabel],
          missing: [],
        },
      },
    };
  },

  _detectTargetLanguageSkills({ questionText = "", standard = {}, subjectName = "" } = {}) {
    const collectElaSkills = (source = "") => {
      const text = String(source || "").toLowerCase();
      const set = new Set();

      if (
        /(comma|commas|punctuation|apostrophe|semicolon|colon|period|question mark|exclamation|tag question|quotation marks?)/i.test(
          text,
        )
      ) {
        set.add("punctuation");
      }
      if (
        /(spell|spelling|misspell|correctly spelled|spelled correctly)/i.test(
          text,
        )
      ) {
        set.add("spelling");
      }
      if (/(capitalization|capital letter|uppercase|lowercase)/i.test(text)) {
        set.add("capitalization");
      }
      if (
        /(grammar|verb|tense|subject[-\s]?verb|agreement|article|preposition|pronoun)/i.test(
          text,
        )
      ) {
        set.add("grammar");
      }
      if (
        /(sentence structure|rewrite|rearrange|complete sentence|fragment|run[-\s]?on)/i.test(
          text,
        )
      ) {
        set.add("sentence_structure");
      }
      if (/(vocabulary|word meaning|synonym|antonym|context clue)/i.test(text)) {
        set.add("vocabulary");
      }

      return set;
    };

    const collectMathSkills = (source = "") => {
      const text = String(source || "").toLowerCase();
      const set = new Set();

      if (/(add|subtract|multiply|divide|arithmetic|operation|computation|calculate)/i.test(text)) set.add("computation");
      if (/(fraction|numerator|denominator|simplif|mixed number|improper)/i.test(text)) set.add("fractions");
      if (/(decimal|place value|tenths?|hundredths?|thousandths?)/i.test(text)) set.add("decimals");
      if (/(percent|percentage|ratio|proportion)/i.test(text)) set.add("percentages");
      if (/(geometry|area|perimeter|volume|angle|triangle|circle|shape)/i.test(text)) set.add("geometry");
      if (/(algebra|equation|variable|expression|solve for|inequality)/i.test(text)) set.add("algebra");
      if (/(measurement|unit|convert|meter|liter|gram|inch|foot|pound|ounce)/i.test(text)) set.add("measurement");
      if (/(pattern|sequence|function|table|graph|coordinate|plot)/i.test(text)) set.add("patterns");
      if (/(word problem|story problem|real.?world|application)/i.test(text)) set.add("word_problems");

      return set;
    };

    const collectScienceSkills = (source = "") => {
      const text = String(source || "").toLowerCase();
      const set = new Set();

      if (/(hypothesis|experiment|variable|control|method|procedure|observation)/i.test(text)) set.add("scientific_method");
      if (/(classify|categorize|sort|group|kingdom|phylum)/i.test(text)) set.add("classification");
      if (/(cause|effect|result|because|lead to|consequence)/i.test(text)) set.add("cause_effect");
      if (/(ecosystem|habitat|food chain|food web|biome|environment)/i.test(text)) set.add("ecology");
      if (/(cell|organism|photosynthesis|respiration|mitosis|meiosis)/i.test(text)) set.add("life_science");
      if (/(force|motion|energy|gravity|newton|speed|velocity|acceleration)/i.test(text)) set.add("physical_science");
      if (/(rock|mineral|weather|climate|erosion|plate|tectonic|volcano|earthquake)/i.test(text)) set.add("earth_science");
      if (/(chemical|reaction|element|compound|mixture|atom|molecule)/i.test(text)) set.add("chemistry");

      return set;
    };

    const collectSocialStudiesSkills = (source = "") => {
      const text = String(source || "").toLowerCase();
      const set = new Set();

      if (/(date|year|century|era|period|timeline|chronolog)/i.test(text)) set.add("chronology");
      if (/(map|geography|continent|country|capital|location|region|latitude|longitude)/i.test(text)) set.add("geography");
      if (/(government|constitution|law|rights|citizen|democracy|republic|branch)/i.test(text)) set.add("civics");
      if (/(economy|trade|supply|demand|market|resource|goods|services)/i.test(text)) set.add("economics");
      if (/(war|revolution|independence|colony|movement|reform|civil rights)/i.test(text)) set.add("history");
      if (/(culture|tradition|custom|religion|society|community)/i.test(text)) set.add("culture");

      return set;
    };

    const domain = this._classifySubjectDomain(subjectName);
    const collectByDomain = {
      ela: collectElaSkills,
      math: collectMathSkills,
      science: collectScienceSkills,
      social_studies: collectSocialStudiesSkills,
    };

    const primaryCollect = collectByDomain[domain] || null;

    if (primaryCollect) {
      const questionSkills = primaryCollect(questionText);
      if (questionSkills.size > 0) return questionSkills;

      const standardSkills = primaryCollect(`${standard?.name || ""} ${standard?.description || ""}`);
      if (standardSkills.size > 0) return standardSkills;
    }

    const questionSkills = collectElaSkills(questionText);
    if (questionSkills.size > 0) return questionSkills;

    return collectElaSkills(`${standard?.name || ""} ${standard?.description || ""}`);
  },

  _analyzeShortAnswerDifferences({ studentAnswer = "", correctAnswer = "" } = {}) {
    const categories = new Set();
    const expectedText = String(correctAnswer || "").trim();
    const studentText = String(studentAnswer || "").trim();

    const expectedLower = expectedText.toLowerCase();
    const studentLower = studentText.toLowerCase();
    const expectedNoPunct = expectedLower.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const studentNoPunct = studentLower.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    const expectedCommaCount = this._countOccurrences(expectedText, ",");
    const studentCommaCount = this._countOccurrences(studentText, ",");
    if (expectedCommaCount !== studentCommaCount) {
      categories.add("punctuation");
    }

    const expectedCaseAware = expectedText.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const studentCaseAware = studentText.replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (
      expectedCaseAware &&
      studentCaseAware &&
      expectedCaseAware.toLowerCase() === studentCaseAware.toLowerCase() &&
      expectedCaseAware !== studentCaseAware
    ) {
      categories.add("capitalization");
    }

    const expectedTokens = this._tokenizeLanguageWords(expectedText);
    const studentTokens = this._tokenizeLanguageWords(studentText);
    const { missingWords, extraWords } = this._diffWordFrequencies({
      expectedTokens,
      studentTokens,
    });

    const typoWords = [];
    let typosOnly = false;
    if (expectedTokens.length === studentTokens.length && expectedTokens.length > 0) {
      let possibleTyposOnly = true;
      for (let i = 0; i < expectedTokens.length; i += 1) {
        const expected = expectedTokens[i];
        const actual = studentTokens[i];
        if (expected === actual) continue;
        const distance = this._levenshteinDistance(expected, actual);
        const looksTypo =
          distance > 0 &&
          distance <= 2 &&
          expected.length >= 4 &&
          actual.length >= 4;
        if (!looksTypo) {
          possibleTyposOnly = false;
          break;
        }
        typoWords.push(actual);
      }
      if (possibleTyposOnly && typoWords.length > 0) {
        categories.add("spelling");
        typosOnly = true;
      }
    }

    if (!typosOnly && expectedNoPunct !== studentNoPunct && !categories.has("spelling")) {
      categories.add("wording");
    }
    if (!typosOnly && (missingWords.length > 0 || extraWords.length > 0)) {
      categories.add("wording");
    }

    const expectedNums = expectedLower.match(/-?[\d.,/]+%?/g) || [];
    const studentNums = studentLower.match(/-?[\d.,/]+%?/g) || [];
    if (
      expectedNums.length > 0 &&
      studentNums.length > 0 &&
      expectedNums.join(" ") !== studentNums.join(" ")
    ) {
      categories.add("numeric");
    }

    return {
      categories,
      missingWords,
      extraWords,
      typoWords,
    };
  },

  _humanizeTargetSkillLabel(targetSkills = new Set()) {
    // ELA
    if (targetSkills.has("punctuation")) return "punctuation";
    if (targetSkills.has("grammar")) return "grammar";
    if (targetSkills.has("sentence_structure")) return "sentence structure";
    if (targetSkills.has("spelling")) return "spelling";
    if (targetSkills.has("capitalization")) return "capitalization";
    if (targetSkills.has("vocabulary")) return "vocabulary";
    // Math
    if (targetSkills.has("computation")) return "computation";
    if (targetSkills.has("fractions")) return "fractions";
    if (targetSkills.has("decimals")) return "decimals";
    if (targetSkills.has("percentages")) return "percentages";
    if (targetSkills.has("geometry")) return "geometry";
    if (targetSkills.has("algebra")) return "algebra";
    if (targetSkills.has("measurement")) return "measurement";
    if (targetSkills.has("patterns")) return "patterns";
    if (targetSkills.has("word_problems")) return "word problems";
    // Science
    if (targetSkills.has("scientific_method")) return "scientific method";
    if (targetSkills.has("classification")) return "classification";
    if (targetSkills.has("cause_effect")) return "cause and effect";
    if (targetSkills.has("ecology")) return "ecology";
    if (targetSkills.has("life_science")) return "life science";
    if (targetSkills.has("physical_science")) return "physical science";
    if (targetSkills.has("earth_science")) return "earth science";
    if (targetSkills.has("chemistry")) return "chemistry";
    // Social studies
    if (targetSkills.has("chronology")) return "chronology";
    if (targetSkills.has("geography")) return "geography";
    if (targetSkills.has("civics")) return "civics";
    if (targetSkills.has("economics")) return "economics";
    if (targetSkills.has("history")) return "history";
    if (targetSkills.has("culture")) return "culture";
    return "target skill";
  },

  _buildOffTargetIssueDescription(diff = {}) {
    const { categories = new Set(), missingWords = [], extraWords = [], typoWords = [] } = diff;

    if (categories.has("spelling")) {
      if (typoWords.length > 0) {
        return `spelling issue (for example: "${typoWords[0]}")`;
      }
      return "spelling issue";
    }

    if (categories.has("punctuation")) {
      return "punctuation issue";
    }

    if (categories.has("capitalization")) {
      return "capitalization issue";
    }

    if (categories.has("wording")) {
      const missingList = this._formatQuotedWordList(missingWords);
      if (missingWords.length > 0 && extraWords.length > 0) {
        return `wording issue (missing ${missingList} and extra ${this._formatQuotedWordList(extraWords)})`;
      }
      if (missingWords.length > 0) {
        return `wording issue (missing ${missingList})`;
      }
      if (extraWords.length > 0) {
        return `wording issue (extra ${this._formatQuotedWordList(extraWords)})`;
      }
      return "wording issue";
    }

    if (categories.has("numeric")) {
      return "numeric formatting issue";
    }

    return "minor issue";
  },

  _applyShortAnswerLanguageGuard({
    questionType,
    isCorrect,
    questionText,
    studentAnswer,
    correctAnswer,
    feedbackParts,
    gradeLevel,
    studentFirstName,
  }) {
    const baseParts = feedbackParts || {};
    if (questionType !== "short_answer" || isCorrect) {
      return { feedbackParts: baseParts, guardApplied: false };
    }

    const diagnosis = this._diagnoseShortAnswerLanguageIssue({
      questionText,
      studentAnswer,
      correctAnswer,
    });
    if (!diagnosis) {
      return { feedbackParts: baseParts, guardApplied: false };
    }

    const patched = {
      ...baseParts,
      correctionOrConfirmation:
        diagnosis.correctionOrConfirmation || baseParts.correctionOrConfirmation,
      explanation: diagnosis.explanation || baseParts.explanation,
      reasonSummary: diagnosis.reasonSummary || baseParts.reasonSummary,
      nextStep: diagnosis.nextStep || baseParts.nextStep,
      reviewTag: diagnosis.reviewTag || baseParts.reviewTag,
      confidenceLevel:
        baseParts.confidenceLevel === "high"
          ? "medium"
          : baseParts.confidenceLevel || "medium",
      conceptChecks: diagnosis.conceptChecks || baseParts.conceptChecks,
    };

    return {
      feedbackParts: this._mergeFeedbackParts(
        patched,
        {},
        gradeLevel,
        studentFirstName,
      ),
      guardApplied: true,
    };
  },

  _diagnoseShortAnswerLanguageIssue({
    questionText = "",
    studentAnswer = "",
    correctAnswer = "",
  } = {}) {
    const question = String(questionText || "").toLowerCase();
    const asksLanguageMechanics =
      /(sentence|rewrite|correct|missing|grammar|punctuation|comma|tag question|capitalization|spelling)/i.test(
        question,
      );
    if (!asksLanguageMechanics) return null;

    const expectedTokens = this._tokenizeLanguageWords(correctAnswer);
    const studentTokens = this._tokenizeLanguageWords(studentAnswer);
    if (!expectedTokens.length || !studentTokens.length) return null;

    const { missingWords, extraWords } = this._diffWordFrequencies({
      expectedTokens,
      studentTokens,
    });

    const commaFocus = /(comma|commas|punctuation|tag question)/i.test(question);
    const expectedCommaCount = this._countOccurrences(correctAnswer, ",");
    const studentCommaCount = this._countOccurrences(studentAnswer, ",");
    const expectedTagComma = /,\s*[^?]+\?$/.test(String(correctAnswer || "").trim());
    const studentHasTagComma = /,\s*[^?]+\?$/.test(String(studentAnswer || "").trim());
    const commaLikelyCorrect =
      expectedCommaCount === studentCommaCount &&
      (!expectedTagComma || studentHasTagComma);

    if (commaFocus && commaLikelyCorrect && missingWords.length > 0) {
      const missingList = this._formatQuotedWordList(missingWords);
      const conceptChecks = {
        matched: ["comma placement"],
        missing: missingWords.map((word) => `missing word: ${word}`),
      };
      return {
        correctionOrConfirmation: `Your comma placement is correct, but your sentence is missing ${missingList}.`,
        explanation:
          "The punctuation is in the right place for a tag question. The main fix is adding the missing word so the sentence is grammatically complete.",
        reasonSummary:
          "This answer was marked incorrect because a required word was missing, not because of comma placement.",
        nextStep:
          "After placing punctuation, reread once to check for missing words like articles (a, an, the).",
        reviewTag: "sentence structure",
        conceptChecks,
      };
    }

    if (commaFocus && !commaLikelyCorrect) {
      return {
        correctionOrConfirmation:
          "You need a comma before the tag question to separate the main statement from the tag.",
        explanation:
          "Tag questions are set off with a comma before the tag phrase.",
        reasonSummary:
          "This answer was marked incorrect due to comma placement around the tag question.",
        nextStep:
          "Practice adding one comma before each tag question (for example: ..., isn't it?).",
        reviewTag: "punctuation",
        conceptChecks: {
          matched: [],
          missing: ["comma before tag question"],
        },
      };
    }

    if (missingWords.length > 0 || extraWords.length > 0) {
      const missingList = this._formatQuotedWordList(missingWords);
      const extraList = this._formatQuotedWordList(extraWords);
      const details = [
        missingWords.length > 0 ? `missing ${missingList}` : null,
        extraWords.length > 0 ? `extra ${extraList}` : null,
      ]
        .filter(Boolean)
        .join(" and ");

      return {
        correctionOrConfirmation: `Your sentence has a wording mismatch (${details}) compared with the expected answer.`,
        explanation:
          "This task checks sentence accuracy, so all required words should be present in the final sentence.",
        reasonSummary:
          "This answer was marked incorrect because the sentence wording did not fully match the expected structure.",
        nextStep:
          "Compare your sentence word-by-word with the target sentence to catch missing or extra words.",
        reviewTag: "sentence accuracy",
        conceptChecks: {
          matched: [],
          missing: missingWords.length > 0 ? missingWords.map((word) => `missing word: ${word}`) : ["sentence accuracy"],
        },
      };
    }

    return null;
  },
};
