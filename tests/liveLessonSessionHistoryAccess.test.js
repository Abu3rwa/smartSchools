import assert from "node:assert/strict";
import test from "node:test";
import LiveSession from "../models/LiveSession.js";
import { listLiveSessions } from "../controllers/liveLessonController.js";

const query = (value) => ({
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  select() { return this; },
  populate() { return this; },
  lean: async () => value,
});

test("teacher session history only queries sessions they own", async (t) => {
  const teacherId = "507f1f77bcf86cd799439011";
  const schoolId = "507f1f77bcf86cd799439012";
  let sessionFilter;

  t.mock.method(LiveSession, "find", (filter) => {
    sessionFilter = filter;
    return query([]);
  });
  t.mock.method(LiveSession, "countDocuments", async () => 0);

  let resolveResponse;
  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const res = {
    json(body) {
      this.body = body;
      resolveResponse();
      return this;
    },
  };
  listLiveSessions({
    query: {},
    user: { _id: teacherId, role: "teacher" },
    schoolId,
  }, res);
  await responsePromise;

  assert.deepEqual(sessionFilter, { school: schoolId, teacherId });
  assert.deepEqual(res.body.data.sessions, []);
});
