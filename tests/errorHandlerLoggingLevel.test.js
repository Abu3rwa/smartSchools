import test from "node:test";
import assert from "node:assert/strict";
import logger from "../utils/logger.js";
import errorHandler from "../middleware/errorHandler.js";

const runHandler = (error, t) => {
  const events = [];
  t.mock.method(logger, "error", (message, meta) => events.push({ level: "error", message, meta }));
  t.mock.method(logger, "warn", (message, meta) => events.push({ level: "warn", message, meta }));

  let statusCode = null;
  let body = null;
  const res = {
    headersSent: false,
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    }
  };

  errorHandler(
    error,
    {
      headers: {},
      method: "POST",
      originalUrl: "/api/spelling/sessions/start",
      correlationId: "req-1"
    },
    res,
    () => {}
  );

  return { statusCode, body, events };
};

test("expected 4xx errors answer the client and log a warning without a stack", (t) => {
  const error = Object.assign(
    new Error("No unresolved missed words are available for this preparation test"),
    { statusCode: 400 }
  );

  const { statusCode, body, events } = runHandler(error, t);

  assert.equal(statusCode, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, "No unresolved missed words are available for this preparation test");
  assert.deepEqual(events.map((event) => event.level), ["warn"]);
  assert.equal(events[0].meta.correlationId, "req-1");
  assert.equal(events[0].meta.statusCode, 400);
  assert.equal(events[0].meta.stack, undefined);
});

test("mongodb duplicate key errors are logged as warnings", (t) => {
  const error = Object.assign(new Error("E11000 duplicate key error"), {
    code: 11000,
    keyValue: { email: "teacher@school.com" }
  });

  const { statusCode, events } = runHandler(error, t);

  assert.equal(statusCode, 400);
  assert.deepEqual(events.map((event) => event.level), ["warn"]);
});

test("unexpected errors keep error-level logging with the stack", (t) => {
  const { statusCode, events } = runHandler(new Error("boom"), t);

  assert.equal(statusCode, 500);
  assert.equal(events[0].level, "error");
  assert.ok(events[0].meta.stack);
});
