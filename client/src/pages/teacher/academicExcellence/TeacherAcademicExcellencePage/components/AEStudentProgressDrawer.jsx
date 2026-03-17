import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../../config/api";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../../store/slices/uiSlice";

const labelFromMastery = (value) =>
  String(value || "")
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");

const AEStudentProgressDrawer = ({ student, classId, onClose }) => {
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);

  const [loading, setLoading] = useState(false);
  const [objectives, setObjectives] = useState([]);
  const [tasks, setTasks] = useState([]);

  const loadStudentData = useCallback(async () => {
    if (!student?._id) return;
    setLoading(true);
    try {
      const params = { academicYear, semester: selectedSemester, limit: 30 };
      const [objRes, taskRes] = await Promise.all([
        api.get(`/students/${student._id}/academic-excellence/objectives`, { params }),
        api.get(`/students/${student._id}/academic-excellence/tasks`, { params }),
      ]);
      setObjectives(objRes.data?.data?.objectives || []);
      setTasks(taskRes.data?.data?.tasks || []);
    } catch {
      /* silently fail in drawer */
    } finally {
      setLoading(false);
    }
  }, [student, academicYear, selectedSemester]);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  const studentName = student?.name || `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Student";

  return (
    <div className="teacher-ae-drawer-overlay" onClick={onClose}>
      <div className="teacher-ae-drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{studentName}</h2>
          <button type="button" className="teacher-ae-btn" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="teacher-ae-loading">Loading student data...</div>}

        <div>
          <strong style={{ fontSize: "0.95rem" }}>Objectives ({objectives.length})</strong>
          {objectives.length === 0 ? (
            <div className="teacher-ae-empty" style={{ marginTop: "0.4rem" }}>No objectives tracked.</div>
          ) : (
            <div className="teacher-ae-list" style={{ marginTop: "0.4rem" }}>
              {objectives.map((obj) => (
                <div key={obj._id || obj.objectiveKey} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0", borderBottom: "1px solid var(--border-color, #f3f4f6)", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.88rem", wordBreak: "break-word" }}>{obj.objectiveName || obj.objectiveKey}</span>
                  <span className={`academic-excellence-badge ${obj.masteryLevel || "not_started"}`} style={{ flexShrink: 0 }}>
                    {labelFromMastery(obj.masteryLevel)} · {obj.masteryScore || 0}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <strong style={{ fontSize: "0.95rem" }}>Tasks ({tasks.length})</strong>
          {tasks.length === 0 ? (
            <div className="teacher-ae-empty" style={{ marginTop: "0.4rem" }}>No tasks.</div>
          ) : (
            <div className="teacher-ae-list" style={{ marginTop: "0.4rem" }}>
              {tasks.map((task) => (
                <div key={task._id} style={{ padding: "0.4rem 0", borderBottom: "1px solid var(--border-color, #f3f4f6)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{task.title || "Task"}</span>
                    <span className={`academic-excellence-badge ${task.status || "assigned"}`}>
                      {labelFromMastery(task.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text-secondary, #6b7280)" }}>
                    {task.objectiveName || task.objectiveKey || "—"} · Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AEStudentProgressDrawer;
