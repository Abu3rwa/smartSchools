import assert from "node:assert/strict";
import test from "node:test";
import Class from "../models/Class.js";
import LiveLesson from "../models/LiveLesson.js";
import Subject from "../models/Subject.js";
import { listLiveLessons } from "../controllers/liveLessonController.js";

const queryChain = (value) => ({
  select: () => ({ lean: async () => value }),
  lean: async () => value,
});

const callList = (req) => {
  const body = {};
  let resolveResponse;
  const responded = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const collect = (payload) => {
    Object.assign(body, payload);
    resolveResponse();
    return undefined;
  };
  listLiveLessons({ ...req }, {
    json: collect,
    status: () => ({ json: collect }),
  }, (error) => {
    body.error = error;
    resolveResponse();
  });
  return responded.then(() => {
    if (body.error) throw body.error;
    return body;
  });
};

const teacher = { _id: "507f1f77bcf86cd799439011", role: "teacher" };
const schoolId = "507f1f77bcf86cd799439012";
const classId = "507f1f77bcf86cd799439013";
const subjectId = "507f1f77bcf86cd799439014";

test("the lesson library only downloads one page by default", async (t) => {
  let pipeline;
  t.mock.method(LiveLesson, "aggregate", (stages) => {
    pipeline = stages;
    return Promise.resolve([]);
  });
  t.mock.method(LiveLesson, "countDocuments", async () => 0);
  t.mock.method(Class, "find", () => queryChain([]));
  t.mock.method(Subject, "find", () => queryChain([]));

  const body = await callList({ query: {}, user: teacher, schoolId });
  assert.deepEqual(
    pipeline.filter((stage) => "$skip" in stage || "$limit" in stage),
    [{ $skip: 0 }, { $limit: 25 }],
  );
  assert.equal(String(pipeline[0].$match.school), schoolId);
  assert.equal(String(pipeline[0].$match.ownerId), teacher._id);
  assert.deepEqual(body.data.pagination, {
    page: 1,
    limit: 25,
    total: 0,
    pages: 1,
    libraryTotal: 0,
  });
});

test("library filters run in the database and the page never runs past the end", async (t) => {
  let pipeline;
  const counts = [];
  t.mock.method(LiveLesson, "aggregate", (stages) => {
    pipeline = stages;
    return Promise.resolve([]);
  });
  t.mock.method(LiveLesson, "countDocuments", async (filter) => {
    counts.push(filter);
    return filter.classId ? 26 : 80;
  });
  t.mock.method(Class, "find", () => queryChain([]));
  t.mock.method(Subject, "find", () => queryChain([]));

  const body = await callList({
    query: { classId, subjectId, includeDone: "false", page: "9", limit: "10" },
    user: teacher,
    schoolId,
  });
  assert.equal(String(pipeline[0].$match.classId), classId);
  assert.equal(String(pipeline[0].$match.subjectId), subjectId);
  assert.deepEqual(pipeline[0].$match.isDone, { $ne: true });
  assert.deepEqual(
    pipeline.filter((stage) => "$skip" in stage || "$limit" in stage),
    [{ $skip: 20 }, { $limit: 10 }],
  );
  assert.equal(counts.length, 2);
  assert.equal(counts[1].classId, undefined);
  assert.deepEqual(body.data.pagination, {
    page: 3,
    limit: 10,
    total: 26,
    pages: 3,
    libraryTotal: 80,
  });
});

test("lesson rows carry a slide count instead of up to two hundred slide documents", async (t) => {
  let pipeline;
  t.mock.method(LiveLesson, "aggregate", (stages) => {
    pipeline = stages;
    return Promise.resolve([
      {
        _id: "507f1f77bcf86cd7994390aa",
        title: "Fractions",
        classId,
        subjectId,
        isDone: false,
        slideCount: 12,
        createdAt: new Date("2026-10-01T08:00:00.000Z"),
        updatedAt: new Date("2026-10-01T09:00:00.000Z"),
      },
    ]);
  });
  t.mock.method(LiveLesson, "countDocuments", async () => 1);
  t.mock.method(Class, "find", () => queryChain([{ _id: classId, name: "Grade 5-G" }]));
  t.mock.method(Subject, "find", () => queryChain([{ _id: subjectId, name: "Mathematics" }]));

  const body = await callList({ query: { page: "2", limit: "25" }, user: teacher, schoolId });
  const projected = pipeline.find((stage) => stage.$project);
  assert.equal(projected.$project.slides, undefined);
  assert.deepEqual(projected.$project.slideCount, { $size: { $ifNull: ["$slides", []] } });
  assert.deepEqual(
    pipeline.filter((stage) => "$skip" in stage || "$limit" in stage),
    [{ $skip: 0 }, { $limit: 25 }],
  );

  const [lesson] = body.data.lessons;
  assert.equal(lesson._id, "507f1f77bcf86cd7994390aa");
  assert.equal(lesson.slideCount, 12);
  assert.deepEqual(lesson.classId, { _id: classId, name: "Grade 5-G" });
  assert.deepEqual(lesson.subjectId, { _id: subjectId, name: "Mathematics" });
  assert.deepEqual(body.data.pagination, {
    page: 1,
    limit: 25,
    total: 1,
    pages: 1,
    libraryTotal: 1,
  });
});

test("a lesson whose class no longer resolves reads as unlinked", async (t) => {
  t.mock.method(LiveLesson, "aggregate", () => Promise.resolve([
    { _id: "507f1f77bcf86cd7994390aa", title: "Old", classId, subjectId: null, slideCount: 3 },
  ]));
  t.mock.method(LiveLesson, "countDocuments", async () => 1);
  t.mock.method(Class, "find", () => queryChain([]));
  t.mock.method(Subject, "find", () => queryChain([]));

  const body = await callList({ query: {}, user: teacher, schoolId });
  assert.equal(body.data.lessons[0].classId, null);
});
