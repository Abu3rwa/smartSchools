/**
 * Deterministic pre-checks that stop a useless AI run before it is claimed.
 *
 * These are facts about the draft, not judgements about the child: an empty
 * draft, a draft below the task's own minimum, a draft that arrived mostly as a
 * blocked paste, or a single sentence. Each returns teacher guidance and a
 * short child-facing message. No AI is called and no credit is spent.
 */

const PASTED_SHARE = 0.6;
const PASTED_MIN_CHARS = 200;
const SINGLE_SENTENCE_MIN_WORDS = 8;

const message = (code, guidance, childMessage, data = {}) => ({
  code,
  guidance,
  childMessage,
  ...data,
});

const draftChars = (draft) =>
  (draft?.sections || [])
    .map((row) => String(row?.text || ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim().length;

const pastedChars = (draft) =>
  (draft?.pasteAttempts || []).reduce(
    (sum, row) =>
      sum + (Number(row?.chars) || String(row?.text || "").length || 0),
    0,
  );

/** The first blocking condition, or null when the draft is worth a run. */
export const draftPrecheck = ({ assignment = {}, draft = {}, metrics = {} } = {}) => {
  const totalWords = Number(metrics.totalWords) || 0;
  if (totalWords === 0) {
    return message(
      "empty",
      "This draft is empty. No feedback was generated and no credit was used. Ask the student to write a first sentence, then run the assessment again.",
      "Your draft is empty. Write a first sentence about your topic, then send it again.",
    );
  }

  const minWords = Number(assignment.minWords) || 0;
  if (minWords > 0 && totalWords < minWords) {
    return message(
      "below_minimum",
      `This draft has ${totalWords} words, and the task asks for at least ${minWords}. No feedback was generated and no credit was used. Ask the student to finish the draft first.`,
      `Your draft has ${totalWords} words, and the task asks for at least ${minWords}. Finish your ideas, then send it again.`,
      { words: totalWords, minWords },
    );
  }

  const chars = draftChars(draft);
  const pasted = pastedChars(draft);
  if (chars >= PASTED_MIN_CHARS && pasted >= chars * PASTED_SHARE) {
    return message(
      "pasted",
      "Most of this draft arrived through a blocked paste. Check with the student that these are their own words before giving feedback. No AI feedback was generated and no credit was used.",
      "Rewrite this draft in your own words, then send it again.",
    );
  }

  if (
    (Number(metrics.sentenceCount) || 0) === 1 &&
    totalWords >= SINGLE_SENTENCE_MIN_WORDS
  ) {
    return message(
      "single_sentence",
      "This draft is one sentence. No feedback was generated and no credit was used. Ask the student to break it into several sentences, then run the assessment again.",
      "All your ideas are in one sentence. Break them into shorter sentences, then send it again.",
    );
  }

  return null;
};
