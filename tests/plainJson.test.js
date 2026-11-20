import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import WritingAssessment from "../models/WritingAssessment.js";
import { PLAIN_JSON_LIMITS, plainJsonIssue } from "../utils/plainJson.js";

test("a stored reply is plain, nested data", () => {
  const payload = {
    sections: [{ key: "body", strengths: ["clear opening"], score: 3 }],
    overall: { summary: "{{student}} states an opinion." },
    publishedAt: new Date("2026-11-16T08:00:00Z"),
  };
  assert.equal(plainJsonIssue(payload), null);
});

test("each way a payload can fail to store is named", () => {
  const cyclic = { summary: "fine" };
  cyclic.self = cyclic;
  assert.equal(plainJsonIssue(cyclic), "cycle");

  let deep = "leaf";
  for (let level = 0; level < 100; level += 1) deep = { child: deep };
  assert.equal(plainJsonIssue(deep), "depth");

  assert.equal(plainJsonIssue({ note: () => "x" }), "unsupported:function");
  assert.equal(plainJsonIssue({ words: new Set(["a"]) }), "unsupported:Set");
  assert.equal(plainJsonIssue({ score: Number.NaN }), "unsupported:number");

  const huge = { summary: "x".repeat(PLAIN_JSON_LIMITS.maxBytes + 1) };
  assert.equal(plainJsonIssue(huge), "size");
});

const assessmentFields = () => ({
  school: new mongoose.Types.ObjectId(),
  project: new mongoose.Types.ObjectId(),
  assignment: new mongoose.Types.ObjectId(),
  student: new mongoose.Types.ObjectId(),
  draft: new mongoose.Types.ObjectId(),
});

test("the model refuses an original that could not be read back", () => {
  const cyclic = { overall: { summary: "ok" } };
  cyclic.overall.self = cyclic;

  const refused = new WritingAssessment({
    ...assessmentFields(),
    aiOriginal: cyclic,
  }).validateSync();
  assert.ok(refused?.errors?.aiOriginal, "a cyclic original must be refused");

  const accepted = new WritingAssessment({
    ...assessmentFields(),
    aiOriginal: { overall: { summary: "ok" }, sections: [] },
  }).validateSync();
  assert.equal(accepted?.errors?.aiOriginal, undefined);
});
