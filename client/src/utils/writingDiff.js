/**
 * Deterministic word alignment for the teacher's side-by-side view (F4).
 * It is a reading aid only: no mark, note or AI call depends on it, so the same
 * two drafts always produce the same picture.
 */
import { foldForMatch } from "./writingTextMatch.js";

/** Past this the table costs more than it tells; the view says so instead. */
export const MAX_DIFF_WORDS = 800;

const wordsOf = (value) => String(value ?? "").match(/\S+/g) || [];

// Case, quote style and punctuation at the edges do not make a new word.
const keyOf = (word) => foldForMatch(word).replace(/[^\p{L}\p{N}']/gu, "");

/**
 * Longest-common-subsequence alignment of two texts, word by word. Each op is
 * `equal`, `insert` (only in the new text) or `delete` (only in the old one).
 */
export const diffWords = (before, after) => {
  const left = wordsOf(before);
  const right = wordsOf(after);
  if (left.length > MAX_DIFF_WORDS || right.length > MAX_DIFF_WORDS) {
    return {
      tooLong: true,
      ops: [
        ...left.map((word) => ({ op: "delete", text: word })),
        ...right.map((word) => ({ op: "insert", text: word })),
      ],
    };
  }

  const keysLeft = left.map(keyOf);
  const keysRight = right.map(keyOf);
  const width = keysRight.length + 1;
  const table = new Uint32Array((keysLeft.length + 1) * width);
  for (let i = keysLeft.length - 1; i >= 0; i -= 1) {
    for (let j = keysRight.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        keysLeft[i] && keysLeft[i] === keysRight[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops = [];
  const push = (op, text) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) {
      last.text += ` ${text}`;
      return;
    }
    ops.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < keysLeft.length && j < keysRight.length) {
    if (keysLeft[i] && keysLeft[i] === keysRight[j]) {
      push("equal", left[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push("delete", left[i]);
      i += 1;
    } else {
      push("insert", right[j]);
      j += 1;
    }
  }
  while (i < keysLeft.length) {
    push("delete", left[i]);
    i += 1;
  }
  while (j < keysRight.length) {
    push("insert", right[j]);
    j += 1;
  }
  return { tooLong: false, ops };
};

export const diffStats = (ops = []) => {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const op of ops) {
    const count = wordsOf(op.text).length;
    if (op.op === "insert") added += count;
    else if (op.op === "delete") removed += count;
    else unchanged += count;
  }
  return { added, removed, unchanged };
};

const sectionKey = (section) => `${section.key}:${section.index}`;

const buildRow = (current, before) => {
  const diff = diffWords(before?.text || "", current?.text || "");
  return {
    key: sectionKey(current || before),
    label: current?.label || before?.label || current?.key || before?.key || "",
    before: before?.text || "",
    after: current?.text || "",
    ops: diff.ops,
    tooLong: diff.tooLong,
    stats: diffStats(diff.ops),
    removedSection: !current,
  };
};

/**
 * Pairs the two drafts part by part. Current parts keep their reading order and
 * a part that no longer exists is shown last, so nothing silently disappears.
 */
export const alignDraftSections = (previousDraft, currentDraft) => {
  const previous = previousDraft?.sections || [];
  const current = currentDraft?.sections || [];
  const rows = current.map((section) =>
    buildRow(
      section,
      previous.find((row) => sectionKey(row) === sectionKey(section)),
    ),
  );
  const removed = previous.filter(
    (row) => !current.some((section) => sectionKey(section) === sectionKey(row)),
  );
  return [...rows, ...removed.map((section) => buildRow(null, section))];
};
