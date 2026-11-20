import test from "node:test";
import assert from "node:assert/strict";
import logger from "../utils/logger.js";
import errorHandler, { notFound } from "../middleware/errorHandler.js";
import { resetDbOutageLogState } from "../utils/dbHealth.js";

const runHandler = (error, t) => {
  const events = [];
  const headers = {};
  t.mock.method(logger, "error", (message, meta) => events.push({ level: "error", message, meta }));
  t.mock.method(logger, "warn", (message, meta) => events.push({ level: "warn", message, meta }));

  let statusCode = null;
  let body = null;
  const res = {
    headersSent: false,
    setHeader(name, value) {
      headers[name] = value;
    },
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

  return { statusCode, body, events, headers };
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

test("an unmatched route answers 404 instead of a fake 500 crash", (t) => {
  t.mock.method(logger, "warn", () => {});
  t.mock.method(logger, "error", () => {});

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
  const req = {
    headers: {},
    method: "GET",
    originalUrl: "/api/teacher/behavior/overview"
  };

  notFound(req, res, (error) => errorHandler(error, req, res, () => {}));

  assert.equal(statusCode, 404);
  assert.match(body.message, /Not Found - \/api\/teacher\/behavior\/overview/);
  assert.deepEqual(body.message === "Internal server error", false);
});

test("a database outage answers 503 with a retry hint instead of a 500", (t) => {
  resetDbOutageLogState();
  const error = Object.assign(
    new Error("getaddrinfo ENOTFOUND ac-wovlb2h-shard-00-00.glgpmmp.mongodb.net"),
    { name: "MongoServerSelectionError" }
  );

  const { statusCode, body, events, headers } = runHandler(error, t);

  assert.equal(statusCode, 503);
  assert.equal(body.code, "DB_UNAVAILABLE");
  assert.match(body.message, /temporarily unreachable/);
  assert.equal(headers["Retry-After"], "15");
  assert.deepEqual(events.map((event) => event.level), ["warn"]);
  assert.equal(events[0].message, "database_unreachable");
});

test("repeated outage responses log once instead of once per request", (t) => {
  resetDbOutageLogState();
  const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

  const first = runHandler(error, t);
  const second = runHandler(error, t);

  assert.equal(first.statusCode, 503);
  assert.equal(second.statusCode, 503);
  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 0);
});
