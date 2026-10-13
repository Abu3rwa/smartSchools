import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVE_LESSON_CSV_TEMPLATE,
  parseLiveLessonCsv,
} from "../services/liveLessonCsvService.js";
import {
  getSessionStudents,
  liveEventActorRole,
  safeSlide,
} from "../services/liveLessonService.js";

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
