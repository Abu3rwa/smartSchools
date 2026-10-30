/**
 * Quote anchoring for published writing feedback. A sent draft is frozen, so a
 * quote the teacher approved stays on the same words in every later view.
 * Shared by the student essay view and the family email so both highlight the
 * same span and number the comments the same way.
 */

const MIN_QUOTE_LENGTH = 4;

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const quotePattern = (quote) => {
  const needle = String(quote ?? "").trim().replace(/\s+/g, " ");
  if (needle.length < MIN_QUOTE_LENGTH) return null;
  return new RegExp(escapePattern(needle).replace(/\s+/g, "\\s+"), "iu");
};

/**
 * One paragraph split into plain and highlighted runs. Whitespace in the quote
 * is flexible and the match ignores case, because that is how the quote was
 * validated against the draft. No match means one plain run: the caller then
 * shows the comment as a card instead of a highlight.
 */
export const anchorSegments = (text, quote, mark = 1) => {
  const paragraph = String(text ?? "");
  const plain = [{ text: paragraph, mark: null }];
  if (!paragraph) return plain;
  const pattern = quotePattern(quote);
  if (!pattern) return plain;

  const found = pattern.exec(paragraph);
  if (!found) return plain;

  const start = found.index;
  const end = start + found[0].length;
  const segments = [];
  if (start > 0) segments.push({ text: paragraph.slice(0, start), mark: null });
  segments.push({ text: paragraph.slice(start, end), mark });
  if (end < paragraph.length) segments.push({ text: paragraph.slice(end), mark: null });
  return segments;
};

/**
 * Paragraphs in reading order with their comment number. Only a quote really
 * present in the paragraph earns a number, so a badge always points at text.
 * `notes` are the published section rows, matched by key and index; a note whose
 * slot no longer lines up is still placed under the paragraph that holds its
 * quote, because a comment marked "under this line" has to sit under that line.
 */
export const anchorEssay = (paragraphs, notes) => {
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
    const match = pool.find((entry) => {
      if (entry.used) return false;
      const pattern = quotePattern(entry.note.evidence);
      return Boolean(pattern && pattern.test(String(row.paragraph.text ?? "")));
    });
    if (match) row.note = claim(match);
  }

  let numbered = 0;
  return placed.map(({ paragraph, note }) => {
    const segments = anchorSegments(paragraph.text, note?.evidence, numbered + 1);
    const anchored = segments.some((segment) => segment.mark !== null);
    if (anchored) numbered += 1;
    return { ...paragraph, note, segments, number: anchored ? numbered : 0 };
  });
};