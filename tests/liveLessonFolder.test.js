import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import LiveLessonFolder from "../models/LiveLessonFolder.js";

test("live lesson folders default to an empty ordered lesson list", () => {
  const folder = new LiveLessonFolder({
    school: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    name: "  Unit 1  ",
  });

  assert.equal(folder.name, "Unit 1");
  assert.deepEqual(folder.lessonIds, []);
  assert.equal(folder.parentId, null);
  assert.equal(folder.validateSync(), undefined);
});

test("live lesson folder names are limited to 100 characters", () => {
  const folder = new LiveLessonFolder({
    school: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    name: "x".repeat(101),
  });

  assert.equal(folder.validateSync().errors.name.kind, "maxlength");
});
