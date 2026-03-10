import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES,
  DEFAULT_ATTENDANCE_REMINDER_ENABLED,
  MAX_ATTENDANCE_REMINDER_DELAY_MINUTES,
  MIN_ATTENDANCE_REMINDER_DELAY_MINUTES,
  getAttendanceReminderSettingsFromSchool,
  validateAttendanceReminderSettingsPayload,
} from "../utils/attendanceReminderSettings.js";

test("getAttendanceReminderSettingsFromSchool returns defaults when settings are missing", () => {
  const settings = getAttendanceReminderSettingsFromSchool({});
  assert.equal(settings.enabled, DEFAULT_ATTENDANCE_REMINDER_ENABLED);
  assert.equal(settings.delayMinutes, DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES);
});

test("getAttendanceReminderSettingsFromSchool normalizes valid school settings", () => {
  const settings = getAttendanceReminderSettingsFromSchool({
    settings: { attendanceReminders: { enabled: false, delayMinutes: 90 } },
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.delayMinutes, 90);
});

test("validateAttendanceReminderSettingsPayload validates strict payload shape", () => {
  const missing = validateAttendanceReminderSettingsPayload({
    delayMinutes: 60,
  });
  assert.equal(missing.valid, false);

  const invalidDelay = validateAttendanceReminderSettingsPayload({
    enabled: true,
    delayMinutes: 1.5,
  });
  assert.equal(invalidDelay.valid, false);

  const tooSmall = validateAttendanceReminderSettingsPayload({
    enabled: true,
    delayMinutes: MIN_ATTENDANCE_REMINDER_DELAY_MINUTES - 1,
  });
  assert.equal(tooSmall.valid, false);

  const tooLarge = validateAttendanceReminderSettingsPayload({
    enabled: true,
    delayMinutes: MAX_ATTENDANCE_REMINDER_DELAY_MINUTES + 1,
  });
  assert.equal(tooLarge.valid, false);

  const valid = validateAttendanceReminderSettingsPayload({
    enabled: true,
    delayMinutes: 120,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.data, { enabled: true, delayMinutes: 120 });
});
