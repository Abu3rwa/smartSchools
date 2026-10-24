import test from "node:test";
import assert from "node:assert/strict";
import { LIVE_LESSON_CSV_TEMPLATE as CLIENT_AI_PROMPT_CSV, LIVE_LESSON_SAMPLE_CSV } from "../client/src/pages/liveLessons/liveLessonCsvTemplate.js";
import {
  LIVE_LESSON_CSV_TEMPLATE,
  parseLiveLessonCsv,
  serializeLiveLessonCsv,
} from "../services/liveLessonCsvService.js";
import {
  getSessionStudents,
  liveEventActorRole,
  safeSlide,
} from "../services/liveLessonService.js";

const csvRow = (cells) => cells.map((value) => {
  const cell = String(value ?? "");
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}).join(",");

test("sample CSV imports a structured lesson with a graded question", () => {
  const result = parseLiveLessonCsv(LIVE_LESSON_CSV_TEMPLATE);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.lesson.title, "Figurative Language");
  assert.equal(result.lesson.slides.length, 13);
  assert.equal(result.lesson.slides[0].type, "opening");
  assert.equal(result.lesson.slides.at(-1).type, "question");
  const question = result.lesson.slides.find((slide) => slide.question)?.question;
  assert.equal(question.kind, "mcq");
  assert.equal(question.correctOptionId, "b");
  assert.equal(question.options[1].text, "Metaphor");
});

test("the sample lesson covers every live question kind", () => {
  const { lesson } = parseLiveLessonCsv(LIVE_LESSON_CSV_TEMPLATE);
  assert.deepEqual(
    lesson.slides.filter((slide) => slide.question).map((slide) => slide.question.kind),
    ["mcq", "multi_select", "tf", "matching", "ordering", "fill_in_blank", "numeric", "text"],
  );

  const ordering = lesson.slides.find((slide) => slide.question?.kind === "ordering");
  assert.deepEqual(ordering.question.orderingItems.map((item) => item.text), ["Read the sentence", "Find the verb", "Name the tense"]);
  const blanks = lesson.slides.find((slide) => slide.question?.kind === "fill_in_blank");
  assert.deepEqual(blanks.question.blanks, [
    { id: "b1", accepts: ["simile"] },
    { id: "b2", accepts: ["like or as", "like and as"] },
  ]);
  const numeric = lesson.slides.find((slide) => slide.question?.kind === "numeric");
  assert.deepEqual(numeric.question.numericRule, { mode: "exact", value: "3" });

  // Differentiated questions are not authored or downloaded any more, so no sample slide carries one.
  assert.deepEqual(lesson.slides.filter((slide) => slide.variants?.length), []);
});

test("portable CSV round-trips every question kind and its levels", () => {
  const source = {
    _id: "lesson-kinds",
    title: "Every kind",
    slides: [
      {
        type: "question",
        title: "Match",
        question: {
          kind: "matching",
          prompt: "Match each term.",
          matchingPairs: [{ left: "Simile", right: "uses like or as" }, { left: "Alliteration", right: "repeated beginning sounds" }],
          explanation: "Read them aloud.",
        },
      },
      {
        type: "question",
        title: "Order",
        question: {
          kind: "ordering",
          prompt: "Order the steps.",
          orderingItems: [{ id: "i7", text: "Read the sentence" }, { id: "i3", text: "Find the verb" }, { id: "i9", text: "Name the tense" }],
        },
      },
      {
        type: "question",
        title: "Blanks",
        question: {
          kind: "fill_in_blank",
          prompt: "A {{b1}} compares with {{b2}}.",
          blanks: [{ id: "b1", accepts: ["simile"] }, { id: "b2", accepts: ["like or as", "as"] }],
        },
      },
      {
        type: "question",
        title: "Number",
        question: { kind: "numeric", prompt: "How long?", numericRule: { mode: "tolerance", value: "45", tolerance: "5", unit: "minutes" } },
      },
      {
        type: "question",
        title: "Exit ticket",
        question: { kind: "text", prompt: "Explain the difference.", guidance: "Two sentences.", criteria: "Names both.", minWords: 20 },
        variants: [
          {
            groupId: "group-support",
            question: { kind: "mcq", prompt: "Which sentence is a simile?", options: [{ id: "a", text: "as bright as a bell" }, { id: "b", text: "was a beehive" }], correctOptionId: "a" },
          },
          { groupId: "group-stretch", question: { kind: "text", prompt: "Write your own simile.", guidance: "Name both things." } },
        ],
      },
    ],
  };
  const csv = serializeLiveLessonCsv(source, {
    groupNames: { "group-support": "Needs support", "group-stretch": "Ready to stretch" },
  });
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  result.lesson.slides.forEach((slide, index) => {
    assert.deepEqual(slide.question, source.slides[index].question);
  });
  assert.deepEqual(result.lesson.slides[4].variants.map((variant) => variant.group), ["Needs support", "Ready to stretch"]);
  assert.deepEqual(result.lesson.slides[4].variants[1].question, source.slides[4].variants[1].question);
});

test("a format version 1 export still imports", () => {
  const csv = [
    csvRow(["format_version", "lesson_id", "lesson_title", "lesson_description", "subject", "grade", "language", "assigned_class", "assigned_subject", "is_done", "slide_order", "slide_type", "title", "body", "html", "examples_json", "image_url", "question_kind", "question_prompt", "question_options_json", "correct_answer", "explanation", "speaker_notes"]),
    csvRow(["1", "L9", "Old export", "", "", "", "", "", "", "false", 1, "question", "Check", "", "", "[]", "", "mcq", "Which is right?", '[{"id":"a","text":"First"},{"id":"b","text":"Second"}]', "b", "", "note"]),
  ].join("\r\n");
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.lesson.slides[0].question.correctOptionId, "b");
});

test("portable CSV names the column behind a broken key for every kind", () => {
  const broken = {
    _id: "lesson-broken",
    title: "Broken keys",
    slides: [
      { type: "question", title: "Match", question: { kind: "matching", prompt: "Match these.", matchingPairs: [{ left: "Simile", right: "" }] } },
      { type: "question", title: "Blanks", question: { kind: "fill_in_blank", prompt: "No blank token here", blanks: [{ id: "b1", accepts: ["simile"] }] } },
      { type: "question", title: "Number", question: { kind: "numeric", prompt: "How many?", numericRule: { mode: "tolerance", value: "10" } } },
      { type: "question", title: "Sort", question: { kind: "ordering", prompt: "Sort these.", orderingItems: [{ id: "i1", text: "One" }, { id: "i2", text: "Two" }] } },
      { type: "question", title: "Bubble", question: { kind: "bubble", prompt: "Draw it." } },
      { type: "question", title: "Ticket", question: { kind: "text", prompt: "Explain." }, variants: [{ groupId: "group-x", question: { kind: "text" } }] },
    ],
  };
  const result = parseLiveLessonCsv(serializeLiveLessonCsv(broken));

  assert.equal(result.ok, false);
  const fields = result.errors.map((error) => error.field);
  for (const column of ["question_pairs_json", "question_blanks_json", "question_numeric_json", "question_items_json", "question_kind", "levels_json"]) {
    assert.ok(fields.includes(column), `expected an error on ${column}: ${JSON.stringify(result.errors)}`);
  }
});

test("downloadable HTML CSV template passes the server importer", () => {
  const result = parseLiveLessonCsv(CLIENT_AI_PROMPT_CSV);
  assert.equal(result.ok, true);
  assert.equal(result.lesson.slides.length, 2);
  assert.equal(result.lesson.slides[0].type, "html");
  assert.equal(result.lesson.slides[1].question.kind, "mcq");
});

// The browser bundle cannot import this service, so the sample the teacher downloads is a mirror
// of the server's. Comparing the two files is what stops the sample and the importer drifting.
test("the downloaded sample CSV is the server template, cell for cell", () => {
  assert.equal(LIVE_LESSON_SAMPLE_CSV, LIVE_LESSON_CSV_TEMPLATE);
});

test("HTML slide CSV imports lesson metadata, animated HTML, and structured MCQ", () => {
  const csv = [
    csvRow(["lesson_id", "slide_order", "slide_type", "title", "subject", "grade", "language", "html", "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d", "correct_answer", "explanation", "speaker_notes"]),
    csvRow(["L1", 0, "lesson", "Sentence Types", "English", "Grade 4", "en", ...Array(10).fill("")]),
    csvRow(["L1", 1, "html", "Animated opener", "", "", "", "<style>@keyframes fade{from{opacity:0}to{opacity:1}}.a{animation:fade 1s}</style><h1 class='a'>Hello</h1>", ...Array(9).fill("")]),
    csvRow(["L1", 2, "question", "Quick check", "", "", "", "", "mcq", "Which is complex?", "Simple", "Complex", "Compound", "", "B", "It has a dependent clause.", "Teacher note"]),
  ].join("\n");
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, true);
  assert.equal(result.lesson.title, "Sentence Types");
  assert.equal(result.lesson.subject, "English");
  assert.equal(result.lesson.grade, "Grade 4");
  assert.equal(result.lesson.language, "en");
  assert.equal(result.lesson.slides[0].type, "html");
  assert.match(result.lesson.slides[0].html, /@keyframes fade/);
  assert.equal(result.lesson.slides[1].question.correctOptionId, "b");
});

test("HTML slide CSV requires a lesson row and consistent slide ordering and metadata", () => {
  const csv = [
    csvRow(["lesson_id", "slide_order", "slide_type", "title", "subject", "grade", "language", "html", "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d", "correct_answer", "explanation", "speaker_notes"]),
    csvRow(["L1", 0, "lesson", "Sentence Types", "English", "Grade 4", "en", ...Array(10).fill("")]),
    csvRow(["L1", 2, "html", "Animated opener", "", "", "", "<p>Hello</p>", ...Array(9).fill("")]),
  ].join("\n");
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field === "slide_order"));
});

test("HTML slide CSV maps true/false answer letters to existing question option IDs", () => {
  const csv = [
    csvRow(["lesson_id", "slide_order", "slide_type", "title", "subject", "grade", "language", "html", "question_type", "question_prompt", "option_a", "option_b", "option_c", "option_d", "correct_answer", "explanation", "speaker_notes"]),
    csvRow(["L2", 0, "lesson", "Facts", "Science", "Grade 2", "en", ...Array(10).fill("")]),
    csvRow(["L2", 1, "question", "Check", "", "", "", "", "true_false", "Is the sun a star?", "True", "False", "", "", "A", "The sun is a star.", ""]),
  ].join("\n");
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, true);
  assert.equal(result.lesson.slides[0].question.correctOptionId, "true");
  assert.deepEqual(result.lesson.slides[0].question.options.map((option) => option.id), ["true", "false"]);
});

test("portable export round-trips lesson metadata and every supported slide field", () => {
  const sourceLesson = {
    _id: "lesson-original",
    title: 'Commas, "quotes", and clauses',
    description: "First line\nSecond line",
    subject: "English",
    grade: "Grade 5",
    language: "en",
    isDone: true,
    classId: { name: "Grade 5-R" },
    subjectId: { name: "English Language Arts" },
    slides: [
      {
        type: "opening",
        title: "Welcome",
        body: "A body with commas, quotes, and\nline breaks.",
        html: "",
        examples: ["First example, with comma", 'Second "quoted" example'],
        imageUrl: "https://example.test/image.png",
        speakerNotes: "Teacher notes",
      },
      {
        type: "html",
        title: "Animated slide",
        body: "",
        html: "<style>h1{color:red}</style>\n<h1>Hello</h1>",
        examples: [],
        imageUrl: "",
        speakerNotes: "",
      },
      {
        type: "question",
        title: "Choose the best answer",
        body: "",
        html: "",
        examples: [],
        imageUrl: "",
        question: {
          kind: "mcq",
          prompt: "Which choice is correct?",
          options: [
            { id: "a", text: "First" },
            { id: "b", text: "Second, with detail" },
            { id: "c", text: 'Third "quoted"' },
          ],
          correctOptionId: "b",
          explanation: "The second option is correct.",
        },
        speakerNotes: "Ask the class to explain.",
      },
      {
        type: "exit-ticket",
        title: "Finish",
        body: "One final reflection.",
        html: "",
        examples: [],
        imageUrl: "",
        speakerNotes: "",
      },
    ],
  };
  const csv = serializeLiveLessonCsv(sourceLesson);
  const result = parseLiveLessonCsv(csv);

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.lesson.title, sourceLesson.title);
  assert.equal(result.lesson.description, sourceLesson.description);
  assert.equal(result.lesson.subject, sourceLesson.subject);
  assert.equal(result.lesson.grade, sourceLesson.grade);
  assert.equal(result.lesson.language, sourceLesson.language);
  assert.equal(result.lesson.isDone, true);
  assert.deepEqual(result.lesson.importHints, {
    assignedClass: "Grade 5-R",
    assignedSubject: "English Language Arts",
  });
  assert.equal(result.lesson.slides.length, sourceLesson.slides.length);
  assert.deepEqual(result.lesson.slides[0].examples, sourceLesson.slides[0].examples);
  assert.equal(result.lesson.slides[0].body, sourceLesson.slides[0].body);
  assert.equal(result.lesson.slides[1].html, sourceLesson.slides[1].html);
  assert.deepEqual(result.lesson.slides[2].question, sourceLesson.slides[2].question);
  assert.equal(result.lesson.slides[3].type, "exit-ticket");
});

test("portable CSV rejects inconsistent metadata, slide ordering, and answer keys", () => {
  const source = {
    _id: "lesson-1",
    title: "Portable",
    slides: [
      { type: "content", title: "First", body: "First body" },
      {
        type: "question",
        title: "Question",
        question: {
          kind: "mcq",
          prompt: "Pick one",
          options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
          correctOptionId: "a",
        },
      },
    ],
  };
  const csv = serializeLiveLessonCsv(source);
  const rows = csv.split("\r\n");
  const changedMetadata = rows.map((row, index) => index === 2 ? row.replace("Portable", "Changed") : row).join("\r\n");
  assert.ok(parseLiveLessonCsv(changedMetadata).errors.some((error) => error.field === "lesson_title"));

  const wrongAnswer = rows.map((row, index) => index === 2
    ? row.replace(",a,,", ",z,,")
    : row).join("\r\n");
  const parsedWrongAnswer = parseLiveLessonCsv(wrongAnswer);
  assert.equal(parsedWrongAnswer.ok, false);
  assert.ok(parsedWrongAnswer.errors.some((error) => error.field === "correct_answer"));
});

test("CSV parser accepts title aliases and quoted multiline content", () => {
  const csv = [
    "lesson title,slide number,slide kind,heading,content",
    '"Figurative Language",1,opening,"Start here","Try one example, then discuss\nwith a partner"',
  ].join("\r\n");
  const result = parseLiveLessonCsv(csv);
  assert.equal(result.ok, true);
  assert.equal(result.matchedColumns.title, "heading");
  assert.equal(result.lesson.slides[0].title, "Start here");
  assert.match(result.lesson.slides[0].body, /\nwith a partner/);
});

test("CSV parser supports true/false questions without explicit option columns", () => {
  const csv = [
    "lesson_title,slide_type,heading,question,question_type,correct_answer",
    "Language,question,Quick check,The stars winked at us.,tf,true",
  ].join("\n");
  const result = parseLiveLessonCsv(csv);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.lesson.slides[0].question.options.map((option) => option.id),
    ["true", "false"],
  );
  assert.equal(result.lesson.slides[0].question.correctOptionId, "true");
});

test("CSV parser reports ambiguous aliases and incorrect answer keys", () => {
  const csv = [
    "lesson_title,slide_type,title,heading,question,option_a,option_b,correct_answer",
    "Language,question,Title,Heading,Pick one,A,B,C",
  ].join("\n");
  const result = parseLiveLessonCsv(csv);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /Ambiguous columns/.test(error.message)));
  assert.ok(result.errors.some((error) => error.field === "correct answer"));
});

test("CSV parser rejects duplicate slide order and malformed quoting", () => {
  const duplicateOrder = [
    "lesson_title,slide_order,heading,content",
    "Lesson,1,One,First",
    "Lesson,1,Two,Second",
  ].join("\n");
  const duplicateResult = parseLiveLessonCsv(duplicateOrder);
  assert.ok(duplicateResult.errors.some((error) => error.field === "slide order"));
  const malformed = parseLiveLessonCsv('lesson_title,title\n"Lesson,Unclosed');
  assert.equal(malformed.ok, false);
  assert.match(malformed.errors[0].message, /unclosed/i);
});

test("live slide payload never includes answer keys", () => {
  const slide = {
    type: "question",
    question: {
      prompt: "Which answer is correct?",
      options: [{ id: "a", text: "First" }, { id: "b", text: "Second" }],
      correctOptionId: "b",
      explanation: "The second choice is correct.",
    },
  };
  const safe = safeSlide(slide);
  assert.equal(safe.question.correctOptionId, undefined);
  assert.equal(safe.question.explanation, undefined);
});

test("answer key is kept separate from the student-safe slide", () => {
  const slide = {
    type: "question",
    question: {
      prompt: "Which answer is correct?",
      options: [{ id: "a", text: "First" }, { id: "b", text: "Second" }],
      correctOptionId: "b",
      explanation: "The second choice is correct.",
    },
  };
  const safe = safeSlide(slide);
  const teacherAnswer = {
    correctOptionId: slide.question.correctOptionId,
    explanation: slide.question.explanation,
  };
  assert.equal(safe.question.correctOptionId, undefined);
  assert.equal(teacherAnswer.correctOptionId, "b");
});

test("session roster uses the captured class list, including an empty roster", async () => {
  const students = await getSessionStudents({
    rosterCapturedAt: new Date(),
    rosterSnapshot: [],
    classId: "unused",
  });
  assert.deepEqual(students, []);
});

test("live event actors map authorized staff roles to teacher", () => {
  assert.equal(liveEventActorRole("teacher"), "teacher");
  assert.equal(liveEventActorRole("admin"), "teacher");
  assert.equal(liveEventActorRole("department_principal"), "teacher");
  assert.equal(liveEventActorRole("student"), "student");
  assert.equal(liveEventActorRole("system"), "system");
});
