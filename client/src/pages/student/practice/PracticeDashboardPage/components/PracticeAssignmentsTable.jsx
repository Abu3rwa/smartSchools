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
          const lifetimeTotal = assignment.mastery?.lifetimeStats?.totalAttempts ?? assignment.mastery?.totalAttempts ?? 0;
          const windowCorrect = assignment.mastery?.rollingWindowStats?.windowCorrect ?? assignment.mastery?.correctCount ?? 0;
          const windowAttempts = assignment.mastery?.rollingWindowStats?.windowAttempts ?? 0;
          const confidence = assignment.mastery?.confidenceScore ?? assignment.mastery?.percentage ?? 0;
          const isReview = assignment.mastery?.masteryStatus === "needs_review" || assignment.mastery?.needsReview;
          const isMastered = assignment.mastery?.isMastered && !assignment.mastery?.needsReview;

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
                  <div className="progress-bar-wrapper">
                    <div
                      className={`progress-bar-fill ${getMasteryColor(confidence)}`}
                      style={{ width: `${Math.min(100, confidence)}%` }}
                    />
                  </div>
                  <span className="progress-text">{confidence}%</span>
                </div>
              </td>
              <td>
                <div className="actions-cell">
                  {isMastered && !isReview ? (
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
                            <span>Start Practice</span>
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
