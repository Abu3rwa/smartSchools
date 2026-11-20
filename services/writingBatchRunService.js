/**
 * Batch assessment as a durable run (F3).
 *
 * The start request creates a WritingBatchRun and returns at once; the run is
 * then processed in the background, one draft at a time. The teacher polls the
 * run for live progress, can cancel before the next draft starts, and can retry
 * failed drafts without touching the ones that already succeeded.
 *
 * Every AI call still goes through assessDraft in the assessment service; this
 * file never reaches the provider itself.
 */
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingBatchRun from "../models/WritingBatchRun.js";
import WritingProject from "../models/WritingProject.js";
import WritingAssessment from "../models/WritingAssessment.js";
import Student from "../models/Student.js";
import { isCreditError } from "./aiCreditService.js";
import { assertWritingCredit } from "./writingFailureAlertService.js";
import { aiFailureCodeOf } from "./aiFailureCodes.js";
import { assessDraft } from "./writingAssistantAssessmentService.js";

/** Q7: one batch never takes more than ten drafts. */
export const MAX_BATCH_ITEMS = 10;
/** Same window as a stale assessment run: past this the runner is dead. */
export const BATCH_STALE_MS = 5 * 60 * 1000;
export const DEFAULT_ESTIMATE_CENTS = 2;
const ESTIMATE_WINDOW_DAYS = 60;
const ESTIMATE_SAMPLE = 50;

const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) =>
  Object.assign(new Error(message), { statusCode: 409 });

const sameId = (left, right) =>
  Boolean(left && right) && String(left) === String(right);
const objectId = (value) =>
  mongoose.isValidObjectId(String(value || "")) ? String(value) : null;

/** Runs this process is already working on; a retry cannot start a second one. */
const activeRuns = new Set();

const assertOwner = (assignment, userId, isAdmin) => {
  if (isAdmin || sameId(assignment?.assignedBy, userId)) return;
  throw forbidden(
    "Only the teacher who created this writing task or a school admin can assess it.",
  );
};

const itemCap = (limit) => {
  const requested = Math.floor(Number(limit));
  const value = Number.isFinite(requested) ? requested : MAX_BATCH_ITEMS;
  return Math.min(Math.max(value, 1), MAX_BATCH_ITEMS);
};

const waitingFilter = ({ schoolId, assignmentId, classId }) => {
  const filter = {
    school: schoolId,
    assignment: assignmentId,
    stage: "submitted",
  };
  if (objectId(classId)) filter.class = classId;
  return filter;
};

/**
 * The estimate is the average cost of this school's recent finished
 * assessments. Charges still follow real token use; this only sets the number
 * the teacher confirms.
 */
export const estimatePerDraftCents = (
  rows = [],
  fallback = DEFAULT_ESTIMATE_CENTS,
) => {
  const values = (rows || [])
    .map((row) => Number(row?.usage?.costCents))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return fallback;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const estimateFor = async ({ schoolId, drafts }) => {
  const rows = await WritingAssessment.find({
    school: schoolId,
    kind: "feedback",
    aiStatus: "done",
    createdAt: {
      $gte: new Date(Date.now() - ESTIMATE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    },
  })
    .sort({ createdAt: -1 })
    .limit(ESTIMATE_SAMPLE)
    .select("usage.costCents")
    .lean();
  const perDraftCents = estimatePerDraftCents(rows);
  return {
    drafts,
    perDraftCents,
    totalCents: perDraftCents * drafts,
    basis: rows.length ? "recent" : "default",
  };
};

/** Counts per status, plus the shape the board polls. Pure, so it is testable. */
export const summarizeRun = (run = {}) => {
  const items = (run.items || []).map((item) => ({
    projectId: String(item.project),
    studentId: String(item.student),
    studentName: item.studentName || "",
    status: item.status,
    code: item.code || "",
    error: item.error || "",
    assessmentId: item.assessment ? String(item.assessment) : "",
  }));
  const count = (status) => items.filter((row) => row.status === status).length;
  return {
    id: String(run._id),
    assignmentId: String(run.assignment),
    status: run.status,
    cancelRequested: Boolean(run.cancelRequested),
    stoppedReason: run.stoppedReason || "",
    estimate:
      run.estimate || { drafts: items.length, perDraftCents: 0, totalCents: 0, basis: "" },
    totals: {
      drafts: items.length,
      done: count("done"),
      failed: count("failed"),
      skipped: count("skipped"),
      pending: count("pending"),
      running: count("running"),
      finished: count("done") + count("failed") + count("skipped"),
    },
    startedAt: run.createdAt || null,
    finishedAt: run.status === "running" ? null : run.updatedAt || null,
    items,
  };
};

const staleBefore = () => new Date(Date.now() - BATCH_STALE_MS);

/**
 * A run whose process died stays "running" in the database. The first read
 * after the window marks it interrupted and puts its in-flight item back in
 * the queue, so a resume works.
 */
const interruptIfStale = async ({ schoolId, batchRunId }) => {
  const interrupted = await WritingBatchRun.findOneAndUpdate(
    {
      school: schoolId,
      _id: batchRunId,
      status: "running",
      updatedAt: { $lt: staleBefore() },
    },
    {
      $set: {
        status: "interrupted",
        "items.$[stuck].status": "pending",
        "items.$[stuck].startedAt": null,
      },
    },
    { arrayFilters: [{ "stuck.status": "running" }], new: true },
  ).lean();
  return interrupted;
};

const loadRun = async ({ schoolId, batchRunId }) => {
  const id = objectId(batchRunId);
  if (!id) throw notFound("Batch run not found.");
  const run = await WritingBatchRun.findOne({ school: schoolId, _id: id });
  if (!run) throw notFound("Batch run not found.");
  if (run.status === "running" && run.updatedAt < staleBefore()) {
    const interrupted = await interruptIfStale({ schoolId, batchRunId: id });
    if (interrupted) return interrupted;
    return WritingBatchRun.findOne({ school: schoolId, _id: id }).lean();
  }
  return run;
};

const assertRunVisible = (run, userId, isAdmin) => {
  if (isAdmin || sameId(run.requestedBy, userId)) return;
  throw forbidden("Only the teacher who started this batch can see it.");
};

/* ------------------------------------------------------------------ */
/* Reading and previewing                                              */
/* ------------------------------------------------------------------ */

export const previewBatch = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  classId = "",
  limit = MAX_BATCH_ITEMS,
} = {}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");
  assertOwner(assignment, userId, isAdmin);

  const filter = waitingFilter({
    schoolId,
    assignmentId: assignment._id,
    classId,
  });
  const [waiting, drafts] = await Promise.all([
    WritingProject.countDocuments(filter),
    WritingProject.find(filter)
      .sort({ updatedAt: 1 })
      .limit(itemCap(limit))
      .select("_id student")
      .lean(),
  ]);
  const estimate = await estimateFor({ schoolId, drafts: drafts.length });
  return {
    started: false,
    drafts: drafts.length,
    waiting,
    estimate,
  };
};

export const getBatchRun = async ({
  schoolId,
  userId,
  isAdmin = false,
  batchRunId,
} = {}) => {
  const run = await loadRun({ schoolId, batchRunId });
  assertRunVisible(run, userId, isAdmin);
  return summarizeRun(run);
};

/** The newest run for a task, so a reloaded board still shows progress. */
export const latestBatchRun = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
} = {}) => {
  const id = objectId(assignmentId);
  if (!id) return null;
  const filter = { school: schoolId, assignment: id };
  // A teacher sees their own runs; an admin sees the latest run of any teacher.
  if (!isAdmin) filter.requestedBy = userId;
  const run = await WritingBatchRun.findOne(filter)
    .sort({ createdAt: -1 })
    .lean();
  if (!run) return null;
  if (run.status === "running" && run.updatedAt < staleBefore()) {
    const interrupted = await interruptIfStale({ schoolId, batchRunId: run._id });
    return summarizeRun(interrupted || run);
  }
  return summarizeRun(run);
};

/* ------------------------------------------------------------------ */
/* Starting, cancelling and retrying                                   */
/* ------------------------------------------------------------------ */

export const startBatch = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  classId = "",
  limit = MAX_BATCH_ITEMS,
  language = "",
  confirm = false,
} = {}) => {
  if (!confirm) {
    return previewBatch({
      schoolId,
      assignmentId,
      userId,
      isAdmin,
      classId,
      limit,
    });
  }

  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");
  assertOwner(assignment, userId, isAdmin);

  // Two batches on one task would race for the same drafts and the same
  // teacher's attention. A dead run does not block the next one.
  const running = await WritingBatchRun.findOne({
    school: schoolId,
    assignment: assignment._id,
    status: "running",
  }).lean();
  if (running) {
    if (running.updatedAt >= staleBefore())
      throw conflict("A batch is already running for this task.");
    await interruptIfStale({ schoolId, batchRunId: running._id });
  }

  const filter = waitingFilter({
    schoolId,
    assignmentId: assignment._id,
    classId,
  });
  const waiting = await WritingProject.find(filter)
    .sort({ updatedAt: 1 })
    .limit(itemCap(limit))
    .select("_id student latestDraft")
    .lean();
  if (!waiting.length) {
    return { started: false, drafts: 0, waiting: 0, estimate: null };
  }

  await assertWritingCredit({ schoolId, userId });

  const students = await Student.find({
    school: schoolId,
    _id: { $in: waiting.map((row) => row.student) },
  })
    .select("firstName lastName")
    .lean();
  const nameOf = (studentId) => {
    const student = students.find((row) => sameId(row._id, studentId));
    return student
      ? `${student.firstName || ""} ${student.lastName || ""}`.trim()
      : "";
  };

  const estimate = await estimateFor({ schoolId, drafts: waiting.length });
  const run = await WritingBatchRun.create({
    school: schoolId,
    assignment: assignment._id,
    requestedBy: userId,
    requestedByAdmin: Boolean(isAdmin),
    status: "running",
    language: String(language || "").trim().toLowerCase().slice(0, 8),
    estimate,
    items: waiting.map((project) => ({
      project: project._id,
      student: project.student,
      studentName: nameOf(project.student),
      draft: project.latestDraft || null,
      status: "pending",
    })),
  });

  void processRun(run._id);
  return { started: true, ...summarizeRun(run.toObject()) };
};

export const cancelBatchRun = async ({
  schoolId,
  userId,
  isAdmin = false,
  batchRunId,
} = {}) => {
  const run = await loadRun({ schoolId, batchRunId });
  assertRunVisible(run, userId, isAdmin);
  if (run.status !== "running") return summarizeRun(run);
  const updated = await WritingBatchRun.findOneAndUpdate(
    { school: schoolId, _id: run._id, status: "running" },
    { $set: { cancelRequested: true } },
    { new: true },
  ).lean();
  // The runner stops before the next item; already-running work still lands.
  return summarizeRun(updated || run);
};

/**
 * One action covers both cases the teacher cares about after a run stops:
 * failed items go back in the queue, and pending items left by a cancel,
 * credit stop or restart continue. Finished items are never run again.
 */
export const retryBatchRun = async ({
  schoolId,
  userId,
  isAdmin = false,
  batchRunId,
} = {}) => {
  const run = await loadRun({ schoolId, batchRunId });
  assertRunVisible(run, userId, isAdmin);
  if (run.status === "running")
    throw conflict("This batch is still running. Cancel it before retrying.");

  const failed = (run.items || []).filter((row) => row.status === "failed").length;
  const pending = (run.items || []).filter((row) => row.status === "pending").length;
  if (!failed && !pending) return { ...summarizeRun(run), requeued: 0 };

  await assertWritingCredit({ schoolId, userId });
  const claimed = await WritingBatchRun.findOneAndUpdate(
    { school: schoolId, _id: run._id, status: { $ne: "running" } },
    {
      $set: {
        status: "running",
        cancelRequested: false,
        stoppedReason: "",
        "items.$[failed].status": "pending",
        "items.$[failed].code": "",
        "items.$[failed].error": "",
        "items.$[failed].startedAt": null,
        "items.$[failed].finishedAt": null,
        "items.$[stuck].status": "pending",
        "items.$[stuck].startedAt": null,
      },
    },
    {
      arrayFilters: [
        { "failed.status": "failed" },
        { "stuck.status": "running" },
      ],
      new: true,
    },
  ).lean();
  if (!claimed) throw conflict("This batch is still running. Cancel it before retrying.");

  void processRun(claimed._id);
  return { ...summarizeRun(claimed), requeued: failed };
};

/* ------------------------------------------------------------------ */
/* The background runner                                               */
/* ------------------------------------------------------------------ */

const setItem = async ({ runId, index, fields }) => {
  const $set = {};
  for (const [key, value] of Object.entries(fields)) {
    $set[`items.${index}.${key}`] = value;
  }
  await WritingBatchRun.updateOne({ _id: runId }, { $set });
};

const finishRun = async ({ runId, status, stoppedReason = "" }) => {
  await WritingBatchRun.updateOne(
    { _id: runId, status: "running" },
    { $set: { status, stoppedReason } },
  );
};

/**
 * Processes pending items in order. Each iteration re-reads the run, so a
 * cancel, a credit stop in another tab or a manual retry is seen before the
 * next draft starts. Any failure is recorded on the item, never thrown.
 *
 * `assess` is the assessment service call; tests pass a fake to drive the loop
 * without reaching the provider.
 */
export const processRun = async (batchRunId, { assess = assessDraft } = {}) => {
  const runId = String(batchRunId);
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  try {
    for (;;) {
      const current = await WritingBatchRun.findOne({ _id: runId }).lean();
      if (!current || current.status !== "running") return;
      const index = (current.items || []).findIndex(
        (row) => row.status === "pending",
      );
      if (index === -1) {
        await finishRun({ runId, status: "done" });
        return;
      }
      if (current.cancelRequested) {
        await finishRun({ runId, status: "cancelled" });
        return;
      }
      const item = current.items[index];
      await setItem({
        runId,
        index,
        fields: { status: "running", startedAt: new Date(), error: "", code: "" },
      });

      const project = await WritingProject.findOne({
        school: current.school,
        _id: item.project,
      })
        .select("latestDraft")
        .lean();
      const draftId = project?.latestDraft || item.draft;
      if (!draftId) {
        await setItem({
          runId,
          index,
          fields: {
            status: "failed",
            code: "STALE_DRAFT",
            error: "No submitted draft was found for this student.",
            finishedAt: new Date(),
          },
        });
        continue;
      }

      try {
        const result = await assess({
          schoolId: current.school,
          draftId,
          userId: current.requestedBy,
          isAdmin: Boolean(current.requestedByAdmin),
          language: current.language || undefined,
          creditChecked: true,
        });
        if (result.precheck) {
          await setItem({
            runId,
            index,
            fields: {
              status: "skipped",
              code: result.precheck.code,
              error: result.precheck.guidance,
              draft: draftId,
              finishedAt: new Date(),
            },
          });
          continue;
        }
        await setItem({
          runId,
          index,
          fields: {
            status: "done",
            code: "",
            error: "",
            draft: draftId,
            assessment: result.assessment.id,
            finishedAt: new Date(),
          },
        });
      } catch (error) {
        if (isCreditError(error)) {
          // Not the draft's fault and nothing was charged: leave it queued so
          // a top-up plus retry continues the same run.
          await setItem({
            runId,
            index,
            fields: { status: "pending", startedAt: null },
          });
          await finishRun({ runId, status: "stopped", stoppedReason: "credit" });
          return;
        }
        await setItem({
          runId,
          index,
          fields: {
            status: "failed",
            code: aiFailureCodeOf(error),
            error: String(error?.message || "Assessment failed.").slice(0, 300),
            draft: draftId,
            finishedAt: new Date(),
          },
        });
      }
    }
  } catch {
    // A database failure mid-run leaves the run "running"; the next read turns
    // it into "interrupted" after the stale window and a retry resumes it.
  } finally {
    activeRuns.delete(runId);
  }
};
