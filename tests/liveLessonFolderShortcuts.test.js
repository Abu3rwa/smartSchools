import assert from "node:assert/strict";
import test from "node:test";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonFolder from "../models/LiveLessonFolder.js";
import {
  addLiveLessonFolderShortcuts,
  removeLiveLessonFolderShortcuts,
} from "../controllers/liveLessonController.js";

const queryChain = (value) => {
  const chain = {
    select: () => chain,
    lean: async () => value,
  };
  return chain;
};

const call = (handler, req) => {
  const body = {};
  return new Promise((resolve) => {
    const collect = (payload) => {
      Object.assign(body, payload);
      resolve(body);
      return undefined;
    };
    handler({ ...req }, {
      json: collect,
      status: () => ({ json: collect }),
    }, (error) => {
      body.error = error;
      resolve(body);
    });
  }).then((result) => {
    if (result.error) throw result.error;
    return result;
  });
};

const teacher = { _id: "507f1f77bcf86cd799439011", role: "teacher" };
const schoolId = "507f1f77bcf86cd799439012";
const folderId = "507f1f77bcf86cd799439015";
const firstLessonId = "507f1f77bcf86cd7994390aa";
const secondLessonId = "507f1f77bcf86cd7994390bb";

test("adding shortcuts adds each owned lesson once", async (t) => {
  t.mock.method(LiveLessonFolder, "findOne", () =>
    queryChain({ _id: folderId }));
  t.mock.method(LiveLesson, "find", () => queryChain([
    { _id: firstLessonId },
    { _id: secondLessonId },
  ]));
  let updated;
  t.mock.method(LiveLessonFolder, "updateOne", async (filter, update) => {
    updated = { filter, update };
    return { modifiedCount: 1 };
  });

  const body = await call(addLiveLessonFolderShortcuts, {
    params: { folderId },
    body: { lessonIds: [firstLessonId, firstLessonId, secondLessonId] },
    user: teacher,
    schoolId,
  });

  assert.equal(body.success, true);
  assert.deepEqual(updated.update, {
    $addToSet: { lessonIds: { $each: [firstLessonId, secondLessonId] } },
  });
  assert.equal(String(updated.filter.school), schoolId);
  assert.equal(String(updated.filter.ownerId), teacher._id);
});

test("adding shortcuts refuses lessons outside the teacher's library", async (t) => {
  t.mock.method(LiveLessonFolder, "findOne", () =>
    queryChain({ _id: folderId }));
  t.mock.method(LiveLesson, "find", () => queryChain([{ _id: firstLessonId }]));
  let written = false;
  t.mock.method(LiveLessonFolder, "updateOne", async () => {
    written = true;
    return { modifiedCount: 1 };
  });

  const body = await call(addLiveLessonFolderShortcuts, {
    params: { folderId },
    body: { lessonIds: [firstLessonId, secondLessonId] },
    user: teacher,
    schoolId,
  });

  assert.equal(body.success, false);
  assert.equal(body.message, "Some lessons were not found in your library.");
  assert.equal(written, false);
});

test("adding shortcuts caps one request at two hundred lessons", async (t) => {
  let looked = false;
  t.mock.method(LiveLessonFolder, "findOne", () => {
    looked = true;
    return queryChain({ _id: folderId });
  });

  const many = Array.from({ length: 201 }, (_, index) =>
    String(index).padStart(24, "0"));
  const body = await call(addLiveLessonFolderShortcuts, {
    params: { folderId },
    body: { lessonIds: many },
    user: teacher,
    schoolId,
  });

  assert.equal(body.success, false);
  assert.equal(body.message, "Choose a folder and up to 200 lessons.");
  assert.equal(looked, false);
});

test("removing shortcuts pulls only the selected lessons from the chosen folders", async (t) => {
  let removed;
  t.mock.method(LiveLessonFolder, "updateMany", async (filter, update) => {
    removed = { filter, update };
    return { modifiedCount: 2 };
  });

  const body = await call(removeLiveLessonFolderShortcuts, {
    body: {
      folderIds: [folderId, folderId],
      lessonIds: [firstLessonId, secondLessonId],
    },
    user: teacher,
    schoolId,
  });

  assert.equal(body.success, true);
  assert.match(body.message, /removed from 2 folders/);
  assert.match(body.message, /lessons themselves were not changed/);
  assert.deepEqual(removed.update, {
    $pull: { lessonIds: { $in: [firstLessonId, secondLessonId] } },
  });
  assert.deepEqual(removed.filter._id, { $in: [folderId] });
  assert.equal(String(removed.filter.ownerId), teacher._id);
});

test("removing shortcuts without folders changes nothing", async (t) => {
  let written = false;
  t.mock.method(LiveLessonFolder, "updateMany", async () => {
    written = true;
    return { modifiedCount: 0 };
  });

  const body = await call(removeLiveLessonFolderShortcuts, {
    body: { folderIds: [], lessonIds: [firstLessonId] },
    user: teacher,
    schoolId,
  });

  assert.equal(body.success, false);
  assert.equal(body.message, "Choose valid folders.");
  assert.equal(written, false);
});
