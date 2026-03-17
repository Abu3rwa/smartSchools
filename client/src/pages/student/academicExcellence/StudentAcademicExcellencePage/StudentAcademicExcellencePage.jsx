import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import api from "../../../../config/api";
import { fetchMyAssignments, selectPracticeStudentId } from "../../../../store/slices/practiceSlice";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../store/slices/uiSlice";
import AIPracticeSession from "../AIPracticeSession/AIPracticeSession";
import "./StudentAcademicExcellencePage.css";
const masteryOrder = ["mastered", "developing", "at_risk", "not_started"];

const PAGE_SIZE = 10;

const PaginationBar = ({ page, total, pageSize, onPage }) => {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="academic-excellence-pagination" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
      <button type="button" className="academic-excellence-refresh-btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.85rem", minWidth: 0 }} disabled={page === 1} onClick={() => onPage(1)}>«</button>
      <button type="button" className="academic-excellence-refresh-btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.85rem", minWidth: 0 }} disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{page} / {totalPages}</span>
      <button type="button" className="academic-excellence-refresh-btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.85rem", minWidth: 0 }} disabled={page === totalPages} onClick={() => onPage(page + 1)}>›</button>
      <button type="button" className="academic-excellence-refresh-btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.85rem", minWidth: 0 }} disabled={page === totalPages} onClick={() => onPage(totalPages)}>»</button>
    </div>
  );
};


const labelFromMastery = (value) =>
  String(value || "")
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatObjectiveLabel = (objective = {}) => {
  const preferred = String(
    objective?.objectiveTitle || objective?.objectiveName || "",
  ).trim();
  if (preferred) return preferred;

  const rawKey = String(objective?.objectiveKey || "").trim();
  if (!rawKey) return "Objective";

  const normalized = rawKey
    .replace(/^obj_/, "")
    .replace(/_[a-z0-9]{6}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "Objective";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const StudentAcademicExcellencePage = () => {
  const dispatch = useDispatch();
  const practiceStudentId = useSelector(selectPracticeStudentId);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvedStudentId, setResolvedStudentId] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [completingTaskId, setCompletingTaskId] = useState("");

  const [objectivesPage, setObjectivesPage] = useState(1);
  const [tasksPage, setTasksPage] = useState(1);

  const resolveStudentId = useCallback(async () => {
    if (practiceStudentId) return practiceStudentId;

    const resultAction = await dispatch(
      fetchMyAssignments({ academicYear, semester: selectedSemester }),
    );

    if (fetchMyAssignments.fulfilled.match(resultAction)) {
      return resultAction.payload?.studentId || "";
    }

    return "";
  }, [academicYear, dispatch, practiceStudentId, selectedSemester]);

  const loadAcademicExcellenceData = useCallback(
    async (studentId) => {
      if (!studentId) return;

      setLoading(true);
      setError("");

      try {
        const [dashboardResponse, objectivesResponse, tasksResponse] = await Promise.all([
          api.get(`/students/${studentId}/academic-excellence`, {
            params: { academicYear, semester: selectedSemester },
          }),
          api.get(`/students/${studentId}/academic-excellence/objectives`, {
            params: { limit: 8, academicYear, semester: selectedSemester },
          }),
          api.get(`/students/${studentId}/academic-excellence/tasks`, {
            params: { limit: 8, academicYear, semester: selectedSemester },
          }),
        ]);

        setDashboard(dashboardResponse.data?.data || null);
        setObjectives(objectivesResponse.data?.data?.objectives || []);
        setTasks(tasksResponse.data?.data?.tasks || []);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Failed to load Academic Excellence data.",
        );
      } finally {
        setLoading(false);
      }
    },
    [academicYear, selectedSemester],
  );

  const refresh = useCallback(async () => {
    const studentId = await resolveStudentId();
    if (!studentId) {
      setError("Student profile not found.");
      return;
    }

    setResolvedStudentId(studentId);
    setObjectivesPage(1);
    setTasksPage(1);

    await loadAcademicExcellenceData(studentId);
  }, [loadAcademicExcellenceData, resolveStudentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCompleteTask = async (taskId) => {
    const studentId = await resolveStudentId();
    if (!studentId || !taskId) return;

    setCompletingTaskId(taskId);
    setError("");

    try {
      await api.patch(`/students/${studentId}/academic-excellence/tasks/${taskId}/complete`, {});
      await loadAcademicExcellenceData(studentId);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Failed to complete task.");
    } finally {
      setCompletingTaskId("");
    }
  };

  const masteryCounts = useMemo(() => {
    const defaultCounts = {
      mastered: 0,
      developing: 0,
      at_risk: 0,
      not_started: 0,
    };

    objectives.forEach((objective) => {
      const key = objective?.masteryLevel;
      if (Object.prototype.hasOwnProperty.call(defaultCounts, key)) {
        defaultCounts[key] += 1;
      }
    });

    return defaultCounts;
  }, [objectives]);

  const dashboardStats = dashboard?.stats || dashboard?.summary || {};
  const tasksTotal = Array.isArray(tasks) ? tasks.length : 0;
  const tasksCompleted = Array.isArray(tasks)
    ? tasks.filter((task) => task?.status === "completed").length
    : 0;
  const completionRate =
    toNumber(dashboardStats.taskCompletionRate, NaN) >= 0
      ? toNumber(dashboardStats.taskCompletionRate, 0)
      : tasksTotal > 0
        ? tasksCompleted / tasksTotal
        : 0;
  const pendingTasksCount =
    dashboardStats.pendingTasksCount ?? dashboardStats.tasksPending ?? tasks.filter((task) => ["assigned", "in_progress", "overdue"].includes(task?.status)).length;
  const masteredObjectivesCount =
    dashboardStats.masteredObjectivesCount
    ?? dashboardStats.masteredThisMonth
    ?? masteryCounts.mastered;

  return (
    <div className="student-academic-excellence-page">
      <header className="academic-excellence-header">
        <div>
          <h1>Academic Excellence</h1>
          <p>Track your mastery progress and complete your next best tasks.</p>
        </div>
        <button
          type="button"
          className="academic-excellence-refresh-btn"
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      {loading ? <div className="academic-excellence-loading">Loading your dashboard...</div> : null}
      {error ? <div className="academic-excellence-error">{error}</div> : null}

      <section className="academic-excellence-grid">
        <article className="academic-excellence-card">
          <h3>Completion Rate</h3>
          <strong>{Math.round(toNumber(completionRate, 0) * 100)}%</strong>
        </article>
        <article className="academic-excellence-card">
          <h3>Pending Tasks</h3>
          <strong>{toNumber(pendingTasksCount, 0)}</strong>
        </article>
        <article className="academic-excellence-card">
          <h3>Mastered Objectives</h3>
          <strong>{toNumber(masteredObjectivesCount, 0)}</strong>
        </article>
      </section>

      <section className="academic-excellence-panel">
        <h2>Objective Mastery</h2>
        {objectives.length === 0 ? (
          <div className="academic-excellence-empty">No objectives available yet.</div>
        ) : (
          <div className="academic-excellence-list">
            {objectives
              .slice((objectivesPage - 1) * PAGE_SIZE, objectivesPage * PAGE_SIZE)
              .map((objective) => (
              <article key={objective._id} className="academic-excellence-list-item">
                <div className="academic-excellence-list-item-header">
                  <strong>{formatObjectiveLabel(objective)}</strong>
                  <span className={`academic-excellence-badge ${objective.masteryLevel || "not_started"}`}>
                    {labelFromMastery(objective.masteryLevel || "not_started")}
                  </span>
                </div>
                <div>Score: {objective.masteryScore || 0}%</div>
              </article>
            ))}
          </div>
        )}
        {objectives.length > 0 && (
          <PaginationBar
            page={objectivesPage}
            total={objectives.length}
            pageSize={PAGE_SIZE}
            onPage={setObjectivesPage}
          />
        )}
      </section>

      <section className="academic-excellence-panel">
        <h2>My Tasks</h2>
        {tasks.length === 0 ? (
          <div className="academic-excellence-empty">No tasks assigned right now.</div>
        ) : (
          <div className="academic-excellence-list">
            {tasks
              .slice((tasksPage - 1) * PAGE_SIZE, tasksPage * PAGE_SIZE)
              .map((task) => {
              const canComplete = ["assigned", "in_progress", "overdue"].includes(task.status);
              return (
                <article key={task._id} className="academic-excellence-list-item">
                  <div className="academic-excellence-list-item-header">
                    <strong>{task.title || task.objectiveName || formatObjectiveLabel(task) || "Task"}</strong>
                    <span className={`academic-excellence-badge ${task.status || "not_started"}`}>
                      {labelFromMastery(task.status || "assigned")}
                    </span>
                  </div>
                  <div className="academic-excellence-task-meta">
                    <span>Priority: {task.priority || "normal"}</span>
                    <span>
                      Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Any time"}
                    </span>
                  </div>
                  {task.taskType === "ai_interactive" ? (
                    <AIPracticeSession
                      task={task}
                      studentId={resolvedStudentId || practiceStudentId || dashboard?.student?.id}
                      onComplete={refresh}
                    />
                  ) : task.description ? <div>{task.description}</div> : null}
                  {task.taskType !== "ai_interactive" && canComplete ? (
                    <button
                      type="button"
                      className="academic-excellence-complete-btn"
                      onClick={() => handleCompleteTask(task._id)}
                      disabled={completingTaskId === task._id}
                    >
                      {completingTaskId === task._id ? "Saving..." : "Mark Complete"}
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {tasks.length > 0 && (
          <PaginationBar
            page={tasksPage}
            total={tasks.length}
            pageSize={PAGE_SIZE}
            onPage={setTasksPage}
          />
        )}
      </section>

      <section className="academic-excellence-grid">
        {masteryOrder.map((level) => (
          <article key={level} className="academic-excellence-card">
            <h3>{labelFromMastery(level)}</h3>
            <strong>{masteryCounts[level]}</strong>
          </article>
        ))}
      </section>
    </div>
  );
};

export default StudentAcademicExcellencePage;
