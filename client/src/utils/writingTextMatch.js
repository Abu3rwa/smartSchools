/**
 * Text matching shared by the server and the student view. One implementation
 * for both means a quote the server accepted is the same quote the child's
 * browser highlights: smart apostrophes, dashes and full-width forms are folded
 * the same way on each side.
 */

/**
 * Case-, Unicode- and punctuation-insensitive form used only for comparison.
 * The original text is always what gets rendered; this form never leaves the
 * matcher. `foldRaw` keeps surrounding whitespace, which the offset matcher in
 * writingAnchors needs character by character.
 */
export const foldRaw = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02BC\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();

export const foldForMatch = (value) => foldRaw(value).trim();

const TOKEN_SPLIT = /[^\p{L}\p{N}']+/u;

/** Content words only: short words ("a", "of") carry no anchoring signal. */
export const tokensForMatch = (value) =>
  foldForMatch(value)
    .split(TOKEN_SPLIT)
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3);

/** Dice overlap of two word bags, 0 to 1. */
export const tokenSimilarity = (a, b) => {
  const left = tokensForMatch(a);
  const right = tokensForMatch(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  for (const token of left) counts.set(token, (counts.get(token) || 0) + 1);
  let shared = 0;
  for (const token of right) {
    const remaining = counts.get(token) || 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(token, remaining - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
};

/** How much of `quote`'s content words appear in `text`, 0 to 1. */
export const tokenCoverage = (quote, text) => {
  const need = tokensForMatch(quote);
  if (!need.length) return 0;
  const have = new Set(tokensForMatch(text));
  return need.filter((token) => have.has(token)).length / need.length;
};

/** Same instruction, said again: wording overlap above the repeat threshold. */
export const REPEAT_SIMILARITY = 0.6;

export const isRepeatedInstruction = (previous, next) =>
  Boolean(previous && next) && tokenSimilarity(previous, next) >= REPEAT_SIMILARITY;

/**
 * Levenshtein distance that stops as soon as it is certain to exceed `limit`,
 * so scanning a whole draft never costs more than a short band per word.
 */
export const editDistanceWithin = (a, b, limit) => {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = new Array(b.length + 1);
  let current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      if (current[j] < best) best = current[j];
    }
    if (best > limit) return limit + 1;
    [previous, current] = [current, previous];
  }
  return previous[b.length];
};

/** A longer word is a near miss one edit away; a very long word may be two. */
export const nearMissLimit = (word) => {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
};

/**
 * Tokens the writer typed instead of `word`. Near misses are evidence, never a
 * correction: short words are skipped so `the`/`she` never looks like a
 * misspelling.
 */
export const nearMissTokens = ({ word, tokens = [], known = new Set(), max = 2 }) => {
  const key = String(word || "").toLowerCase();
  const limit = nearMissLimit(key);
  if (!limit) return [];
  const found = [];
  for (const token of tokens) {
    if (token === key || known.has(token)) continue;
    if (editDistanceWithin(token, key, limit) <= limit) {
      found.push(token);
      if (found.length === max) break;
    }
  }
  return found;
};
