import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

import AiCreditAccount from "../models/AiCreditAccount.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import Student from "../models/Student.js";
import WritingAssessment from "../models/WritingAssessment.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingBatchRun from "../models/WritingBatchRun.js";
import WritingProject from "../models/WritingProject.js";
import {
  MAX_BATCH_ITEMS,
  cancelBatchRun,
  estimatePerDraftCents,
  previewBatch,
  processRun,
  retryBatchRun,
  startBatch,
  summarizeRun,
} from "../services/writingBatchRunService.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const oid = () => new mongoose.Types.ObjectId().toString();

const schoolId = oid();
const teacherId = oid();
const otherTeacherId = oid();
const assignmentId = oid();

const stub = (target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
};

const withStubs = async (stubs, run) => {
  const restores = stubs.map(([target, key, value]) => stub(target, key, value));
  try {
    await run();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

// Mongoose queries are awaitable and also carry .lean(); the service uses both.
const query = (value, limits = null) => {
  const q = {
    select: () => q,
    sort: () => q,
    limit: (n) => {
      if (limits) limits.push(n);
      return q;
    },
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return q;
};

const creditStubs = () => [
  [AiCreditAccount, "findOne", () => query({ balanceCents: 500, paused: false })],
  [AiCreditSetting, "findOne", () => query({ markupPercent: 30 })],
];

const makeRun = (overrides = {}) => ({
  _id: oid(),
  school: schoolId,
  assignment: assignmentId,
  requestedBy: teacherId,
  requestedByAdmin: false,
  status: "running",
  cancelRequested: false,
  stoppedReason: "",
  language: "en",
  estimate: { drafts: 0, perDraftCents: 2, totalCents: 0, basis: "default" },
  items: [],
  createdAt: new Date(Date.now() - 60 * 1000),
  updatedAt: new Date(),
  ...overrides,
});

const makeItem = (overrides = {}) => ({
  project: oid(),
  student: oid(),
  studentName: "Student",
  draft: oid(),
  status: "pending",
  code: "",
  error: "",
  ...overrides,
});

const fakeDoc = (payload) => {
  const doc = { _id: payload._id || oid(), ...payload };
  doc.toObject = () => ({ ...doc, toObject: undefined });
  return doc;
};

// Applies the runner's dotted $set paths to the in-memory run, like Mongo does.
const applySet = (run, fields = {}) => {
  for (const [path, value] of Object.entries(fields)) {
    const parts = path.split(".");
    if (parts[0] === "items") {
      run.items[Number(parts[1])][parts[2]] = value;
    } else {
      run[path] = value;
    }
  }
};

const runStore = (run) => {
  const copy = () => JSON.parse(JSON.stringify(state.run));
  const state = { run: JSON.parse(JSON.stringify(run)), updates: [] };
  return {
    state,
    findOne: () => query(copy()),
    updateOne: async (_filter, update) => {
      state.updates.push(update.$set);
      applySet(state.run, update.$set);
      return { acknowledged: true };
    },
  };
};

test("the summary counts every item status and stays open while running", () => {
  const run = makeRun({
    items: [
      makeItem({ status: "done", assessment: oid() }),
      makeItem({ status: "failed", code: "AI_TIMEOUT", error: "Timed out." }),
      makeItem({ status: "skipped", code: "DRAFT_EMPTY" }),
      makeItem({ status: "pending" }),
      makeItem({ status: "running" }),
    ],
  });

  const summary = summarizeRun(run);

  assert.equal(summary.status, "running");
  assert.equal(summary.finishedAt, null);
  assert.deepEqual(summary.totals, {
    drafts: 5,
    done: 1,
    failed: 1,
    skipped: 1,
    pending: 1,
    running: 1,
    finished: 3,
  });
  assert.equal(summary.items[1].code, "AI_TIMEOUT");
  assert.equal(summary.items[0].assessmentId, String(run.items[0].assessment));

  const finished = summarizeRun({ ...run, status: "done" });
  assert.equal(finished.finishedAt, run.updatedAt);
});

test("the per-draft estimate averages recent real costs and falls back", () => {
  assert.equal(
    estimatePerDraftCents([
      { usage: { costCents: 2 } },
      { usage: { costCents: 4 } },
      { usage: { costCents: 0 } },
      { usage: {} },
    ]),
    3,
  );
  assert.equal(estimatePerDraftCents([], 7), 7);
  // A run with a failed assessment in the sample must not skew the number down.
  assert.equal(estimatePerDraftCents([{ usage: { costCents: -2 } }], 5), 5);
});

test("the preview counts the waiting drafts, caps at ten, and prices them", async () => {
  const limits = [];
  const projectFilters = [];
  const waiting = Array.from({ length: 10 }, () => ({
    _id: oid(),
    student: oid(),
  }));
  await withStubs(
    [
      [WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })],
      [WritingProject, "countDocuments", async () => 14],
      [
        WritingProject,
        "find",
        (filter) => {
          projectFilters.push(filter);
          return query(waiting, limits);
        },
      ],
      [WritingAssessment, "find", () => query([{ usage: { costCents: 2 } }, { usage: { costCents: 4 } }])],
    ],
    async () => {
      const preview = await previewBatch({
        schoolId,
        assignmentId,
        userId: teacherId,
        classId: oid(),
        limit: 50,
      });
      assert.equal(preview.started, false);
      assert.equal(preview.drafts, 10);
      assert.equal(preview.waiting, 14);
      assert.deepEqual(preview.estimate, {
        drafts: 10,
        perDraftCents: 3,
        totalCents: 30,
        basis: "recent",
      });
    },
  );
  assert.ok(limits.includes(MAX_BATCH_ITEMS));
  assert.equal(projectFilters[0].stage, "submitted");
  assert.ok(projectFilters[0].class, "the class scope is applied when asked");
});

test("a teacher who did not create the task cannot batch it", async () => {
  await withStubs(
    [[WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })]],
    async () => {
      await assert.rejects(
        previewBatch({ schoolId, assignmentId, userId: otherTeacherId }),
        (error) => {
          assert.equal(error.statusCode, 403);
          assert.match(error.message, /Only the teacher who created/);
          return true;
        },
      );
    },
  );
});

test("starting without confirmation only previews, and never writes a run", async () => {
  const created = { count: 0 };
  await withStubs(
    [
      [WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })],
      [WritingProject, "countDocuments", async () => 2],
      [WritingProject, "find", () => query([{ _id: oid(), student: oid() }])],
      [WritingAssessment, "find", () => query([])],
      [
        WritingBatchRun,
        "create",
        async () => {
          created.count += 1;
          return fakeDoc({});
        },
      ],
    ],
    async () => {
      const result = await startBatch({ schoolId, assignmentId, userId: teacherId });
      assert.equal(result.started, false);
      assert.equal(result.drafts, 1);
      assert.equal(result.estimate.basis, "default");
    },
  );
  assert.equal(created.count, 0);
});

test("starting with nothing waiting says so and charges nothing", async () => {
  const created = { count: 0 };
  await withStubs(
    [
      [WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })],
      [WritingBatchRun, "findOne", () => query(null)],
      [WritingProject, "find", () => query([])],
      [
        WritingBatchRun,
        "create",
        async () => {
          created.count += 1;
          return fakeDoc({});
        },
      ],
    ],
    async () => {
      const result = await startBatch({
        schoolId,
        assignmentId,
        userId: teacherId,
        confirm: true,
      });
      assert.deepEqual(result, {
        started: false,
        drafts: 0,
        waiting: 0,
        estimate: null,
      });
    },
  );
  assert.equal(created.count, 0);
});

test("a second batch on the same task is refused while the first runs", async () => {
  await withStubs(
    [
      [WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })],
      [
        WritingBatchRun,
        "findOne",
        () => query(makeRun({ updatedAt: new Date() })),
      ],
    ],
    async () => {
      await assert.rejects(
        startBatch({ schoolId, assignmentId, userId: teacherId, confirm: true }),
        (error) => {
          assert.equal(error.statusCode, 409);
          assert.match(error.message, /already running/);
          return true;
        },
      );
    },
  );
});

test("a confirmed start records every waiting project with its student name", async () => {
  const students = [
    { _id: oid(), firstName: "Mona", lastName: "Ali" },
    { _id: oid(), firstName: "Omar", lastName: "Hassan" },
  ];
  const waiting = students.map((student) => ({
    _id: oid(),
    student: student._id,
    latestDraft: oid(),
  }));
  const created = { payload: null };
  let batchReads = 0;

  await withStubs(
    [
      [WritingAssignment, "findOne", () => query({ _id: assignmentId, assignedBy: teacherId })],
      [
        WritingBatchRun,
        "findOne",
        () => {
          batchReads += 1;
          // First read is the "is one already running" check; the runner's own
          // read then sees a finished run so it exits without touching AI.
          return query(batchReads === 1 ? null : makeRun({ status: "done", items: [] }));
        },
      ],
      [WritingProject, "find", () => query(waiting)],
      [Student, "find", () => query(students)],
      [WritingAssessment, "find", () => query([])],
      [
        WritingBatchRun,
        "create",
        async (payload) => {
          created.payload = payload;
          return fakeDoc(payload);
        },
      ],
      [WritingBatchRun, "updateOne", async () => ({ acknowledged: true })],
      ...creditStubs(),
    ],
    async () => {
      const result = await startBatch({
        schoolId,
        assignmentId,
        userId: teacherId,
        confirm: true,
        language: "AR",
      });
      assert.equal(result.started, true);
      assert.equal(result.totals.drafts, 2);
    },
  );

  assert.equal(created.payload.status, "running");
  assert.equal(created.payload.language, "ar");
  assert.equal(created.payload.items.length, 2);
  assert.equal(created.payload.items[0].status, "pending");
  assert.equal(created.payload.items[0].studentName, "Mona Ali");
  assert.equal(created.payload.items[1].studentName, "Omar Hassan");
  assert.equal(created.payload.estimate.basis, "default");
  assert.equal(created.payload.estimate.totalCents, 2 * 2);
});

test("cancelling only asks the runner to stop; a finished run is left alone", async () => {
  const running = makeRun({ items: [makeItem(), makeItem()] });
  const update = { calls: 0 };
  await withStubs(
    [
      [WritingBatchRun, "findOne", () => query(running)],
      [
        WritingBatchRun,
        "findOneAndUpdate",
        () => {
          update.calls += 1;
          return {
            lean: async () => ({ ...running, cancelRequested: true }),
          };
        },
      ],
    ],
    async () => {
      const result = await cancelBatchRun({
        schoolId,
        userId: teacherId,
        batchRunId: running._id,
      });
      assert.equal(result.cancelRequested, true);
    },
  );
  assert.equal(update.calls, 1);

  const finished = makeRun({ status: "done", items: [makeItem({ status: "done" })] });
  await withStubs(
    [
      [WritingBatchRun, "findOne", () => query(finished)],
      [
        WritingBatchRun,
        "findOneAndUpdate",
        () => {
          throw new Error("a finished run must not be updated");
        },
      ],
    ],
    async () => {
      const result = await cancelBatchRun({
        schoolId,
        userId: teacherId,
        batchRunId: finished._id,
      });
      assert.equal(result.status, "done");
      assert.equal(result.cancelRequested, false);
    },
  );
});

test("retry requeues the failed items, never the finished ones", async () => {
  const run = makeRun({
    status: "stopped",
    stoppedReason: "credit",
    items: [
      makeItem({ status: "done" }),
      makeItem({ status: "failed", code: "AI_TIMEOUT", error: "Timed out." }),
      makeItem({ status: "failed", code: "INTERNAL", error: "Broke." }),
    ],
  });
  const claimed = makeRun({
    status: "running",
    items: run.items.map((item) =>
      item.status === "failed" ? { ...item, status: "pending" } : item,
    ),
  });
  const update = { query: null, fields: null };
  let reads = 0;

  await withStubs(
    [
      [
        WritingBatchRun,
        "findOne",
        () => {
          reads += 1;
          // loadRun reads the stopped run; the spawned runner then sees it done.
          return query(reads === 1 ? run : { ...claimed, status: "done" });
        },
      ],
      [
        WritingBatchRun,
        "findOneAndUpdate",
        (filter, fields) => {
          update.query = filter;
          update.fields = fields;
          return { lean: async () => claimed };
        },
      ],
      [WritingBatchRun, "updateOne", async () => ({ acknowledged: true })],
      ...creditStubs(),
    ],
    async () => {
      const result = await retryBatchRun({
        schoolId,
        userId: teacherId,
        batchRunId: run._id,
      });
      assert.equal(result.requeued, 2);
      assert.equal(result.status, "running");
    },
  );

  assert.equal(update.fields.$set.status, "running");
  assert.equal(update.fields.$set.cancelRequested, false);
  assert.equal(update.fields.$set.stoppedReason, "");
  assert.equal(update.fields.$set["items.$[failed].status"], "pending");
  assert.equal("items.0.status" in update.fields.$set, false, "done items stay done");
  assert.deepEqual(update.query.status, { $ne: "running" });
});

test("the runner assesses each pending draft and marks the run done", async () => {
  const run = makeRun({ items: [makeItem(), makeItem()] });
  const store = runStore(run);
  const draftId = oid();
  const calls = [];
  const assess = async (input) => {
    calls.push(input);
    return { assessment: { id: oid() } };
  };

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query({ latestDraft: draftId })],
    ],
    () => processRun(run._id, { assess }),
  );

  assert.equal(store.state.run.status, "done");
  assert.deepEqual(
    store.state.run.items.map((item) => item.status),
    ["done", "done"],
  );
  assert.ok(store.state.run.items.every((item) => item.assessment));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].creditChecked, true, "the batch checked credit once, up front");
  assert.equal(calls[0].schoolId, schoolId);
  assert.equal(calls[0].userId, teacherId);
  assert.equal(calls[0].draftId, draftId);
});

test("a draft stopped before AI is recorded as skipped, not failed", async () => {
  const run = makeRun({ items: [makeItem()] });
  const store = runStore(run);
  const assess = async () => ({
    precheck: { code: "DRAFT_EMPTY", guidance: "Ask for a first sentence." },
  });

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query({ latestDraft: oid() })],
    ],
    () => processRun(run._id, { assess }),
  );

  assert.equal(store.state.run.items[0].status, "skipped");
  assert.equal(store.state.run.items[0].code, "DRAFT_EMPTY");
  assert.equal(store.state.run.items[0].error, "Ask for a first sentence.");
  assert.equal(store.state.run.status, "done");
});

test("running out of credit stops the run with the item still queued", async () => {
  const run = makeRun({ items: [makeItem(), makeItem()] });
  const store = runStore(run);
  let calls = 0;
  const assess = async () => {
    calls += 1;
    throw Object.assign(new Error("You have no AI credit left."), {
      code: "AI_CREDIT_REQUIRED",
      statusCode: 402,
    });
  };

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query({ latestDraft: oid() })],
    ],
    () => processRun(run._id, { assess }),
  );

  assert.equal(store.state.run.status, "stopped");
  assert.equal(store.state.run.stoppedReason, "credit");
  assert.equal(store.state.run.items[0].status, "pending");
  assert.equal(store.state.run.items[1].status, "pending");
  assert.equal(calls, 1, "later drafts are not attempted without credit");
});

test("one failed draft does not stop the ones after it", async () => {
  const run = makeRun({ items: [makeItem(), makeItem()] });
  const store = runStore(run);
  let calls = 0;
  const assess = async () => {
    calls += 1;
    if (calls === 1) throw new Error("The provider timed out.");
    return { assessment: { id: oid() } };
  };

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query({ latestDraft: oid() })],
    ],
    () => processRun(run._id, { assess }),
  );

  assert.equal(store.state.run.items[0].status, "failed");
  assert.equal(store.state.run.items[0].code, "AI_TIMEOUT");
  assert.equal(store.state.run.items[1].status, "done");
  assert.equal(store.state.run.status, "done");
});

test("a project without a submitted draft fails clearly instead of calling AI", async () => {
  const run = makeRun({ items: [makeItem({ draft: null })] });
  const store = runStore(run);
  let calls = 0;

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query(null)],
    ],
    () => processRun(run._id, { assess: async () => { calls += 1; } }),
  );

  assert.equal(calls, 0);
  assert.equal(store.state.run.items[0].status, "failed");
  assert.equal(store.state.run.items[0].code, "STALE_DRAFT");
  assert.equal(store.state.run.status, "done");
});

test("a cancel during an assessment stops before the next draft starts", async () => {
  const run = makeRun({ items: [makeItem(), makeItem()] });
  const store = runStore(run);
  let calls = 0;
  const assess = async () => {
    calls += 1;
    // The teacher cancels while the first draft is being read.
    store.state.run.cancelRequested = true;
    return { assessment: { id: oid() } };
  };

  await withStubs(
    [
      [WritingBatchRun, "findOne", store.findOne],
      [WritingBatchRun, "updateOne", store.updateOne],
      [WritingProject, "findOne", () => query({ latestDraft: oid() })],
    ],
    () => processRun(run._id, { assess }),
  );

  assert.equal(calls, 1);
  assert.equal(store.state.run.status, "cancelled");
  assert.equal(store.state.run.items[0].status, "done");
  assert.equal(store.state.run.items[1].status, "pending");
});

test("the model caps one batch at ten and keeps the run statuses", () => {
  assert.equal(MAX_BATCH_ITEMS, 10);
  assert.deepEqual(WritingBatchRun.schema.path("status").enumValues, [
    "running",
    "done",
    "cancelled",
    "stopped",
    "interrupted",
  ]);
  assert.deepEqual(WritingBatchRun.schema.path("stoppedReason").enumValues, [
    "",
    "credit",
    "error",
  ]);
  const index = WritingBatchRun.schema
    .indexes()
    .find(
      ([keys]) =>
        keys.school === 1 && keys.assignment === 1 && keys.createdAt === -1,
    );
  assert.ok(index, "the board can find the latest run for a task");
});

test("every batch route is staff-only and flag-gated, and the old path is not", async () => {
  const source = await readFile(
    join(HERE, "..", "routes", "writingRoutes.js"),
    "utf8",
  );
  const routes =
    source.match(/router\.(get|post)\(\s*"[^"]*batch[^"]*"[^;]+;/g) || [];
  assert.equal(routes.length, 4);
  for (const route of routes) {
    assert.match(route, /\bstaff\b/);
    assert.match(route, /\brequireTeacherTools\b/);
  }

  // Flag off must keep the single-run assessment working for every school.
  const legacy = source.match(
    /router\.post\(\s*"\/assignments\/:assignmentId\/assess"[^;]+;/,
  );
  assert.ok(legacy, "the original assess route still exists");
  assert.doesNotMatch(legacy[0], /requireTeacherTools/);
});
