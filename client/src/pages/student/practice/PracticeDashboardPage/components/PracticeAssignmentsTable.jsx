import { HiOutlineCalendar, HiOutlineEye, HiOutlinePlay, HiOutlineRefresh } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { PRACTICE_TABLE_HEADERS } from "../constants";
import { getMasteryColor, getScheduleView, getStatusBadge } from "../utils/practiceDashboardPresentation";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

const getAssignmentViewModel = (assignment, onOpenPractice, onOpenHistory, now) => {
  const badge = getStatusBadge(assignment);
  const sessionType = assignment.practiceConfig?.sessionType === "assessment"
    ? "assessment"
    : "practice";
  const sessionTypeLabel = sessionType === "assessment" ? "Assessment" : "Practice";
  const assessmentComplete = Boolean(assignment.assessmentProgress?.isComplete);
  const isReview = assignment.mastery?.masteryStatus === "needs_review" || assignment.mastery?.needsReview;
  const isMastered = assignment.mastery?.isMastered && !assignment.mastery?.needsReview;
  const lifetimeTotal = assignment.mastery?.lifetimeStats?.totalAttempts ?? assignment.mastery?.totalAttempts ?? 0;
  const windowCorrect = assignment.mastery?.rollingWindowStats?.windowCorrect ?? assignment.mastery?.correctCount ?? 0;
  const windowAttempts = assignment.mastery?.rollingWindowStats?.windowAttempts ?? 0;
  const confidence = assignment.mastery?.confidenceScore ?? assignment.mastery?.percentage ?? 0;
  const assignmentQuestionLimit = Number(assignment.practiceConfig?.questionLimit || 0);
  const hasAssignmentLimit = Number.isFinite(assignmentQuestionLimit) && assignmentQuestionLimit > 0;
  const completedCount = hasAssignmentLimit
    ? Math.min(lifetimeTotal, assignmentQuestionLimit)
    : lifetimeTotal;

  const progressPercent = hasAssignmentLimit
    ? Math.min(100, Math.round((completedCount / assignmentQuestionLimit) * 100))
    : Math.min(100, confidence);

  const progressText = assessmentComplete
    ? "Assessment submitted"
    : hasAssignmentLimit
      ? `${completedCount}/${assignmentQuestionLimit} questions done`
      : lifetimeTotal > 0
        ? `${lifetimeTotal} questions answered`
        : "No questions answered yet";

  const progressHint = assessmentComplete
    ? "You can review your result"
    : windowAttempts > 0
      ? `${windowCorrect}/${windowAttempts} correct recently`
      : hasAssignmentLimit
        ? `${assignmentQuestionLimit - completedCount} left`
        : "Start when ready";

  const schedule = assessmentComplete ? null : getScheduleView(assignment, now);

  const actionLabel = isReview
    ? "Review Now"
    : assessmentComplete || (isMastered && !isReview)
      ? "View Result"
      : lifetimeTotal > 0
        ? "Continue"
        : "Start";

  const actionIcon = isReview
    ? HiOutlineRefresh
    : assessmentComplete || (isMastered && !isReview)
      ? HiOutlineEye
      : HiOutlinePlay;

  const onPrimaryAction = assessmentComplete || (isMastered && !isReview)
    ? onOpenHistory
    : onOpenPractice;

  return {
    badge,
    schedule,
    sessionType,
    sessionTypeLabel,
    progressPercent,
    progressText,
    progressHint,
    actionLabel,
    actionIcon,
    onPrimaryAction,
    isMastered,
    isReview,
  };
};

const PracticeAssignmentsTable = ({ assignments, onOpenPractice, onOpenHistory }) => {
  const { t } = useTranslation(['studentPractice']);
  const now = new Date();

  const renderSchedule = (view) => {
    if (!view.schedule) return null;
    return (
      <span className={`practice-schedule practice-schedule--${view.schedule.tone}`}>
        <HiOutlineCalendar size={13} aria-hidden="true" />
        {t(`studentPractice:${view.schedule.key}`, view.schedule.params)}
      </span>
    );
  };

  const renderAction = (view, assignment) => {
    const ActionIcon = view.actionIcon;
    const blocked = Boolean(view.schedule?.blocked);
    return (
      <button
        className={`btn btn-sm ${view.isReview ? "btn-warning" : "btn-primary"}`}
        onClick={() => view.onPrimaryAction(assignment._id)}
        disabled={blocked}
        title={blocked && view.schedule
            ? t(`studentPractice:${view.schedule.key}`, view.schedule.params)
            : undefined}
      >
        <ActionIcon size={16} />
        <span>{view.actionLabel}</span>
      </button>
    );
  };

  return (
    <>
    <div className="table-container desktop-assignments">
      <table className="practice-table">
        <thead>
          <tr>
            {PRACTICE_TABLE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => {
            const view = getAssignmentViewModel(assignment, onOpenPractice, onOpenHistory, now);

            return (
              <tr key={assignment._id} className={view.isMastered ? "mastered-row" : view.isReview ? "needs-review-row" : ""}>
                <td>
                  <div className="standard-cell">
                    <span className="standard-name" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {assignment.title || "Standards Assignment"}
                    </span>
                    <span className="standard-code">
                      {formatStandardLabel(assignment.standard) || "N/A"}
                    </span>
                    <span className={`assignment-type-badge assignment-type-badge--${view.sessionType}`}>
                      {view.sessionTypeLabel}
                    </span>
                    {renderSchedule(view)}
                  </div>
                </td>
                <td>{assignment.subject?.name || "-"}</td>
                <td>
                  <span className={`status-badge ${view.badge.className}`}>{view.badge.label}</span>
                </td>
                <td>
                  <div className="progress-cell student-first-progress">
                    <div className="progress-bar-wrapper" title={view.progressText}>
                      <div
                        className={`progress-bar-fill ${getMasteryColor(view.progressPercent)}`}
                        style={{ width: `${Math.min(100, view.progressPercent)}%` }}
                      />
                    </div>
                    <div className="progress-meta">
                      <span className="progress-text">{view.progressText}</span>
                      <span className="progress-subtext">{view.progressHint}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="actions-cell">
                    {renderAction(view, assignment)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="mobile-assignment-list" role="list">
      {assignments.map((assignment) => {
        const view = getAssignmentViewModel(assignment, onOpenPractice, onOpenHistory, now);

        return (
          <article key={assignment._id} className="assignment-card" role="listitem">
            <div className="assignment-card-top">
              <div className="standard-cell">
                <span className="standard-name" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {assignment.title || "Standards Assignment"}
                </span>
                <span className="standard-code">{formatStandardLabel(assignment.standard) || "N/A"}</span>
              </div>
              <span className={`assignment-type-badge assignment-type-badge--${view.sessionType}`}>
                {view.sessionTypeLabel}
              </span>
            </div>

            <div className="assignment-card-status-row">
              <span className={`status-badge ${view.badge.className}`}>{view.badge.label}</span>
              <span className="text-muted" style={{ fontSize: "0.78rem" }}>
                {assignment.subject?.name || "-"}
              </span>
            </div>

            {renderSchedule(view)}

            <div className="progress-cell student-first-progress">
              <div className="progress-bar-wrapper" title={view.progressText}>
                <div
                  className={`progress-bar-fill ${getMasteryColor(view.progressPercent)}`}
                  style={{ width: `${Math.min(100, view.progressPercent)}%` }}
                />
              </div>
              <div className="progress-meta">
                <span className="progress-text">{view.progressText}</span>
                <span className="progress-subtext">{view.progressHint}</span>
              </div>
            </div>

            {renderAction(view, assignment)}
          </article>
        );
      })}
    </div>
    </>
  );
};

export default PracticeAssignmentsTable;
