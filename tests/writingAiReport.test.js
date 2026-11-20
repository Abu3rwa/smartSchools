import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REPORT_MONTHS,
  MAX_REPORT_MONTHS,
  getWritingAiReport,
  reportWindow,
  shapeWritingAiReport,
} from "../services/writingAiReportService.js";

const assessmentRow = (values = {}) => ({
  _id: {
    month: "2026-11",
    status: "done",
    code: "",
    version: "feedback-2026-11-16.1",
    kind: "feedback",
  },
  count: 1,
  totalTokens: 0,
  costCents: 0,
  latencyMs: 0,
  edited: 0,
  ...values,
});

test("the report window counts this month and clamps the span", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const window = reportWindow({ months: 3, now });
  assert.equal(window.months, 3);
  assert.equal(window.from.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(window.to.toISOString(), "2026-11-16T12:00:00.000Z");
  assert.equal(reportWindow({ months: 0, now }).months, 1);
  assert.equal(reportWindow({ months: 999, now }).months, MAX_REPORT_MONTHS);
  assert.equal(reportWindow({ months: "abc", now }).months, DEFAULT_REPORT_MONTHS);
});

test("an empty window is a zero report, not an error", () => {
  const report = shapeWritingAiReport();
  assert.deepEqual(report.months, []);
  assert.equal(report.totals.assessments.done, 0);
  assert.equal(report.totals.assessments.editRate, 0);
  assert.equal(report.totals.ledger.chargedCents, 0);
});

test("months are newest first and a month sums its runs", () => {
  const report = shapeWritingAiReport({
    assessmentRows: [
      assessmentRow({
        count: 3,
        totalTokens: 3000,
        costCents: 12,
        latencyMs: 9000,
        edited: 1,
      }),
      assessmentRow({
        _id: {
          month: "2026-10",
          status: "failed",
          code: "AI_TIMEOUT",
          version: "feedback-2026-11-16.1",
          kind: "feedback",
        },
        count: 2,
      }),
    ],
  });
  assert.deepEqual(
    report.months.map((row) => row.month),
    ["2026-11", "2026-10"],
  );
  const [november, october] = report.months;
  assert.equal(november.assessments.done, 3);
  assert.equal(november.assessments.edited, 1);
  assert.equal(november.assessments.editRate, 0.333);
  assert.equal(november.assessments.tokens, 3000);
  assert.equal(november.assessments.costCents, 12);
  assert.equal(november.assessments.averageLatencyMs, 3000);
  assert.equal(november.assessments.costPerDraftCents, 4);
  assert.equal(october.assessments.failed, 2);
  assert.deepEqual(october.assessments.failuresByCode, { AI_TIMEOUT: 2 });
});

test("quality counters are tagged by prompt version", () => {
  const report = shapeWritingAiReport({
    assessmentRows: [
      assessmentRow({
        _id: {
          month: "2026-11",
          status: "done",
          code: "",
          version: "feedback-v1",
          kind: "feedback",
        },
        count: 2,
      }),
      assessmentRow({
        _id: {
          month: "2026-11",
          status: "failed",
          code: "AI_CONTENT_REJECTED",
          version: "feedback-v2",
          kind: "feedback",
        },
        count: 1,
      }),
    ],
  });
  assert.deepEqual(report.months[0].assessments.byVersion, {
    "feedback-v1": { done: 2, failed: 0 },
    "feedback-v2": { done: 0, failed: 1 },
  });
  assert.deepEqual(report.months[0].assessments.failuresByCode, {
    AI_CONTENT_REJECTED: 1,
  });
});

test("analyses and the credit ledger roll into the same month", () => {
  const report = shapeWritingAiReport({
    analysisRows: [
      { _id: { month: "2026-11", status: "done" }, count: 2, tokens: 5000, costCents: 8 },
      { _id: { month: "2026-11", status: "unusable" }, count: 1, tokens: 800, costCents: 1 },
    ],
    ledgerRows: [
      {
        _id: { month: "2026-11", feature: "writing_feedback", outcome: "done" },
        count: 4,
        chargedCents: 20,
        costCents: 12,
      },
      {
        _id: { month: "2026-11", feature: "writing_feedback", outcome: "unusable" },
        count: 1,
        chargedCents: 0,
        costCents: 1,
      },
    ],
  });
  const month = report.months[0];
  assert.equal(month.analyses.runs, 3);
  assert.equal(month.analyses.done, 2);
  assert.equal(month.analyses.failed, 1);
  assert.equal(month.analyses.tokens, 5800);
  assert.equal(month.analyses.costCents, 9);
  assert.equal(month.ledger.runs, 5);
  assert.equal(month.ledger.unusable, 1);
  assert.equal(month.ledger.chargedCents, 20);
  assert.equal(month.ledger.providerCostCents, 13);
  assert.deepEqual(month.ledger.byFeature.writing_feedback, {
    runs: 5,
    chargedCents: 20,
  });
});

test("totals weight latency by the number of runs, not by month", () => {
  const report = shapeWritingAiReport({
    assessmentRows: [
      assessmentRow({ count: 1, latencyMs: 1000 }),
      assessmentRow({
        _id: {
          month: "2026-10",
          status: "done",
          code: "",
          version: "feedback-2026-11-16.1",
          kind: "feedback",
        },
        count: 3,
        latencyMs: 9000,
      }),
    ],
  });
  assert.equal(report.totals.assessments.done, 4);
  assert.equal(report.totals.assessments.averageLatencyMs, 2500);
  assert.equal(report.totals.analyses.runs, 0);
});

test("an unknown school id is a 400 before any query runs", async () => {
  await assert.rejects(
    () => getWritingAiReport({ schoolId: "not-an-id" }),
    (error) => error.statusCode === 400,
  );
});
