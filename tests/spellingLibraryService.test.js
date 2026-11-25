import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import SpellingLibraryState from "../models/SpellingLibraryState.js";
import SpellingPronunciation from "../models/SpellingPronunciation.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import SpellingSession from "../models/SpellingSession.js";
import SpellingWord from "../models/SpellingWord.js";
import {
  commitLibraryImport,
  listLibraryWords,
  previewLibraryOperation,
} from "../services/spellingLibraryService.js";

const chain = (value) => ({
  sort() {
    return this;
  },
  skip() {
    return this;
  },
  select() {
    return this;
  },
  limit() {
    return this;
  },
  session() {
    return this;
  },
  lean: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const wordDoc = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  school: new mongoose.Types.ObjectId(),
  grade: "G2",
  week: 1,
  category: "Review",
  word: "red fox",
  definition: "A wild animal",
  normalizedWord: "red fox",
  order: 1,
  revision: 3,
  deletedAt: null,
  ...overrides,
});

const preview = (overrides = {}) =>
  previewLibraryOperation({
    schoolId: new mongoose.Types.ObjectId(),
    user: { _id: new mongoose.Types.ObjectId(), roles: ["admin"] },
    role: "admin",
    operation: {
      kind: "patch",
      wordId: new mongoose.Types.ObjectId(),
      patch: { definition: "Updated definition" },
      expectedRevision: 3,
    },
    expectedLibraryVersions: { G2: 2 },
    ...overrides,
  });

test("an active spelling test blocks edits to its grade", async (t) => {
  const word = wordDoc();
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G2" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));
  t.mock.method(SpellingLibraryState, "find", () =>
    chain([{ grade: "G2", version: 2 }]),
  );
  t.mock.method(SpellingSession, "find", (filter) =>
    chain(
      (filter?.status?.$in || []).includes("in-progress")
        ? [{ status: "in-progress", curriculumGrade: "G2" }]
        : [],
    ),
  );

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "patch",
          wordId: word._id,
          patch: { definition: "Updated definition" },
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "ACTIVE_TEST" && error.statusCode === 409,
  );
});

test("a scheduled test blocks edits, including grades only touched by a retest quiz", async (t) => {
  const word = wordDoc();
  const retestQuizId = new mongoose.Types.ObjectId();
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G2" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));
  t.mock.method(SpellingLibraryState, "find", () =>
    chain([{ grade: "G2", version: 2 }]),
  );
  t.mock.method(SpellingSession, "find", (filter) =>
    chain(
      (filter?.status?.$in || []).includes("scheduled")
        ? [{ status: "scheduled", retestQuizItems: [retestQuizId] }]
        : [],
    ),
  );
  t.mock.method(SpellingRetestItem, "find", (filter) => {
    assert.deepEqual(filter._id.$in, [retestQuizId]);
    return chain([{ grade: "G2" }]);
  });

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "patch",
          wordId: word._id,
          patch: { definition: "Updated definition" },
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "SCHEDULED_TEST" && error.statusCode === 409,
  );
});

test("a frozen formal test list pins its grades even when the current grade is unset", async (t) => {
  const word = wordDoc();
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G2" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));
  t.mock.method(SpellingLibraryState, "find", () =>
    chain([{ grade: "G2", version: 2 }]),
  );
  t.mock.method(SpellingSession, "find", (filter) =>
    chain(
      (filter?.status?.$in || []).includes("in-progress")
        ? [
            {
              status: "in-progress",
              assessmentType: "formal-spelling-test",
              formalTestWordList: [{ grade: "G2" }],
            },
          ]
        : [],
    ),
  );

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "patch",
          wordId: word._id,
          patch: { definition: "Updated definition" },
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "ACTIVE_TEST",
  );
});

test("structural edits in a grade with progress reject MIGRATION_REQUIRED without writing", async (t) => {
  const word = wordDoc();
  const writes = [];
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G2" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));
  t.mock.method(SpellingLibraryState, "find", () =>
    chain([{ grade: "G2", version: 2 }]),
  );
  t.mock.method(SpellingSession, "find", () => chain([]));
  t.mock.method(SpellingLibraryState, "findOneAndUpdate", async () => ({
    grade: "G2",
    version: 1,
    coordinationRevision: 0,
    migrationStatus: "ready",
    progressSchemaVersion: 0,
    save: async () => {
      writes.push("state-save");
    },
  }));
  t.mock.method(Student, "find", () => {
    throw new Error("Impact must not run for a blocked structural edit");
  });
  t.mock.method(Student, "countDocuments", async () => 3);
  t.mock.method(SpellingWord, "updateOne", async () => {
    writes.push("word-update");
    return { matchedCount: 1 };
  });
  t.mock.method(SpellingWord, "updateMany", async () => {
    writes.push("word-update-many");
    return { matchedCount: 1 };
  });

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "move",
          wordId: word._id,
          toWeek: 2,
          toPosition: 1,
          expectedRevision: 3,
        },
      }),
    (error) =>
      error.code === "MIGRATION_REQUIRED" &&
      error.details?.[0]?.grade === "G2",
  );

  assert.deepEqual(writes, []);
});

test("punctuation-only words are rejected by the plan before any write", async (t) => {
  const writes = [];
  t.mock.method(SpellingWord, "find", () => chain([]));
  t.mock.method(SpellingWord, "create", async () => {
    writes.push("create");
    return [];
  });
  t.mock.method(SpellingWord, "insertMany", async () => {
    writes.push("insertMany");
    return [];
  });

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "add",
          grade: "G2",
          week: 1,
          category: "Review",
          word: "!!!",
        },
      }),
    (error) => error.code === "INVALID_WORD" && error.statusCode === 400,
  );

  assert.deepEqual(writes, []);
});

test("renaming a word without confirming a typo correction is rejected", async (t) => {
  const word = wordDoc();
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G2" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "patch",
          wordId: word._id,
          patch: { word: "red fux" },
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "CHANGE_TYPE_REQUIRED" && error.statusCode === 400,
  );
});

test("a move beyond the grade's last week is rejected", async (t) => {
  const word = wordDoc({ grade: "G1" });
  t.mock.method(SpellingWord, "findOne", () => chain({ grade: "G1" }));
  t.mock.method(SpellingWord, "find", () => chain([word]));

  await assert.rejects(
    () =>
      preview({
        operation: {
          kind: "move",
          wordId: word._id,
          toWeek: 37,
          toPosition: 1,
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "INVALID_POSITION" && error.statusCode === 400,
  );
});

test("a word ID is always resolved inside the requested school", async (t) => {
  const schoolId = new mongoose.Types.ObjectId();
  const filters = [];
  t.mock.method(SpellingWord, "findOne", (filter) => {
    filters.push(filter);
    return chain(null);
  });

  await assert.rejects(
    () =>
      preview({
        schoolId,
        operation: {
          kind: "patch",
          wordId: new mongoose.Types.ObjectId(),
          patch: { definition: "Updated definition" },
          expectedRevision: 3,
        },
      }),
    (error) => error.code === "WORD_NOT_FOUND" && error.statusCode === 404,
  );

  assert.equal(filters.length, 1);
  assert.equal(String(filters[0].school), String(schoolId));
  assert.equal(filters[0].deletedAt, null);
});

test("only an acting admin can apply an import preview", async () => {
  for (const role of ["teacher", "department_principal", null]) {
    await assert.rejects(
      () =>
        commitLibraryImport({
          schoolId: new mongoose.Types.ObjectId(),
          user: {
            _id: new mongoose.Types.ObjectId(),
            roles: ["admin", "super_admin"],
          },
          role,
          job: { uploadedBy: new mongoose.Types.ObjectId() },
          input: { operationId: "operation-1", reason: "Align the weekly list" },
        }),
      (error) => error.code === "ROLE_FORBIDDEN" && error.statusCode === 403,
    );
  }
});

test("the library list exposes definitions and per-grade edit permissions", async (t) => {
  const word = wordDoc();
  t.mock.method(SpellingWord, "find", () => chain([word]));
  t.mock.method(SpellingLibraryState, "find", () =>
    chain([{ grade: "G2", version: 4 }]),
  );
  t.mock.method(SpellingPronunciation, "find", () => chain([]));

  const result = await listLibraryWords({
    schoolId: new mongoose.Types.ObjectId(),
    user: { _id: new mongoose.Types.ObjectId() },
    role: "admin",
    query: { grade: "G2" },
  });

  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].definition, "A wild animal");
  assert.equal(result.words[0].libraryVersion, 4);
  assert.equal(result.words[0].revision, 3);
  assert.deepEqual(result.words[0].permissions, {
    canEdit: true,
    reasonCode: null,
  });
});
