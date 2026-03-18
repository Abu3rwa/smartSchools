import { useState } from "react";
import api from "../../../../../config/api";

const TASK_TYPES = [
  { value: "practice_questions", label: "Practice Questions" },
  { value: "reading", label: "Reading Comprehension" },
  { value: "teacher_review", label: "Teacher Review" },
  { value: "peer_discussion", label: "Peer Discussion" },
  { value: "project", label: "Project" },
  { value: "custom", label: "Custom" },
];

const AEBulkAssignModal = ({ classId, objectiveKey, objectiveName, subjectId, subjectName, trackingMode = "objectives", onAssign, onClose }) => {
  const entityLabel = trackingMode === "standards" ? "Standard" : "Objective";
  const [form, setForm] = useState({
    title: "",
    description: "",
    taskType: "practice_questions",
    dueDate: "",
    estimatedMinutes: 15,
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!objectiveKey) return;
    setGenerating(true);
    try {
      const res = await api.post("/academic-excellence/tasks/generate", {
        objectiveKey,
        objectiveName: objectiveName || objectiveKey,
        subjectName: subjectName || "",
        taskType: form.taskType,
      });
      const data = res.data?.data;
      if (data) {
        setForm((p) => ({
          ...p,
          title: data.title || p.title,
          description: data.description || p.description,
          estimatedMinutes: data.estimatedMinutes || p.estimatedMinutes,
        }));
      }
    } catch {
      /* silent */
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onAssign({
        classId,
        objectiveKey,
        subjectId,
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
        <h2>Bulk Assign {entityLabel} Task — {objectiveName || objectiveKey}</h2>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #6b7280)" }}>
          This task will be assigned to all students in the selected class.
        </p>

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

        {/* AI Generate Button */}
        <button
          type="button"
          className="teacher-ae-btn-primary"
          style={{ width: "100%", marginBottom: "0.5rem" }}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating with AI..." : "✨ Generate Task with AI"}
        </button>

        <div className="teacher-ae-form-group">
          <label>Title</label>
          <input
            className="teacher-ae-input"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Practice worksheet: Adding Fractions"
          />
        </div>

        <div className="teacher-ae-form-group">
          <label>Task Content / Instructions</label>
          <textarea
            className="teacher-ae-textarea"
            rows={8}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="AI will generate exercises here, or write your own..."
            style={{ minHeight: "140px" }}
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
            {saving ? "Assigning..." : "Assign to All Students"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AEBulkAssignModal;
