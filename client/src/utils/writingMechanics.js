/**
 * Language corrections: the typed, exact-span layer beneath the main coaching.
 * Shared by the server normalizer, the student page, the teacher editor and both
 * email builders so one stored correction renders identically everywhere.
 *
 * Pure JavaScript: no React, no Mongoose, no browser globals, no requests.
 * An anchor is `{start,end}` in UTF-16 code units relative to the canonical
 * displayed section text — `String(section.text || '').trim()`, exactly what the
 * student's essay renders (draftEssay.js).
 */

export const MECHANICS_CATEGORIES = Object.freeze([
  "grammar",
  "verb_tense",
  "punctuation",
  "spelling",
]);

/** Old two-field pairs carry no category; they render under a neutral label. */
export const LEGACY_CATEGORY = "";

export const MAX_ORIGINAL_CHARS = 160;
export const MAX_CORRECTION_CHARS = 160;
export const MAX_EXPLANATION_CHARS = 240;
export const MAX_SOURCE_QUOTE_CHARS = 240;
export const MAX_PER_SECTION = 12;
export const MAX_PER_ASSESSMENT = 48;

export const MECHANICS_REVIEW_STATUSES = Object.freeze([
  "checked",
  "partial",
  "unavailable",
]);

export const canonicalSectionText = (value) => String(value ?? "").trim();

export const categoryOrder = (category) => {
  const index = MECHANICS_CATEGORIES.indexOf(String(category || ""));
  return index === -1 ? MECHANICS_CATEGORIES.length : index;
};

export const normalizeCategory = (value) => {
  const candidate = String(value ?? "").trim().toLowerCase();
  return MECHANICS_CATEGORIES.includes(candidate) ? candidate : "";
};

/** The visible label for one correction category; legacy pairs read "Language". */
export const categoryLabel = (t, category) =>
  category
    ? t(`writing:languageCorrections.category.${category}`)
    : t("writing:languageCorrections.category.legacy");

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code) => code >= 0xdc00 && code <= 0xdfff;

/** A boundary inside a surrogate pair would cut an emoji into broken halves. */
export const splitsSurrogatePair = (text, index) =>
  index > 0 &&
  index < text.length &&
  isHighSurrogate(text.charCodeAt(index - 1)) &&
  isLowSurrogate(text.charCodeAt(index));

const allOccurrences = (text, needle) => {
  const found = [];
  if (!needle) return found;
  let at = text.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = text.indexOf(needle, at + 1);
  }
  return found;
};

const WORD_CHAR = /[\p{L}\p{N}]/u;
const SINGLE_WORD = /^[\p{L}\p{N}]+$/u;

/**
 * A one-word quote such as "i" also matches inside "think"; the child's own
 * word is the whole word. When at least one occurrence sits on word boundaries,
 * those are the only real candidates.
 */
const preferWholeWords = (text, needle, spans) => {
  if (!SINGLE_WORD.test(needle) || spans.length < 2) return spans;
  const bounded = spans.filter(
    (span) =>
      !WORD_CHAR.test(text[span.start - 1] ?? "") &&
      !WORD_CHAR.test(text[span.end] ?? ""),
  );
  return bounded.length ? bounded : spans;
};

/**
 * Whitespace-only equivalence: prompts collapse whitespace, so a quote may
 * differ from the draft only in runs of spaces/newlines. Case, apostrophes,
 * punctuation and accents must match exactly — this layer is stricter than the
 * coaching matcher on purpose.
 */
const collapseWhitespace = (text) => {
  let collapsed = "";
  const map = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (collapsed.endsWith(" ")) continue;
      collapsed += " ";
      map.push(index);
      continue;
    }
    collapsed += char;
    map.push(index);
  }
  return { collapsed, map };
};

const collapseFor = (text) => collapseWhitespace(text).collapsed.trim();

/**
 * Where `original` really sits in `text`. One literal occurrence wins on its
 * own; several need a sourceQuote that contains exactly one of them. Never
 * defaults to the first match — a wrong highlight is worse than none.
 *
 * Returns `{ok:true,start,end,original}` with the raw source slice, or
 * `{ok:false,reason}` with reason `missing` | `ambiguous`.
 */
export const resolveCorrectionSpan = (sectionText, original, sourceQuote = "") => {
  const text = canonicalSectionText(sectionText);
  const needle = String(original ?? "").trim();
  if (!needle || !text) return { ok: false, reason: "missing" };

  const usable = (spans) =>
    spans.filter(
      (span) =>
        span.end > span.start &&
        Boolean(text.slice(span.start, span.end).trim()) &&
        !splitsSurrogatePair(text, span.start) &&
        !splitsSurrogatePair(text, span.end),
    );

  // 1) Literal, case-sensitive occurrences.
  const literalSpans = usable(
    allOccurrences(text, needle).map((start) => ({
      start,
      end: start + needle.length,
    })),
  );

  // 2) Whitespace-only equivalence: prompts collapse runs of spaces/newlines.
  let spans = preferWholeWords(text, needle, literalSpans);
  if (!spans.length) {
    const collapsedNeedle = collapseFor(needle);
    if (!collapsedNeedle) return { ok: false, reason: "missing" };
    const { collapsed, map } = collapseWhitespace(text);
    const loose = [];
    for (const at of allOccurrences(collapsed, collapsedNeedle)) {
      const start = map[at];
      const last = map[at + collapsedNeedle.length - 1];
      if (!Number.isInteger(start) || !Number.isInteger(last)) continue;
      const candidate = { start, end: last + 1 };
      const slice = text.slice(candidate.start, candidate.end);
      if (collapseFor(slice) !== collapsedNeedle) continue;
      loose.push(candidate);
    }
    spans = preferWholeWords(text, needle, usable(loose));
  }

  if (!spans.length) return { ok: false, reason: "missing" };
  if (spans.length === 1) {
    const [span] = spans;
    return {
      ok: true,
      start: span.start,
      end: span.end,
      original: text.slice(span.start, span.end),
    };
  }
  const viaQuote = narrowByQuote(text, spans, sourceQuote);
  if (!viaQuote) return { ok: false, reason: "ambiguous" };
  return {
    ok: true,
    start: viaQuote.start,
    end: viaQuote.end,
    original: text.slice(viaQuote.start, viaQuote.end),
  };
};

/** One sourceQuote can disambiguate repeated words only when it holds exactly one. */
const narrowByQuote = (text, spans, sourceQuote) => {
  const quote = String(sourceQuote ?? "").trim();
  if (!quote) return null;
  const quoteRanges = [];
  const literal = allOccurrences(text, quote);
  if (literal.length) {
    for (const at of literal) quoteRanges.push({ start: at, end: at + quote.length });
  } else {
    const needle = collapseFor(quote);
    if (!needle) return null;
    const { collapsed, map } = collapseWhitespace(text);
    for (const at of allOccurrences(collapsed, needle)) {
      const start = map[at];
      const last = map[at + needle.length - 1];
      if (Number.isInteger(start) && Number.isInteger(last)) {
        quoteRanges.push({ start, end: last + 1 });
      }
    }
  }
  const inside = spans.filter((span) =>
    quoteRanges.some((range) => span.start >= range.start && span.end <= range.end),
  );
  return inside.length === 1 ? inside[0] : null;
};

const plainText = (value) => {
  const textValue = String(value ?? "");
  return textValue !== "" && !/[<>]/.test(textValue);
};

/**
 * Validate one new typed correction against its section text and resolve the
 * exact span. Accepts a teacher-supplied `anchor` as a proposal: the slice must
 * still equal `original` or the row is refused.
 *
 * Returns `{ok:true,value:{category,original,correction,explanation,anchor}}`
 * or `{ok:false,code}` with `code` in the WRITING_MECHANICS_* vocabulary.
 */
export const validateCorrection = (sectionText, row, { requireExplanation = true } = {}) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false, code: "WRITING_MECHANICS_INVALID" };
  }
  const category = normalizeCategory(row.category);
  if (!category) return { ok: false, code: "WRITING_MECHANICS_INVALID" };

  if (typeof row.original !== "string" || typeof row.correction !== "string") {
    return { ok: false, code: "WRITING_MECHANICS_INVALID" };
  }
  const original = row.original;
  const correction = row.correction;
  if (
    !original ||
    original !== original.trim() ||
    original.length > MAX_ORIGINAL_CHARS ||
    correction.trim() !== correction ||
    correction.length > MAX_CORRECTION_CHARS ||
    original === correction
  ) {
    return { ok: false, code: "WRITING_MECHANICS_INVALID" };
  }

  if (requireExplanation) {
    if (typeof row.explanation !== "string") {
      return { ok: false, code: "WRITING_MECHANICS_INVALID" };
    }
    const explanation = row.explanation.trim();
    if (
      !explanation ||
      explanation.length > MAX_EXPLANATION_CHARS ||
      !plainText(explanation)
    ) {
      return { ok: false, code: "WRITING_MECHANICS_INVALID" };
    }
  }

  const text = canonicalSectionText(sectionText);
  if (!text) return { ok: false, code: "WRITING_MECHANICS_ANCHOR_MISMATCH" };

  const anchorStart = Number(row?.anchor?.start);
  const anchorEnd = Number(row?.anchor?.end);
  if (Number.isInteger(anchorStart) && Number.isInteger(anchorEnd)) {
    if (
      anchorStart < 0 ||
      anchorEnd <= anchorStart ||
      anchorEnd > text.length ||
      splitsSurrogatePair(text, anchorStart) ||
      splitsSurrogatePair(text, anchorEnd) ||
      text.slice(anchorStart, anchorEnd) !== original
    ) {
      return { ok: false, code: "WRITING_MECHANICS_ANCHOR_MISMATCH" };
    }
    return {
      ok: true,
      value: {
        category,
        original,
        correction,
        explanation: requireExplanation ? row.explanation.trim() : "",
        anchor: { start: anchorStart, end: anchorEnd },
      },
    };
  }

  const resolved = resolveCorrectionSpan(text, original, row.sourceQuote);
  if (!resolved.ok) {
    return {
      ok: false,
      code:
        resolved.reason === "ambiguous"
          ? "WRITING_MECHANICS_ANCHOR_MISMATCH"
          : "WRITING_MECHANICS_ANCHOR_MISMATCH",
    };
  }
  return {
    ok: true,
    value: {
      category,
      original: resolved.original,
      correction,
      explanation: requireExplanation ? row.explanation.trim() : "",
      anchor: { start: resolved.start, end: resolved.end },
    },
  };
};

/** Occurrence previews for a repeated snippet, so a teacher can pick the right one. */
export const occurrenceChoices = (sectionText, original, { limit = 5 } = {}) => {
  const text = canonicalSectionText(sectionText);
  const needle = String(original ?? "").trim();
  if (!text || !needle) return [];
  return allOccurrences(text, needle)
    .slice(0, limit)
    .map((start) => {
      const end = start + needle.length;
      return {
        start,
        end,
        before: text.slice(Math.max(0, start - 28), start),
        after: text.slice(end, Math.min(text.length, end + 28)),
      };
    });
};

/** Legacy rows have no category/anchor; they render list-only and stay valid. */
export const isLegacyMechanic = (row) =>
  Boolean(row) && typeof row === "object" && !String(row.category || "").trim();

/**
 * What one part's language block shows, shared by the student page and email so
 * the status wording can never disagree between surfaces.
 *
 * `message` is `noneSuggested` | `partial` | `unavailable` or null; a historical
 * record with no review metadata gets no status line at all.
 */
export const describeLanguageSection = ({ mechanics = [], status = null } = {}) => {
  const rows = (mechanics || []).filter(Boolean);
  const typed = rows.filter((row) => !isLegacyMechanic(row));
  const legacy = rows.filter(isLegacyMechanic);
  const list = typed.length > 0 || legacy.length > 0;
  return {
    show: list || MECHANICS_REVIEW_STATUSES.includes(status),
    typed,
    legacy,
    heading: typed.length > 0 || status ? "typed" : "legacy",
    message:
      status === "unavailable"
        ? "unavailable"
        : status === "partial"
          ? "partial"
          : status === "checked" && !list
            ? "noneSuggested"
            : null,
  };
};

export const sortCorrections = (rows = []) =>
  [...rows].sort(
    (a, b) =>
      (a.anchor?.start ?? 0) - (b.anchor?.start ?? 0) ||
      (a.anchor?.end ?? 0) - (b.anchor?.end ?? 0) ||
      categoryOrder(a.category) - categoryOrder(b.category),
  );

/**
 * Accepted rows for storage: dedupe identical proposals, refuse competing
 * replacements for one span, then apply the section cap.
 * Returns `{rows, dropped}` where `dropped` counts refused duplicate/conflict
 * candidates so the caller can mark the check partial.
 */
export const acceptCorrections = (rows = [], { limit = MAX_PER_SECTION } = {}) => {
  const seen = new Set();
  const bySpan = new Map();
  const accepted = [];
  let dropped = 0;

  for (const row of rows) {
    const key = [
      row.anchor.start,
      row.anchor.end,
      row.category,
      row.correction,
      row.original,
    ].join("\u0000");
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    const spanKey = `${row.anchor.start}:${row.anchor.end}`;
    const competitor = bySpan.get(spanKey);
    if (competitor) {
      if (competitor.correction !== row.correction) {
        // Two different replacements for the same words: publish neither.
        bySpan.delete(spanKey);
        const existing = accepted.indexOf(competitor);
        if (existing !== -1) accepted.splice(existing, 1);
        dropped += 2;
      } else {
        dropped += 1;
      }
      continue;
    }
    bySpan.set(spanKey, row);
    accepted.push(row);
  }

  const sorted = sortCorrections(accepted);
  if (sorted.length > limit) dropped += sorted.length - limit;
  return { rows: sorted.slice(0, limit), dropped };
};

/**
 * Validate a teacher's submitted mechanics array against the assessed section
 * text, returning the rows to store or a bounded error code. This is the save/
 * publish counterpart to the generation normalizer: it never silently clears or
 * trims. `undefined` (omitted) is handled by the caller and never reaches here;
 * `[]` is an explicit clear; null/object/malformed rows are an invalid request.
 *
 * A row with a category must satisfy the full typed contract and anchor against
 * this exact section. A row without one is a legacy two-field pair, preserved
 * as stored (list-only, no invented anchor or check status). Exact duplicate
 * typed proposals dedupe; competing replacements for one span are refused.
 *
 * Returns `{ok:true, rows}` or `{ok:false, code, index}` where index is the
 * offending row (-1 for an array-level limit/conflict).
 */
export const validateMechanicsEdit = (rows, sectionText, { limit = MAX_PER_SECTION } = {}) => {
  if (!Array.isArray(rows)) {
    return { ok: false, code: "WRITING_MECHANICS_INVALID", index: -1 };
  }
  const typed = [];
  const legacy = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, code: "WRITING_MECHANICS_INVALID", index };
    }
    const category = normalizeCategory(row.category);
    if (!category) {
      // A claimed but unknown category is an invalid new row, never a silent
      // downgrade to a legacy pair; only an absent category means legacy.
      if (
        row.category !== undefined &&
        row.category !== null &&
        row.category !== ""
      ) {
        return { ok: false, code: "WRITING_MECHANICS_INVALID", index };
      }
      const { original, correction } = row;
      if (
        typeof original !== "string" ||
        !original ||
        original.length > MAX_ORIGINAL_CHARS ||
        typeof correction !== "string" ||
        !correction ||
        correction.length > MAX_CORRECTION_CHARS
      ) {
        return { ok: false, code: "WRITING_MECHANICS_INVALID", index };
      }
      legacy.push({ original, correction });
      continue;
    }
    const checked = validateCorrection(sectionText, row);
    if (!checked.ok) return { ok: false, code: checked.code, index };
    typed.push(checked.value);
  }
  if (typed.length + legacy.length > limit) {
    return { ok: false, code: "WRITING_MECHANICS_LIMIT", index: -1 };
  }
  const seen = new Set();
  const unique = [];
  for (const row of typed) {
    const key = [
      row.anchor.start,
      row.anchor.end,
      row.category,
      row.correction,
      row.original,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  const accepted = acceptCorrections(unique, { limit });
  if (accepted.dropped > 0) {
    return { ok: false, code: "WRITING_MECHANICS_ANCHOR_MISMATCH", index: -1 };
  }
  return { ok: true, rows: [...accepted.rows, ...legacy] };
};

/**
 * The honest state of the language check. The model's own `reviewed` bit is
 * never proof of complete coverage; caps, dropped candidates and reported
 * extra errors all downgrade the result to `partial`.
 */
export const deriveReviewStatus = ({
  reviewed = false,
  hasMore = false,
  dropped = 0,
  sectionAvailable = true,
  responsePresent = true,
} = {}) => {
  if (!responsePresent || !sectionAvailable) return "unavailable";
  if (reviewed && !hasMore && dropped === 0) return "checked";
  return "partial";
};

/**
 * Split one paragraph into runs carrying both layers: the existing coaching
 * mark and the language correction numbers. Boundaries are computed once and
 * the concatenated run text always equals the section text exactly.
 */
export const composeParagraphRuns = ({
  text,
  coachingSegments = [],
  corrections = [],
} = {}) => {
  const paragraph = String(text ?? "");
  if (!paragraph) return [];

  const coachingSpans = [];
  let cursor = 0;
  for (const segment of coachingSegments) {
    const length = String(segment?.text ?? "").length;
    if (segment?.mark !== null && segment?.mark !== undefined && length > 0) {
      coachingSpans.push({
        start: cursor,
        end: cursor + length,
        mark: segment.mark,
      });
    }
    cursor += length;
  }

  const mechanicsSpans = corrections
    .filter(
      (row) =>
        Number.isInteger(row?.anchor?.start) &&
        Number.isInteger(row?.anchor?.end) &&
        row.anchor.start >= 0 &&
        row.anchor.end > row.anchor.start &&
        row.anchor.end <= paragraph.length,
    )
    .map((row) => ({
      start: row.anchor.start,
      end: row.anchor.end,
      numbers: Array.isArray(row.numbers) ? row.numbers : [row.number],
    }));

  const boundaries = new Set([0, paragraph.length]);
  for (const span of [...coachingSpans, ...mechanicsSpans]) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }
  const points = [...boundaries]
    .filter((point) => point >= 0 && point <= paragraph.length)
    .sort((a, b) => a - b);

  const runs = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end === start) continue;
    const coaching = coachingSpans.find(
      (span) => span.start <= start && span.end >= end,
    );
    const mechanics = mechanicsSpans
      .filter((span) => span.start <= start && span.end >= end)
      .flatMap((span) => span.numbers);
    runs.push({
      text: paragraph.slice(start, end),
      coachingMark: coaching ? coaching.mark : null,
      mechanics,
      start,
      end,
    });
  }
  return runs;
};

/**
 * Number corrections in reading order across the paragraphs of one draft and
 * keep only rows whose stored anchor still matches their text. Rows that fail
 * stay visible in the list without an inline highlight; legacy two-field pairs
 * carry no category or anchor, so they list without a number.
 */
export const resolveParagraphCorrections = (paragraphs = [], rowsBySlot = new Map()) => {
  let next = 1;
  return (paragraphs || []).map((paragraph) => {
    const text = canonicalSectionText(paragraph.text);
    const slot = `${paragraph.key}:${Number(paragraph.index) || 0}`;
    const entry = rowsBySlot.get(slot) || {};
    const mechanics = [];
    const list = [];
    for (const row of entry.mechanics || []) {
      const legacy = isLegacyMechanic(row);
      const number = legacy ? null : next;
      if (!legacy) next += 1;
      const resolved = resolveStoredCorrection(text, row);
      list.push({ ...row, number, ...(resolved ? { anchor: resolved } : {}) });
      if (resolved && !legacy) {
        mechanics.push({ ...row, number, anchor: resolved });
      }
    }
    return {
      ...paragraph,
      text,
      mechanics,
      mechanicsList: list,
      mechanicsReview: entry.mechanicsReview || null,
    };
  });
};

/** Assessed sections keyed by the slot the draft shares with them. */
export const correctionsBySlot = (sections = []) =>
  new Map(
    (sections || []).map((row) => [
      `${row?.key}:${Number(row?.index) || 0}`,
      {
        mechanics: row?.mechanics || [],
        mechanicsReview: row?.mechanicsReview || null,
      },
    ]),
  );

/** A stored row's anchor is re-checked against the text it will be drawn on. */
export const resolveStoredCorrection = (sectionText, row) => {
  const text = String(sectionText ?? "");
  const start = Number(row?.anchor?.start);
  const end = Number(row?.anchor?.end);
  const original = String(row?.original ?? "");
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length ||
    splitsSurrogatePair(text, start) ||
    splitsSurrogatePair(text, end) ||
    text.slice(start, end) !== original
  ) {
    return null;
  }
  return { start, end };
};
