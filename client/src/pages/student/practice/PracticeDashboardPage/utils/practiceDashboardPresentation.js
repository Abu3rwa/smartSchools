export const formatTaskDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
