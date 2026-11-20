/**
 * A rubric row as a student reads it: the criterion, a plain-word verdict and
 * one quote from their own writing. No points are shown — the level comes from
 * the ratio and reads as five dots, so 4/5 and 8/10 look the same.
 *
 * The same file runs on the server (email, print sheet, student payload) so a
 * child and a family never read a number where a verdict was intended.
 */

const DOTS = 5;

export const LEVELS = ["strong", "near", "needs"];

/**
 * How much of a mark a child, a family or a printout may read. The school picks
 * one mode and every child-facing surface follows it (C4).
 * "words" is the default because it is what the app has always shown.
 */
export const MARKS_MODES = ["words", "words_numbers", "numbers"];

export const marksModeOf = (value) =>
  MARKS_MODES.includes(String(value)) ? String(value) : "words";

export const marksShowsNumbers = (mode) =>
  mode === "words_numbers" || mode === "numbers";

const isLevel = (value) => LEVELS.includes(value);

export const rubricLevel = (score, maxScore) => {
  const max = Number(maxScore) || 0;
  const value = Math.min(Math.max(Number(score) || 0, 0), max);
  const ratio = max > 0 ? value / max : 0;
  return {
    ratio,
    level: ratio >= 0.8 ? "strong" : ratio >= 0.5 ? "near" : "needs",
    filled: Math.round(ratio * DOTS),
    dots: DOTS,
  };
};

const DIGIT = "[0-9٠-٩]";
const NUM = `${DIGIT}+(?:[.,٫]${DIGIT}+)?`;

// Ways a reply says it in marks. The child reads the verdict instead; the
// numbers themselves stay on the teacher's screen.
const SCORE_PATTERNS = [
  new RegExp(
    `\\b(?:you\\s+)?(?:scored|score|got|earned|received|achieved)\\s*(?:a\\s+)?${NUM}\\s*(?:/|out of|من)\\s*${NUM}\\b`,
    "gi",
  ),
  new RegExp(`\\b${NUM}\\s*(?:/|out of|من)\\s*${NUM}\\b`, "g"),
  new RegExp(
    `\\b(?:scored|score|scores|marks?|points?|grades?)\\s*(?:of|is|was|:|=)?\\s*${NUM}\\b`,
    "gi",
  ),
  new RegExp(`\\b${NUM}\\s*(?:marks?|points?|نقاط|درجات?)\\b`, "gi"),
  new RegExp(`\\b(?:score|mark|point|grade|الدرجة|النقاط)\\s*[:=]\\s*${NUM}\\b`, "gi"),
];

// What is left once the number is gone: "You scored 4/5" must not become
// "You scored ." — the clause goes with the number.
const DANGLING = [
  /\b(?:you\s+)?(?:scored|score|got|earned|received|achieved)(?:\s+a)?\s*(?=[.,;:!?]|$)/gi,
  /\byour\s+(?:score|mark|grade|total)(?:\s+(?:is|was|of))?\s*(?=[.,;:!?]|$)/gi,
  /\s*حصلت\s+على\s*(?=[.,;:!?]|$)/g,
];

/** Drop score talk from feedback prose, keeping the sentence readable. */
export const stripScoreTalk = (text) => {
  let out = String(text ?? "");
  if (!out) return "";
  for (const pattern of SCORE_PATTERNS) out = out.replace(pattern, "");
  for (const pattern of DANGLING) out = out.replace(pattern, "");
  const tidied = out
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])\s*([.,;:!?])+/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,;:!?—–-]+/, "")
    .replace(/\s+$/, "");
  return /^[.,;:!?—–\s-]*$/.test(tidied) ? "" : tidied;
};

const levelOf = (row) => {
  const dots = Number(row.dots) > 0 ? Number(row.dots) : DOTS;
  const filled = Math.min(Math.max(Number(row.filled) || 0, 0), dots);
  return { ratio: filled / dots, level: row.level, filled, dots };
};

export const rubricRows = (scores, { marks = "words" } = {}) =>
  (Array.isArray(scores) ? scores : [])
    .filter((row) => row && String(row.label || row.key || "").trim())
    .map((row) => ({
      key: String(row.key || row.label),
      label: String(row.label || row.key).trim(),
      evidence: String(row.evidence || "").trim(),
      explanation: stripScoreTalk(row.explanation),
      // The server sends the verdict already computed (no points in the payload);
      // the teacher's screen still carries score and maxScore and derives it here.
      ...(isLevel(row.level)
        ? levelOf(row)
        : rubricLevel(row.score, row.maxScore)),
      // A school that shows numbers gets them on the row; the default never does.
      ...(marksShowsNumbers(marksModeOf(marks)) &&
      Number.isFinite(Number(row.score)) &&
      Number(row.maxScore) > 0
        ? { score: Number(row.score), maxScore: Number(row.maxScore) }
        : {}),
    }));
