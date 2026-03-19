import { HiOutlineEye, HiOutlinePlay, HiOutlineRefresh } from "react-icons/hi";
import { PRACTICE_TABLE_HEADERS } from "../constants";
import { getMasteryColor, getStatusBadge } from "../utils/practiceDashboardPresentation";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

const PracticeAssignmentsTable = ({ assignments, onOpenPractice, onOpenHistory }) => (
  <div className="table-container">
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
          const badge = getStatusBadge(assignment);
          const sessionType = assignment.practiceConfig?.sessionType === "assessment"
            ? "assessment"
            : "practice";
          const assessmentComplete = Boolean(assignment.assessmentProgress?.isComplete);
          const sessionTypeLabel = sessionType === "assessment" ? "Assessment" : "Practice";
          const lifetimeTotal = assignment.mastery?.lifetimeStats?.totalAttempts ?? assignment.mastery?.totalAttempts ?? 0;
          const windowCorrect = assignment.mastery?.rollingWindowStats?.windowCorrect ?? assignment.mastery?.correctCount ?? 0;
          const windowAttempts = assignment.mastery?.rollingWindowStats?.windowAttempts ?? 0;
          const confidence = assignment.mastery?.confidenceScore ?? assignment.mastery?.percentage ?? 0;
          const isReview = assignment.mastery?.masteryStatus === "needs_review" || assignment.mastery?.needsReview;
          const isMastered = assignment.mastery?.isMastered && !assignment.mastery?.needsReview;
          const assignmentQuestionLimit = Number(assignment.practiceConfig?.questionLimit || 0);
          const hasAssignmentLimit = Number.isFinite(assignmentQuestionLimit) && assignmentQuestionLimit > 0;
          const completedCount = hasAssignmentLimit
            ? Math.min(lifetimeTotal, assignmentQuestionLimit)
            : lifetimeTotal;
          const completionPercent = hasAssignmentLimit
            ? Math.min(100, Math.round((completedCount / assignmentQuestionLimit) * 100))
            : null;
          const showCompletionProgress = hasAssignmentLimit && !isMastered && !isReview && !assessmentComplete;
          const progressPercent = showCompletionProgress ? completionPercent : confidence;
          const progressText = assessmentComplete
            ? `${assignmentQuestionLimit}/${assignmentQuestionLimit}`
            : showCompletionProgress
            ? `${completedCount}/${assignmentQuestionLimit}`
            : `${confidence}%`;
          const progressTitle = assessmentComplete
            ? `Assessment complete: ${assignmentQuestionLimit} of ${assignmentQuestionLimit} answered`
            : showCompletionProgress
            ? `Assignment completion: ${completedCount} of ${assignmentQuestionLimit} answered`
            : `Mastery confidence: ${confidence}%`;
          const progressSubtext = assessmentComplete
            ? "Assessment submitted"
            : showCompletionProgress
              ? "Assignment progress"
              : "Mastery confidence";
          const actionLabel = isReview
            ? "Review"
            : assessmentComplete
              ? `${sessionTypeLabel} Complete`
            : lifetimeTotal > 0
              ? `Continue ${sessionTypeLabel}`
              : `Start ${sessionTypeLabel}`;

          return (
            <tr key={assignment._id} className={isMastered ? "mastered-row" : isReview ? "needs-review-row" : ""}>
              <td>
                <div className="standard-cell">
                  <span className="standard-name" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {assignment.title || "Standards Assignment"}
                  </span>
                  <span className="standard-code">
                    {formatStandardLabel(assignment.standard) || "N/A"}
                  </span>
                  <span className={`assignment-type-badge assignment-type-badge--${sessionType}`}>
                    {sessionTypeLabel}
                  </span>
                </div>
              </td>
              <td>{assignment.subject?.name}</td>
              <td>
                <span className={`status-badge ${badge.className}`}>{badge.label}</span>
              </td>
              <td>
                <div className="lifetime-recent-cell">
                  <span className="lifetime-label" title="Total questions answered">
                    {lifetimeTotal} answered
                  </span>
                  {windowAttempts > 0 && (
                    <span className="recent-label" title="Correct in recent window">
                      {windowCorrect}/{windowAttempts} recent
                    </span>
                  )}
                </div>
              </td>
              <td>
                <div className="progress-cell">
                  <div className="progress-bar-wrapper" title={progressTitle}>
                    <div
                      className={`progress-bar-fill ${getMasteryColor(progressPercent)}`}
                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                    />
                  </div>
                  <div className="progress-meta">
                    <span className="progress-text" title={progressTitle}>{progressText}</span>
                    <span className="progress-subtext">
                      {progressSubtext}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <div className="actions-cell">
                  {assessmentComplete || (isMastered && !isReview) ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => onOpenHistory(assignment._id)}>
                      <HiOutlineEye size={16} />
                      <span>History</span>
                    </button>
                  ) : (
                    <>
                      <button
                        className={`btn btn-sm ${isReview ? "btn-warning" : "btn-primary"}`}
                        onClick={() => onOpenPractice(assignment._id)}
                      >
                        {isReview ? (
                          <>
                            <HiOutlineRefresh size={16} />
                            <span>Review</span>
                          </>
                        ) : (
                          <>
                            <HiOutlinePlay size={16} />
                            <span>{actionLabel}</span>
                          </>
                        )}
                      </button>
                      {lifetimeTotal > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onOpenHistory(assignment._id)}>
                          <HiOutlineEye size={16} />
                          <span>History</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default PracticeAssignmentsTable;
