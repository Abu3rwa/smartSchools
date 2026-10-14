import test from "node:test";
import assert from "node:assert/strict";
import Grade from "../models/Grade.js";
import { calculateLiveSessionMark } from "../services/liveSessionGradebookService.js";

test("live session grade uses correct answers from the presented question set", () => {
  assert.deepEqual(calculateLiveSessionMark({
    correctAnswers: 3,
    questionCount: 4,
    maxMarks: 10,
    visibilityIncidents: 0,
    deductionPerIncident: 0,
  }), {
    baseMarks: 7.5,
    behaviorDeduction: 0,
    marks: 7.5,
  });
});

test("hidden-tab deduction is optional and applied per recorded incident", () => {
  assert.equal(calculateLiveSessionMark({
    correctAnswers: 4,
    questionCount: 4,
    maxMarks: 10,
    visibilityIncidents: 3,
    deductionPerIncident: 0.5,
  }).marks, 8.5);
  assert.equal(calculateLiveSessionMark({
    correctAnswers: 4,
    questionCount: 4,
    maxMarks: 10,
    visibilityIncidents: 2,
    deductionPerIncident: 1,
  }).marks, 8);
});

test("behavior deductions cannot make a live session grade negative", () => {
  assert.deepEqual(calculateLiveSessionMark({
    correctAnswers: 1,
    questionCount: 10,
    maxMarks: 10,
    visibilityIncidents: 5,
    deductionPerIncident: 1,
  }), {
    baseMarks: 1,
    behaviorDeduction: 1,
    marks: 0,
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
