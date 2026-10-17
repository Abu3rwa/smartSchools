import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLiveSessionDurationMs,
  getSessionPauseAccounting,
  resumeLiveSessionPause,
} from "../services/liveSessionTime.js";

test("active session duration excludes completed pause intervals", () => {
  const session = {
    startedAt: new Date("2026-10-16T08:00:00.000Z"),
    endedAt: new Date("2026-10-17T12:42:00.000Z"),
    totalPausedMs: 27 * 60 * 60 * 1000 + 55 * 60 * 1000,
  };

  assert.equal(activeLiveSessionDurationMs(session), 47 * 60 * 1000);
});

test("active session duration excludes an ongoing pause", () => {
  const session = {
    startedAt: new Date("2026-10-17T10:00:00.000Z"),
    paused: true,
    pausedAt: new Date("2026-10-17T10:40:00.000Z"),
    totalPausedMs: 5 * 60 * 1000,
  };

  assert.equal(
    activeLiveSessionDurationMs(session, new Date("2026-10-17T11:00:00.000Z")),
    35 * 60 * 1000,
  );
});

test("resuming a paused session accumulates pause time and clears its pause state", () => {
  const session = {
    paused: true,
    pausedAt: new Date("2026-10-17T10:40:00.000Z"),
    totalPausedMs: 5 * 60 * 1000,
  };

  resumeLiveSessionPause(session, new Date("2026-10-17T10:47:00.000Z"));

  assert.equal(session.totalPausedMs, 12 * 60 * 1000);
  assert.equal(session.paused, false);
  assert.equal(session.pausedAt, null);
});

test("resuming an unpaused session does not change accumulated pause time", () => {
  const session = { paused: false, totalPausedMs: 3000 };

  resumeLiveSessionPause(session, new Date());

  assert.equal(session.totalPausedMs, 3000);
});

test("legacy pause events reconstruct completed and ongoing pause durations", () => {
  const accounting = getSessionPauseAccounting([
    { type: "session:paused", at: "2026-10-17T10:10:00.000Z" },
    { type: "session:resumed", at: "2026-10-17T10:20:00.000Z" },
    { type: "session:paused", at: "2026-10-17T10:30:00.000Z" },
  ]);

  assert.equal(accounting.totalPausedMs, 10 * 60 * 1000);
  assert.equal(accounting.pausedAt.toISOString(), "2026-10-17T10:30:00.000Z");
});

test("a legacy session-ended event closes an open pause interval", () => {
  const accounting = getSessionPauseAccounting([
    { type: "session:paused", at: "2026-10-17T10:10:00.000Z" },
    { type: "session:ended", at: "2026-10-17T10:57:00.000Z" },
  ]);

  assert.equal(accounting.totalPausedMs, 47 * 60 * 1000);
  assert.equal(accounting.pausedAt, null);
});
