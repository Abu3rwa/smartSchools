import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readLocale = (locale, namespace) =>
  JSON.parse(
    fs.readFileSync(
      new URL(
        `../client/src/i18n/locales/${locale}/${namespace}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

const flattenKeys = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

const assertParity = (namespace) => {
  const en = new Set(flattenKeys(readLocale("en", namespace)));
  const ar = new Set(flattenKeys(readLocale("ar", namespace)));

  const missingInAr = [...en].filter((key) => !ar.has(key));
  const missingInEn = [...ar].filter((key) => !en.has(key));

  assert.deepEqual(missingInAr, [], `${namespace}: keys missing in ar`);
  assert.deepEqual(missingInEn, [], `${namespace}: keys missing in en`);
};

test("student assignments translations keep EN/AR parity", () => {
  assertParity("assignments");
});

test("student practice translations keep EN/AR parity", () => {
  assertParity("studentPractice");
});

test("the student assignment card uses the documented state, action and sync keys", () => {
  const en = readLocale("en", "assignments");
  const required = [
    "student.status.not_started",
    "student.status.in_progress",
    "student.status.submitted",
    "student.status.graded",
    "student.status.released",
    "student.status.awaiting_release",
    "student.status.awaiting_review",
    "student.status.sync_failed",
    "student.status.excused",
    "student.status.closed",
    "student.status.mastered",
    "student.status.needs_review",
    "student.status.completed",
    "student.actions.start",
    "student.actions.continue",
    "student.actions.view",
    "student.actions.view_result",
    "student.actions.view_results",
    "student.actions.open_form",
    "student.actions.view_submission",
    "student.actions.start_assessment",
    "student.actions.review",
    "student.filters.subject",
    "student.filters.allSubjects",
    "student.filters.subjectFallback",
    "student.resultAvailability.released_now",
    "student.resultAvailability.awaiting_review",
    "student.sync.awaiting_sync",
    "student.sync.sync_failed",
    "student.sync.last_synced",
  ];

  const enKeys = new Set(flattenKeys(en));
  const missing = required.filter((key) => !enKeys.has(key));
  assert.deepEqual(missing, [], "missing student assignment keys");
});

test("the practice feedback screen has localized result, retry and finalize copy", () => {
  const en = readLocale("en", "studentPractice");
  const required = [
    "session.feedback.correctTitle",
    "session.feedback.incorrectTitle",
    "session.feedback.submittedTitle",
    "session.feedback.resultsWithheld",
    "session.feedback.nextQuestion",
    "session.feedback.submitFinal",
    "session.answerForm.submit",
    "session.answerForm.retrySubmit",
    "session.answerForm.submitFailed",
    "session.errors.tryAgain",
    "history.back",
    "results.title",
  ];

  const enKeys = new Set(flattenKeys(en));
  const missing = required.filter((key) => !enKeys.has(key));
  assert.deepEqual(missing, [], "missing student practice keys");
});
