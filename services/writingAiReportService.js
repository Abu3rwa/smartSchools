/**
 * Monthly quality and cost report for the Writing Assistant.
 *
 * Money comes from the credit ledger (`AiCreditEntry`), quality from the rows
 * each run wrote (`WritingAssessment`, `WritingAnalysis.pieceRuns`). Reading is
 * split from shaping: `shapeWritingAiReport` is pure, so the report logic is
 * testable without a database, and the readers stay three plain aggregations.
 */
import mongoose from "mongoose";

import WritingAssessment from "../models/WritingAssessment.js";
import WritingAnalysis from "../models/WritingAnalysis.js";
import AiCreditEntry from "../models/AiCreditEntry.js";

export const WRITING_AI_FEATURES = [
  "writing_feedback",
  "writing_comparison",
  "writing_analysis",
];
export const MAX_REPORT_MONTHS = 24;
export const DEFAULT_REPORT_MONTHS = 6;

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

/** The first instant of the window: `months` months back, counting this one. */
export const reportWindow = ({ months = DEFAULT_REPORT_MONTHS, now = new Date() } = {}) => {
  const requested = Math.floor(Number(months));
  const span = Number.isFinite(requested)
    ? Math.min(MAX_REPORT_MONTHS, Math.max(1, requested))
    : DEFAULT_REPORT_MONTHS;
  const end = new Date(now);
  const from = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (span - 1), 1),
  );
  return { months: span, from, to: end };
};

const emptyMonth = (month) => ({
  month,
  assessments: {
    done: 0,
    failed: 0,
    edited: 0,
    editRate: 0,
    tokens: 0,
    costCents: 0,
    averageLatencyMs: 0,
    costPerDraftCents: 0,
    byVersion: {},
    failuresByCode: {},
  },
  analyses: { runs: 0, done: 0, failed: 0, tokens: 0, costCents: 0 },
  ledger: {
    runs: 0,
    unusable: 0,
    chargedCents: 0,
    providerCostCents: 0,
    byFeature: {},
  },
  _latencyMs: 0,
});

const addAssessmentRow = (month, row) => {
  const count = Number(row.count) || 0;
  const version = row._id?.version || "unversioned";
  const byVersion = (month.assessments.byVersion[version] ||= {
    done: 0,
    failed: 0,
  });
  month.assessments.tokens += Number(row.totalTokens) || 0;
  month.assessments.costCents += Number(row.costCents) || 0;
  month._latencyMs += Number(row.latencyMs) || 0;

  if (row._id?.status === "done") {
    month.assessments.done += count;
    month.assessments.edited += Number(row.edited) || 0;
    byVersion.done += count;
    return;
  }
  if (row._id?.status === "failed") {
    month.assessments.failed += count;
    byVersion.failed += count;
    const code = row._id?.code || "INTERNAL";
    month.assessments.failuresByCode[code] =
      (month.assessments.failuresByCode[code] || 0) + count;
  }
};

const addAnalysisRow = (month, row) => {
  const count = Number(row.count) || 0;
  const status = row._id?.status || "";
  month.analyses.runs += count;
  month.analyses.tokens += Number(row.tokens) || 0;
  month.analyses.costCents += Number(row.costCents) || 0;
  if (status === "done") month.analyses.done += count;
  else if (status === "failed" || status === "unusable") {
    month.analyses.failed += count;
  }
};

const addLedgerRow = (month, row) => {
  const count = Number(row.count) || 0;
  const feature = row._id?.feature || "unknown";
  const byFeature = (month.ledger.byFeature[feature] ||= {
    runs: 0,
    chargedCents: 0,
  });
  month.ledger.runs += count;
  month.ledger.chargedCents += Number(row.chargedCents) || 0;
  month.ledger.providerCostCents += Number(row.costCents) || 0;
  byFeature.runs += count;
  byFeature.chargedCents += Number(row.chargedCents) || 0;
  // Every refused or retried reply leaves an unusable ledger row, so this is
  // the retry counter as well as the rejection counter.
  if (row._id?.outcome === "unusable") month.ledger.unusable += count;
};

const finish = (month) => {
  const done = month.assessments.done;
  month.assessments.editRate = done ? round(month.assessments.edited / done, 3) : 0;
  month.assessments.averageLatencyMs = done
    ? Math.round(month._latencyMs / done)
    : 0;
  month.assessments.costPerDraftCents = done
    ? round(month.assessments.costCents / done, 2)
    : 0;
  return month;
};

const totalsOf = (months) =>
  months.reduce(
    (sum, month) => {
      sum.assessments.done += month.assessments.done;
      sum.assessments.failed += month.assessments.failed;
      sum.assessments.edited += month.assessments.edited;
      sum.assessments.tokens += month.assessments.tokens;
      sum.assessments.costCents += month.assessments.costCents;
      sum.assessments.latencyMs += month._latencyMs;
      for (const [code, count] of Object.entries(month.assessments.failuresByCode)) {
        sum.assessments.failuresByCode[code] =
          (sum.assessments.failuresByCode[code] || 0) + count;
      }
      sum.analyses.runs += month.analyses.runs;
      sum.analyses.done += month.analyses.done;
      sum.analyses.failed += month.analyses.failed;
      sum.analyses.tokens += month.analyses.tokens;
      sum.analyses.costCents += month.analyses.costCents;
      sum.ledger.runs += month.ledger.runs;
      sum.ledger.unusable += month.ledger.unusable;
      sum.ledger.chargedCents += month.ledger.chargedCents;
      sum.ledger.providerCostCents += month.ledger.providerCostCents;
      return sum;
    },
    {
      assessments: {
        done: 0,
        failed: 0,
        edited: 0,
        tokens: 0,
        costCents: 0,
        latencyMs: 0,
        failuresByCode: {},
        editRate: 0,
        averageLatencyMs: 0,
        costPerDraftCents: 0,
      },
      analyses: { runs: 0, done: 0, failed: 0, tokens: 0, costCents: 0 },
      ledger: { runs: 0, unusable: 0, chargedCents: 0, providerCostCents: 0 },
    },
  );

/** Rows in, one report out. Every number is a sum of the rows given. */
export const shapeWritingAiReport = ({
  assessmentRows = [],
  analysisRows = [],
  ledgerRows = [],
} = {}) => {
  const months = new Map();
  const monthFor = (key) => {
    if (!months.has(key)) months.set(key, emptyMonth(key));
    return months.get(key);
  };

  for (const row of assessmentRows) addAssessmentRow(monthFor(row._id?.month), row);
  for (const row of analysisRows) addAnalysisRow(monthFor(row._id?.month), row);
  for (const row of ledgerRows) addLedgerRow(monthFor(row._id?.month), row);

  // Newest month first: the report is read from the top.
  const ordered = [...months.values()].map(finish).sort((a, b) => b.month.localeCompare(a.month));
  const totals = totalsOf(ordered);
  if (totals.assessments.done) {
    totals.assessments.editRate = round(
      totals.assessments.edited / totals.assessments.done,
      3,
    );
    totals.assessments.averageLatencyMs = Math.round(
      totals.assessments.latencyMs / totals.assessments.done,
    );
    totals.assessments.costPerDraftCents = round(
      totals.assessments.costCents / totals.assessments.done,
      2,
    );
  }
  delete totals.assessments.latencyMs;
  for (const month of ordered) delete month._latencyMs;
  return { months: ordered, totals };
};

const groupKey = (timeField, fields) => ({
  month: { $dateToString: { format: "%Y-%m", date: timeField } },
  ...fields,
});

const readAssessmentRows = ({ school, from, to }) =>
  WritingAssessment.aggregate([
    { $match: { ...(school ? { school } : {}), createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: groupKey("$createdAt", {
          status: "$aiStatus",
          code: "$aiErrorCode",
          version: "$promptVersion",
          kind: "$kind",
        }),
        count: { $sum: 1 },
        totalTokens: { $sum: { $ifNull: ["$usage.totalTokens", 0] } },
        costCents: { $sum: { $ifNull: ["$usage.costCents", 0] } },
        latencyMs: { $sum: { $ifNull: ["$usage.latencyMs", 0] } },
        edited: {
          $sum: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$teacherEdits.changedPaths", []] } }, 0] },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

const readAnalysisRows = ({ school, from, to }) =>
  WritingAnalysis.aggregate([
    { $match: { ...(school ? { school } : {}), createdAt: { $gte: from, $lte: to } } },
    { $unwind: "$pieceRuns" },
    {
      $group: {
        _id: groupKey("$createdAt", { status: "$pieceRuns.aiStatus" }),
        count: { $sum: 1 },
        tokens: { $sum: { $ifNull: ["$pieceRuns.tokens", 0] } },
        costCents: { $sum: { $ifNull: ["$pieceRuns.costCents", 0] } },
      },
    },
  ]);

const readLedgerRows = ({ school, from, to }) =>
  AiCreditEntry.aggregate([
    {
      $match: {
        ...(school ? { school } : {}),
        type: "usage",
        feature: { $in: WRITING_AI_FEATURES },
        createdAt: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: groupKey("$createdAt", {
          feature: "$feature",
          outcome: "$outcome",
        }),
        count: { $sum: 1 },
        chargedCents: { $sum: { $ifNull: ["$chargedCents", 0] } },
        costCents: { $sum: { $ifNull: ["$costCents", 0] } },
      },
    },
  ]);

/**
 * `schoolId` empty means every school (platform view). A school id narrows the
 * same report; the route decides who may pass which.
 */
export const getWritingAiReport = async ({
  schoolId = "",
  months = DEFAULT_REPORT_MONTHS,
  now = new Date(),
} = {}) => {
  const window = reportWindow({ months, now });
  let school = null;
  if (schoolId) {
    if (!mongoose.isValidObjectId(schoolId)) {
      throw badRequest("Choose a school from the list.");
    }
    school = new mongoose.Types.ObjectId(String(schoolId));
  }
  const scope = { school, from: window.from, to: window.to };
  const [assessmentRows, analysisRows, ledgerRows] = await Promise.all([
    readAssessmentRows(scope),
    readAnalysisRows(scope),
    readLedgerRows(scope),
  ]);
  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    ...shapeWritingAiReport({ assessmentRows, analysisRows, ledgerRows }),
  };
};
