import test from "node:test";
import assert from "node:assert/strict";
import LiveSession from "../models/LiveSession.js";

test("live sessions store an optional schedule and bounded class timer", () => {
  const scheduledAt = LiveSession.schema.path("scheduledAt");
  const timerDurationMinutes = LiveSession.schema.path("timerDurationMinutes");

  assert.ok(scheduledAt);
  assert.equal(timerDurationMinutes.defaultValue, 0);
  assert.equal(timerDurationMinutes.options.min, 0);
  assert.equal(timerDurationMinutes.options.max, 240);
});
