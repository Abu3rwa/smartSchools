/**
 * A rubric row as a student reads it: the criterion, a plain-word verdict and
 * one quote from their own writing. No points are shown — the level comes from
 * the ratio and reads as five dots, so 4/5 and 8/10 look the same.
 */

const DOTS = 5;

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

export const rubricRows = (scores) => (Array.isArray(scores) ? scores : [])
  .filter((row) => row && String(row.label || row.key || "").trim())
  .map((row) => ({
    key: String(row.key || row.label),
    label: String(row.label || row.key).trim(),
    evidence: String(row.evidence || "").trim(),
    explanation: String(row.explanation || "").trim(),
    ...rubricLevel(row.score, row.maxScore),
  }));