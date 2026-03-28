import { HiOutlinePlay, HiOutlineRefresh } from "react-icons/hi";
import { formatTaskDate } from "../utils/practiceDashboardPresentation";
import { formatStandardLabel } from "../../../../../utils/standardLabel";

const PracticeReviewQueueCard = ({
  reviewFeatureEnabled,
  dueNowCount,
  reviewQueue,
  reviewQueueLoading,
  reviewQueueError,
  onRefreshQueue,
  onStartReview,
}) => {
  if (!reviewFeatureEnabled) return null;

  return (
    <div className="card" style={{ marginBottom: "var(--spacing-lg)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--spacing-md)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ marginBottom: 4 }}>Review Queue</h3>
          <p className="text-muted" style={{ margin: 0 }}>
            Due now: {dueNowCount} · Upcoming: {Math.max(reviewQueue.length - dueNowCount, 0)}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRefreshQueue} disabled={reviewQueueLoading}>
          <HiOutlineRefresh size={16} />
          <span>{reviewQueueLoading ? "Refreshing..." : "Refresh Queue"}</span>
        </button>
      </div>

      {reviewQueueLoading && reviewQueue.length === 0 ? (
        <p className="text-muted" style={{ marginTop: "var(--spacing-md)", marginBottom: 0 }}>
          Loading review queue...
        </p>
      ) : reviewQueueError && reviewQueue.length === 0 ? (
        <p className="text-muted" style={{ marginTop: "var(--spacing-md)", marginBottom: 0 }}>
          Unable to load review queue right now.
        </p>
      ) : reviewQueue.length === 0 ? (
        <p className="text-muted" style={{ marginTop: "var(--spacing-md)", marginBottom: 0 }}>
          No review tasks due right now. Keep your streak going.
        </p>
      ) : (
        <div style={{ marginTop: "var(--spacing-md)", display: "grid", gap: "var(--spacing-sm)" }}>
          {reviewQueue.map((task) => (
            <div
              key={task._id}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--spacing-sm)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 600,
                    lineHeight: 1.35,
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                  }}
                >
                  {formatStandardLabel(task.standard) || "Standard"}
                </div>
                <div className="text-muted" style={{ fontSize: "0.82rem" }}>
                  Stage {task.intervalStage} · Due {formatTaskDate(task.scheduledFor)} · Priority {task.priorityScore}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!task.assignment}
                onClick={() => onStartReview(task)}
              >
                <HiOutlinePlay size={16} />
                <span>Start Review</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PracticeReviewQueueCard;
