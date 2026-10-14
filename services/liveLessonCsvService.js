const MAX_CSV_LENGTH = 2 * 1024 * 1024;
const MAX_SLIDES = 200;
const MAX_CELL_LENGTH = 5000;
const MAX_HTML_LENGTH = 100000;
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
  options: ["options", "answer options"],
  correctAnswer: ["correct answer", "correct option", "answer", "key"],
  explanation: ["explanation", "answer explanation", "teacher explanation"],
  speakerNotes: ["speaker notes", "teacher notes", "notes"],
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

const makeQuestion = (row, headers, rowNumber, errors) => {
  const prompt = valueAt(row, headers.result.prompt);
  const kindValue = normalizeHeader(valueAt(row, headers.result.questionType));
  const options = parseOptions(row, headers);
  const kind =
    kindValue === "tf" ||
    kindValue === "true false" ||
    kindValue === "true/false" ||
    kindValue === "true or false"
      ? "tf"
      : "mcq";
  const answer = valueAt(row, headers.result.correctAnswer);
  if (prompt.length > 500) {
    errors.push({ row: rowNumber, field: "question prompt", message: "Question prompts must be 500 characters or fewer." });
  }
  if (!prompt) errors.push({ row: rowNumber, field: "question prompt", message: "Question slides need a prompt." });
  if (kind === "tf" && options.length === 0) {
    options.push({ id: "true", text: "True" }, { id: "false", text: "False" });
  }
  if (kind === "tf" && options.length === 2) {
    const explicit = options.map((option) => {
      const text = normalizeHeader(option.text);
      if (["false", "f", "no", "n"].includes(text)) return "false";
      if (["true", "t", "yes", "y"].includes(text)) return "true";
      return "";
    });
    const canInfer = explicit[0] && explicit[1] && explicit[0] !== explicit[1];
    options[0].id = canInfer ? explicit[0] : "true";
    options[1].id = canInfer ? explicit[1] : "false";
  }
  if (kind === "mcq" && (options.length < 2 || options.length > 6)) {
    errors.push({ row: rowNumber, field: "options", message: "Multiple-choice questions need 2–6 non-empty options." });
  }
  if (kind === "tf" && options.length !== 2) {
    errors.push({ row: rowNumber, field: "options", message: "True/false questions need exactly two options." });
  }
  if (options.some((option) => option.text.length > 300)) {
    errors.push({ row: rowNumber, field: "options", message: "Each answer option must be 300 characters or fewer." });
  }
  const explanation = valueAt(row, headers.result.explanation);
  if (explanation.length > 2000) {
    errors.push({ row: rowNumber, field: "explanation", message: "Explanations must be 2,000 characters or fewer." });
  }
  let correctOptionId = "";
  if (answer) {
    const match = options.find(
      (option) =>
        normalizeHeader(option.id) === normalizeHeader(answer) ||
        normalizeHeader(option.text) === normalizeHeader(answer),
    );
    if (match) correctOptionId = match.id;
    else errors.push({ row: rowNumber, field: "correct answer", message: "Correct answer must match an option label or option text." });
  } else {
    errors.push({ row: rowNumber, field: "correct answer", message: "Question slides need a correct answer for teacher grading." });
  }
  if (kind === "tf" && answer) {
    const truthy = ["true", "t", "yes", "y"];
    const falsy = ["false", "f", "no", "n"];
    const normalized = normalizeHeader(answer);
    if (truthy.includes(normalized)) correctOptionId = "true";
    else if (falsy.includes(normalized)) correctOptionId = "false";
  }

  return {
    kind,
    prompt,
    options,
    correctOptionId,
    explanation,
  };
};

export const parseLiveLessonCsv = (csv) => {
  if (typeof csv !== "string" || csv.trim().length === 0) {
    return { ok: false, errors: [{ row: 1, field: "file", message: "Choose a non-empty CSV file." }] };
  }
  if (csv.length > MAX_CSV_LENGTH) {
    return { ok: false, errors: [{ row: 1, field: "file", message: "CSV files must be 2 MB or smaller." }] };
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
    } else if (isQuestion) {
      errors.push({ row: rowNumber, field: "slide type", message: "A row with a question prompt must use the question slide type." });
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

export const LIVE_LESSON_CSV_TEMPLATE = [
  "lesson_title,lesson_description,slide_order,slide_type,title,body,examples,image_url,question_type,question_prompt,option_a,option_b,option_c,option_d,correct_answer,explanation,speaker_notes",
  '"Figurative Language","ELA lesson",1,opening,"Figurative Language","Explore similes, metaphors and personification.",,,,,,,,,,,"Welcome students"',
  '"Figurative Language","ELA lesson",2,goals,"Learning goals","Define each technique and identify it in a sentence.",,,,,,,,,,,',
  '"Figurative Language","ELA lesson",3,content,"How to spot the technique","Read carefully; look for a comparison or human action; decide if it is literal.",,,,,,,,,,,',
  '"Figurative Language","ELA lesson",4,examples,"Simile","A simile compares two things using like or as.","Her laugh was as bright as a bell|Ideas fell like rain",,,,,,,,',
  '"Figurative Language","ELA lesson",5,question,"Check for understanding",,,"",mcq,"The classroom was a beehive. Which technique is used?","Simile","Metaphor","Personification",,"Metaphor","It says the classroom is a beehive without like or as.",',
  '"Figurative Language","ELA lesson",6,activity,"Your turn","Write one simile, one metaphor, and one example of personification.",,,,,,,,,,,',
  '"Figurative Language","ELA lesson",7,exit-ticket,"Exit ticket","Name the technique in ""The stars winked at us"" and explain how a metaphor differs from a simile.",,,,,,,,,,',
].join("\r\n");
