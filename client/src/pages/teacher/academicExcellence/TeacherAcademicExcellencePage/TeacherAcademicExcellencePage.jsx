import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { PERMISSIONS } from "../../../../constants/permissions";
import { selectUser } from "../../../../store/slices/authSlice";
import useTeacherAcademicExcellence from "./hooks/useTeacherAcademicExcellence";
import AEAssignTaskModal from "./components/AEAssignTaskModal";
import AEBulkAssignModal from "./components/AEBulkAssignModal";
import AEStudentProgressDrawer from "./components/AEStudentProgressDrawer";
import "./TeacherAcademicExcellencePage.css";

const labelFromMastery = (value) =>
  String(value || "")
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");

const TABS = [
  { key: "overview", label: "Class Overview" },
  { key: "students", label: "Student Monitor" },
  { key: "tasks", label: "Task Queue" },
  { key: "exclusions", label: "Controls & Exclusions" },
  { key: "notifications", label: "Notification Settings" },
];

const TeacherAcademicExcellencePage = () => {
  const user = useSelector(selectUser);
  const [activeTab, setActiveTab] = useState("overview");

  // Modals
  const [assignModal, setAssignModal] = useState(null);
  const [bulkAssignModal, setBulkAssignModal] = useState(null);
  const [drawerStudent, setDrawerStudent] = useState(null);
  const [reviewingTaskId, setReviewingTaskId] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");

  // Exclusion form
  const [newExclusion, setNewExclusion] = useState({
    scopeType: "objective",
    objectiveKey: "",
    targetType: "all_students",
    reason: "",
  });

  // Notification prefs local state
  const [localNotifPrefs, setLocalNotifPrefs] = useState(null);
  const [savingNotifs, setSavingNotifs] = useState(false);

  const {
    loading,
    error,
    classes,
    selectedClassId,
    setSelectedClassId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    classSummary,
    objectives,
    students,
    taskQueue,
    exclusions,
    notificationPrefs,
    assignTask,
    bulkAssignTasks,
    reviewTask,
    createExclusion,
    toggleExclusion,
    deleteExclusion,
    saveNotificationPrefs,
    refresh,
  } = useTeacherAcademicExcellence();

  // Permission check helper
  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      if (user.role === "super_admin" || user.role === "admin") return true;
      return user.permissions?.includes(perm) ?? false;
    },
    [user],
  );

  // Summary KPIs from classSummary
  const kpis = useMemo(() => {
    const summary = classSummary?.summary || {};
    return {
      totalStudents: summary.totalStudents || students.length || 0,
      atRiskPercent: summary.atRiskPercent || 0,
      developingPercent: summary.developingPercent || 0,
      masteredPercent: summary.masteredPercent || 0,
    };
  }, [classSummary, students]);

  // Heatmap: objectives as rows, students as columns
  const heatmapData = useMemo(() => {
    if (!classSummary?.heatmap) return null;
    return classSummary.heatmap;
  }, [classSummary]);

  // Init local notif prefs from loaded data
  useMemo(() => {
    if (notificationPrefs && !localNotifPrefs) {
      setLocalNotifPrefs(notificationPrefs);
    }
  }, [notificationPrefs, localNotifPrefs]);

  // ── Handlers ──
  const handleReviewSubmit = async (taskId) => {
    try {
      await reviewTask(taskId, { teacherFeedback: feedbackText });
      setReviewingTaskId(null);
      setFeedbackText("");
    } catch {
      /* toast can go here */
    }
  };

  const handleCreateExclusion = async () => {
    try {
      await createExclusion({
        ...newExclusion,
        classId: selectedClassId,
      });
      setNewExclusion({ scopeType: "objective", objectiveKey: "", targetType: "all_students", reason: "" });
    } catch {
      /* toast */
    }
  };

  const handleSaveNotifPrefs = async () => {
    if (!localNotifPrefs) return;
    setSavingNotifs(true);
    try {
      await saveNotificationPrefs(localNotifPrefs);
    } catch {
      /* toast */
    } finally {
      setSavingNotifs(false);
    }
  };

  const updateNotifField = (path, value) => {
    setLocalNotifPrefs((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
        if (!obj) return prev;
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  // ── Render ──
  return (
    <div className="teacher-academic-excellence-page">
      {/* Header */}
      <header className="teacher-ae-header">
        <div>
          <h1>Academic Excellence</h1>
          <p>Monitor student mastery, assign tasks, and manage exclusions.</p>
        </div>
        <div className="teacher-ae-header-actions">
          <button type="button" className="teacher-ae-btn" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="teacher-ae-filters">
        <select
          className="teacher-ae-select"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="">Select Class</option>
          {classes.map((cls) => (
            <option key={cls._id} value={cls._id}>
              {cls.name || cls.className || cls._id}
            </option>
          ))}
        </select>
        {subjects.length > 0 && (
          <select
            className="teacher-ae-select"
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub._id || sub} value={sub._id || sub}>
                {sub.name || sub}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <div className="teacher-ae-loading">Loading academic excellence data...</div>}
      {error && <div className="teacher-ae-error">{error}</div>}

      {/* Tabs */}
      <nav className="teacher-ae-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`teacher-ae-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ═══ Tab 1: Class Overview ═══ */}
      {activeTab === "overview" && (
        <>
          <div className="teacher-ae-grid">
            <article className="teacher-ae-card">
              <h3>Total Students</h3>
              <strong>{kpis.totalStudents}</strong>
            </article>
            <article className="teacher-ae-card">
              <h3>At Risk</h3>
              <strong>{kpis.atRiskPercent}%</strong>
            </article>
            <article className="teacher-ae-card">
              <h3>Developing</h3>
              <strong>{kpis.developingPercent}%</strong>
            </article>
            <article className="teacher-ae-card">
              <h3>Mastered</h3>
              <strong>{kpis.masteredPercent}%</strong>
            </article>
          </div>

          <section className="teacher-ae-panel">
            <h2>Objective × Student Heatmap</h2>
            {heatmapData ? (
              <div className="teacher-ae-heatmap-wrap">
                <table className="teacher-ae-heatmap">
                  <thead>
                    <tr>
                      <th>Objective</th>
                      {(heatmapData.students || []).map((s) => (
                        <th key={s._id}>{s.name || s._id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(heatmapData.objectives || []).map((obj) => (
                      <tr key={obj.objectiveKey}>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>
                          {obj.objectiveName || obj.objectiveKey}
                          {hasPermission(PERMISSIONS.BULK_ASSIGN_ACADEMIC_EXCELLENCE_TASKS) && (
                            <button
                              type="button"
                              className="teacher-ae-btn"
                              style={{ marginLeft: "0.5rem", padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                              onClick={() => setBulkAssignModal({ objectiveKey: obj.objectiveKey, objectiveName: obj.objectiveName })}
                            >
                              Assign All
                            </button>
                          )}
                        </td>
                        {(heatmapData.students || []).map((s) => {
                          const cell = (obj.studentLevels || {})[s._id] || "not_started";
                          return (
                            <td
                              key={s._id}
                              className={cell}
                              style={{ cursor: "pointer" }}
                              onClick={() => setDrawerStudent({ ...s, objectiveKey: obj.objectiveKey })}
                              title={`${s.name}: ${labelFromMastery(cell)}`}
                            >
                              {labelFromMastery(cell).charAt(0)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="teacher-ae-empty">
                {selectedClassId ? "No heatmap data available for this class." : "Select a class to view the heatmap."}
              </div>
            )}
          </section>

          <section className="teacher-ae-panel">
            <h2>Objectives ({objectives.length})</h2>
            {objectives.length === 0 ? (
              <div className="teacher-ae-empty">No objectives tracked yet.</div>
            ) : (
              <div className="teacher-ae-list">
                {objectives.map((obj) => (
                  <article key={obj._id || obj.objectiveKey} className="teacher-ae-task-item">
                    <div className="teacher-ae-task-header">
                      <strong>{obj.objectiveName || obj.objectiveKey}</strong>
                      <span className={`academic-excellence-badge ${obj.masteryLevel || "not_started"}`}>
                        {labelFromMastery(obj.masteryLevel)}
                      </span>
                    </div>
                    <div className="teacher-ae-task-meta">
                      <span>Avg Score: {obj.avgScore ?? obj.masteryScore ?? 0}%</span>
                      <span>Students at risk: {obj.atRiskCount || 0}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══ Tab 2: Student Monitor ═══ */}
      {activeTab === "students" && (
        <section className="teacher-ae-panel">
          <h2>Student Monitor</h2>
          {students.length === 0 ? (
            <div className="teacher-ae-empty">No students in this class.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="teacher-ae-student-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>At Risk</th>
                    <th>Developing</th>
                    <th>Mastered</th>
                    <th>Tasks Pending</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const aeData = classSummary?.studentBreakdown?.[student._id] || {};
                    return (
                      <tr key={student._id}>
                        <td>
                          <button
                            type="button"
                            className="teacher-ae-btn"
                            style={{ border: 0, background: "transparent", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                            onClick={() => setDrawerStudent(student)}
                          >
                            {student.name || `${student.firstName || ""} ${student.lastName || ""}`.trim() || student._id}
                          </button>
                        </td>
                        <td>{aeData.atRiskCount || 0}</td>
                        <td>{aeData.developingCount || 0}</td>
                        <td>{aeData.masteredCount || 0}</td>
                        <td>{aeData.pendingTasksCount || 0}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            {hasPermission(PERMISSIONS.ASSIGN_ACADEMIC_EXCELLENCE_TASKS) && (
                              <button
                                type="button"
                                className="teacher-ae-btn-primary"
                                style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                                onClick={() => setAssignModal({ studentId: student._id, studentName: student.name || student.firstName })}
                              >
                                Assign Task
                              </button>
                            )}
                            {hasPermission(PERMISSIONS.DISABLE_ACADEMIC_EXCELLENCE_FOR_STUDENT) && (
                              <button
                                type="button"
                                className="teacher-ae-btn"
                                style={{ fontSize: "0.78rem", padding: "0.25rem 0.5rem" }}
                                title={aeData.isDisabled ? "Re-enable AE" : "Disable AE"}
                                onClick={() => {
                                  /* TODO: toggle AE for student */
                                }}
                              >
                                {aeData.isDisabled ? "Enable AE" : "Disable AE"}
                              </button>
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
        </section>
      )}

      {/* ═══ Tab 3: Task Queue ═══ */}
      {activeTab === "tasks" && (
        <section className="teacher-ae-panel">
          <h2>Task Queue ({taskQueue.length})</h2>
          {taskQueue.length === 0 ? (
            <div className="teacher-ae-empty">No tasks awaiting review.</div>
          ) : (
            <div className="teacher-ae-list">
              {taskQueue.map((task) => (
                <article key={task._id} className="teacher-ae-task-item">
                  <div className="teacher-ae-task-header">
                    <strong>{task.title || task.objectiveName || "Task"}</strong>
                    <span className={`academic-excellence-badge ${task.status || "assigned"}`}>
                      {labelFromMastery(task.status)}
                    </span>
                  </div>
                  <div className="teacher-ae-task-meta">
                    <span>Student: {task.studentName || task.student?.name || "—"}</span>
                    <span>Objective: {task.objectiveName || task.objectiveKey || "—"}</span>
                    <span>Score: {task.studentScore != null ? `${task.studentScore}%` : "—"}</span>
                    <span>Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</span>
                  </div>
                  {task.studentNotes && <div style={{ fontSize: "0.85rem", fontStyle: "italic" }}>"{task.studentNotes}"</div>}
                  {hasPermission(PERMISSIONS.REVIEW_ACADEMIC_EXCELLENCE_TASKS) && task.status === "completed" && (
                    <>
                      {reviewingTaskId === task._id ? (
                        <div className="teacher-ae-task-feedback">
                          <textarea
                            placeholder="Your feedback..."
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                          />
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button type="button" className="teacher-ae-btn-primary" onClick={() => handleReviewSubmit(task._id)}>
                              Submit Feedback
                            </button>
                            <button type="button" className="teacher-ae-btn" onClick={() => { setReviewingTaskId(null); setFeedbackText(""); }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="teacher-ae-btn-primary" onClick={() => setReviewingTaskId(task._id)}>
                          Review
                        </button>
                      )}
                    </>
                  )}
                  {task.teacherFeedback && (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary, #6b7280)" }}>
                      Feedback: {task.teacherFeedback}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══ Tab 4: Controls & Exclusions ═══ */}
      {activeTab === "exclusions" && (
        <section className="teacher-ae-panel">
          <h2>Exclusions ({exclusions.length})</h2>

          {(hasPermission(PERMISSIONS.EXCLUDE_ACADEMIC_EXCELLENCE_LESSON) ||
            hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS)) && (
            <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem", padding: "0.75rem", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: "8px" }}>
              <strong style={{ fontSize: "0.9rem" }}>Add Exclusion</strong>
              <div className="teacher-ae-form-group">
                <label>Scope Type</label>
                <select
                  className="teacher-ae-select"
                  value={newExclusion.scopeType}
                  onChange={(e) => setNewExclusion((p) => ({ ...p, scopeType: e.target.value }))}
                >
                  <option value="objective">Objective</option>
                  <option value="lesson">Lesson</option>
                  <option value="subject">Subject</option>
                </select>
              </div>
              <div className="teacher-ae-form-group">
                <label>Objective Key</label>
                <input
                  className="teacher-ae-input"
                  value={newExclusion.objectiveKey}
                  onChange={(e) => setNewExclusion((p) => ({ ...p, objectiveKey: e.target.value }))}
                  placeholder="e.g. MATH-G5-FRACTIONS-ADD"
                />
              </div>
              <div className="teacher-ae-form-group">
                <label>Target</label>
                <select
                  className="teacher-ae-select"
                  value={newExclusion.targetType}
                  onChange={(e) => setNewExclusion((p) => ({ ...p, targetType: e.target.value }))}
                >
                  <option value="all_students">All Students</option>
                  <option value="class">This Class</option>
                  <option value="student">Individual Student</option>
                </select>
              </div>
              <div className="teacher-ae-form-group">
                <label>Reason</label>
                <input
                  className="teacher-ae-input"
                  value={newExclusion.reason}
                  onChange={(e) => setNewExclusion((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Why exclude this?"
                />
              </div>
              <button type="button" className="teacher-ae-btn-primary" onClick={handleCreateExclusion}>
                Create Exclusion
              </button>
            </div>
          )}

          {exclusions.length === 0 ? (
            <div className="teacher-ae-empty">No active exclusions.</div>
          ) : (
            <div className="teacher-ae-list">
              {exclusions.map((exc) => (
                <div key={exc._id} className="teacher-ae-exclusion-item">
                  <div>
                    <strong>{exc.objectiveKey || exc.lessonPlanId || exc.subjectId || "—"}</strong>
                    <div className="teacher-ae-exclusion-meta">
                      {exc.scopeType} · {exc.targetType} · {exc.reason || "No reason"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button
                      type="button"
                      className="teacher-ae-btn"
                      onClick={() => toggleExclusion(exc._id)}
                    >
                      {exc.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {hasPermission(PERMISSIONS.MANAGE_ACADEMIC_EXCELLENCE_EXCLUSIONS) && (
                      <button
                        type="button"
                        className="teacher-ae-btn-danger"
                        onClick={() => deleteExclusion(exc._id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══ Tab 5: Notification Settings ═══ */}
      {activeTab === "notifications" && (
        <section className="teacher-ae-panel">
          <h2>Notification Preferences</h2>
          {localNotifPrefs ? (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <div className="teacher-ae-noti-row">
                <label>Enable AE Notifications</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.enabled ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.enabled", !localNotifPrefs.global?.enabled)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>On Task Completed</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.onTaskCompleted ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.onTaskCompleted", !localNotifPrefs.global?.onTaskCompleted)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>On Objective Mastered</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.onObjectiveMastered ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.onObjectiveMastered", !localNotifPrefs.global?.onObjectiveMastered)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>On Student Struggling</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.onStudentStruggling ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.onStudentStruggling", !localNotifPrefs.global?.onStudentStruggling)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>Weekly Digest</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.onWeeklyDigest ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.onWeeklyDigest", !localNotifPrefs.global?.onWeeklyDigest)}
                />
              </div>

              <strong style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Channels</strong>
              <div className="teacher-ae-noti-row">
                <label>In-App</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.channels?.inApp ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.channels.inApp", !localNotifPrefs.global?.channels?.inApp)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>Email</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.channels?.email ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.channels.email", !localNotifPrefs.global?.channels?.email)}
                />
              </div>
              <div className="teacher-ae-noti-row">
                <label>Push</label>
                <button
                  type="button"
                  className={`teacher-ae-toggle ${localNotifPrefs.global?.channels?.push ? "on" : "off"}`}
                  onClick={() => updateNotifField("global.channels.push", !localNotifPrefs.global?.channels?.push)}
                />
              </div>

              <button
                type="button"
                className="teacher-ae-btn-primary"
                style={{ marginTop: "0.75rem", justifySelf: "start" }}
                disabled={savingNotifs}
                onClick={handleSaveNotifPrefs}
              >
                {savingNotifs ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          ) : (
            <div className="teacher-ae-empty">Loading notification preferences...</div>
          )}
        </section>
      )}

      {/* ═══ Modals ═══ */}
      {assignModal && (
        <AEAssignTaskModal
          studentId={assignModal.studentId}
          studentName={assignModal.studentName}
          classId={selectedClassId}
          objectives={objectives}
          subjectId={selectedSubjectId}
          subjectName={subjects.find((s) => (s._id || s) === selectedSubjectId)?.name || ""}
          onAssign={async (taskData) => {
            await assignTask(taskData);
            setAssignModal(null);
          }}
          onClose={() => setAssignModal(null)}
        />
      )}

      {bulkAssignModal && (
        <AEBulkAssignModal
          classId={selectedClassId}
          objectiveKey={bulkAssignModal.objectiveKey}
          objectiveName={bulkAssignModal.objectiveName}
          subjectId={selectedSubjectId}
          subjectName={subjects.find((s) => (s._id || s) === selectedSubjectId)?.name || ""}
          onAssign={async (taskData) => {
            await bulkAssignTasks(taskData);
            setBulkAssignModal(null);
          }}
          onClose={() => setBulkAssignModal(null)}
        />
      )}

      {drawerStudent && (
        <AEStudentProgressDrawer
          student={drawerStudent}
          classId={selectedClassId}
          onClose={() => setDrawerStudent(null)}
        />
      )}
    </div>
  );
};

export default TeacherAcademicExcellencePage;
