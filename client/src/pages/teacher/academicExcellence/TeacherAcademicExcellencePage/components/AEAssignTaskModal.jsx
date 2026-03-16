import { useState } from "react";

const TASK_TYPES = [
  { value: "practice_questions", label: "Practice Questions" },
  { value: "video_watch", label: "Video Watch" },
  { value: "reading", label: "Reading" },
  { value: "teacher_review", label: "Teacher Review" },
  { value: "peer_discussion", label: "Peer Discussion" },
  { value: "project", label: "Project" },
  { value: "custom", label: "Custom" },
];

const AEAssignTaskModal = ({ studentId, studentName, classId, objectives, onAssign, onClose }) => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    objectiveKey: objectives?.[0]?.objectiveKey || "",
    taskType: "practice_questions",
    dueDate: "",
    estimatedMinutes: 15,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.objectiveKey) return;
    setSaving(true);
    try {
      await onAssign({
        studentId,
        classId,
        objectiveKey: form.objectiveKey,
        title: form.title,
        description: form.description,
        taskType: form.taskType,
        dueDate: form.dueDate || undefined,
        estimatedMinutes: Number(form.estimatedMinutes) || 15,
      });
    } catch {
      /* parent handles */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="teacher-ae-modal-overlay" onClick={onClose}>
      <div className="teacher-ae-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Assign Task to {studentName || "Student"}</h2>

        <div className="teacher-ae-form-group">
          <label>Objective</label>
          <select
            className="teacher-ae-select"
            value={form.objectiveKey}
            onChange={(e) => setForm((p) => ({ ...p, objectiveKey: e.target.value }))}
          >
            {(objectives || []).map((obj) => (
              <option key={obj.objectiveKey} value={obj.objectiveKey}>
                {obj.objectiveName || obj.objectiveKey}
              </option>
            ))}
          </select>
        </div>

        <div className="teacher-ae-form-group">
          <label>Title</label>
          <input
            className="teacher-ae-input"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Practice adding fractions"
          />
        </div>

        <div className="teacher-ae-form-group">
          <label>Task Type</label>
          <select
            className="teacher-ae-select"
            value={form.taskType}
            onChange={(e) => setForm((p) => ({ ...p, taskType: e.target.value }))}
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="teacher-ae-form-group">
          <label>Description (optional)</label>
          <textarea
            className="teacher-ae-textarea"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Task instructions..."
          />
        </div>

        <div style={{ display: "flex", gap: "0.6rem" }}>
          <div className="teacher-ae-form-group" style={{ flex: 1 }}>
            <label>Due Date</label>
            <input
              type="date"
              className="teacher-ae-input"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
            />
          </div>
          <div className="teacher-ae-form-group" style={{ flex: 1 }}>
            <label>Est. Minutes</label>
            <input
              type="number"
              className="teacher-ae-input"
              min={1}
              value={form.estimatedMinutes}
              onChange={(e) => setForm((p) => ({ ...p, estimatedMinutes: e.target.value }))}
            />
          </div>
        </div>

        <div className="teacher-ae-modal-actions">
          <button type="button" className="teacher-ae-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="teacher-ae-btn-primary" onClick={handleSubmit} disabled={saving || !form.title.trim()}>
            {saving ? "Assigning..." : "Assign Task"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AEAssignTaskModal;
