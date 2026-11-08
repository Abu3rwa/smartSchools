import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePracticeStatusAfterSubmit,
  shouldShowPracticeFeedback,
} from "../client/src/utils/practiceFeedbackState.js";

test("a normal answer enters feedback instead of auto-advancing", () => {
  assert.equal(
    resolvePracticeStatusAfterSubmit({ isCorrect: true, sessionComplete: false }),
    "feedback",
  );
  assert.equal(
    resolvePracticeStatusAfterSubmit({ isCorrect: false, sessionComplete: false }),
    "feedback",
  );
});

test("a hidden assessment result still enters feedback", () => {
  assert.equal(
    resolvePracticeStatusAfterSubmit({
      isCorrect: null,
      resultsVisible: false,
      requiresTeacherReview: false,
      sessionComplete: false,
    }),
    "feedback",
  );
});

test("completing the session keeps the feedback for the finalize action", () => {
  assert.equal(
    resolvePracticeStatusAfterSubmit({ sessionComplete: true, newlyMastered: true }),
    "session_complete",
  );
});

test("newly mastered practice ends on the mastery state", () => {
  assert.equal(
    resolvePracticeStatusAfterSubmit({ sessionComplete: false, newlyMastered: true }),
    "mastered",
  );
});

test("feedback stays visible until the next question is actually being loaded", () => {
  const result = { isCorrect: true };

  assert.equal(shouldShowPracticeFeedback(result, false), true);
  assert.equal(shouldShowPracticeFeedback(result, true), false);
  assert.equal(shouldShowPracticeFeedback(null, false), false);
  assert.equal(shouldShowPracticeFeedback(null, true), false);
});
