import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveStudentAssignmentCard,
  isAssessmentAssignment,
  resolveProgressPercent,
} from "../client/src/pages/student/assignments/StudentMyAssignmentsPage/utils/studentAssignmentProgress.js";

const practiceId = "6af075f7d1712618b41696bd";
const base = {
  _id: "assignment-1",
  practiceAssignmentId: practiceId,
  title: "Fractions practice",
  assignmentType: { key: "practice" },
};

test("an excused assignment offers no action", () => {
  const card = deriveStudentAssignmentCard({
    ...base,
    studentProgress: { state: "excused" },
  });

  assert.equal(card.state, "excused");
  assert.equal(card.actionKey, null);
  assert.equal(card.actionType, "none");
  assert.equal(card.destination, "/portal/my-assignments/assignment-1");
});

test("a closed assignment opens the detail with a view action", () => {
  const card = deriveStudentAssignmentCard({ ...base, status: "closed" });

  assert.equal(card.state, "closed");
  assert.equal(card.actionType, "detail");
  assert.equal(card.actionKey, "student.actions.view");
});

test("a google form in progress opens the saved submission, not the form again", () => {
  const openForm = deriveStudentAssignmentCard({
    ...base,
    googleForm: { responderUri: "https://docs.google.com/forms/d/e/abc/viewform" },
    studentProgress: { state: "not_started" },
  });
  assert.equal(openForm.actionType, "external");
  assert.equal(openForm.actionKey, "student.actions.open_form");

  const inProgress = deriveStudentAssignmentCard({
    ...base,
    googleForm: { responderUri: "https://docs.google.com/forms/d/e/abc/viewform" },
    studentProgress: { state: "submitted" },
  });
  assert.equal(inProgress.actionType, "detail");
  assert.equal(inProgress.actionKey, "student.actions.view_submission");

  const graded = deriveStudentAssignmentCard({
    ...base,
    googleForm: { responderUri: "https://docs.google.com/forms/d/e/abc/viewform" },
    studentProgress: { state: "graded" },
  });
  assert.equal(graded.actionKey, "student.actions.view_results");
});

test("a released assessment links to the results page", () => {
  const card = deriveStudentAssignmentCard({
    ...base,
    practiceConfig: { sessionType: "assessment" },
    studentProgress: { state: "released", score: 8, maxScore: 10 },
  });

  assert.equal(isAssessmentAssignment({ ...base, practiceConfig: { sessionType: "assessment" } }), true);
  assert.equal(card.actionKey, "student.actions.view_results");
  assert.equal(card.actionType, "results");
  assert.equal(card.destination, `/portal/my-assignments/${practiceId}/results`);
  assert.equal(card.progressPercent, 80);
});

test("an unreleased assessment opens the detail while results stay hidden", () => {
  const card = deriveStudentAssignmentCard({
    ...base,
    practiceConfig: { sessionType: "assessment" },
    studentProgress: { state: "awaiting_release" },
  });

  assert.equal(card.actionKey, "student.actions.view");
  assert.equal(card.actionType, "detail");
  assert.equal(card.destination, "/portal/my-assignments/assignment-1");
});

test("in-progress practice continues the session and mastered practice shows history", () => {
  const inProgress = deriveStudentAssignmentCard({
    ...base,
    practiceConfig: { sessionType: "practice" },
    studentProgress: { state: "in_progress" },
  });
  assert.equal(inProgress.actionKey, "student.actions.continue");
  assert.equal(inProgress.destination, `/portal/practice/${practiceId}`);

  const review = deriveStudentAssignmentCard({
    ...base,
    practiceConfig: { sessionType: "practice" },
    studentProgress: { state: "needs_review" },
  });
  assert.equal(review.actionKey, "student.actions.review");
  assert.equal(review.destination, `/portal/practice/${practiceId}`);

  const mastered = deriveStudentAssignmentCard({
    ...base,
    practiceConfig: { sessionType: "practice" },
    studentProgress: { state: "mastered" },
  });
  assert.equal(mastered.actionKey, "student.actions.view_result");
  assert.equal(mastered.destination, `/portal/practice/${practiceId}/history`);
});

test("progress percent prefers mastery, then score, then the question limit", () => {
  assert.equal(resolveProgressPercent({}, { masteryPercent: 45 }), 45);
  assert.equal(resolveProgressPercent({}, { score: 3, maxScore: 4 }), 75);
  assert.equal(resolveProgressPercent({}, { answeredCount: 3, questionLimit: 10 }), 30);
  assert.equal(resolveProgressPercent({}, {}), null);
});

test("sync metadata is only reported for a real server sync state", () => {
  const pending = deriveStudentAssignmentCard({
    ...base,
    studentProgress: { state: "awaiting_review", syncStatus: "awaiting" },
  });
  assert.deepEqual(pending.sync, { key: "student.sync.awaiting_sync" });

  const failed = deriveStudentAssignmentCard({
    ...base,
    studentProgress: { state: "awaiting_review", syncStatus: "failed" },
  });
  assert.deepEqual(failed.sync, { key: "student.sync.sync_failed" });

  const synced = deriveStudentAssignmentCard({
    ...base,
    studentProgress: {
      state: "graded",
      syncStatus: "synced",
      lastSyncedAt: "2026-11-08T10:00:00.000Z",
    },
  });
  assert.equal(synced.sync.key, "student.sync.last_synced");
  assert.equal(synced.sync.time, "2026-11-08T10:00:00.000Z");

  const none = deriveStudentAssignmentCard({
    ...base,
    studentProgress: { state: "graded" },
  });
  assert.equal(none.sync, null);
});
