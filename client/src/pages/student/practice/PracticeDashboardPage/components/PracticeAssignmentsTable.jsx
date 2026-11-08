import { HiOutlineCalendar, HiOutlineEye, HiOutlinePlay, HiOutlineRefresh } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import { PRACTICE_TABLE_HEADERS } from "../constants";
import { getMasteryColor, getScheduleView, getStatusBadge } from "../utils/practiceDashboardPresentation";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

const getAssignmentViewModel = (assignment, onOpenPractice, onOpenHistory, now, t, locale) => {
  const badge = getStatusBadge(assignment);
  const sessionType = assignment.practiceConfig?.sessionType === "assessment"
    ? "assessment"
    : "practice";
  const sessionTypeLabel = t(`dashboard.sessionTypes.${sessionType}`);
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
    ? t("dashboard.progress.assessmentSubmitted")
    : hasAssignmentLimit
      ? t("dashboard.progress.questionsDone", { done: completedCount, total: assignmentQuestionLimit })
      : lifetimeTotal > 0
        ? t("dashboard.progress.questionsAnswered", { answered: lifetimeTotal })
        : t("dashboard.progress.noQuestions");

  const progressHint = assessmentComplete
    ? t("dashboard.progress.reviewResult")
    : windowAttempts > 0
      ? t("dashboard.progress.recentCorrect", { correct: windowCorrect, attempts: windowAttempts })
      : hasAssignmentLimit
        ? t("dashboard.progress.left", { remaining: assignmentQuestionLimit - completedCount })
        : t("dashboard.progress.startWhenReady");

  const schedule = assessmentComplete ? null : getScheduleView(assignment, now, locale);

  const actionLabel = isReview
    ? t("dashboard.actions.reviewNow")
    : assessmentComplete || (isMastered && !isReview)
      ? t("dashboard.actions.viewResult")
      : lifetimeTotal > 0
        ? t("dashboard.actions.continue")
        : t("dashboard.actions.start");

  const actionIcon = isReview
    ? HiOutlineRefresh
    : assessmentComplete || (isMastered && !isReview)
      ? HiOutlineEye
      : HiOutlinePlay;

  const onPrimaryAction = assessmentComplete || (isMastered && !isReview)
    ? onOpenHistory
    : onOpenPractice;

  return {
    badge: { ...badge, label: t(badge.labelKey) },
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
  const { t, i18n } = useTranslation(['studentPractice']);
  const now = new Date();
  const locale = i18n.language === "ar" ? "ar-EG" : "en-GB";

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
              <th key={header}>{t(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => {
            const view = getAssignmentViewModel(assignment, onOpenPractice, onOpenHistory, now, t, locale);

            return (
              <tr key={assignment._id} className={view.isMastered ? "mastered-row" : view.isReview ? "needs-review-row" : ""}>
                <td>
                  <div className="standard-cell">
                    <span className="standard-name" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {assignment.title || t("dashboard.untitled")}
                    </span>
                    <span className="standard-code">
                      {formatStandardLabel(assignment.standard) || t("dashboard.notAvailable")}
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
        const view = getAssignmentViewModel(assignment, onOpenPractice, onOpenHistory, now, t, locale);

        return (
          <article key={assignment._id} className="assignment-card" role="listitem">
            <div className="assignment-card-top">
              <div className="standard-cell">
                <span className="standard-name" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {assignment.title || t("dashboard.untitled")}
                </span>
                <span className="standard-code">{formatStandardLabel(assignment.standard) || t("dashboard.notAvailable")}</span>
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
