/**
 * Phase 5 teacher throughput. Off by default: it adds endpoints and screens a
 * teacher has to be shown, so enabling it is a rollout decision.
 * F13 (returning a mistaken submission) is a bug fix and is not gated here.
 */
export const teacherToolsEnabled = () =>
  process.env.WRITING_TEACHER_TOOLS === "1";
