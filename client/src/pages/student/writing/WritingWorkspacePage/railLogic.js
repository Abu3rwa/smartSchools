/** Pure helpers for the student word rail. No React, no requests. */

const needleOf = (query) =>
  String(query || "")
    .trim()
    .toLowerCase();

/** A search matches the word, its base form, its meaning, or its Arabic gloss. */
export const wordMatches = (row, query) => {
  const needle = needleOf(query);
  if (!needle) return true;
  if (typeof row === "string") return row.toLowerCase().includes(needle);
  return [row?.word, row?.baseWord, row?.meaning, row?.arabicMeaning].some(
    (value) => String(value || "").toLowerCase().includes(needle),
  );
};

/**
 * The server counts the word, its base form, and common inflections, so the
 * tick uses the same set instead of only the exact word.
 */
export const wordIsUsed = (row, used) => {
  const tokens = used instanceof Set ? used : new Set(used || []);
  const candidates = [
    row?.word,
    row?.baseWord,
    ...(Array.isArray(row?.forms) ? row.forms : []),
  ]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return candidates.some((candidate) => tokens.has(candidate));
};
