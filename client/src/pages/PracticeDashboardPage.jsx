import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchMyAssignments,
  fetchReviewQueue,
  selectMyAssignments,
  selectPracticeAssignmentsLoading,
  selectPracticeError,
  selectReviewQueue,
  selectReviewFeatureEnabled,
  selectReviewQueueLoading,
  selectReviewQueueError,
} from "../store/slices/practiceSlice";
import { selectCurrentAcademicYear } from "../store/slices/uiSlice";
import {
  HiOutlineAcademicCap,
  HiOutlinePlay,
  HiOutlineEye,
  HiOutlineRefresh,
  HiOutlineExclamationCircle,
} from "react-icons/hi";
import "./PracticeDashboardPage.css";

const PracticeDashboardPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const rawAssignments = useSelector(selectMyAssignments);
  const assignments = rawAssignments.filter((a) => a.standard);
  const loading = useSelector(selectPracticeAssignmentsLoading);
  const error = useSelector(selectPracticeError);
  const reviewQueue = useSelector(selectReviewQueue);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const reviewFeatureEnabled = useSelector(selectReviewFeatureEnabled);
  const reviewQueueLoading = useSelector(selectReviewQueueLoading);
  const reviewQueueError = useSelector(selectReviewQueueError);

  useEffect(() => {
    dispatch(fetchMyAssignments());
    dispatch(fetchReviewQueue({ limit: 5 }));
  }, [dispatch, academicYear]);

  const dueNowCount = reviewQueue.filter((task) => task.status === "scheduled").length;

  const formatTaskDate = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const mastered = assignments.filter((a) => a.mastery?.isMastered && !a.mastery?.needsReview);
  const needsReview = assignments.filter(
    (a) => a.mastery?.masteryStatus === "needs_review" || (a.mastery?.isMastered && a.mastery?.needsReview),
  );
  const inProgress = assignments.filter(
    (a) =>
      a.mastery?.masteryStatus === "in_progress" ||
      (!a.mastery?.isMastered && a.mastery?.totalAttempts > 0 && a.mastery?.masteryStatus !== "needs_review"),
  );
  const notStarted = assignments.filter(
    (a) => a.mastery?.masteryStatus === "not_started" || (!a.mastery?.isMastered && a.mastery?.totalAttempts === 0),
  );

  const getMasteryColor = (confidenceOrPct) => {
    if (confidenceOrPct >= 80) return "green";
    if (confidenceOrPct >= 40) return "yellow";
    if (confidenceOrPct > 0) return "red";
    return "gray";
  };

  const getStatusBadge = (a) => {
    if (a.mastery?.isMastered && !a.mastery?.needsReview) return { label: "Mastered (Gold)", className: "status-mastered-gold" };
    if (a.mastery?.masteryStatus === "needs_review" || (a.mastery?.isMastered && a.mastery?.needsReview))
      return { label: "Needs Review", className: "status-needs-review" };
    if (a.mastery?.totalAttempts > 0) return { label: "In Progress", className: "status-in-progress" };
    return { label: "Not Started", className: "status-not-started" };
  };

  return (
    <div className="practice-dashboard">
      <div className="page-header">
        <div>
          <h1>Standards Practice</h1>
          <p className="text-muted">
            Personalized questions, adaptive difficulty, and clear next steps.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => dispatch(fetchMyAssignments())}
          disabled={loading}
        >
          <HiOutlineRefresh size={16} />
          <span>{loading ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      <div className="practice-stats">
        <div className="practice-stat-card">
          <div className="stat-value">{assignments.length}</div>
          <div className="stat-label">Total Assigned</div>
        </div>
        <div className="practice-stat-card mastered">
          <div className="stat-value">{mastered.length}</div>
          <div className="stat-label">Mastered (Gold)</div>
        </div>
        <div className="practice-stat-card needs-review">
          <div className="stat-value">{needsReview.length}</div>
          <div className="stat-label">Needs Review</div>
        </div>
        <div className="practice-stat-card in-progress">
          <div className="stat-value">{inProgress.length}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="practice-stat-card not-started">
          <div className="stat-value">{notStarted.length}</div>
          <div className="stat-label">Not Started</div>
        </div>
      </div>

      {reviewFeatureEnabled && (
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
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => dispatch(fetchReviewQueue({ limit: 5 }))}
              disabled={reviewQueueLoading}
            >
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
                    <div style={{ fontWeight: 600 }}>
                      {task.standard?.code || "Standard"}
                      {task.standard?.name ? ` · ${task.standard.name}` : ""}
                    </div>
                    <div className="text-muted" style={{ fontSize: "0.82rem" }}>
                      Stage {task.intervalStage} · Due {formatTaskDate(task.scheduledFor)} · Priority {task.priorityScore}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!task.assignment}
                    onClick={() =>
                      task.assignment &&
                      navigate(`/portal/practice/${task.assignment?._id || task.assignment}`)
                    }
                  >
                    <HiOutlinePlay size={16} />
                    <span>Start Review</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading your current standards...</p>
        </div>
      ) : error && assignments.length === 0 ? (
        <div className="practice-empty error">
          <HiOutlineExclamationCircle size={56} />
          <h3>Unable to load standards</h3>
          <p>{error}</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => dispatch(fetchMyAssignments())}
          >
            <HiOutlineRefresh size={16} />
            <span>Try Again</span>
          </button>
        </div>
      ) : assignments.length === 0 ? (
        <div className="practice-empty">
          <HiOutlineAcademicCap size={56} />
          <h3>No standards assigned yet</h3>
          <p>Your teacher will assign standards soon. Check back later.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="practice-table">
            <thead>
              <tr>
                <th>Standard</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Lifetime / Recent</th>
                <th>Mastery Confidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const badge = getStatusBadge(a);
                const lifetimeTotal = a.mastery?.lifetimeStats?.totalAttempts ?? a.mastery?.totalAttempts ?? 0;
                const windowCorrect = a.mastery?.rollingWindowStats?.windowCorrect ?? a.mastery?.correctCount ?? 0;
                const windowAttempts = a.mastery?.rollingWindowStats?.windowAttempts ?? 0;
                const confidence = a.mastery?.confidenceScore ?? a.mastery?.percentage ?? 0;
                const isReview = a.mastery?.masteryStatus === "needs_review" || a.mastery?.needsReview;
                return (
                  <tr
                    key={a._id}
                    className={
                      a.mastery?.isMastered && !a.mastery?.needsReview
                        ? "mastered-row"
                        : isReview
                        ? "needs-review-row"
                        : ""
                    }
                  >
                    <td>
                      <div className="standard-cell">
                        <span className="standard-code">
                          {a.standard?.code || "N/A"}
                        </span>
                        <span className="standard-name">
                          {a.standard?.name}
                        </span>
                      </div>
                    </td>
                    <td>{a.subject?.name}</td>
                    <td>
                      <span className={`status-badge ${badge.className}`}>
                        {badge.label}
                      </span>
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
                        {a.mastery?.isMastered && !isReview ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              navigate(`/portal/practice/${a._id}/history`)
                            }
                          >
                            <HiOutlineEye size={16} />
                            <span>History</span>
                          </button>
                        ) : (
                          <>
                            <button
                              className={`btn btn-sm ${isReview ? "btn-warning" : "btn-primary"}`}
                              onClick={() => navigate(`/portal/practice/${a._id}`)}
                            >
                              {isReview ? (
                                <>
                                  <HiOutlineRefresh size={16} />
                                  <span>Review</span>
                                </>
                              ) : (
                                <>
                                  <HiOutlinePlay size={16} />
                                  <span>
                                    {lifetimeTotal > 0 ? "Continue Practice" : "Start Practice"}
                                  </span>
                                </>
                              )}
                            </button>
                            {lifetimeTotal > 0 && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  navigate(`/portal/practice/${a._id}/history`)
                                }
                              >
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
      )}
    </div>
  );
};

export default PracticeDashboardPage;
