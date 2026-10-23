export const formatTaskDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * The server enforces practiceConfig.availability but not dueDate, so a closed
 * window is a hard block while a passed due date is only a warning.
 */
export const getScheduleView = (assignment, now = new Date()) => {
  const availability = assignment?.practiceConfig?.availability || {};
  const startAt = availability.startAt ? new Date(availability.startAt) : null;
  const endAt = availability.endAt ? new Date(availability.endAt) : null;
  const dueDate = assignment?.dueDate ? new Date(assignment.dueDate) : null;

  if (startAt && Number.isFinite(startAt.getTime()) && now < startAt) {
    return { key: "dashboard.opensOn", params: { date: formatTaskDate(startAt) }, tone: "muted", blocked: true };
  }
  if (endAt && Number.isFinite(endAt.getTime()) && now > endAt) {
    return { key: "dashboard.windowClosed", params: {}, tone: "urgent", blocked: true };
  }
  if (!dueDate || !Number.isFinite(dueDate.getTime())) return null;

  const dayDiff = Math.round((startOfDay(dueDate) - startOfDay(now)) / DAY_MS);
  if (dayDiff === 0) {
    return { key: "dashboard.dueToday", params: {}, tone: "urgent", blocked: false };
  }
  if (now > dueDate) {
    return { key: "dashboard.pastDue", params: { date: formatTaskDate(dueDate) }, tone: "warn", blocked: false };
  }
  if (dayDiff === 1) {
    return { key: "dashboard.dueTomorrow", params: {}, tone: "warn", blocked: false };
  }
  return { key: "dashboard.dueOn", params: { date: formatTaskDate(dueDate) }, tone: "muted", blocked: false };
};

export const getMasteryColor = (confidenceOrPct) => {
  if (confidenceOrPct >= 80) return "green";
  if (confidenceOrPct >= 40) return "yellow";
  if (confidenceOrPct > 0) return "red";
  return "gray";
};

export const getStatusBadge = (assignment) => {
  if (assignment.assessmentProgress?.isComplete) {
    return { label: "Completed", className: "status-mastered-gold" };
  }
  if (assignment.mastery?.isMastered && !assignment.mastery?.needsReview) {
    return { label: "Completed", className: "status-mastered-gold" };
  }
  if (
    assignment.mastery?.masteryStatus === "needs_review" ||
    (assignment.mastery?.isMastered && assignment.mastery?.needsReview)
  ) {
    return { label: "Needs Review", className: "status-needs-review" };
  }
  if (assignment.mastery?.totalAttempts > 0) {
    return { label: "Keep Going", className: "status-in-progress" };
  }
  return { label: "Ready to Start", className: "status-not-started" };
};

export const buildPracticeBuckets = (assignments) => {
  const mastered = assignments.filter(
    (assignment) =>
      assignment.assessmentProgress?.isComplete ||
      (assignment.mastery?.isMastered && !assignment.mastery?.needsReview),
  );
  const needsReview = assignments.filter(
    (assignment) =>
      assignment.mastery?.masteryStatus === "needs_review" ||
      (assignment.mastery?.isMastered && assignment.mastery?.needsReview),
  );
  const inProgress = assignments.filter(
    (assignment) =>
      !assignment.assessmentProgress?.isComplete &&
      (
        assignment.mastery?.masteryStatus === "in_progress" ||
        !assignment.mastery?.isMastered &&
        assignment.mastery?.totalAttempts > 0 &&
        assignment.mastery?.masteryStatus !== "needs_review"
      ),
  );
  const notStarted = assignments.filter(
    (assignment) =>
      !assignment.assessmentProgress?.isComplete &&
      (
        assignment.mastery?.masteryStatus === "not_started" ||
        (!assignment.mastery?.isMastered && assignment.mastery?.totalAttempts === 0)
      ),
  );

  return { mastered, needsReview, inProgress, notStarted };
};
