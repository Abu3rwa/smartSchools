import test from "node:test";
import assert from "node:assert/strict";
import { LIVE_LESSON_CSV_TEMPLATE as CLIENT_LIVE_LESSON_CSV_TEMPLATE } from "../client/src/pages/liveLessons/liveLessonCsvTemplate.js";
import {
  LIVE_LESSON_CSV_TEMPLATE,
  parseLiveLessonCsv,
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
  assert.equal(result.ok, true);
  assert.equal(result.lesson.title, "Figurative Language");
  assert.equal(result.lesson.slides.length, 7);
  assert.equal(result.lesson.slides[0].type, "opening");
  assert.equal(result.lesson.slides.at(-1).type, "exit-ticket");
  const question = result.lesson.slides.find((slide) => slide.question)?.question;
  assert.equal(question.kind, "mcq");
  assert.equal(question.correctOptionId, "b");
  assert.equal(question.options[1].text, "Metaphor");
});

test("downloadable HTML CSV template passes the server importer", () => {
  const result = parseLiveLessonCsv(CLIENT_LIVE_LESSON_CSV_TEMPLATE);
  assert.equal(result.ok, true);
  assert.equal(result.lesson.slides.length, 2);
  assert.equal(result.lesson.slides[0].type, "html");
  assert.equal(result.lesson.slides[1].question.kind, "mcq");
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
