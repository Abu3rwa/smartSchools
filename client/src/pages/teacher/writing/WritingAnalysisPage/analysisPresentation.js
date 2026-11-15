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

const CATEGORY_SLUGS = new Set([
  "ideas",
  "organisation",
  "sentence",
  "vocabulary",
  "conventions",
  "audience",
]);

/**
 * Standards carry a free-text category from the school's own import, often the
 * English word for one of the six writing strands. Translate those; anything
 * else is the school's own wording and is shown as written.
 */
export const categoryLabel = (t, value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const slug = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const key = slug === "organization" ? "organisation" : slug;
  return CATEGORY_SLUGS.has(key)
    ? t(`writing:teacher.analysis.categories.${key}`)
    : raw;
};

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
  not_shown: "rose",
  fragile: "rose",
  developing: "amber",
  consistent: "teal",
  transfer: "green",
};

export const statusTone = (status) => STATUS_TONES[status] || "muted";

/**
 * What the evidence shows, in words. The server's status is the level bucket,
 * and the level table caps at 2 for a two-piece window, so "2 of 2 met" would
 * arrive as "about half". The screen therefore describes the counts, and the
 * level stays the proposal.
 */
export const usageStatusOf = (result) => {
  const counts = result?.counts || {};
  const applicable = Number(counts.applicable) || 0;
  const met = Number(counts.met) || 0;
  const partly = Number(counts.partly) || 0;
  if (applicable === 0) return "no_chance";
  if (applicable === 1) return "one_piece";
  if (met === 0) return partly > 0 ? "partly_used" : "not_used";
  const share = met / applicable;
  if (share === 1) return "every_piece";
  if (share >= 0.6) return "most_pieces";
  if (share >= 0.5) return "half_pieces";
  return "few_pieces";
};

const USAGE_TONES = {
  no_chance: "muted",
  one_piece: "muted",
  not_used: "rose",
  partly_used: "amber",
  few_pieces: "rose",
  half_pieces: "amber",
  most_pieces: "teal",
  every_piece: "green",
};

export const usageTone = (usage) => USAGE_TONES[usage] || "muted";

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

/**
 * A parent code covers a child code: "L.5.1" covers "L.5.1A", and "ELA.5.L.2"
 * covers "ELA.5.L.2.B". A number after the parent code is a different standard.
 * Mirrors isChildCode() in the server's writingAnalysisLogic.js.
 */
export const isChildCode = (parent, child) => {
  const parentCode = String(parent || "").trim().toUpperCase();
  const childCode = String(child || "").trim().toUpperCase();
  if (!parentCode || !childCode || parentCode === childCode) return false;
  if (!childCode.startsWith(parentCode)) return false;
  const rest = childCode.slice(parentCode.length);
  if (rest.startsWith(".")) return rest.length > 1;
  return /^[A-Z]/.test(rest);
};

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
    return !baseCodes.some((other) => isChildCode(code, other));
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
      if (isChildCode(parentCode, codeOf(child))) pairs.push({ parent, child });
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
