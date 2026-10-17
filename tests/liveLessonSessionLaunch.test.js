import assert from "node:assert/strict";
import test from "node:test";
import { resolveLiveSessionSubjectId } from "../services/liveLessonService.js";

test("session launch uses the lesson subject when assigned to the selected class", () => {
  const subjectId = "507f1f77bcf86cd799439011";
  assert.equal(
    resolveLiveSessionSubjectId(
      { subject: "English", subjectId },
      [{ subject: { _id: subjectId, name: "English" } }],
    ),
    subjectId,
  );
});

test("session launch resolves an equivalent subject on a different class", () => {
  const targetClassSubjectId = "507f1f77bcf86cd799439012";
  assert.equal(
    resolveLiveSessionSubjectId(
      { subject: "English", subjectId: "507f1f77bcf86cd799439011" },
      [{ subject: { _id: targetClassSubjectId, name: " english " } }],
    ),
    targetClassSubjectId,
  );
});

test("session launch keeps working when the selected class has no matching subject", () => {
  assert.equal(
    resolveLiveSessionSubjectId(
      { subject: "English", subjectId: "507f1f77bcf86cd799439011" },
      [{ subject: { _id: "507f1f77bcf86cd799439012", name: "Math" } }],
    ),
    null,
  );
});

test("session launch does not guess between duplicate subject names", () => {
  assert.equal(
    resolveLiveSessionSubjectId(
      { subject: "English" },
      [
        { subject: { _id: "507f1f77bcf86cd799439011", name: "English" } },
        { subject: { _id: "507f1f77bcf86cd799439012", name: "English" } },
      ],
    ),
    null,
  );
});
