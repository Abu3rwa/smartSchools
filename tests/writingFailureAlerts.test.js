import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { setTimeout as delay } from "node:timers/promises";

import Notification from "../models/Notification.js";
import School from "../models/School.js";
import User from "../models/User.js";
import WritingFailureAlert from "../models/WritingFailureAlert.js";
import notificationService from "../services/notificationService.js";
import {
  ALERT_COOLDOWN_MS,
  ALERT_THRESHOLD,
  alertDecision,
  assertWritingCredit,
  buildFailureAlertCopy,
  noteWritingFailure,
} from "../services/writingFailureAlertService.js";

const oid = () => new mongoose.Types.ObjectId().toString();
const schoolId = oid();

const chain = (value) => {
  const query = {
    select: () => query,
    lean: async () => value,
  };
  return query;
};

const stub = (target, key, replacement) => {
  const original = target[key];
  target[key] = replacement;
  return () => {
    target[key] = original;
  };
};

const minutes = (n) => n * 60 * 1000;

/* ------------------------------------------------------------------ */
/* The decision is pure                                               */
/* ------------------------------------------------------------------ */

test("the first two failures stay quiet and the third opens an alert", () => {
  const now = new Date("2026-11-17T08:00:00Z");
  assert.equal(alertDecision({ count: ALERT_THRESHOLD - 1, alertedAt: null }, now), false);
  assert.equal(alertDecision({ count: ALERT_THRESHOLD, alertedAt: null }, now), true);
});

test("a repeated outage inside the cooldown stays quiet", () => {
  const now = new Date("2026-11-17T08:20:00Z");
  const alertedAt = new Date(now - ALERT_COOLDOWN_MS + minutes(1));
  assert.equal(alertDecision({ count: 9, alertedAt }, now), false);
  const expired = new Date(now - ALERT_COOLDOWN_MS - minutes(1));
  assert.equal(alertDecision({ count: 9, alertedAt: expired }, now), true);
});

test("the alert sentences fill the count and the window and carry no token", () => {
  const english = buildFailureAlertCopy({
    errorCode: "AI_PROVIDER_ERROR",
    count: 3,
    language: "en",
  });
  assert.match(english.message, /3 writing assessments/);
  assert.match(english.message, /15 minutes/);
  assert.equal(/\{\w+\}/.test(english.message), false);

  const arabic = buildFailureAlertCopy({
    errorCode: "CREDIT_EXHAUSTED",
    count: 4,
    language: "ar",
  });
  assert.match(arabic.subject, /[؀-ۿ]/);
  assert.match(arabic.message, /4/);
  assert.equal(/\{\w+\}/.test(arabic.message), false);

  const quota = buildFailureAlertCopy({
    errorCode: "AI_PROVIDER_QUOTA",
    count: 2,
    language: "en",
  });
  assert.match(quota.subject, /provider account is out of balance/);
  assert.match(quota.message, /2 writing assessments/);
  // The outage is the platform's provider bill, not the school's balance.
  assert.match(quota.message, /school's own AI credit is untouched/);
  assert.equal(/\{\w+\}/.test(quota.message), false);
});

/* ------------------------------------------------------------------ */
/* Counting, throttling and delivery                                  */
/* ------------------------------------------------------------------ */

const withAlertStubs = (
  t,
  { school = { name: "Test School", reportSettings: { defaultLanguage: "english" } }, admins = null } = {},
  run,
) => {
  const calls = { upserts: [], claims: [], resets: [], notifications: [], emails: [] };
  // One persisted row, as the database would hold it for this school and code.
  const row = { _id: oid(), count: 0, firstAt: null, lastAt: null, alertedAt: null };
  const recipients =
    admins ||
    [
      { _id: oid(), email: "admin1@example.com" },
      { _id: oid(), email: "admin2@example.com" },
    ];

  const restores = [
    stub(WritingFailureAlert, "updateOne", async (filter, update) => {
      if (filter._id) {
        if (row.alertedAt) return { modifiedCount: 0 };
        row.alertedAt = update.$set.alertedAt;
        calls.claims.push({ at: update.$set.alertedAt });
        return { modifiedCount: 1 };
      }
      if (filter.firstAt?.$lt && row.firstAt && row.firstAt < filter.firstAt.$lt) {
        calls.resets.push({ from: row.firstAt });
        row.count = update.$set.count;
        row.firstAt = update.$set.firstAt;
      }
      return { modifiedCount: 0 };
    }),
    stub(WritingFailureAlert, "findOneAndUpdate", async (filter, update) => {
      calls.upserts.push({ filter, update });
      if (!row.firstAt) row.firstAt = update.$setOnInsert.firstAt;
      row.count += update.$inc.count;
      row.lastAt = update.$set.lastAt;
      return { ...row };
    }),
    stub(User, "find", () => chain(recipients)),
    stub(School, "findOne", () => chain(school)),
    stub(Notification, "create", async (input) => {
      calls.notifications.push(input);
      return { ...input };
    }),
    stub(notificationService, "sendEmail", async (notification) => {
      calls.emails.push(notification);
    }),
  ];
  t.after(() => restores.forEach((restore) => restore()));
  return run(calls);
};

test("three failures send one alert per admin and the rest of the outage is silent", async (t) => {
  await withAlertStubs(t, {}, async (calls) => {
    const at = new Date("2026-11-17T08:00:00Z");
    const first = await noteWritingFailure({
      schoolId,
      errorCode: "AI_PROVIDER_ERROR",
      now: at,
    });
    const second = await noteWritingFailure({
      schoolId,
      errorCode: "AI_PROVIDER_ERROR",
      now: new Date(at.getTime() + minutes(1)),
    });
    const third = await noteWritingFailure({
      schoolId,
      errorCode: "AI_PROVIDER_ERROR",
      now: new Date(at.getTime() + minutes(2)),
    });

    assert.equal(first.alerted, false);
    assert.equal(second.alerted, false);
    assert.equal(third.alerted, true);
    assert.equal(calls.notifications.length, 2);
    assert.equal(calls.emails.length, 2);
    assert.match(calls.notifications[0].subject, /Writing feedback AI is failing/);
    assert.match(calls.notifications[0].message, /3 writing assessments/);
    assert.equal(calls.notifications[0].priority, "high");
    assert.equal(calls.notifications[0].metadata.code, "AI_PROVIDER_ERROR");

    // The window restarts after fifteen quiet minutes, but the cooldown holds:
    // the next burst is the same outage and must not email the admins again.
    let later = new Date(at.getTime() + minutes(20));
    for (let i = 0; i < 3; i += 1) {
      const result = await noteWritingFailure({
        schoolId,
        errorCode: "AI_PROVIDER_ERROR",
        now: new Date(later.getTime() + minutes(i)),
      });
      assert.equal(result.alerted, false);
    }
    assert.equal(calls.notifications.length, 2);
    assert.equal(calls.resets.length, 1);
  });
});

test("a failure class the admin cannot act on is not counted", async (t) => {
  await withAlertStubs(t, {}, async (calls) => {
    const result = await noteWritingFailure({
      schoolId,
      errorCode: "AI_INVALID_REPLY",
    });
    assert.equal(result, null);
    assert.equal(calls.upserts.length, 0);
    assert.equal(calls.notifications.length, 0);
  });
});

test("an Arabic school gets the alert in Arabic", async (t) => {
  await withAlertStubs(
    t,
    {
      school: { name: "مدرسة", reportSettings: { defaultLanguage: "arabic" } },
      admins: [{ _id: oid(), email: "admin@example.com" }],
    },
    async (calls) => {
      const at = new Date("2026-11-17T08:00:00Z");
      for (let i = 0; i < 3; i += 1) {
        await noteWritingFailure({
          schoolId,
          errorCode: "CREDIT_EXHAUSTED",
          now: new Date(at.getTime() + minutes(i)),
        });
      }
      assert.equal(calls.notifications.length, 1);
      assert.match(calls.notifications[0].subject, /الذكاء الاصطناعي/);
    },
  );
});

test("a school with no admin address sends nothing and breaks nothing", async (t) => {
  await withAlertStubs(t, { admins: [] }, async (calls) => {
    const at = new Date("2026-11-17T08:00:00Z");
    let last = null;
    for (let i = 0; i < 3; i += 1) {
      last = await noteWritingFailure({
        schoolId,
        errorCode: "AI_PROVIDER_ERROR",
        now: new Date(at.getTime() + minutes(i)),
      });
    }
    assert.equal(last.alerted, true);
    assert.equal(calls.notifications.length, 0);
  });
});

test("a broken monitor never throws into the run path", async (t) => {
  const restoreUpdate = stub(WritingFailureAlert, "updateOne", async () => {
    throw new Error("monitor is down");
  });
  const restoreFind = stub(WritingFailureAlert, "findOneAndUpdate", async () => {
    throw new Error("monitor is down");
  });
  t.after(() => {
    restoreUpdate();
    restoreFind();
  });
  const result = await noteWritingFailure({
    schoolId,
    errorCode: "AI_PROVIDER_ERROR",
  });
  assert.equal(result, null);
});

/* ------------------------------------------------------------------ */
/* The credit gate feeds the same monitor                             */
/* ------------------------------------------------------------------ */

test("a credit refusal is counted and still thrown to the caller", async (t) => {
  await withAlertStubs(t, {}, async (calls) => {
    const creditError = Object.assign(
      new Error("There are not enough AI credits left."),
      { statusCode: 402, code: "AI_CREDIT_REQUIRED" },
    );
    await assert.rejects(
      assertWritingCredit({
        schoolId,
        userId: oid(),
        assertSpend: async () => {
          throw creditError;
        },
      }),
      (error) => error === creditError,
    );
    await delay(0);
    assert.equal(calls.upserts.length, 1);
    assert.equal(calls.upserts[0].filter.code, "CREDIT_EXHAUSTED");
  });
});

test("a deliberate credit state is not counted as an outage", async (t) => {
  await withAlertStubs(t, {}, async (calls) => {
    await assert.rejects(
      assertWritingCredit({
        schoolId,
        userId: oid(),
        assertSpend: async () => {
          throw Object.assign(new Error("Pricing missing."), {
            code: "AI_CREDIT_PRICING_REQUIRED",
          });
        },
      }),
    );
    await delay(0);
    // Missing pricing (and a paused account) is a deliberate state, not an
    // outage; only an empty balance alerts the admins.
    assert.equal(calls.upserts.length, 0);
  });
});
