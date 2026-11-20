/**
 * Quote anchoring for published writing feedback. A sent draft is frozen, so a
 * quote the teacher approved stays on the same words in every later view.
 * Shared by the student essay view and the family email so both highlight the
 * same span and number the comments the same way.
 */
import { foldForMatch, foldRaw, tokensForMatch } from "./writingTextMatch.js";

const MIN_QUOTE_LENGTH = 4;

// A quote whose exact wording drifted (a typo fixed, a word swapped) may still
// point at its paragraph: nearly all of its content words sit in exactly one
// paragraph. Anything less is a general note, never a highlight.
const MIN_TOKEN_COVERAGE = 0.8;
const MIN_MATCH_TOKENS = 4;

/**
 * The folded paragraph plus one original offset per folded character, so a
 * match found on the folded text can be cut from the real text. Smart quotes,
 * dashes and NFKC forms fold to the same characters on both sides.
 */
const foldWithMap = (text) => {
  const source = String(text ?? "");
  let folded = "";
  const map = [];
  let index = 0;
  while (index < source.length) {
    const char = String.fromCodePoint(source.codePointAt(index));
    const piece = foldRaw(char);
    for (let i = 0; i < piece.length; i += 1) map.push(index);
    folded += piece;
    index += char.length;
  }
  // foldRaw collapses whitespace per whole string; folding one character at a
  // time leaves newlines and double spaces behind, so collapse runs here and
  // keep the first character's offset for each surviving space.
  let collapsed = "";
  const collapsedMap = [];
  for (let i = 0; i < folded.length; i += 1) {
    if (folded[i] === " " && collapsed.endsWith(" ")) continue;
    collapsed += folded[i];
    collapsedMap.push(map[i]);
  }
  return { folded: collapsed, map: collapsedMap };
};

/** Where a quote really sits in a paragraph, in original-text offsets. */
const quoteSpan = (text, quote) => {
  const raw = String(quote ?? "").trim();
  if (raw.length < MIN_QUOTE_LENGTH) return null;
  const needle = foldForMatch(raw);
  if (!needle) return null;
  const { folded, map } = foldWithMap(text);
  const at = folded.indexOf(needle);
  if (at === -1) return null;
  return { start: map[at], end: map[at + needle.length - 1] + 1 };
};


const quoteInText = (text, quote) => quoteSpan(text, quote) !== null;

/**
 * One paragraph split into plain and highlighted runs. The match is made on a
 * folded copy, so a curly apostrophe in the draft still meets a straight one in
 * the quote. No match means one plain run: the caller then shows the comment
 * as a card instead of a highlight.
 */
export const anchorSegments = (text, quote, mark = 1) => {
  const paragraph = String(text ?? "");
  const plain = [{ text: paragraph, mark: null }];
  if (!paragraph) return plain;
  const span = quoteSpan(paragraph, quote);
  if (!span) return plain;

  const segments = [];
  if (span.start > 0) segments.push({ text: paragraph.slice(0, span.start), mark: null });
  segments.push({ text: paragraph.slice(span.start, span.end), mark });
  if (span.end < paragraph.length) segments.push({ text: paragraph.slice(span.end), mark: null });
  return segments;
};

/**
 * The one paragraph whose words nearly all appear in the quote. Two paragraphs
 * that match equally well are not a match: a note must never guess.
 */
const tokenMatchRow = (candidates, quote) => {
  const need = tokensForMatch(quote);
  if (need.length < MIN_MATCH_TOKENS) return null;
  const scored = [];
  for (const row of candidates) {
    const words = new Set(tokensForMatch(row.paragraph.text));
    const coverage = need.filter((token) => words.has(token)).length / need.length;
    if (coverage >= MIN_TOKEN_COVERAGE) scored.push({ row, coverage });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.coverage - a.coverage);
  if (scored[1] && Math.abs(scored[1].coverage - scored[0].coverage) < 0.0001) return null;
  return scored[0].row;
};

/**
 * Each note dropped onto at most one paragraph: the slot it names, then the
 * paragraph holding its quote, then a section that appears only once. The order
 * matters — a real quote beats a loose key, an exact slot beats both. Notes no
 * paragraph can take come back so the caller still shows them: published feedback
 * never disappears just because the text moved.
 */
const placeNotes = (paragraphs, notes) => {
  const pool = (notes || []).filter(Boolean).map((note) => ({ note, used: false }));
  const claim = (entry) => {
    entry.used = true;
    return entry.note;
  };

  const placed = (paragraphs || []).map((paragraph) => {
    const exact = pool.find(
      (entry) =>
        !entry.used &&
        entry.note.key === paragraph.key &&
        Number(entry.note.index) === Number(paragraph.index),
    );
    return { paragraph, note: exact ? claim(exact) : null };
  });

  for (const row of placed) {
    if (row.note) continue;
    const match = pool.find(
      (entry) =>
        !entry.used &&
        quoteInText(row.paragraph.text, entry.note.evidence),
    );
    if (match) row.note = claim(match);
  }

  // Words survive a small edit; a quote that no longer matches exactly still
  // finds its paragraph when its content words are nearly all in one place.
  for (const row of placed) {
    if (row.note) continue;
    const open = pool.filter((entry) => !entry.used && entry.note.evidence);
    for (const entry of open) {
      const best = tokenMatchRow(
        placed.filter((candidate) => !candidate.note),
        entry.note.evidence,
      );
      if (best === row) {
        row.note = claim(entry);
        break;
      }
    }
  }

  // A part written once: the index in the note is wrong but the key cannot be.
  const seenPerKey = new Map();
  for (const { paragraph } of placed) {
    seenPerKey.set(paragraph.key, (seenPerKey.get(paragraph.key) || 0) + 1);
  }
  for (const row of placed) {
    if (row.note || seenPerKey.get(row.paragraph.key) !== 1) continue;
    const match = pool.find(
      (entry) => !entry.used && entry.note.key === row.paragraph.key,
    );
    if (match) row.note = claim(match);
  }

  const loose = pool.filter((entry) => !entry.used).map((entry) => entry.note);
  return { placed, loose };
};

/**
 * Paragraphs in reading order with their comment number. Only a quote really
 * present in the paragraph earns a number, so a badge always points at text.
 * `notes` are the published section rows, matched by key and index; a note whose
 * slot no longer lines up is still placed under the paragraph that holds its
 * quote, because a comment marked "under this line" has to sit under that line.
 */
export const anchorEssay = (paragraphs, notes) => {
  const { placed } = placeNotes(paragraphs, notes);

  let numbered = 0;
  return placed.map(({ paragraph, note }) => {
    const segments = anchorSegments(paragraph.text, note?.evidence, numbered + 1);
    const anchored = segments.some((segment) => segment.mark !== null);
    if (anchored) numbered += 1;
    return { ...paragraph, note, segments, number: anchored ? numbered : 0 };
  });
};

/** Published notes that no paragraph could hold, shown apart from the essay. */
export const unplacedNotes = (paragraphs, notes) => placeNotes(paragraphs, notes).loose;