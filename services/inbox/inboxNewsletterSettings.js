/** Defaults and validation shared by the settings controller and the auto-reply job. */

export const CHECK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_CHECK_TIMES = 12;
// A 15-minute tick must land within tolerance of a check time or it is missed.
export const CHECK_TIME_TOLERANCE_MINUTES = 10;

/**
 * The teacher's own `enabled` + `confirmedRisk` + `deliveryMode` choice is the
 * real gate now; this stays exported so `effectiveDeliveryMode` has a single
 * place to flip back to draft-only-only if a rollback is ever needed.
 */
export const NEWSLETTER_SEND_ENABLED = true;

export const NEWSLETTER_AUTOREPLY_DEFAULTS = Object.freeze({
  enabled: false,
  confirmedRisk: false,
  hoursBeforeDeadline: 3,
  deliveryMode: "draft_only",
  checkTimes: Object.freeze(["07:00", "18:00", "00:00"]),
});

export const normalizeCheckTimes = (value) => {
  const list = Array.isArray(value)
    ? value
    : NEWSLETTER_AUTOREPLY_DEFAULTS.checkTimes;
  const valid = [
    ...new Set(
      list.filter(
        (time) => typeof time === "string" && CHECK_TIME_PATTERN.test(time),
      ),
    ),
  ];
  return valid.sort();
};

export const normalizeNewsletterAutoReply = (value) => ({
  ...NEWSLETTER_AUTOREPLY_DEFAULTS,
  ...(value || {}),
  enabled: value?.enabled === true,
  confirmedRisk: value?.confirmedRisk === true,
  checkTimes: normalizeCheckTimes(value?.checkTimes),
});

/** What will really happen, regardless of what was asked for. */
export const effectiveDeliveryMode = (value) =>
  NEWSLETTER_SEND_ENABLED && value === "send" ? "send" : "draft_only";

const minutesOfDay = (time) => {
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
};

/** True when the local clock is within tolerance of one of the teacher's check times. */
export const isCheckTimeNow = (checkTimes, localMinutes) => {
  const times = normalizeCheckTimes(checkTimes);
  return times.some((time) => {
    const diff = Math.abs(minutesOfDay(time) - localMinutes);
    return Math.min(diff, 24 * 60 - diff) <= CHECK_TIME_TOLERANCE_MINUTES;
  });
};
