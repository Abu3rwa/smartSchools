import { createHash } from "node:crypto";

/**
 * One place that makes AI and teacher text safe to store and render. The native
 * slide renderer shows plain text, so tags, control characters, zero-width
 * characters and bidi overrides are removed here rather than trusted.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200F\uFEFF]/g;
const BIDI_OVERRIDES = /[\u202A-\u202E\u2066-\u2069]/g;
// A tag starts with a letter, so "3 < 5 and 7 > 2" keeps its signs.
const HTML_TAGS = /<\/?[a-zA-Z][^>]*>/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d[\s().-]?){7,}\d/g;

export const PIPE_REPLACEMENT = "\u2223";

export const cleanText = (value, { maxLength = 0 } = {}) => {
  let text = String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(ZERO_WIDTH, "")
    .replace(BIDI_OVERRIDES, "")
    .replace(HTML_TAGS, "")
    .replace(/\|/g, PIPE_REPLACEMENT)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (maxLength > 0 && text.length > maxLength) text = text.slice(0, maxLength).trimEnd();
  return text;
};

export const cleanLine = (value, maxLength = 0) => cleanText(value, { maxLength })
  .replace(/\s*\n+\s*/g, " ")
  .trim();

export const bodyLines = (value) => String(value || "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

export const redactSourceText = (value) => {
  let emails = 0;
  let phones = 0;
  const text = String(value ?? "")
    .replace(EMAIL_PATTERN, () => {
      emails += 1;
      return "[email]";
    })
    .replace(PHONE_PATTERN, (match) => {
      // A short year range such as "2023 - 2024" has fewer than eight digits.
      if (match.replace(/\D/g, "").length < 8) return match;
      phones += 1;
      return "[number]";
    });
  return { text, redactions: { emails, phones } };
};

const FILE_HEADER = /^-{2,}\s*file:\s*.+?-{2,}$/i;

/**
 * Pasted text plus every uploaded file's extracted text become one source. The
 * cap applies to the combined text, so the longest lesson never sends more than
 * the plan's 30,000 characters to the model.
 */
export const combineSourceText = ({ pastedText = "", files = [], maxChars = 30000 }) => {
  const blocks = [];
  const pasted = redactSourceText(pastedText);
  if (pasted.text.trim()) blocks.push({ name: "", text: pasted.text });
  const redactions = { ...pasted.redactions };
  files.forEach((file) => {
    const redacted = redactSourceText(file.text || "");
    if (!redacted.text.trim()) return;
    redactions.emails += redacted.redactions.emails;
    redactions.phones += redacted.redactions.phones;
    blocks.push({ name: file.name || "file", text: redacted.text });
  });

  let remaining = maxChars;
  let truncated = false;
  const parts = [];
  blocks.forEach((block) => {
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const header = block.name ? `--- file: ${block.name} ---\n` : "";
    const available = Math.max(0, remaining - header.length);
    const body = block.text.slice(0, available);
    if (body.length < block.text.length) truncated = true;
    if (!body.trim()) return;
    parts.push(`${header}${body}`.trim());
    remaining -= header.length + body.length;
  });

  return { text: cleanText(parts.join("\n\n"), { maxLength: maxChars }), truncated, redactions };
};

export const arabicScriptRatio = (value) => {
  const letters = String(value || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  const arabic = letters.filter((letter) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(letter)).length;
  return arabic / letters.length;
};

export const hashSeed = (...values) => createHash("sha256")
  .update(values.map((value) => String(value ?? "")).join("\u0000"))
  .digest("hex");

/** Deterministic shuffle: the same draft item always gets the same option order. */
export const shuffleWithSeed = (rows, seed) => {
  const output = [...rows];
  let state = parseInt(hashSeed(seed).slice(0, 12), 16) || 1;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
};

/**
 * A title the teacher can keep or edit. It comes from the document's own words,
 * never from a file name — a file called "5-R-Ahmed.docx" must never become the
 * lesson title.
 */
export const suggestLessonTitle = (sourceText, { maxLength = 120 } = {}) => {
  const lines = bodyLines(sourceText)
    .map((line) => cleanLine(line.replace(/^#{1,6}\s*/, "")))
    .filter((line) => line && !FILE_HEADER.test(line));
  const usable = lines.filter((line) => line.length >= 6 && line.length <= 90
    && !/^\d+$/.test(line)
    && !/^page\s+\d+/i.test(line));
  const heading = usable.find((line) => /^[\p{Lu}]/u.test(line) && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 12);
  // The fallback reads the same header-free lines, so a source that holds only
  // file headers suggests no title at all rather than a file name.
  const sentence = lines.join(" ").replace(/\s+/g, " ").trim();
  const candidate = heading || usable[0] || sentence.slice(0, 80);
  return cleanLine(candidate.replace(/^["'“”]+|["'“”]+$/g, ""), maxLength);
};
