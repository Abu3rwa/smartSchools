/** Small pure helpers for the Writing Analysis screen; no fetching, no AI. */

import { getScaleLevelInfo } from "../../../../utils/sbrScaleUtils.js";

export const WINDOW_PRESETS = ["month", "term", "year", "all", "custom"];

/** How many standards the setup page pre-ticks; the server sends the real number. */
export const DEFAULT_STANDARD_COUNT = 12;

const firstOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * "This term" follows the school year used by the standards gradebook:
 * August–January is the first term, February–July the second.
 */
export const windowRange = (preset, now = new Date()) => {
  const year = now.getFullYear();
  const month = now.getMonth();
  switch (preset) {
    case "month":
      return { from: firstOfMonth(now), to: null };
    case "term":
      return month >= 7
        ? { from: new Date(year, 7, 1), to: new Date(year + 1, 0, 31) }
        : { from: new Date(year, 1, 1), to: new Date(year, 6, 31) };
    case "year":
      return { from: new Date(month >= 7 ? year : year - 1, 7, 1), to: null };
    case "all":
      return { from: null, to: null };
    default:
      return { from: null, to: null };
  }
};

export const toDateInput = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** A date input is a local calendar day; the API stores an instant. */
export const fromDateInput = (value) =>
  value ? new Date(`${value}T00:00:00`).toISOString() : "";

export const levelOf = (result) =>
  result?.teacherLevel ?? result?.proposedLevel ?? null;

export const initialLevelDraft = (standards = []) =>
  Object.fromEntries(
    (standards || []).map((row) => [
      String(row.standard),
      { level: row.teacherLevel ?? null, note: row.teacherNote || "" },
    ]),
  );

export const progressOf = (analysis) => {
  const runs = analysis?.pieceRuns || [];
  const total = runs.length || (analysis?.draftSelection || []).length;
  const byStatus = (value) =>
    runs.filter((run) => run.aiStatus === value).length;
  const done = byStatus("done");
  const failed = byStatus("failed") + byStatus("unusable");
  return { total, done, failed, settled: done + failed };
};

export const pieceByIdOf = (analysis) =>
  new Map(
    (analysis?.draftSelection || []).map((piece) => [
      String(piece.draft),
      piece,
    ]),
  );

const STATUS_TONES = {
  not_observed: "muted",
  insufficient_evidence: "muted",
  fragile: "rose",
  developing: "amber",
  consistent: "teal",
  transfer: "green",
};

export const statusTone = (status) => STATUS_TONES[status] || "muted";

export const growthTone = (direction) =>
  ({
    improving: "green",
    stable: "teal",
    declining: "rose",
    uncertain: "muted",
  })[direction] || "muted";

/* ------------------------------------------------------------------ */
/* Standards: codes, defaults and grouping                             */
/* ------------------------------------------------------------------ */

export const codeOf = (standard) => String(standard?.code || "").trim();

/** Visible depth used to indent a child standard under its parent. */
export const codeDepth = (code) => (String(code || "").match(/\./g) || []).length;

const extendsCode = (parent, child) =>
  Boolean(parent) && Boolean(child) && child.startsWith(`${parent}.`);

/**
 * Default ticked standards: the ones already assigned in this class and
 * subject when there are any, never the parent when one of its children is
 * also ticked (L.1 plus L.1.A would grade the same skill twice).
 */
export const defaultStandardSelection = (
  standards = [],
  assignedIds = [],
  count = DEFAULT_STANDARD_COUNT,
) => {
  const rows = (standards || []).filter((row) => row?._id);
  const assigned = new Set((assignedIds || []).map(String));
  const assignedRows = rows.filter((row) => assigned.has(String(row._id)));
  const base = assignedRows.length ? assignedRows : rows;
  const baseCodes = base.map(codeOf).filter(Boolean);
  const keep = base.filter((row) => {
    const code = codeOf(row);
    if (!code) return true;
    return !baseCodes.some((other) => extendsCode(code, other));
  });
  return keep.slice(0, count).map((row) => String(row._id));
};

/** Every standard in the subject, with the same parent rule as the defaults. */
export const allStandardSelection = (standards = []) =>
  defaultStandardSelection(standards, [], Number.POSITIVE_INFINITY);

/** Parent/child pairs the teacher ticked by hand; publishing writes both. */
export const overlappingStandards = (standards = [], selected = []) => {
  const chosen = (standards || []).filter((row) =>
    selected.includes(String(row._id)),
  );
  const pairs = [];
  for (const parent of chosen) {
    const parentCode = codeOf(parent);
    if (!parentCode) continue;
    for (const child of chosen) {
      if (extendsCode(parentCode, codeOf(child))) pairs.push({ parent, child });
    }
  }
  return pairs;
};

/** One line per parent: "L.2 · L.2.A, L.2.B". */
export const overlapSummary = (pairs = [], maxParents = 3) => {
  const byParent = new Map();
  for (const { parent, child } of pairs || []) {
    const key = codeOf(parent) || "?";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(codeOf(child) || "?");
  }
  return [...byParent.entries()]
    .slice(0, maxParents)
    .map(([parent, children]) => `${parent} · ${children.join(", ")}`)
    .join("; ");
};

export const standardGroups = (standards = []) => {
  const groups = new Map();
  for (const row of standards || []) {
    const category = String(row.category || "").trim();
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(row);
  }
  return [...groups.entries()].map(([category, rows]) => ({
    category,
    rows: [...rows].sort((a, b) =>
      codeOf(a).localeCompare(codeOf(b), undefined, { numeric: true }),
    ),
  }));
};

/* ------------------------------------------------------------------ */
/* Review copy helpers                                                 */
/* ------------------------------------------------------------------ */

/** Deterministic list of standards that need a teacher decision. */
export const attentionOf = (analysis) => {
  const standards = analysis?.standards || [];
  const weak = standards
    .filter(
      (row) =>
        (row.counts?.applicable || 0) > 0 && (row.counts?.met || 0) === 0,
    )
    .map((row) => ({
      code: row.code || row.name,
      met: row.counts?.met || 0,
      applicable: row.counts?.applicable || 0,
    }));
  const noProposal = standards.filter(
    (row) => row.proposedLevel === null || row.proposedLevel === undefined,
  ).length;
  return { weak: weak.slice(0, 4), weakCount: weak.length, noProposal };
};

export const scaleLabel = (value, language = "en") => {
  const info = getScaleLevelInfo(value);
  return language === "ar" ? info.labelAr : info.label;
};

export const splitPatterns = (patterns = []) => ({
  recurring: (patterns || []).filter((row) => row.recurring || row.pieces >= 2),
  single: (patterns || []).filter((row) => !row.recurring && row.pieces < 2),
});
