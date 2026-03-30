import assert from "node:assert/strict";
import test from "node:test";

import { applySlidePatchOperations } from "../services/presentationPatchService.js";

test("applySlidePatchOperations updates top-level and nested fields", () => {
  const slide = {
    title: "Original",
    bodyHtml: "<p>Body</p>",
    background: {
      type: "solid",
      solidColor: "#ffffff",
    },
  };

  const updated = applySlidePatchOperations(slide, [
    { op: "set", path: "title", value: "Updated" },
    { op: "set", path: "background.solidColor", value: "#1a73e8" },
  ]);

  assert.equal(updated.title, "Updated");
  assert.equal(updated.background.solidColor, "#1a73e8");
});

test("applySlidePatchOperations supports unset/remove aliases", () => {
  const slide = {
    title: "Original",
    subtitle: "Sub",
    background: {
      type: "gradient",
      gradientFrom: "#111111",
      gradientTo: "#222222",
    },
  };

  const updated = applySlidePatchOperations(slide, [
    { op: "unset", path: "subtitle" },
    { op: "remove", path: "background.gradientTo" },
  ]);

  assert.equal(updated.subtitle, undefined);
  assert.equal(updated.background.gradientTo, undefined);
});

test("applySlidePatchOperations rejects unsupported paths", () => {
  const slide = { title: "Original" };

  assert.throws(
    () => applySlidePatchOperations(slide, [{ op: "set", path: "teacherNotes", value: "Nope" }]),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(String(error.message).includes("Unsupported patch path"), true);
      return true;
    }
  );
});

test("applySlidePatchOperations rejects unsupported operations", () => {
  const slide = { title: "Original" };

  assert.throws(
    () => applySlidePatchOperations(slide, [{ op: "increment", path: "title", value: 1 }]),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(String(error.message).includes("Unsupported patch operation"), true);
      return true;
    }
  );
});
