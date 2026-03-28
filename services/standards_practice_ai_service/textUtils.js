import { GRADE_WORD_BANDS, TEXT_LIMIT_BANDS } from "./constants.js";

export default {
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
  },

  _toSentenceCase(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  },

  _sanitizeDifficulty(value) {
    const raw = String(value || "").toLowerCase();
    if (raw === "easy" || raw === "medium" || raw === "hard") return raw;
    return "medium";
  },

  _normalizeStudentName(name) {
    const cleaned = this._sanitizeText(name || "", {
      maxLength: 40,
      sentenceCase: true,
    });
    return cleaned || "Student";
  },

  _escapeRegex(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  _normalizeSentence(text) {
    return this._sanitizeText(text, { maxLength: 800, sentenceCase: false });
  },

  _normalizeForComparison(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[`*_#>\-~]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  _truncateWords(text, maxWords) {
    const words = String(text || "")
      .split(/\s+/)
      .filter(Boolean);
    if (!maxWords || words.length <= maxWords) return words.join(" ");
    return `${words.slice(0, maxWords).join(" ")}...`;
  },

  _getWordRangeByGrade(gradeLevel) {
    const grade = Number(gradeLevel);
    if (!Number.isFinite(grade)) {
      return { minWords: 50, maxWords: 90 };
    }
    const band = GRADE_WORD_BANDS.find((entry) => grade >= entry.min && grade <= entry.max);
    return band || { minWords: 70, maxWords: 120 };
  },

  _getTextLimitsByGrade(gradeLevel) {
    const grade = Number(gradeLevel);
    if (!Number.isFinite(grade)) return TEXT_LIMIT_BANDS[1];
    return (
      TEXT_LIMIT_BANDS.find((entry) => grade >= entry.min && grade <= entry.max) ||
      TEXT_LIMIT_BANDS[2]
    );
  },

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
  },

  _parseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          // continue to next attempt
        }
      }

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
  },

  _levenshteinDistance(left = "", right = "") {
    const a = String(left || "");
    const b = String(right || "");
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[a.length][b.length];
  },

  _tokenizeLanguageWords(text = "") {
    const matches = String(text || "")
      .toLowerCase()
      .match(/[a-z0-9']+/g);
    return Array.isArray(matches) ? matches : [];
  },

  _diffWordFrequencies({ expectedTokens = [], studentTokens = [] } = {}) {
    const expectedFreq = new Map();
    const studentFreq = new Map();

    expectedTokens.forEach((token) => {
      expectedFreq.set(token, (expectedFreq.get(token) || 0) + 1);
    });
    studentTokens.forEach((token) => {
      studentFreq.set(token, (studentFreq.get(token) || 0) + 1);
    });

    const missingWords = [];
    const extraWords = [];

    expectedFreq.forEach((count, token) => {
      const delta = count - (studentFreq.get(token) || 0);
      for (let i = 0; i < delta; i += 1) {
        if (missingWords.length < 4) missingWords.push(token);
      }
    });

    studentFreq.forEach((count, token) => {
      const delta = count - (expectedFreq.get(token) || 0);
      for (let i = 0; i < delta; i += 1) {
        if (extraWords.length < 4) extraWords.push(token);
      }
    });

    return { missingWords, extraWords };
  },

  _formatQuotedWordList(words = []) {
    const unique = [...new Set((words || []).filter(Boolean))].slice(0, 3);
    if (unique.length === 0) return "a required word";
    if (unique.length === 1) return `"${unique[0]}"`;
    if (unique.length === 2) return `"${unique[0]}" and "${unique[1]}"`;
    return `"${unique[0]}", "${unique[1]}", and "${unique[2]}"`;
  },

  _countOccurrences(text = "", token = ",") {
    if (!token) return 0;
    const matches = String(text || "").match(
      new RegExp(this._escapeRegex(token), "g"),
    );
    return matches ? matches.length : 0;
  },

  _jaccardSimilarity(setA, setB) {
    if (!setA?.size || !setB?.size) return 0;
    let intersection = 0;
    setA.forEach((item) => {
      if (setB.has(item)) intersection += 1;
    });
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  },
};
