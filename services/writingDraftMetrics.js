/**
 * Deterministic facts about one writing draft.
 *
 * Everything here is computed from the text itself: no AI, no database, no
 * clock. The prompt quotes these facts so the model stops guessing at counts,
 * and normalisation corrects a reply that states a different number.
 */

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const SENTENCE_BREAK = /(?<=[.!?…])\s+/;
const READING_WORDS_PER_MINUTE = 200;
const MAX_REPEATED_PHRASES = 5;
const MAX_NEAR_MISSES = 8;
const MAX_WALK_DEPTH = 64;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "i", "in", "is", "it", "its",
  "my", "not", "of", "on", "or", "she", "so", "that", "the", "their",
  "them", "there", "they", "this", "to", "was", "we", "were", "with", "you",
]);

// Order matters only for how the prompt lists them; the counts are the facts.
const COUNTERPOINT_MARKERS = [
  "however",
  "although",
  "though",
  "even though",
  "but",
  "yet",
  "because",
  "since",
  "therefore",
  "instead",
  "whereas",
  "while",
  "meanwhile",
  "moreover",
  "furthermore",
  "for example",
  "for instance",
  "on the other hand",
  "in contrast",
];

// A single linking word ("however") is not proof of an opposing view, so only
// phrases that name another side are counted here. The lists stay conservative:
// they feed a score guard, and a false match would cost a child marks.
const OTHER_SIDE_MARKERS = [
  "some people think",
  "some people believe",
  "some may argue",
  "some might argue",
  "others might",
  "others may",
  "people might disagree",
  "people may disagree",
  "on the other hand",
  "opponents",
  "critics",
  "even though",
  "although",
];

const REPLY_MARKERS = [
  "but i",
  "i still",
  "i disagree",
  "even so",
  "this is why",
  "that is why",
  "yet i",
  "nevertheless",
];

export const countWords = (value) =>
  (String(value || "").match(WORD_PATTERN) || []).length;

const countSyllables = (word) => {
  const letters = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return 0;
  const groups = letters.match(/[aeiouy]+/g) || [];
  let syllables = groups.length;
  // A silent final "e" does not make a syllable unless it carries the only
  // vowel sound in the word ("the", "be").
  if (syllables > 1 && letters.endsWith("e")) syllables -= 1;
  return Math.max(1, syllables);
};

/**
 * Flesch reading ease and Flesch–Kincaid grade for one text. The heuristic is
 * the standard one; it is only ever used as a gauge with a threshold, never as
 * a fact the model is told (word counts stay in the metrics block).
 */
export const readabilityOf = (value) => {
  const text = String(value || "");
  const sentences = splitSentences(text);
  const words = (text.toLowerCase().match(WORD_PATTERN) || []);
  if (!words.length) {
    return { words: 0, sentences: 0, fleschEase: 0, fleschGrade: 0 };
  }
  const wordsPerSentence = words.length / Math.max(1, sentences.length);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const syllablesPerWord = syllables / words.length;
  const round = (number) => Math.round(number * 10) / 10;
  return {
    words: words.length,
    sentences: sentences.length || 1,
    fleschEase: round(206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord),
    fleschGrade: round(0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59),
  };
};

export const splitSentences = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .split(SENTENCE_BREAK)
    .map((row) => row.trim())
    .filter(Boolean);

const wordsOf = (value) =>
  (String(value || "").toLowerCase().match(WORD_PATTERN) || []);

/**
 * The words that carry meaning when two texts are compared: no stopwords, no
 * short words. Used to decide whether a lesson fact already appears in a draft.
 */
export const contentWordsOf = (value) => [
  ...new Set(wordsOf(value).filter((word) => word.length >= 4 && !STOPWORDS.has(word))),
];

/** Edit distance at most one, the usual shape of a child's near miss. */
export const withinOneEdit = (a, b) => {
  const left = String(a || "");
  const right = String(b || "");
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
};

const repeatedPhrasesOf = (words) => {
  const counts = new Map();
  for (let index = 0; index + 2 < words.length; index += 1) {
    const trigram = `${words[index]} ${words[index + 1]} ${words[index + 2]}`;
    if (words.slice(index, index + 3).every((word) => STOPWORDS.has(word))) continue;
    counts.set(trigram, (counts.get(trigram) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_REPEATED_PHRASES)
    .map(([phrase, count]) => ({ phrase, count }));
};

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const markerCounts = (text, markers) => {
  const haystack = String(text || "").toLowerCase();
  return markers.map((marker) => ({
    marker,
    count: (haystack.match(new RegExp(`\\b${escapePattern(marker)}\\b`, "g")) || []).length,
  })).filter((row) => row.count > 0);
};

const counterpointOf = (text) => markerCounts(text, COUNTERPOINT_MARKERS);

const opposingViewOf = (text) => ({
  otherSide: markerCounts(text, OTHER_SIDE_MARKERS),
  reply: markerCounts(text, REPLY_MARKERS),
});

const targetWordsOf = (wordUseEvidence, spellingCandidates, draftWords) => {
  if (!wordUseEvidence && !(spellingCandidates || []).length) return null;
  const used = [];
  const unused = [];
  const nearMisses = [];
  for (const source of ["spelling", "vocabulary"]) {
    for (const row of wordUseEvidence?.[source] || []) {
      const word = String(row?.word || "").trim();
      if (!word) continue;
      if (row.used) used.push(word);
      else unused.push(word);
      for (const miss of row.nearMisses || []) {
        nearMisses.push({ word, found: String(miss || "") });
      }
    }
  }
  const seen = new Set([...used, ...unused].map((word) => word.toLowerCase()));
  for (const row of spellingCandidates || []) {
    const word = String(row?.word || "").trim();
    if (!word || seen.has(word.toLowerCase())) continue;
    const exact = draftWords.includes(word.toLowerCase());
    if (exact) used.push(word);
    else {
      unused.push(word);
      if (nearMisses.length < MAX_NEAR_MISSES) {
        const miss = draftWords.find(
          (token) =>
            token !== word.toLowerCase() &&
            token.length > 2 &&
            withinOneEdit(token, word.toLowerCase()),
        );
        if (miss) nearMisses.push({ word, found: miss });
      }
    }
  }
  if (!used.length && !unused.length) return null;
  return {
    usedCount: used.length,
    unusedCount: unused.length,
    usedWords: used.slice(0, 12),
    nearMisses: nearMisses.slice(0, MAX_NEAR_MISSES),
  };
};

/**
 * The whole draft in one object. Sections are read in the order the student
 * wrote them; every number is derived from the text on every call.
 */
export const computeDraftMetrics = ({
  draft,
  wordUseEvidence = null,
  spellingCandidates = [],
} = {}) => {
  const sections = (draft?.sections || []).map((row) => {
    const value = String(row?.text || "");
    const sentences = splitSentences(value);
    return {
      key: String(row?.key || ""),
      index: Number(row?.index) || 0,
      label: String(row?.label || row?.key || ""),
      words: countWords(value),
      sentences: sentences.length,
      empty: !value.trim(),
      opposingView: opposingViewOf(value),
    };
  });

  const fullText = (draft?.sections || [])
    .map((row) => String(row?.text || ""))
    .filter((row) => row.trim())
    .join(" ");
  const sentences = splitSentences(fullText);
  const words = wordsOf(fullText);
  const totalWords = words.length;

  let longest = null;
  for (const row of draft?.sections || []) {
    for (const sentence of splitSentences(row?.text)) {
      const size = countWords(sentence);
      if (!longest || size > longest.words) {
        longest = {
          words: size,
          sentence: sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence,
          key: String(row?.key || ""),
          index: Number(row?.index) || 0,
          label: String(row?.label || row?.key || ""),
        };
      }
    }
  }

  return {
    totalWords,
    sentenceCount: sentences.length,
    averageSentenceWords: sentences.length
      ? Math.round((totalWords / sentences.length) * 10) / 10
      : 0,
    longestSentence: longest,
    paragraphCount: sections.filter((row) => !row.empty).length,
    sections,
    repeatedPhrases: repeatedPhrasesOf(words),
    counterpoint: counterpointOf(fullText),
    opposingView: opposingViewOf(fullText),
    targetWords: targetWordsOf(wordUseEvidence, spellingCandidates, words),
    readingMinutes: Math.round((totalWords / READING_WORDS_PER_MINUTE) * 10) / 10,
  };
};

const list = (values) => values.filter(Boolean).join("; ");

/** The facts block a prompt quotes, or "" when there is nothing to quote. */
export const metricsPromptBlock = (metrics) => {
  if (!metrics || !metrics.totalWords) return "";
  const lines = [];
  lines.push(
    `- Total words: ${metrics.totalWords} across ${metrics.paragraphCount} ${metrics.paragraphCount === 1 ? "section" : "sections"}.`,
  );
  const sectionWords = (metrics.sections || [])
    .filter((row) => !row.empty)
    .map((row) => `${row.label || row.key} (${row.index}): ${row.words} words, ${row.sentences} ${row.sentences === 1 ? "sentence" : "sentences"}`);
  if (sectionWords.length) lines.push(`- Section words: ${sectionWords.join("; ")}.`);
  lines.push(
    `- Sentences: ${metrics.sentenceCount} (average ${metrics.averageSentenceWords} words per sentence).`,
  );
  if (metrics.longestSentence?.words) {
    lines.push(
      `- Longest sentence: ${metrics.longestSentence.words} words, in ${metrics.longestSentence.label || metrics.longestSentence.key} (${metrics.longestSentence.index}).`,
    );
  }
  if ((metrics.repeatedPhrases || []).length) {
    lines.push(
      `- Repeated phrases: ${list(metrics.repeatedPhrases.map((row) => `"${row.phrase}" ×${row.count}`))}.`,
    );
  }
  if ((metrics.counterpoint || []).length) {
    lines.push(
      `- Linking words used: ${list(metrics.counterpoint.map((row) => `${row.marker} ×${row.count}`))}.`,
    );
  }
  const opposing = metrics.opposingView || {};
  if ((opposing.otherSide || []).length) {
    lines.push(
      `- Other side of the argument: mentioned (${list(opposing.otherSide.map((row) => row.marker))}).`,
    );
  }
  if ((opposing.reply || []).length) {
    lines.push(
      `- Reply to the other side: mentioned (${list(opposing.reply.map((row) => row.marker))}).`,
    );
  }
  if (metrics.targetWords) {
    lines.push(
      `- Target words: ${metrics.targetWords.usedCount} used, ${metrics.targetWords.unusedCount} not used.`,
    );
    if (metrics.targetWords.nearMisses?.length) {
      lines.push(
        `- Near-miss spellings: ${list(metrics.targetWords.nearMisses.map((row) => `${row.found} for ${row.word}`))}.`,
      );
    }
  }
  lines.push(`- Reading time: about ${metrics.readingMinutes} minutes at 200 words per minute.`);
  return `Draft facts (computed by the server — leave as they are):
${lines.join("\n")}
Use these numbers for any statement about length, sentences or paragraphs, and never state a different count. Spend your judgement on meaning.
`;
};

const COUNT_CLAIMS = [
  { pattern: /(\d+)\s+words?\b/gi, actual: (metrics) => metrics.totalWords },
  { pattern: /(\d+)\s+sentences?\b/gi, actual: (metrics) => metrics.sentenceCount },
  { pattern: /(\d+)\s+paragraphs?\b/gi, actual: (metrics) => metrics.paragraphCount },
];

const scrubString = (value, metrics) => {
  let result = value;
  for (const { pattern, actual } of COUNT_CLAIMS) {
    result = result.replace(pattern, (match, claimed) => {
      const truth = actual(metrics);
      return Number(claimed) === truth ? match : `${truth}${match.slice(claimed.length)}`;
    });
  }
  return result;
};

/**
 * A reply that states a word or sentence count contradicting the draft is
 * corrected to the computed number. Quotes (`evidence`) are left byte-for-byte:
 * they are the child's own words, not a claim about them.
 */
export const scrubCountClaimsDeep = (
  value,
  metrics,
  { skipKeys = ["evidence"], depth = 0, seen = new WeakSet() } = {},
) => {
  if (typeof value === "string") return scrubString(value, metrics);
  if (!value || typeof value !== "object") return value;
  if (depth >= MAX_WALK_DEPTH || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((row) =>
      scrubCountClaimsDeep(row, metrics, { skipKeys, depth: depth + 1, seen }),
    );
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = skipKeys.includes(key)
      ? entry
      : scrubCountClaimsDeep(entry, metrics, { skipKeys, depth: depth + 1, seen });
  }
  return result;
};

/** The bounded shape stored on the assessment; text is dropped on purpose. */
export const metricsSummaryForStorage = (metrics) =>
  metrics
    ? {
        totalWords: metrics.totalWords,
        sentenceCount: metrics.sentenceCount,
        paragraphCount: metrics.paragraphCount,
        averageSentenceWords: metrics.averageSentenceWords,
        longestSentenceWords: metrics.longestSentence?.words || 0,
        repeatedPhraseCount: (metrics.repeatedPhrases || []).length,
        repeatedPhrases: (metrics.repeatedPhrases || []).map((row) => row.phrase),
        readingMinutes: metrics.readingMinutes,
      }
    : undefined;
