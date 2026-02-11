import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  fetchMyAssignments,
  selectMyAssignments,
  selectPracticeLoading,
} from "../store/slices/practiceSlice";
import {
  HiOutlineAcademicCap,
  HiOutlinePlay,
  HiOutlineEye,
  HiOutlineBookOpen,
  HiOutlineCheckCircle,
} from "react-icons/hi";
import "./PracticeDashboardPage.css";

const PracticeDashboardPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const assignments = useSelector(selectMyAssignments);
  const loading = useSelector(selectPracticeLoading);

  useEffect(() => {
    dispatch(fetchMyAssignments());
  }, [dispatch]);

  const mastered = assignments.filter((a) => a.mastery?.isMastered);
  const inProgress = assignments.filter(
    (a) => !a.mastery?.isMastered && a.mastery?.totalAttempts > 0,
  );
  const notStarted = assignments.filter(
    (a) => !a.mastery?.isMastered && a.mastery?.totalAttempts === 0,
  );

  const getMasteryColor = (pct) => {
    if (pct >= 80) return "green";
    if (pct >= 40) return "yellow";
    if (pct > 0) return "red";
    return "gray";
  };

  return (
    <div className="practice-dashboard">
      <div className="page-header">
        <div>
          <h1>Standards Practice</h1>
          <p className="text-muted">
            Practice and master your assigned standards
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="practice-stats">
        <div className="practice-stat-card">
          <div className="stat-value">{assignments.length}</div>
          <div className="stat-label">Total Assigned</div>
        </div>
        <div className="practice-stat-card mastered">
          <div className="stat-value">{mastered.length}</div>
          <div className="stat-label">Mastered</div>
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

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
        </div>
      ) : assignments.length === 0 ? (
        <div className="practice-empty">
          <HiOutlineAcademicCap size={56} />
          <h3>No standards assigned yet</h3>
          <p>Your teacher will assign standards for you to practice.</p>
        </div>
      ) : (
        <div className="practice-standards-list">
          {assignments.map((a) => (
            <div
              key={a._id}
              className={`practice-card ${a.mastery?.isMastered ? "mastered" : ""}`}
            >
              {a.mastery?.isMastered && (
                <div className="mastered-overlay">Mastered</div>
              )}
              <div className="practice-card-top">
                <span className="badge-code">{a.standard?.code}</span>
                <span
                  className="mastery-badge"
                  style={{
                    background: a.mastery?.isMastered
                      ? "var(--success-100, #d1fae5)"
                      : a.mastery?.totalAttempts > 0
                        ? "var(--warning-100, #fef3c7)"
                        : "var(--bg-secondary)",
                    color: a.mastery?.isMastered
                      ? "var(--success-700, #047857)"
                      : a.mastery?.totalAttempts > 0
                        ? "var(--warning-700, #b45309)"
                        : "var(--text-muted)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                >
                  {a.mastery?.isMastered
                    ? "Mastered"
                    : a.mastery?.totalAttempts > 0
                      ? "In Progress"
                      : "Not Started"}
                </span>
              </div>
              <h3>{a.standard?.name}</h3>
              <p className="description">{a.standard?.description}</p>
              <div className="practice-card-meta">
                <span>
                  <HiOutlineBookOpen size={14} /> {a.subject?.name}
                </span>
                <span>
                  <HiOutlineAcademicCap size={14} /> Grade{" "}
                  {a.standard?.gradeLevel}
                </span>
              </div>
              <div className="practice-progress">
                <div className="practice-progress-bar">
                  <div
                    className={`fill ${getMasteryColor(a.mastery?.percentage || 0)}`}
                    style={{ width: `${a.mastery?.percentage || 0}%` }}
                  ></div>
                </div>
                <div className="practice-progress-text">
                  <span>
                    {a.mastery?.correctCount || 0}/
                    {a.mastery?.totalAttempts || 0} correct
                  </span>
                  <span>{a.mastery?.percentage || 0}%</span>
                </div>
              </div>
              <div className="practice-card-actions">
                {a.mastery?.isMastered ? (
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() =>
                      navigate(`/portal/practice/${a._id}/history`)
                    }
                  >
                    <HiOutlineCheckCircle
                      size={16}
                      style={{ marginRight: 4 }}
                    />
                    View History
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/portal/practice/${a._id}`)}
                    >
                      <HiOutlinePlay size={16} style={{ marginRight: 4 }} />
                      {a.mastery?.totalAttempts > 0 ? "Continue" : "Start"}
                    </button>
                    {a.mastery?.totalAttempts > 0 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          navigate(`/portal/practice/${a._id}/history`)
                        }
                      >
                        <HiOutlineEye size={16} style={{ marginRight: 4 }} />
                        History
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PracticeDashboardPage;
