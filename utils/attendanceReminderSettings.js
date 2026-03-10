export const DEFAULT_ATTENDANCE_REMINDER_ENABLED = true;
export const DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES = 60;
export const MIN_ATTENDANCE_REMINDER_DELAY_MINUTES = 1;
export const MAX_ATTENDANCE_REMINDER_DELAY_MINUTES = 24 * 60;

const toInt = (value) => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return Number.NaN;
};

export const normalizeAttendanceReminderSettings = (rawSettings = {}) => {
  const enabled =
    typeof rawSettings?.enabled === "boolean"
      ? rawSettings.enabled
      : DEFAULT_ATTENDANCE_REMINDER_ENABLED;

  const delayMinutesCandidate = toInt(rawSettings?.delayMinutes);
  const delayMinutes =
    Number.isInteger(delayMinutesCandidate) &&
    delayMinutesCandidate >= MIN_ATTENDANCE_REMINDER_DELAY_MINUTES &&
    delayMinutesCandidate <= MAX_ATTENDANCE_REMINDER_DELAY_MINUTES
      ? delayMinutesCandidate
      : DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES;

  return { enabled, delayMinutes };
};

export const getAttendanceReminderSettingsFromSchool = (school) =>
  normalizeAttendanceReminderSettings(school?.settings?.attendanceReminders);

export const validateAttendanceReminderSettingsPayload = (payload = {}) => {
  const errors = [];

  if (typeof payload?.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  const delayMinutes = toInt(payload?.delayMinutes);
  if (!Number.isInteger(delayMinutes)) {
    errors.push("delayMinutes must be an integer");
  } else {
    if (delayMinutes < MIN_ATTENDANCE_REMINDER_DELAY_MINUTES) {
      errors.push(
        `delayMinutes must be at least ${MIN_ATTENDANCE_REMINDER_DELAY_MINUTES}`
      );
    }
    if (delayMinutes > MAX_ATTENDANCE_REMINDER_DELAY_MINUTES) {
      errors.push(
        `delayMinutes must be at most ${MAX_ATTENDANCE_REMINDER_DELAY_MINUTES}`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      enabled: payload.enabled,
      delayMinutes,
    },
  };
};
