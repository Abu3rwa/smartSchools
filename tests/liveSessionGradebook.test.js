import test from "node:test";
import assert from "node:assert/strict";
import Grade from "../models/Grade.js";
import {
  calculateLiveSessionMark,
  effectiveAnswerMarks,
  LIVE_DEFAULT_QUESTION_MARKS,
} from "../services/liveSessionGradebookService.js";

test("live session grade uses earned credit over the questions that have a verdict", () => {
  assert.deepEqual(calculateLiveSessionMark({
    credits: [1, 1, 1, 0],
    maxMarks: 10,
    visibilityIncidents: 0,
    deductionPerIncident: 0,
  }), {
    baseMarks: 7.5,
    behaviorDeduction: 0,
    marks: 7.5,
    countedQuestions: 4,
    pendingQuestions: 0,
  });
});

test("partial credit from the objective engines and the teacher's marks both count", () => {
  // Half a matching question plus a whole MCQ plus a third of a paragraph out of 8 marks.
  assert.equal(calculateLiveSessionMark({
    credits: [0.5, 1, 0.25, 0],
    maxMarks: 8,
    visibilityIncidents: 0,
    deductionPerIncident: 0,
  }).baseMarks, 3.5);
});

test("an answer still waiting to be marked is left out of both sides of the divide", () => {
  const score = calculateLiveSessionMark({
    credits: [1, null, 0, null],
    maxMarks: 10,
    visibilityIncidents: 0,
    deductionPerIncident: 0,
  });
  assert.equal(score.countedQuestions, 2);
  assert.equal(score.pendingQuestions, 2);
  assert.equal(score.baseMarks, 5);
  assert.equal(calculateLiveSessionMark({
    credits: [null, null],
    maxMarks: 10,
    visibilityIncidents: 0,
    deductionPerIncident: 0,
  }).baseMarks, 0);
});

test("hidden-tab deduction is optional and applied per recorded incident", () => {
  assert.equal(calculateLiveSessionMark({
    credits: [1, 1, 1, 1],
    maxMarks: 10,
    visibilityIncidents: 3,
    deductionPerIncident: 0.5,
  }).marks, 8.5);
  assert.equal(calculateLiveSessionMark({
    credits: [1, 1, 1, 1],
    maxMarks: 10,
    visibilityIncidents: 2,
    deductionPerIncident: 1,
  }).marks, 8);
});

test("behavior deductions cannot make a live session grade negative", () => {
  assert.deepEqual(calculateLiveSessionMark({
    credits: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    maxMarks: 10,
    visibilityIncidents: 5,
    deductionPerIncident: 1,
  }), {
    baseMarks: 1,
    behaviorDeduction: 1,
    marks: 0,
    countedQuestions: 10,
    pendingQuestions: 0,
  });
});

test("live session grades have a unique session/student reference and source type", () => {
  const sessionStudentIndex = Grade.schema.indexes().find(([keys]) => (
    keys.school === 1 && keys.liveSession === 1 && keys.student === 1
  ));
  assert.equal(sessionStudentIndex[1].unique, true);
  assert.equal(sessionStudentIndex[1].partialFilterExpression.liveSession.$type, "objectId");
  assert.ok(Grade.schema.path("gradingSource").enumValues.includes("live_session"));
});

test("a teacher's grade outranks what the engines settled", () => {
  assert.deepEqual(effectiveAnswerMarks({
    response: { grade: { status: "graded", marks: 5, maxMarks: 8 }, isCorrect: false },
    allocation: 2,
  }), { marks: 5, maxMarks: 8, marksSource: "teacher" });
});

test("an auto-graded answer earns its credit against the question's allocation", () => {
  assert.deepEqual(effectiveAnswerMarks({
    response: { isCorrect: true, score: 1 },
    allocation: 4,
  }), { marks: 4, maxMarks: 4, marksSource: "auto" });
  // Half credit from a multi-select is half the question.
  assert.deepEqual(effectiveAnswerMarks({
    response: { isCorrect: false, score: 0.5 },
    allocation: 2,
  }), { marks: 1, maxMarks: 2, marksSource: "auto" });
});

test("a correct answer with no allocation keeps the default question mark", () => {
  assert.deepEqual(effectiveAnswerMarks({ response: { isCorrect: true, score: 1 } }), {
    marks: LIVE_DEFAULT_QUESTION_MARKS,
    maxMarks: LIVE_DEFAULT_QUESTION_MARKS,
    marksSource: "auto",
  });
});

test("a wrong auto-graded answer earns a zero instead of a blank", () => {
  assert.deepEqual(effectiveAnswerMarks({
    response: { isCorrect: false, score: 0 },
    allocation: 2,
  }), { marks: 0, maxMarks: 2, marksSource: "auto" });
});

test("an answer waiting for the teacher has no mark yet", () => {
  assert.deepEqual(effectiveAnswerMarks({ response: { isCorrect: null }, allocation: 2 }), {
    marks: null,
    maxMarks: null,
    marksSource: null,
  });
  assert.deepEqual(effectiveAnswerMarks({ response: null, allocation: 2 }), {
    marks: null,
    maxMarks: null,
    marksSource: null,
  });
});
