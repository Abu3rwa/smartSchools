/**
 * Prompt building and response parsing for Writing Analysis.
 *
 * The model's only job is evidence: for each standard, did this piece offer a
 * chance to show it, and what did the student actually do? Levels, counts and
 * growth are computed on the server by writingAnalysisLogic.js, never by the
 * model. Imported only by teacher-triggered code.
 */
import {
  CONTENT_RULES,
  PRIVACY_RULES,
  STUDENT_TOKEN,
  scrubForPrompt,
} from "./aiPromptSafety.js";
import { scrubPersonalText } from "./newsletterPrivacy.js";
import {
  ANALYSIS_LIMITS,
  PATTERN_CATEGORIES,
  normalizeText,
  quoteIsReal,
} from "./writingAnalysisLogic.js";

const JUDGMENTS = new Set(["met", "partly", "not_met"]);

/** The piece exactly as the model will see it: names and contacts scrubbed. */
export const promptSafeText = (text, studentName = "") => {
  let safe = scrubForPrompt(String(text || ""), {
    name: studentName,
    phoneNumbers: true,
  });
  // A draft usually names its author by first name only, so each part of the
  // name is scrubbed as well; the full name alone would leave "Sara" intact.
  const parts = String(studentName || "")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .sort((a, b) => b.length - a.length);
  for (const part of parts) {
    safe = scrubPersonalText(
      safe,
      { names: [part] },
      { placeholder: STUDENT_TOKEN, phoneNumbers: false },
    );
  }
  return safe;
};

const standardLine = (row, key) => {
  const parts = [`[${key}] ${row.code ? `${row.code} — ` : ""}${row.name || ""}`.trim()];
  if (row.description) parts.push(row.description);
  if (row.category) parts.push(`Category: ${row.category}`);
  return parts.join("\n");
};

/**
 * One piece, every selected standard. The prompt asks only for opportunity,
 * judgment, a verbatim quote and a plain note; it explicitly forbids scores,
 * percentages and levels.
 */
export const buildPieceEvidencePrompt = ({
  text,
  standards = [],
  writingType = "",
  rubric = [],
  language = "en",
  studentName = "",
}) => {
  const safeText = promptSafeText(text, studentName);
  const standardBlock = standards
    .map((row, index) => standardLine(row, `S${index + 1}`))
    .join("\n\n");
  const rubricBlock = (rubric || [])
    .map((row) => normalizeText(row?.criterion || row?.label || row))
    .filter(Boolean)
    .slice(0, 8);
  const categories = PATTERN_CATEGORIES.join(", ");

  return `You are helping a teacher check one piece of a student's writing against curriculum standards. You are not writing feedback for the student and you are not grading: the teacher does that.

WHAT YOU RECEIVE
- One piece of writing, verbatim, between the markers.
- The standards to check, each with a key such as S1.
- The writing type and any rubric criteria from the task, to decide whether a standard had a fair chance to appear.

HOW TO JUDGE EACH STANDARD
For every standard key listed above, decide:
1. "opportunity": true only if this piece and this kind of task actually gave the student a chance to show the standard. A story cannot show "uses headings"; a letter cannot show "uses suspense". If there was no real chance, set opportunity false.
2. "judgment": when opportunity is true, one of "met", "partly", "not_met". When opportunity is false, use "none".
3. "quote": a verbatim excerpt from the piece, at most ${ANALYSIS_LIMITS.maxQuoteWords} words, that shows exactly what you judged. For "met" or "partly", quote the words that show the skill. For "not_met", quote the actual attempt that shows the gap. Copy the words exactly; never paraphrase, translate or tidy them. When the judgment is "partly", the quote must contain the flaw you describe.
4. "absence": true only when the standard is missing altogether and there is no attempt to quote, for example "no title of a work appears". When absence is true, judgment must be "not_met" and quote must be "". Otherwise false. Never invent a fragment to stand in for something that is not there.
5. "note": at most ${ANALYSIS_LIMITS.maxNoteChars} characters, plain language, saying what the quoted words show. Describe only the quoted words. Never claim errors in text you did not quote: do not write "elsewhere", "throughout", "the rest of the piece", "several", "many", "often", "sometimes", "in places" or "generally". No scores, marks, percentages, levels or advice.

RULES
- Judge only what this piece shows. Do not guess from the task, the title or other pieces.
- Never invent a quote. If the words are not in the piece, use "absence" or set opportunity false.
- Do not give the same quote for two different standards.
- The app computes levels from your counts. Do not propose a level, score, grade or percentage anywhere.
- Write notes in ${language === "ar" ? "Modern Standard Arabic" : "English"}.

PATTERNS
After the standard judgments, list at most two strengths and at most two issues you actually saw in this piece; the app decides which ones repeat across pieces. Each pattern has:
- "category": one of ${categories}.
- "kind": "strength" or "issue".
- "quote": a verbatim excerpt of at most ${ANALYSIS_LIMITS.maxQuoteWords} words that shows the pattern, or "".
- "note": at most ${ANALYSIS_LIMITS.maxNoteChars} characters, describing only that quote.
Do not repeat the same observation twice, and do not report a pattern without something in the piece to support it.

PIECE
Writing type: ${writingType || "not specified"}
${rubricBlock.length ? `Task criteria:\n- ${rubricBlock.join("\n- ")}\n` : ""}
STANDARDS
${standardBlock}

<<<STUDENT WRITING
${safeText}
STUDENT WRITING>>>

${PRIVACY_RULES}

${CONTENT_RULES}

JSON shape (return only this object, no prose and no fences):
{
  "standards": [
    { "key": "S1", "opportunity": <true|false>, "judgment": "met" | "partly" | "not_met" | "none", "absence": <true|false>, "quote": "<verbatim words or empty>", "note": "<plain explanation>" }
  ],
  "patterns": [
    { "category": "${PATTERN_CATEGORIES[0]}", "kind": "strength" | "issue", "quote": "<verbatim words or empty>", "note": "<plain explanation>" }
  ]
}`;
};

const keyIndex = (key) => {
  const match = String(key || "")
    .trim()
    .match(/^s(\d+)$/i);
  return match ? Number(match[1]) : null;
};

/**
 * Validates one quote against the piece. The prompt saw scrubbed text, so a
 * quote carrying the student token is restored to whichever form of the name
 * is actually in the piece; a quote that still cannot be found is dropped.
 */
const normalizeQuote = ({ quote, text, studentName, limits }) => {
  const raw = normalizeText(quote);
  if (!raw) return { quote: "", real: false };
  const trimmed = raw.split(/\s+/).slice(0, limits.maxQuoteWords).join(" ");
  if (!/\{\{\s*student\s*\}\}/i.test(trimmed)) {
    return quoteIsReal(trimmed, text)
      ? { quote: trimmed, real: true }
      : { quote: "", real: false };
  }
  const parts = String(studentName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const candidates = [String(studentName || "").trim(), ...parts].filter(Boolean);
  for (const candidate of candidates) {
    const filled = trimmed.replace(/\{\{\s*student\s*\}\}/gi, candidate);
    if (quoteIsReal(filled, text)) return { quote: filled, real: true };
  }
  return { quote: "", real: false };
};

const cleanNote = (value, limits) =>
  normalizeText(value).slice(0, limits.maxNoteChars);

/**
 * A note may only describe words that were actually quoted. These phrases point
 * at text outside the quote ("several errors elsewhere"), which the teacher
 * cannot check, so such a note is blanked instead of being shown as evidence.
 */
const OUTSIDE_QUOTE_CLAIMS = [
  /\belsewhere\b/i,
  /\bthroughout\b/i,
  /\bthe rest of\b/i,
  /\bseveral\b/i,
  /\bmany\b/i,
  /\boften\b/i,
  /\bsometimes\b/i,
  /\bin places\b/i,
  /\bgenerally\b/i,
  /\boverall\b/i,
  /في مواضع أخرى/,
  /في أماكن أخرى/,
  /في بقية/,
  /بقية النص/,
  /طوال/,
  /\bعدة\b/,
  /\bالعديد\b/,
  /كثير(ة|ًا|ا)?/,
  /أحيان(ًا|ا)?/,
  /غالب(ًا|ا)?/,
];

const noteDescribesOtherText = (note, quote) => {
  const text = normalizeText(note).toLowerCase();
  const shown = normalizeText(quote).toLowerCase();
  return OUTSIDE_QUOTE_CLAIMS.some(
    (pattern) => pattern.test(text) && !pattern.test(shown),
  );
};

/**
 * Turns the model's reply into the saved evidence. Unknown standards and
 * unverifiable quotes are dropped; a piece where more than 40% of its judged
 * standards lost their quote is unusable and must not silently grade.
 */
export const normalizePieceEvidence = ({
  parsed,
  text,
  standards = [],
  studentName = "",
  limits = ANALYSIS_LIMITS,
}) => {
  const rows = Array.isArray(parsed?.standards) ? parsed.standards : [];
  if (!rows.length) return { ok: false, reason: "no_standards", standards: [], patterns: [], quotesDropped: 0, quotesKept: 0 };

  const byKey = new Map();
  const byCode = new Map();
  standards.forEach((row, index) => {
    byKey.set(`S${index + 1}`, row);
    byKey.set(String(row.standard), row);
    if (row.code) byCode.set(String(row.code).trim().toUpperCase(), row);
  });

  const seen = new Set();
  let quotesDropped = 0;
  let quotesKept = 0;
  let vagueNotes = 0;
  const evidence = [];

  for (const row of rows) {
    const standard =
      byKey.get(String(row?.key || "").trim()) ||
      byCode.get(String(row?.key || "").trim().toUpperCase()) ||
      standards[keyIndex(row?.key) ? keyIndex(row.key) - 1 : -1];
    if (!standard) continue;
    if (seen.has(String(standard.standard))) continue;
    seen.add(String(standard.standard));

    const opportunity = row?.opportunity === true;
    if (!opportunity) {
      evidence.push({
        standard: standard.standard,
        opportunity: false,
        absence: false,
        judgment: "none",
        quote: "",
        note: cleanNote(row?.note, limits),
      });
      continue;
    }

    // An absence judgment is evidence in itself: the standard is missing, so
    // there is nothing to quote. It must not be counted as a lost quote.
    if (row?.absence === true) {
      evidence.push({
        standard: standard.standard,
        opportunity: true,
        absence: true,
        judgment: "not_met",
        quote: "",
        note: cleanNote(row?.note, limits),
      });
      continue;
    }

    const judgment = JUDGMENTS.has(row?.judgment) ? row.judgment : null;
    if (!judgment) continue;

    const checked = normalizeQuote({
      quote: row?.quote,
      text,
      studentName,
      limits,
    });
    if (checked.real) quotesKept += 1;
    else quotesDropped += 1;

    let note = cleanNote(row?.note, limits);
    if (checked.real && note && noteDescribesOtherText(note, checked.quote)) {
      note = "";
      vagueNotes += 1;
    }

    evidence.push({
      standard: standard.standard,
      opportunity: true,
      absence: false,
      judgment,
      quote: checked.quote,
      note,
    });
  }

  if (!evidence.length) {
    return { ok: false, reason: "no_matching_standards", standards: [], patterns: [], quotesDropped, quotesKept, vagueNotes };
  }

  const judged = evidence.filter((row) => row.opportunity && !row.absence).length;
  const droppedRatio = judged ? quotesDropped / judged : 0;

  const patterns = (Array.isArray(parsed?.patterns) ? parsed.patterns : [])
    .filter((row) => PATTERN_CATEGORIES.includes(String(row?.category || "")))
    .slice(0, 4)
    .map((row) => {
      const checked = normalizeQuote({
        quote: row?.quote,
        text,
        studentName,
        limits,
      });
      let note = cleanNote(row?.note, limits);
      if (checked.real && note && noteDescribesOtherText(note, checked.quote)) {
        note = "";
        vagueNotes += 1;
      }
      return {
        category: row.category,
        kind: row?.kind === "strength" ? "strength" : "issue",
        quote: checked.quote,
        note,
      };
    })
    .filter((row) => row.note || row.quote);

  return {
    ok: droppedRatio <= 0.4,
    reason: droppedRatio > 0.4 ? "quotes_dropped" : null,
    standards: evidence,
    patterns,
    quotesDropped,
    quotesKept,
    vagueNotes,
  };
};
