import test from "node:test";
import assert from "node:assert/strict";
import LiveLesson from "../models/LiveLesson.js";

test("live lessons can reference one class and one real subject", () => {
  const classId = LiveLesson.schema.path("classId");
  const subjectId = LiveLesson.schema.path("subjectId");

  assert.equal(classId.options.ref, "Class");
  assert.equal(classId.defaultValue, null);
  assert.equal(subjectId.options.ref, "Subject");
  assert.equal(subjectId.defaultValue, null);
});
