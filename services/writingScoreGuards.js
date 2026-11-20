/**
 * Mechanical score floors and ceilings.
 *
 * A model can praise a draft whose own shape contradicts the mark: a missing
 * required section, an empty section, or a rebuttal that names the other side
 * without using any of the lesson facts. Each guard clamps only what the text
 * mechanically disproves and records the change, so a teacher can see why a
 * mark differs from the model's first answer.
 *
 * Pure: no AI, no database, no clock.
 */

const MAX_ADJUSTMENTS = 12;

const sectionId = (row) => `${row?.key}:${Number(row?.index) || 0}`;

const metricFor = (metrics, row) =>
  (metrics?.sections || []).find((item) => sectionId(item) === sectionId(row));

/**
 * `packCoverage` is null when the assignment has no pack; the rebuttal guard
 * then stays off, because there is no supplied evidence to judge against.
 */
export const guardScores = ({
  sections = [],
  scores = [],
  snapshot = {},
  metrics = null,
  packCoverage = null,
} = {}) => {
  const adjustments = [];
  const record = (row) => {
    if (adjustments.length < MAX_ADJUSTMENTS) adjustments.push(row);
  };
  const definitionFor = (key) =>
    (snapshot.sections || []).find((definition) => definition.key === key);

  const nextSections = (sections || []).map((row) => {
    const metric = metricFor(metrics, row);
    const maxScore = Number(row.maxScore) || 0;
    let score = Number(row.score) || 0;

    // An empty section is not a partial attempt; it earns nothing.
    if (metric?.empty && score > 0) {
      record({
        target: "section",
        key: row.key,
        index: Number(row.index) || 0,
        from: score,
        to: 0,
        reason: "empty_section",
      });
      score = 0;
    }

    // A9: with lesson facts supplied, a counterargument or rebuttal that uses
    // none of them has not backed the other side. Full marks need evidence.
    const kind = definitionFor(row.key)?.kind || "";
    const namesOtherSide = (metric?.opposingView?.otherSide || []).length > 0;
    const usedFacts = (packCoverage?.bySection?.[sectionId(row)] || []).length;
    if (
      packCoverage &&
      ["counterargument", "rebuttal"].includes(kind) &&
      namesOtherSide &&
      usedFacts === 0 &&
      score >= maxScore &&
      maxScore >= 1
    ) {
      record({
        target: "section",
        key: row.key,
        index: Number(row.index) || 0,
        from: score,
        to: maxScore - 1,
        reason: "rebuttal_without_pack_evidence",
      });
      score = maxScore - 1;
    }

    return { ...row, score };
  });

  // A required section that is absent from the draft cannot earn full
  // organisation marks, whatever the model said about the piece's shape.
  const present = new Set((metrics?.sections || []).map((row) => row.key));
  const missing = (snapshot.sections || [])
    .filter((definition) => definition.required && !present.has(definition.key))
    .map((definition) => definition.key);
  const nextScores = (scores || []).map((row) => {
    const isOrganisation =
      row.key === "organisation" || /organis/i.test(String(row.label || ""));
    const maxScore = Number(row.maxScore) || 0;
    const score = Number(row.score) || 0;
    if (isOrganisation && missing.length && score >= maxScore && maxScore >= 1) {
      record({
        target: "score",
        key: row.key,
        index: 0,
        from: score,
        to: maxScore - 1,
        reason: "missing_required_section",
        detail: missing.join(","),
      });
      return { ...row, score: maxScore - 1 };
    }
    return row;
  });

  return { sections: nextSections, scores: nextScores, adjustments };
};
