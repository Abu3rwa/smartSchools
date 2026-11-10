import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import notificationService from "../services/notificationService.js";

const ENV_KEY = "STANDARDS_COMPLETION_EMAIL_ENABLED";

const assignment = {
  _id: "507f1f77bcf86cd799439041",
  title: "Term 1 Assessment",
  practiceConfig: { sessionType: "assessment" },
};

const invoke = async (t, { env, audience }) => {
  const previous = process.env[ENV_KEY];
  if (env === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = env;
  t.after(() => {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });

  const sent = [];
  const pushed = [];
  const saved = [];
  t.mock.method(Student, "findById", async () => ({
    _id: "507f1f77bcf86cd799439021",
    school: "507f1f77bcf86cd799439011",
    fullName: "Test Student",
  }));
  t.mock.method(
    notificationService,
    "_resolveAssignmentAudience",
    async () => audience,
  );
  t.mock.method(notificationService, "sendEmail", async (notification) => {
    sent.push(notification);
  });
  t.mock.method(notificationService, "_dispatchParentUpdatePush", async (args) => {
    pushed.push(args);
  });
  t.mock.method(Notification.prototype, "save", async function save() {
    saved.push(this);
    return this;
  });

  const created =
    await notificationService.sendStandardAssignmentCompletedNotification({
      studentId: "507f1f77bcf86cd799439021",
      assignment,
      score: 3,
      maxScore: 4,
    });
  return { created, sent, pushed, saved };
};

const bothChannelsAudience = () => ({
  parentRecipients: [
    {
      userId: "user-1",
      email: "parent@example.com",
      pushEnabled: true,
      emailEnabled: true,
    },
  ],
  fallbackEmails: ["fallback@example.com"],
});

test("gate unset: no completion email sends, push and inbox entry remain", async (t) => {
  const { created, sent, pushed, saved } = await invoke(t, {
    env: undefined,
    audience: bothChannelsAudience(),
  });

  assert.equal(sent.length, 0);
  assert.equal(pushed.length, 1);
  assert.equal(saved.length, 1);
  assert.equal(created.length, 1);
  assert.deepEqual(saved[0].channels, ["push"]);
});

test("gate true: parent and fallback emails send as before", async (t) => {
  const { sent, pushed, saved } = await invoke(t, {
    env: "true",
    audience: bothChannelsAudience(),
  });

  assert.equal(sent.length, 2);
  assert.equal(pushed.length, 1);
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[0].channels, ["push", "email"]);
  assert.deepEqual(saved[1].channels, ["email"]);
});

test("gate off keeps the in-app entry for an email-only parent", async (t) => {
  const { sent, pushed, saved } = await invoke(t, {
    env: undefined,
    audience: {
      parentRecipients: [
        {
          userId: "user-1",
          email: "parent@example.com",
          pushEnabled: false,
          emailEnabled: true,
        },
      ],
      fallbackEmails: [],
    },
  });

  assert.equal(sent.length, 0);
  assert.equal(pushed.length, 0);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].channels, []);
});

test("gate off: fallback-only audiences produce nothing", async (t) => {
  const { created, sent, saved } = await invoke(t, {
    env: "false",
    audience: {
      parentRecipients: [],
      fallbackEmails: ["fallback@example.com"],
    },
  });

  assert.equal(sent.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(created.length, 0);
});