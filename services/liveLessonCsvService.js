import { LIVE_QUESTION_KINDS } from "../constants/liveLessonQuestionKinds.js";
import {
  PRACTICE_ORDER_SEPARATOR,
  PRACTICE_PAIR_SEPARATOR,
  PRACTICE_TERM_SEPARATOR,
  PRACTICE_VARIANT_SEPARATOR,
} from "../constants/practiceQuestionTypes.js";
import { parseNumericRule } from "./assessment/answerFormat.js";
import { validateLiveQuestion } from "./liveLessonQuestionService.js";

const MAX_CSV_LENGTH = 22 * 1024 * 1024;
const MAX_SLIDES = 200;
const MAX_CELL_LENGTH = 5000;
const MAX_HTML_LENGTH = 100000;
// Version 1 carries multiple-choice and true/false only. Version 2 adds the remaining live
// question kinds and the levelled variants, so an older exported lesson still imports.
const PORTABLE_LIVE_LESSON_CSV_V1_HEADERS = [
  "format_version", "lesson_id", "lesson_title", "lesson_description", "subject", "grade", "language",
  "assigned_class", "assigned_subject", "is_done", "slide_order", "slide_type", "title", "body", "html",
  "examples_json", "image_url", "question_kind", "question_prompt", "question_options_json",
  "correct_answer", "explanation", "speaker_notes",
];
const PORTABLE_LIVE_LESSON_CSV_HEADERS = [
  "format_version", "lesson_id", "lesson_title", "lesson_description", "subject", "grade", "language",
  "assigned_class", "assigned_subject", "is_done", "slide_order", "slide_type", "title", "body", "html",
  "examples_json", "image_url", "question_kind", "question_prompt", "question_options_json",
  "question_pairs_json", "question_items_json", "question_blanks_json", "question_numeric_json",
  "question_guidance", "question_criteria", "question_min_words", "question_max_words",
  "correct_answer", "explanation", "speaker_notes", "levels_json",
];
const PORTABLE_LIVE_LESSON_CSV_LAYOUTS = [
  { version: "1", headers: PORTABLE_LIVE_LESSON_CSV_V1_HEADERS },
  { version: "2", headers: PORTABLE_LIVE_LESSON_CSV_HEADERS },
];
const HTML_CSV_HEADERS = [
  "lesson_id", "slide_order", "slide_type", "title", "subject", "grade", "language", "html",
  "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d",
  "correct_answer", "explanation", "speaker_notes",
];

const HEADER_ALIASES = {
  lessonTitle: ["lesson title", "lesson", "unit title", "deck title"],
  lessonDescription: ["lesson description", "description", "summary"],
  order: ["slide order", "slide number", "order", "sequence", "position"],
  type: ["slide type", "slide kind", "type", "kind"],
  title: ["title", "heading", "slide title", "heading text"],
  body: ["body", "content", "text", "instructions", "teaching points"],
  examples: ["examples", "example", "model examples"],
  imageUrl: ["image url", "image", "visual url", "image link"],
  questionType: ["question type", "question kind", "response type"],
  prompt: ["question prompt", "question", "prompt"],
  options: ["options", "answer options", "question options json"],
  correctAnswer: ["correct answer", "correct option", "answer", "key"],
  explanation: ["explanation", "answer explanation", "teacher explanation"],
  speakerNotes: ["speaker notes", "teacher notes", "notes"],
  pairs: ["question pairs", "question pairs json", "matching pairs", "pairs"],
  items: ["question items", "question items json", "ordering items", "items"],
  blanks: ["question blanks", "question blanks json", "blank answers", "blanks"],
  numeric: ["question numeric", "question numeric json", "numeric rule"],
  guidance: ["question guidance", "question guidance json", "guidance"],
  criteria: ["question criteria", "criteria", "marking criteria"],
  minWords: ["question min words", "min words", "minimum words"],
  maxWords: ["question max words", "max words", "maximum words"],
  levels: ["levels json", "levels", "levelled questions"],
};

const normalizeHeader = (value) =>
  String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const parseCsvRows = (csv) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const trimCell = (value) => String(value ?? "").trim();

const splitGrammar = (value, separator) =>
  trimCell(value).split(separator).map((part) => part.trim()).filter(Boolean);

/** `term::match` with the term missing leaves the match empty so validation can name it. */
const splitTerm = (chunk) => {
  const at = chunk.indexOf(PRACTICE_TERM_SEPARATOR);
  if (at === -1) return { head: trimCell(chunk), tail: "" };
  return { head: trimCell(chunk.slice(0, at)), tail: trimCell(chunk.slice(at + PRACTICE_TERM_SEPARATOR.length)) };
};

/**
 * Structured cells are either JSON or the same plain text grammar the practice CSVs use, so one
 * teacher learns one syntax. A value that is already parsed (a level inside `levels_json`) passes
 * straight through.
 */
const readStructured = (value, ctx, field) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) return null;
  if (!/^[[{]/.test(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    ctx.errors.push({ row: ctx.row, field, message: "This cell must be valid JSON or the plain text grammar shown in the template." });
    return null;
  }
};

const notAnArray = (ctx, field) => {
  ctx.errors.push({ row: ctx.row, field, message: "This cell must be a JSON array or the plain text grammar shown in the template." });
};

const readOptionsCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return [];
  const rows = typeof parsed === "string" ? splitGrammar(parsed, PRACTICE_PAIR_SEPARATOR) : parsed;
  if (!Array.isArray(rows)) {
    notAnArray(ctx, field);
    return [];
  }
  return rows.map((option, index) => {
    const id = typeof option === "string" ? "" : trimCell(option?.id);
    const text = typeof option === "string" ? option.trim() : trimCell(option?.text);
    return { id: id || String.fromCharCode(97 + index), text };
  });
};

const pairFromChunk = (chunk) => {
  const { head, tail } = splitTerm(chunk);
  return { left: head, right: tail };
};

const readPairsCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return [];
  const rows = typeof parsed === "string" ? splitGrammar(parsed, PRACTICE_PAIR_SEPARATOR).map(pairFromChunk) : parsed;
  if (!Array.isArray(rows)) {
    notAnArray(ctx, field);
    return [];
  }
  return rows.map((pair) => (typeof pair === "string"
    ? pairFromChunk(pair)
    : { left: trimCell(pair?.left ?? pair?.term), right: trimCell(pair?.right ?? pair?.match) }));
};

const readItemsCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return [];
  const rows = typeof parsed === "string"
    ? splitGrammar(parsed, PRACTICE_ORDER_SEPARATOR).map((text) => ({ text }))
    : parsed;
  if (!Array.isArray(rows)) {
    notAnArray(ctx, field);
    return [];
  }
  return rows.map((item) => (typeof item === "string"
    ? { text: item.trim() }
    : { ...(trimCell(item?.id) ? { id: trimCell(item.id) } : {}), text: trimCell(item?.text ?? item?.value) }));
};

const readAccepts = (value) => (Array.isArray(value) ? value : splitGrammar(value, PRACTICE_VARIANT_SEPARATOR))
  .map((answer) => trimCell(answer))
  .filter(Boolean);

const blankFromChunk = (chunk) => {
  const { head, tail } = splitTerm(chunk);
  return tail
    ? { id: head, accepts: splitGrammar(tail, PRACTICE_VARIANT_SEPARATOR) }
    : { accepts: splitGrammar(chunk, PRACTICE_VARIANT_SEPARATOR) };
};

const readBlanksCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return [];
  const rows = typeof parsed === "string" ? splitGrammar(parsed, PRACTICE_PAIR_SEPARATOR).map(blankFromChunk) : parsed;
  if (!Array.isArray(rows)) {
    notAnArray(ctx, field);
    return [];
  }
  return rows.map((blank) => (typeof blank === "string"
    ? blankFromChunk(blank)
    : {
      ...(trimCell(blank?.id ?? blank?.blank) ? { id: trimCell(blank?.id ?? blank?.blank) } : {}),
      accepts: readAccepts(blank?.accepts ?? blank?.answer),
    }));
};

const readNumericCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return null;
  if (Array.isArray(parsed)) {
    notAnArray(ctx, field);
    return null;
  }
  if (parsed && typeof parsed === "object") return parsed;
  const { rule, error } = parseNumericRule(String(parsed));
  if (error) {
    ctx.errors.push({ row: ctx.row, field, message: error });
    return null;
  }
  return rule;
};

const LIVE_KIND_ALIASES = {
  tf: "tf", true_false: "tf", "true/false": "tf", truefalse: "tf", true_or_false: "tf", boolean: "tf", yes_no: "tf",
  mcq: "mcq", multiple_choice: "mcq", choice: "mcq",
  multi_select: "multi_select", multiple_select: "multi_select", multiple_answers: "multi_select",
  matching: "matching", match: "matching",
  ordering: "ordering", order: "ordering", sequence: "ordering",
  fill_in_blank: "fill_in_blank", fill_in_the_blank: "fill_in_blank", gap_fill: "fill_in_blank",
  numeric: "numeric", numeric_response: "numeric", number: "numeric",
  text: "text", short_answer: "text", sentence: "text", paragraph: "text", written: "text",
};

const resolveLiveKind = (raw) => {
  const key = trimCell(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return "";
  if (LIVE_KIND_ALIASES[key]) return LIVE_KIND_ALIASES[key];
  return LIVE_QUESTION_KINDS.includes(key) ? key : "";
};

/** Option IDs are authored per file, so an answer letter or option text both resolve. */
const matchOptionId = (options, answer) => {
  const wanted = trimCell(answer).toLowerCase();
  if (!wanted) return "";
  const match = options.find((option) => option.id.toLowerCase() === wanted)
    || options.find((option) => option.text.toLowerCase() === wanted);
  return match?.id || "";
};

/** Only the fields the kind actually uses are kept, so an imported mcq looks like an authored mcq. */
const isMeaningfulCell = (value) => {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const buildQuestionFromCells = (cells, ctx, columns) => {
  const kind = resolveLiveKind(cells.kind) || trimCell(cells.kind);
  const answer = trimCell(cells.answer);
  const options = readOptionsCell(cells.options, ctx, columns.options);
  const question = {
    kind,
    prompt: trimCell(cells.prompt),
    options,
    correctOptionId: kind === "mcq" || kind === "tf" ? matchOptionId(options, answer) : "",
    correctOptionIds: kind === "multi_select"
      ? splitGrammar(answer, PRACTICE_PAIR_SEPARATOR).map((key) => matchOptionId(options, key) || key)
      : [],
    matchingPairs: readPairsCell(cells.pairs, ctx, columns.pairs),
    orderingItems: readItemsCell(cells.items, ctx, columns.items),
    blanks: readBlanksCell(cells.blanks, ctx, columns.blanks),
    numericRule: readNumericCell(cells.numeric, ctx, columns.numeric),
    guidance: trimCell(cells.guidance),
    criteria: trimCell(cells.criteria),
    minWords: Number(trimCell(cells.minWords)) || 0,
    maxWords: Number(trimCell(cells.maxWords)) || 0,
    explanation: trimCell(cells.explanation),
  };
  return Object.fromEntries(Object.entries(question).filter(([, value]) => isMeaningfulCell(value)));
};

// validateLiveQuestion names its complaints after the question fields; each one belongs to a column.
const QUESTION_ERROR_KEYS = {
  prompt: "prompt",
  options: "options",
  "correct answer": "answer",
  "matching pairs": "pairs",
  "ordering items": "items",
  blanks: "blanks",
  "numeric answer": "numeric",
  tolerance: "numeric",
  guidance: "guidance",
  criteria: "criteria",
  "word limit": "wordLimit",
  explanation: "explanation",
};

const questionValidationErrors = (question, ctx, columns, label) =>
  validateLiveQuestion(question, { fieldName: label }).map((error) => {
    const subfield = error.field === label ? "" : error.field.slice(label.length + 1);
    const key = QUESTION_ERROR_KEYS[subfield];
    return {
      row: ctx.row,
      field: key ? columns[key] : (subfield || columns.kind),
      message: error.message,
    };
  });

const PORTABLE_QUESTION_COLUMNS = {
  kind: "question_kind",
  prompt: "question_prompt",
  options: "question_options_json",
  pairs: "question_pairs_json",
  items: "question_items_json",
  blanks: "question_blanks_json",
  numeric: "question_numeric_json",
  guidance: "question_guidance",
  criteria: "question_criteria",
  wordLimit: "question_min_words",
  answer: "correct_answer",
  explanation: "explanation",
};

const FLEXIBLE_QUESTION_COLUMNS = {
  kind: "question type",
  prompt: "question prompt",
  options: "options",
  pairs: "matching pairs",
  items: "ordering items",
  blanks: "blanks",
  numeric: "numeric rule",
  guidance: "guidance",
  criteria: "criteria",
  wordLimit: "word limit",
  answer: "correct answer",
  explanation: "explanation",
};

const LEVEL_QUESTION_COLUMNS = Object.fromEntries(
  [...Object.keys(PORTABLE_QUESTION_COLUMNS), "kind"].map((key) => [key, "levels_json"]),
);

/** `levels_json` holds one question per ability group, named by the group name, not its id. */
const readLevelsCell = (value, ctx, field) => {
  const parsed = readStructured(value, ctx, field);
  if (parsed === null) return [];
  if (!Array.isArray(parsed)) {
    notAnArray(ctx, field);
    return [];
  }
  const seen = new Set();
  return parsed.map((entry, index) => {
    const group = trimCell(entry?.group ?? entry?.level ?? entry?.name);
    if (!group) {
      ctx.errors.push({ row: ctx.row, field, message: `Level ${index + 1} needs the name of the group it belongs to.` });
    } else if (seen.has(group.toLowerCase())) {
      ctx.errors.push({ row: ctx.row, field, message: `Level ${index + 1} repeats the group "${group}".` });
    } else {
      seen.add(group.toLowerCase());
    }
    const question = buildQuestionFromCells({
      kind: entry?.kind,
      prompt: entry?.prompt,
      options: entry?.options,
      pairs: entry?.matching_pairs ?? entry?.pairs ?? entry?.matchingPairs,
      items: entry?.ordering_items ?? entry?.items ?? entry?.orderingItems,
      blanks: entry?.blank_answers ?? entry?.blanks,
      numeric: entry?.numeric_rule ?? entry?.numeric ?? entry?.numericRule,
      guidance: entry?.guidance,
      criteria: entry?.criteria,
      minWords: entry?.min_words ?? entry?.minWords,
      maxWords: entry?.max_words ?? entry?.maxWords,
      answer: entry?.correct_answer ?? entry?.correctAnswer,
      explanation: entry?.explanation,
    }, ctx, LEVEL_QUESTION_COLUMNS);
    return { group, question, label: `level ${group || index + 1}` };
  });
};

const parsePortableLiveLessonCsv = (rawHeaders, dataRows) => {
  const errors = [];
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const layout = PORTABLE_LIVE_LESSON_CSV_LAYOUTS.find((candidate) =>
    candidate.headers.length === rawHeaders.length
    && candidate.headers.every((header, index) => normalizeHeader(header) === normalizedHeaders[index]));
  if (!layout) {
    return {
      ok: false,
      errors: [{ row: 1, field: "headers", message: `Portable lesson CSV must use these columns in order: ${PORTABLE_LIVE_LESSON_CSV_HEADERS.join(", ")}.` }],
    };
  }
  if (dataRows.length < 1 || dataRows.length > MAX_SLIDES) {
    return {
      ok: false,
      errors: [{ row: 1, field: "slides", message: `Include between 1 and ${MAX_SLIDES} slide rows.` }],
    };
  }

  const headerIndex = Object.fromEntries(normalizedHeaders.map((header, index) => [header.replace(/\s+/g, "_"), index]));
  const valueAt = (row, field) => String(row[headerIndex[field]] ?? "");
  const firstRow = dataRows[0];
  if (firstRow.length !== layout.headers.length) {
    errors.push({ row: 2, field: "columns", message: `Expected ${layout.headers.length} columns, found ${firstRow.length}.` });
  }

  const metadataColumns = [
    ["format_version", "version"],
    ["lesson_id", "lessonId"],
    ["lesson_title", "title"],
    ["lesson_description", "description"],
    ["subject", "subject"],
    ["grade", "grade"],
    ["language", "language"],
    ["assigned_class", "assignedClass"],
    ["assigned_subject", "assignedSubject"],
    ["is_done", "isDone"],
  ];
  const lessonMetadata = Object.fromEntries(metadataColumns.map(([column, field]) => [field, valueAt(firstRow, column)]));
  if (lessonMetadata.version !== layout.version) errors.push({ row: 2, field: "format_version", message: `The format_version cell must be ${layout.version} for these columns.` });
  if (!lessonMetadata.lessonId || lessonMetadata.lessonId.length > 100) errors.push({ row: 2, field: "lesson_id", message: "Lesson ID is required and must be 100 characters or fewer." });
  if (!lessonMetadata.title || lessonMetadata.title.length > 200) errors.push({ row: 2, field: "lesson_title", message: "Lesson title is required and must be 200 characters or fewer." });
  if (lessonMetadata.description.length > 1000) errors.push({ row: 2, field: "lesson_description", message: "Lesson description must be 1,000 characters or fewer." });
  if (lessonMetadata.subject.length > 120) errors.push({ row: 2, field: "subject", message: "Subject must be 120 characters or fewer." });
  if (lessonMetadata.grade.length > 80) errors.push({ row: 2, field: "grade", message: "Grade must be 80 characters or fewer." });
  if (lessonMetadata.language.length > 20) errors.push({ row: 2, field: "language", message: "Language must be 20 characters or fewer." });
  if (!["true", "false"].includes(lessonMetadata.isDone)) errors.push({ row: 2, field: "is_done", message: "is_done must be true or false." });
  const slideTypes = new Set(["opening", "goals", "content", "examples", "html", "question", "activity", "exit-ticket"]);
  const slides = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== layout.headers.length) {
      errors.push({ row: rowNumber, field: "columns", message: `Expected ${layout.headers.length} columns, found ${row.length}.` });
      return;
    }
    for (const [column, field] of metadataColumns) {
      if (valueAt(row, column) !== lessonMetadata[field]) {
        errors.push({ row: rowNumber, field: column, message: "Lesson metadata must match on every row." });
      }
    }
    const orderValue = valueAt(row, "slide_order");
    const order = Number(orderValue);
    if (!Number.isInteger(order) || order !== index + 1 || order > MAX_SLIDES) {
      errors.push({ row: rowNumber, field: "slide_order", message: `Slide order must be ${index + 1} with no gaps.` });
    }
    const type = valueAt(row, "slide_type");
    if (!slideTypes.has(type)) errors.push({ row: rowNumber, field: "slide_type", message: "Unsupported slide type." });

    const title = valueAt(row, "title");
    const body = valueAt(row, "body");
    const html = valueAt(row, "html");
    const speakerNotes = valueAt(row, "speaker_notes");
    const imageUrl = valueAt(row, "image_url");
    if (title.length > 200) errors.push({ row: rowNumber, field: "title", message: "Slide titles must be 200 characters or fewer." });
    if (body.length > MAX_CELL_LENGTH) errors.push({ row: rowNumber, field: "body", message: "Slide content must be 5,000 characters or fewer." });
    if (html.length > MAX_HTML_LENGTH) errors.push({ row: rowNumber, field: "html", message: `HTML must be ${MAX_HTML_LENGTH} characters or fewer.` });
    if (speakerNotes.length > 2000) errors.push({ row: rowNumber, field: "speaker_notes", message: "Speaker notes must be 2,000 characters or fewer." });
    if (imageUrl.length > 2048 || (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl))) {
      errors.push({ row: rowNumber, field: "image_url", message: "Image URL must be a valid http:// or https:// URL no longer than 2,048 characters." });
    }

    let examples = [];
    try {
      examples = JSON.parse(valueAt(row, "examples_json") || "[]");
      if (!Array.isArray(examples) || examples.some((example) => typeof example !== "string" || example.length > 5000)) {
        throw new Error("Examples must be a JSON array of strings up to 5,000 characters each.");
      }
    } catch (error) {
      errors.push({ row: rowNumber, field: "examples_json", message: error.message || "Examples must contain valid JSON." });
      examples = [];
    }

    const ctx = { row: rowNumber, errors };
    const questionCells = {
      kind: valueAt(row, "question_kind"),
      prompt: valueAt(row, "question_prompt"),
      options: valueAt(row, "question_options_json"),
      pairs: valueAt(row, "question_pairs_json"),
      items: valueAt(row, "question_items_json"),
      blanks: valueAt(row, "question_blanks_json"),
      numeric: valueAt(row, "question_numeric_json"),
      guidance: valueAt(row, "question_guidance"),
      criteria: valueAt(row, "question_criteria"),
      minWords: valueAt(row, "question_min_words"),
      maxWords: valueAt(row, "question_max_words"),
      answer: valueAt(row, "correct_answer"),
      explanation: valueAt(row, "explanation"),
    };
    const prompt = questionCells.prompt;
    const levelsCell = valueAt(row, "levels_json");
    let question;
    let levels = [];
    if (type === "question") {
      question = buildQuestionFromCells(questionCells, ctx, PORTABLE_QUESTION_COLUMNS);
      levels = readLevelsCell(levelsCell, ctx, "levels_json");
      errors.push(...questionValidationErrors(question, ctx, PORTABLE_QUESTION_COLUMNS, "question"));
      levels.forEach((level) => {
        errors.push(...questionValidationErrors(level.question, ctx, LEVEL_QUESTION_COLUMNS, level.label));
      });
    } else if (Object.values(questionCells).some(Boolean) || levelsCell) {
      errors.push({ row: rowNumber, field: "question", message: "Question columns must be empty for non-question slides." });
    }

    if (type === "html" && !html.trim()) errors.push({ row: rowNumber, field: "html", message: "HTML slides need slide content." });
    if (type !== "html" && html) errors.push({ row: rowNumber, field: "html", message: "Only HTML slides can include HTML content." });
    if (type === "question" && !title && !body && !prompt) errors.push({ row: rowNumber, field: "title", message: "Question slides need a title or prompt." });
    if (type !== "question" && type !== "html" && !title && !body && !examples.length && !imageUrl) {
      errors.push({ row: rowNumber, field: "slide", message: "Each slide needs a title, body, examples, or image." });
    }

    slides.push({
      order: Number.isInteger(order) ? order - 1 : index,
      type,
      title,
      body,
      html,
      examples,
      imageUrl,
      speakerNotes,
      ...(question ? { question } : {}),
      ...(levels.length ? { variants: levels.map((level) => ({ group: level.group, question: level.question })) } : {}),
    });
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    lesson: {
      title: lessonMetadata.title,
      description: lessonMetadata.description,
      subject: lessonMetadata.subject,
      grade: lessonMetadata.grade,
      language: lessonMetadata.language,
      isDone: lessonMetadata.isDone === "true",
      importHints: { assignedClass: lessonMetadata.assignedClass, assignedSubject: lessonMetadata.assignedSubject },
      slides,
    },
    matchedColumns: Object.fromEntries(layout.headers.map((header, index) => [header, rawHeaders[index]])),
  };
};

const parseHtmlSlideCsv = (rawHeaders, dataRows) => {
  const errors = [];
  if (rawHeaders.length !== HTML_CSV_HEADERS.length ||
      rawHeaders.some((header, index) => normalizeHeader(header) !== normalizeHeader(HTML_CSV_HEADERS[index]))) {
    return {
      ok: false,
      errors: [{ row: 1, field: "headers", message: `HTML slide CSV must use these 17 columns in order: ${HTML_CSV_HEADERS.join(", ")}.` }],
    };
  }
  if (dataRows.length < 2 || dataRows.length > MAX_SLIDES + 1) {
    return {
      ok: false,
      errors: [{ row: 1, field: "slides", message: `Include one lesson row and 1–${MAX_SLIDES} slide rows.` }],
    };
  }
  if (dataRows[0].length !== HTML_CSV_HEADERS.length) {
    errors.push({ row: 2, field: "columns", message: `The lesson row must contain exactly ${HTML_CSV_HEADERS.length} columns.` });
  }

  const values = (row) => HTML_CSV_HEADERS.map((_, index) => String(row[index] ?? "").trim());
  const first = values(dataRows[0]);
  const lessonId = first[0];
  const lessonTitle = first[3];
  if (first[1] !== "0" || first[2].toLowerCase() !== "lesson") {
    errors.push({ row: 2, field: "lesson row", message: "The first data row must be the lesson row with slide_order 0 and slide_type lesson." });
  }
  if (!lessonId) errors.push({ row: 2, field: "lesson_id", message: "The lesson row needs a lesson_id." });
  if (!lessonTitle || lessonTitle.length > 200) errors.push({ row: 2, field: "title", message: "The lesson title is required and must be 200 characters or fewer." });
  for (const [index, field, max] of [[4, "subject", 120], [5, "grade", 80], [6, "language", 20]]) {
    if (first[index].length > max) errors.push({ row: 2, field, message: `Must be ${max} characters or fewer.` });
  }
  if (first[7] || first.slice(8).some(Boolean)) {
    errors.push({ row: 2, field: "lesson row", message: "The lesson row contains metadata only; slide and question fields must be empty." });
  }

  const slides = [];
  const lessonMetadata = first.slice(4, 7);
  for (let rowIndex = 1; rowIndex < dataRows.length; rowIndex += 1) {
    const rowNumber = rowIndex + 2;
    const row = values(dataRows[rowIndex]);
    if (dataRows[rowIndex].length !== HTML_CSV_HEADERS.length) {
      errors.push({ row: rowNumber, field: "columns", message: `Expected ${HTML_CSV_HEADERS.length} columns, found ${dataRows[rowIndex].length}.` });
      continue;
    }
    if (!row[0] || row[0] !== lessonId) errors.push({ row: rowNumber, field: "lesson_id", message: "Every row must use the same non-empty lesson_id." });
    for (let metadataIndex = 0; metadataIndex < lessonMetadata.length; metadataIndex += 1) {
      if (row[metadataIndex + 4] && row[metadataIndex + 4] !== lessonMetadata[metadataIndex]) {
        errors.push({ row: rowNumber, field: HTML_CSV_HEADERS[metadataIndex + 4], message: "Lesson metadata must match the lesson row." });
      }
    }

    const order = Number(row[1]);
    if (!Number.isInteger(order) || order !== rowIndex || order > MAX_SLIDES) {
      errors.push({ row: rowNumber, field: "slide_order", message: `Slide order must be ${rowIndex} with no gaps.` });
    }
    const type = row[2].toLowerCase();
    if (!["html", "question"].includes(type)) {
      errors.push({ row: rowNumber, field: "slide_type", message: 'Slides must use slide_type "html" or "question".' });
      continue;
    }
    const title = row[3];
    if (!title || title.length > 200) errors.push({ row: rowNumber, field: "title", message: "Slide title is required and must be 200 characters or fewer." });
    if (row[7].length > MAX_HTML_LENGTH) errors.push({ row: rowNumber, field: "html", message: `HTML must be ${MAX_HTML_LENGTH} characters or fewer per slide.` });
    if (row[16].length > 2000) errors.push({ row: rowNumber, field: "speaker_notes", message: "Speaker notes must be 2,000 characters or fewer." });

    const slide = { order: Math.max(0, order - 1), type, title, html: row[7], body: "", examples: [], imageUrl: "", speakerNotes: row[16] };
    if (type === "html") {
      if (!row[7]) errors.push({ row: rowNumber, field: "html", message: "HTML slides need slide content in the html column." });
      if (row.slice(8, 16).some(Boolean)) errors.push({ row: rowNumber, field: "question", message: "Question fields must be empty on HTML slides." });
    } else {
      if (row[7]) errors.push({ row: rowNumber, field: "html", message: "Question slides use structured question columns; the html field must be empty." });
      const options = row.slice(10, 14).map((text, optionIndex) => ({ id: String.fromCharCode(97 + optionIndex), text })).filter((option) => option.text);
      const kind = row[8].toLowerCase();
      const answer = row[14].trim();
      const canonicalKind = ["true_false", "true/false", "tf", "true false"].includes(kind) ? "tf" : kind === "mcq" ? "mcq" : "";
      if (!canonicalKind) errors.push({ row: rowNumber, field: "question_type", message: "Question type must be mcq or true_false." });
      if (canonicalKind === "tf" && (options.length !== 2 || !/^(true|t|yes|y)$/i.test(options[0].text) || !/^(false|f|no|n)$/i.test(options[1].text))) {
        errors.push({ row: rowNumber, field: "options", message: "True/false questions must use option_a=True and option_b=False." });
      }
      if (canonicalKind === "mcq" && (options.length < 2 || options.length > 4)) {
        errors.push({ row: rowNumber, field: "options", message: "Multiple-choice questions need 2–4 answer options." });
      }
      if (row[9].length > 500) errors.push({ row: rowNumber, field: "question_prompt", message: "Question prompts must be 500 characters or fewer." });
      if (row[15].length > 2000) errors.push({ row: rowNumber, field: "explanation", message: "Explanations must be 2,000 characters or fewer." });
      if (options.some((option) => option.text.length > 300)) errors.push({ row: rowNumber, field: "options", message: "Each option must be 300 characters or fewer." });
      const correctOptionId = answer.toLowerCase();
      const validOptionIds = canonicalKind === "tf" ? ["a", "b"] : options.map((option) => option.id);
      if (!validOptionIds.includes(correctOptionId)) errors.push({ row: rowNumber, field: "correct_answer", message: "Correct answer must be the letter of a populated option." });
      if (!row[9]) errors.push({ row: rowNumber, field: "question_prompt", message: "Question slides need a question prompt." });
      if (!row[15]) errors.push({ row: rowNumber, field: "explanation", message: "Question slides need an explanation." });
      slide.question = {
        kind: canonicalKind,
        prompt: row[9],
        options: options.map((option) => ({
          ...option,
          id: canonicalKind === "tf" ? (option.id === "a" ? "true" : "false") : option.id,
        })),
        correctOptionId: canonicalKind === "tf" ? (correctOptionId === "a" ? "true" : "false") : correctOptionId,
        explanation: row[15],
      };
    }
    slides.push(slide);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    lesson: {
      title: lessonTitle,
      description: "",
      subject: lessonMetadata[0],
      grade: lessonMetadata[1],
      language: lessonMetadata[2] || "en",
      slides,
    },
    matchedColumns: Object.fromEntries(HTML_CSV_HEADERS.map((header) => [header, header])),
  };
};

const resolveHeaders = (headers) => {
  const result = {};
  const errors = [];
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const normalizedAliases = aliases.map(normalizeHeader);
    const matches = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => normalizedAliases.includes(normalizeHeader(header)));
    if (matches.length > 1) {
      errors.push(
        `Ambiguous columns for "${field}": ${matches.map(({ header }) => `"${header}"`).join(", ")}. Keep one or choose a single column name.`,
      );
    } else if (matches.length === 1) {
      result[field] = matches[0].index;
    }
  }

  const optionColumns = headers
    .map((header, index) => {
      const match = normalizeHeader(header).match(/^(?:option|choice|answer)\s*([a-f])$/);
      return match ? { id: match[1], index } : null;
    })
    .filter(Boolean);
  return { result, optionColumns, errors };
};

const valueAt = (row, columnIndex) =>
  columnIndex === undefined ? "" : String(row[columnIndex] ?? "").trim();

const normalizeSlideType = (rawType, hasQuestion) => {
  const type = normalizeHeader(rawType);
  if (!type) return hasQuestion ? "question" : "content";
  if (["question", "quiz", "check for understanding", "check", "mcq", "true false", "multiple choice"].includes(type)) {
    return "question";
  }
  if (["opening", "opener", "cover", "title"].includes(type)) return "opening";
  if (["goal", "goals", "objective", "objectives", "learning goals"].includes(type)) return "goals";
  if (["example", "examples", "model"].includes(type)) return "examples";
  if (["activity", "task", "practice", "student activity"].includes(type)) return "activity";
  if (["exit ticket", "exit", "reflection", "recap", "summary"].includes(type)) return "exit-ticket";
  if (["content", "teaching", "explanation", "section"].includes(type)) return "content";
  return null;
};

const parseOptions = (row, headers) => {
  if (headers.optionColumns.length) {
    return headers.optionColumns
      .map(({ id, index }) => ({ id, text: valueAt(row, index) }))
      .filter((option) => option.text);
  }
  const optionsColumn = headers.result.options;
  if (optionsColumn === undefined) return [];
  return valueAt(row, optionsColumn)
    .split("|")
    .map((text, index) => ({ id: String.fromCharCode(97 + index), text: text.trim() }))
    .filter((option) => option.text);
};

const TRUE_FALSE_ANSWERS = {
  true: "true", t: "true", yes: "true", y: "true",
  false: "false", f: "false", no: "false", n: "false",
};

const makeQuestion = (row, headers, rowNumber, errors) => {
  const ctx = { row: rowNumber, errors };
  // A row with a prompt but no type column stays multiple choice, exactly as before.
  const kindCell = normalizeHeader(valueAt(row, headers.result.questionType)) || "mcq";
  const kind = resolveLiveKind(kindCell) || kindCell;
  const options = parseOptions(row, headers);
  if (kind === "tf" && options.length === 0) {
    options.push({ id: "true", text: "True" }, { id: "false", text: "False" });
  }
  if (kind === "tf" && options.length === 2) {
    const explicit = options.map((option) => TRUE_FALSE_ANSWERS[normalizeHeader(option.text)] || "");
    const canInfer = explicit[0] && explicit[1] && explicit[0] !== explicit[1];
    options[0].id = canInfer ? explicit[0] : "true";
    options[1].id = canInfer ? explicit[1] : "false";
  }
  const rawAnswer = valueAt(row, headers.result.correctAnswer);
  const answer = kind === "tf" ? (TRUE_FALSE_ANSWERS[normalizeHeader(rawAnswer)] || rawAnswer) : rawAnswer;

  const question = buildQuestionFromCells({
    kind: kindCell,
    prompt: valueAt(row, headers.result.prompt),
    options,
    pairs: valueAt(row, headers.result.pairs),
    items: valueAt(row, headers.result.items),
    blanks: valueAt(row, headers.result.blanks),
    numeric: valueAt(row, headers.result.numeric),
    guidance: valueAt(row, headers.result.guidance),
    criteria: valueAt(row, headers.result.criteria),
    minWords: valueAt(row, headers.result.minWords),
    maxWords: valueAt(row, headers.result.maxWords),
    answer,
    explanation: valueAt(row, headers.result.explanation),
  }, ctx, FLEXIBLE_QUESTION_COLUMNS);
  errors.push(...questionValidationErrors(question, ctx, FLEXIBLE_QUESTION_COLUMNS, "question"));
  return question;
};

const makeLevels = (row, headers, rowNumber, errors) => {
  const ctx = { row: rowNumber, errors };
  const levels = readLevelsCell(valueAt(row, headers.result.levels), ctx, "levels");
  levels.forEach((level) => {
    errors.push(...questionValidationErrors(level.question, ctx, LEVEL_QUESTION_COLUMNS, level.label));
  });
  return levels.map((level) => ({ group: level.group, question: level.question }));
};

export const parseLiveLessonCsv = (csv) => {
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return { ok: false, errors: [{ row: 1, field: "file", message: "Choose a non-empty CSV file." }] };
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_LENGTH) {
    return { ok: false, errors: [{ row: 1, field: "file", message: "CSV files must be 22 MB or smaller." }] };
  }

  let rows;
  try {
    rows = parseCsvRows(csv);
  } catch (error) {
    return { ok: false, errors: [{ row: 1, field: "file", message: error.message }] };
  }
  if (rows.length < 2) {
    return { ok: false, errors: [{ row: 1, field: "file", message: "CSV needs a header row and at least one lesson row." }] };
  }

  const [rawHeaders, ...dataRows] = rows;
  if (normalizeHeader(rawHeaders[0]) === "format version") {
    return parsePortableLiveLessonCsv(rawHeaders, dataRows);
  }
  if (normalizeHeader(rawHeaders[2]) === "slide type" && normalizeHeader(rawHeaders[7]) === "html") {
    return parseHtmlSlideCsv(rawHeaders, dataRows);
  }
  const headers = resolveHeaders(rawHeaders);
  const errors = headers.errors.map((message) => ({ row: 1, field: "headers", message }));
  if (headers.result.title === undefined && headers.result.body === undefined) {
    errors.push({ row: 1, field: "headers", message: 'Include a "title" (or "heading") or "body" (or "content") column.' });
  }

  const slides = [];
  let lessonTitle = "";
  let lessonDescription = "";
  const requestedOrders = new Map();
  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cellTooLong = row.findIndex((cell) => cell.length > MAX_CELL_LENGTH);
    if (cellTooLong >= 0) {
      errors.push({ row: rowNumber, field: rawHeaders[cellTooLong] || "cell", message: "Cell content must be 5,000 characters or fewer." });
    }

    lessonTitle ||= valueAt(row, headers.result.lessonTitle);
    lessonDescription ||= valueAt(row, headers.result.lessonDescription);
    if (lessonTitle.length > 200) {
      errors.push({ row: rowNumber, field: "lesson title", message: "Lesson titles must be 200 characters or fewer." });
    }
    if (lessonDescription.length > 1000) {
      errors.push({ row: rowNumber, field: "lesson description", message: "Descriptions must be 1,000 characters or fewer." });
    }
    const rawTitle = valueAt(row, headers.result.title);
    const body = valueAt(row, headers.result.body);
    const prompt = valueAt(row, headers.result.prompt);
    const isQuestion = Boolean(prompt);
    const type = normalizeSlideType(valueAt(row, headers.result.type), isQuestion);
    if (!type) {
      errors.push({ row: rowNumber, field: "slide type", message: "Unsupported slide type." });
      return;
    }
    if (!rawTitle && !body && !prompt) {
      errors.push({ row: rowNumber, field: "title/content", message: "Each row needs a slide title, content, or question prompt." });
      return;
    }
    if (rawTitle.length > 200) {
      errors.push({ row: rowNumber, field: "title", message: "Slide titles must be 200 characters or fewer." });
    }
    if (body.length > 5000) {
      errors.push({ row: rowNumber, field: "content", message: "Slide content must be 5,000 characters or fewer." });
    }
    const speakerNotes = valueAt(row, headers.result.speakerNotes);
    if (speakerNotes.length > 2000) {
      errors.push({ row: rowNumber, field: "speaker notes", message: "Speaker notes must be 2,000 characters or fewer." });
    }

    const orderRaw = valueAt(row, headers.result.order);
    const parsedOrder = orderRaw ? Number(orderRaw) : index + 1;
    if (!Number.isInteger(parsedOrder) || parsedOrder < 1 || parsedOrder > MAX_SLIDES) {
      errors.push({ row: rowNumber, field: "slide order", message: `Slide order must be a whole number from 1 to ${MAX_SLIDES}.` });
    } else if (requestedOrders.has(parsedOrder)) {
      errors.push({ row: rowNumber, field: "slide order", message: `Slide order ${parsedOrder} is already used on row ${requestedOrders.get(parsedOrder)}.` });
    } else {
      requestedOrders.set(parsedOrder, rowNumber);
    }

    const slide = {
      order: Number.isInteger(parsedOrder) ? parsedOrder - 1 : index,
      type,
      title: rawTitle,
      body,
      examples: valueAt(row, headers.result.examples)
        .split(/\r?\n|\s*\|\s*/)
        .map((example) => example.trim())
        .filter(Boolean),
      imageUrl: valueAt(row, headers.result.imageUrl),
      speakerNotes,
    };
    if (slide.imageUrl && !/^https?:\/\/\S+$/i.test(slide.imageUrl)) {
      errors.push({ row: rowNumber, field: "image URL", message: "Image URL must start with http:// or https://." });
    }
    if (type === "question") {
      slide.question = makeQuestion(row, headers, rowNumber, errors);
      const variants = makeLevels(row, headers, rowNumber, errors);
      if (variants.length) slide.variants = variants;
    } else if (isQuestion) {
      errors.push({ row: rowNumber, field: "slide type", message: "A row with a question prompt must use the question slide type." });
    } else if (valueAt(row, headers.result.levels)) {
      errors.push({ row: rowNumber, field: "levels", message: "Only question slides can carry levelled questions." });
    }
    slides.push(slide);
  });

  if (!lessonTitle) errors.push({ row: 2, field: "lesson title", message: "Include a lesson title in the lesson title column." });
  if (slides.length === 0 || slides.length > MAX_SLIDES) {
    errors.push({ row: 1, field: "slides", message: `A lesson must contain between 1 and ${MAX_SLIDES} slides.` });
  }
  slides.sort((first, second) => first.order - second.order);
  slides.forEach((slide, index) => {
    slide.order = index;
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    lesson: { title: lessonTitle, description: lessonDescription, slides },
    matchedColumns: Object.fromEntries(
      Object.entries(headers.result).map(([key, index]) => [key, rawHeaders[index]]),
    ),
  };
};

const csvCell = (value) => {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
};

const csvRow = (values) => values.map(csvCell).join(",");

const LIVE_LESSON_TEMPLATE_HEADERS = [
  "lesson_title", "lesson_description", "slide_order", "slide_type", "title", "body", "examples",
  "image_url", "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d",
  "correct_answer", "explanation", "speaker_notes", "matching_pairs", "ordering_items",
  "blank_answers", "numeric_rule", "guidance", "criteria", "min_words", "max_words", "levels_json",
];

const templateRow = (cells) => csvRow(LIVE_LESSON_TEMPLATE_HEADERS.map((header) => cells[header] ?? ""));

const TEMPLATE_LESSON = { lesson_title: "Figurative Language", lesson_description: "ELA lesson" };

/**
 * One row per live question kind plus a levelled exit ticket, so the sample lesson teaches every
 * column without a separate reference sheet. Type cells take either JSON or the shared practice
 * grammar: `term::match` joined by `|`, steps joined by `>`, and `blank::answer~alternative`.
 */
export const LIVE_LESSON_CSV_TEMPLATE = [
  csvRow(LIVE_LESSON_TEMPLATE_HEADERS),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 1, slide_type: "opening", title: "Figurative Language", body: "Explore similes, metaphors and personification.", speaker_notes: "Welcome students" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 2, slide_type: "goals", title: "Learning goals", body: "Define each technique and identify it in a sentence." }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 3, slide_type: "content", title: "How to spot the technique", body: "Read carefully; look for a comparison or human action; decide if it is literal." }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 4, slide_type: "examples", title: "Simile", body: "A simile compares two things using like or as.", examples: "Her laugh was as bright as a bell|Ideas fell like rain" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 5, slide_type: "question", title: "Check for understanding", question_type: "mcq", question_prompt: "The classroom was a beehive. Which technique is used?", option_a: "Simile", option_b: "Metaphor", option_c: "Personification", correct_answer: "Metaphor", explanation: "It says the classroom is a beehive without like or as." }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 6, slide_type: "question", title: "Select the similes", question_type: "multi_select", question_prompt: "Which sentences use a simile? Select all that apply.", option_a: "Her laugh was as bright as a bell.", option_b: "The classroom was a beehive.", option_c: "Ideas fell like rain.", correct_answer: "a|c", explanation: "Both compare using like." }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 7, slide_type: "question", title: "True or false", question_type: "tf", question_prompt: "A metaphor compares two things using like or as.", correct_answer: "false", explanation: "That is a simile." }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 8, slide_type: "question", title: "Match the technique", question_type: "matching", question_prompt: "Match each technique to its definition.", matching_pairs: "Simile::a comparison using like or as|Personification::human qualities given to a thing" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 9, slide_type: "question", title: "Order the steps", question_type: "ordering", question_prompt: "Put the steps for naming a tense in order.", ordering_items: "Read the sentence > Find the verb > Name the tense" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 10, slide_type: "question", title: "Complete the definition", question_type: "fill_in_blank", question_prompt: "A {{b1}} compares two things using {{b2}}.", blank_answers: "b1::simile|b2::like or as~like and as" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 11, slide_type: "question", title: "How many techniques", question_type: "numeric", question_prompt: "How many techniques does this lesson define?", numeric_rule: "exact::3" }),
  templateRow({ ...TEMPLATE_LESSON, slide_order: 12, slide_type: "activity", title: "Your turn", body: "Write one simile, one metaphor, and one example of personification." }),
  templateRow({
    ...TEMPLATE_LESSON,
    slide_order: 13,
    slide_type: "question",
    title: "Exit ticket",
    question_type: "text",
    question_prompt: "Name the technique in “The stars winked at us” and explain how a metaphor differs from a simile.",
    guidance: "Two sentences, one example of each.",
    criteria: "Names both techniques and the difference between them.",
    min_words: 20,
    levels_json: JSON.stringify([
      { group: "Needs support", kind: "mcq", prompt: "Which sentence uses a simile?", options: [{ id: "a", text: "Her laugh was as bright as a bell." }, { id: "b", text: "The classroom was a beehive." }], correct_answer: "a" },
      { group: "Ready to stretch", kind: "text", prompt: "Write your own simile and say what is compared to what.", guidance: "Name both things in the comparison.", min_words: 25 },
    ]),
  }),
].join("\r\n");

const jsonCell = (value) => (value && typeof value === "object" && (!Array.isArray(value) || value.length)
  ? JSON.stringify(value)
  : "");

const liveAnswerCell = (question) => {
  if (question.kind === "mcq" || question.kind === "tf") return question.correctOptionId || "";
  if (question.kind === "multi_select") return (question.correctOptionIds || []).join(PRACTICE_PAIR_SEPARATOR);
  return "";
};

/** Level cells name the group rather than its id, because the id belongs to this school only. */
const levelEntry = (variant, groupNames) => {
  const question = variant.question || {};
  return {
    group: groupNames[String(variant.groupId)] || "",
    kind: question.kind || "",
    prompt: question.prompt || "",
    ...(question.options?.length ? { options: question.options.map((option) => ({ id: option.id, text: option.text })) } : {}),
    ...(question.matchingPairs?.length ? { matchingPairs: question.matchingPairs } : {}),
    ...(question.orderingItems?.length ? { orderingItems: question.orderingItems.map((item) => ({ id: item.id, text: item.text })) } : {}),
    ...(question.blanks?.length ? { blanks: question.blanks.map((blank) => ({ id: blank.id, accepts: blank.accepts })) } : {}),
    ...(question.numericRule ? { numericRule: question.numericRule } : {}),
    ...(question.guidance ? { guidance: question.guidance } : {}),
    ...(question.criteria ? { criteria: question.criteria } : {}),
    ...(question.minWords ? { minWords: question.minWords } : {}),
    ...(question.maxWords ? { maxWords: question.maxWords } : {}),
    ...(liveAnswerCell(question) ? { correctAnswer: liveAnswerCell(question) } : {}),
    ...(question.explanation ? { explanation: question.explanation } : {}),
  };
};

export const serializeLiveLessonCsv = (lesson, { groupNames = {} } = {}) => {
  const metadata = [
    PORTABLE_LIVE_LESSON_CSV_LAYOUTS.at(-1).version,
    lesson._id || "",
    lesson.title || "",
    lesson.description || "",
    lesson.subject || "",
    lesson.grade || "",
    lesson.language || "en",
    lesson.classId?.name || "",
    lesson.subjectId?.name || "",
    lesson.isDone === true ? "true" : "false",
  ];
  const rows = [PORTABLE_LIVE_LESSON_CSV_HEADERS];
  (lesson.slides || []).forEach((slide, index) => {
    const question = slide.question || {};
    const variants = Array.isArray(slide.variants) ? slide.variants : [];
    rows.push([
      ...metadata,
      index + 1,
      slide.type || "",
      slide.title || "",
      slide.body || "",
      slide.html || "",
      JSON.stringify(Array.isArray(slide.examples) ? slide.examples : []),
      slide.imageUrl || "",
      question.kind || "",
      question.prompt || "",
      jsonCell(question.options?.length ? question.options.map((option) => ({ id: option.id, text: option.text })) : []),
      jsonCell(question.matchingPairs || []),
      jsonCell(question.orderingItems || []),
      jsonCell(question.blanks?.map((blank) => ({ id: blank.id, accepts: blank.accepts })) || []),
      jsonCell(question.numericRule || null),
      question.guidance || "",
      question.criteria || "",
      question.minWords || "",
      question.maxWords || "",
      liveAnswerCell(question),
      question.explanation || "",
      slide.speakerNotes || "",
      jsonCell(variants.map((variant) => levelEntry(variant, groupNames))),
    ]);
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
};
