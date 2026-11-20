/**
 * F6: what has to be true before a round can be published. Pure functions, so
 * the server guard and the teacher's checklist can never disagree.
 *
 * A raw token would reach the child as braces, and a quote that is not in the
 * draft would be shown as a card pretending to sit under the child's line.
 */
import { foldForMatch, tokensForMatch } from "./writingTextMatch.js";
import {
  canonicalSectionText,
  validateCorrection,
} from "./writingMechanics.js";

const TOKEN = /\{\{\s*[^{}]{1,40}?\s*\}\}/g;
const STUDENT_TOKEN = /^\{\{\s*student\s*\}\}$/i;
const MAX_DEPTH = 8;
// Internal fields: never rendered to a child, so never a blocker.
const SKIP_KEYS = new Set([
  "aiOriginal",
  "aiMeta",
  "promptVersions",
  "promptSnapshot",
  "previousDraft",
  "usage",
  "_id",
  "__v",
]);

const collectTokens = (value, found, depth = 0) => {
  if (typeof value === "string") {
    for (const match of value.match(TOKEN) || []) {
      if (!STUDENT_TOKEN.test(match)) found.add(match.replace(/\s+/g, " "));
    }
    return;
  }
  if (!value || typeof value !== "object" || depth >= MAX_DEPTH) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectTokens(entry, found, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (SKIP_KEYS.has(key)) continue;
    collectTokens(entry, found, depth + 1);
  }
};

/** Name tokens the child would see as raw braces instead of a name. */
export const unfilledTokens = (value) => {
  const found = new Set();
  collectTokens(value, found);
  return [...found].sort();
};

export const MIN_ANCHOR_CHARS = 4;
export const MIN_ANCHOR_TOKENS = 4;
export const MIN_ANCHOR_COVERAGE = 0.8;

export const draftParagraphs = (draft) =>
  (draft?.sections || []).map((row) => String(row?.text ?? ""));

/**
 * True when the quote can really be highlighted inside one part of the draft:
 * the same folded-substring match the child's essay uses, then the same
 * near-match rule for a quote whose wording drifted slightly.
 */
export const evidenceQuoteFound = (paragraphs, quote) => {
  const raw = String(quote ?? "").trim();
  if (raw.length < MIN_ANCHOR_CHARS) return true;
  const needle = foldForMatch(raw);
  if (!needle) return true;
  const rows = (paragraphs || []).map((text) => String(text ?? "")).filter(Boolean);
  if (rows.some((text) => foldForMatch(text).includes(needle))) return true;
  const need = tokensForMatch(raw);
  if (need.length < MIN_ANCHOR_TOKENS) return false;
  return rows.some((text) => {
    const have = new Set(tokensForMatch(text));
    const shared = need.filter((token) => have.has(token)).length;
    return shared / need.length >= MIN_ANCHOR_COVERAGE;
  });
};

/** Everything that blocks publishing, in the order the teacher should fix it. */
export const publishBlockers = ({ assessment, draft } = {}) => {
  const blockers = [];
  // The teacher's private note is not here: the child never reads it.
  const tokens = unfilledTokens({
    summary: assessment?.summary,
    overall: assessment?.overall,
    sections: assessment?.sections,
    scores: assessment?.scores,
    spellingTargets: assessment?.spellingTargets,
    spellingWins: assessment?.spellingWins,
    wordUseEvidence: assessment?.wordUseEvidence,
    recommendation: assessment?.recommendation,
    tasks: assessment?.tasks,
    comparison: assessment?.comparison,
  });
  if (tokens.length) blockers.push({ kind: "tokens", items: tokens });

  // Section notes anchor into the essay; a comparison round has none to anchor.
  if (assessment?.kind === "comparison") return blockers;
  const paragraphs = draftParagraphs(draft);
  const missing = (assessment?.sections || [])
    .filter(
      (row) =>
        String(row?.evidence || "").trim() &&
        !evidenceQuoteFound(paragraphs, row.evidence),
    )
    .map((row) => row.label || row.key || "");
  if (missing.length) blockers.push({ kind: "anchors", items: missing });

  // Typed language rows must still match their own part of the assessed draft.
  // Legacy pairs and absent mechanics never block; an unverifiable part (no
  // matching draft section) is left to the server's save-time validation.
  const draftSections = draft?.sections || [];
  const staleMechanics = (assessment?.sections || [])
    .filter((row) =>
      (row?.mechanics || []).some((item) => {
        if (!item?.category) return false;
        const source = draftSections.find(
          (part) =>
            part?.key === row.key &&
            Number(part?.index) === Number(row.index),
        );
        if (!source) return false;
        return !validateCorrection(canonicalSectionText(source.text), item).ok;
      }),
    )
    .map((row) => row.label || row.key || "");
  if (staleMechanics.length)
    blockers.push({ kind: "mechanics", items: staleMechanics });
  return blockers;
};
