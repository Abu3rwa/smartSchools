/** Defaults and validation shared by the settings controller and the homework auto-reply job. */

/**
 * Rollout gate: auto-send stays off server-side until drafts have been proven
 * on real "what's due" replies. Flip to true only after that review.
 */
export const HOMEWORK_SEND_ENABLED = false;

export const HOMEWORK_AUTOREPLY_DEFAULTS = Object.freeze({
  enabled: false,
  confirmedRisk: false,
  scope: "own_subject",
  daysAhead: 7,
  deliveryMode: "draft_only",
});

export const normalizeHomeworkAutoReply = (value) => ({
  ...HOMEWORK_AUTOREPLY_DEFAULTS,
  ...(value || {}),
  enabled: value?.enabled === true,
  confirmedRisk: value?.confirmedRisk === true,
  scope: value?.scope === "whole_class" ? "whole_class" : "own_subject",
});

/** What will really happen, regardless of what was asked for. */
export const effectiveHomeworkDeliveryMode = (value) =>
  HOMEWORK_SEND_ENABLED && value === "send" ? "send" : "draft_only";
