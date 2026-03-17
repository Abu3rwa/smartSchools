import { useEffect, useState } from "react";
import api from "../../../../../config/api";
import { InlineSpinner, ProgressBar } from "../../../../../../../components/ui";

const TASK_TYPES = [
  { value: "practice_questions", label: "Practice Questions" },
  { value: "ai_interactive", label: "AI Interactive Quiz" },
  { value: "reading", label: "Reading Comprehension" },
  { value: "teacher_review", label: "Teacher Review" },
  { value: "peer_discussion", label: "Peer Discussion" },
  { value: "project", label: "Project" },
  { value: "custom", label: "Custom" },
];

const AEAssignTaskModal = ({ studentId, studentName, classId, objectives, subjectId, subjectName, onAssign, onClose }) => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    objectiveKey: objectives?.[0]?.objectiveKey || "",
    taskType: "practice_questions",
    dueDate: "",
    estimatedMinutes: 15,
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const isInteractiveType = form.taskType === "ai_interactive";

  const selectedObj = (objectives || []).find((o) => o.objectiveKey === form.objectiveKey);

  useEffect(() => {
    if (form.objectiveKey) return;
    const firstObjectiveKey = objectives?.[0]?.objectiveKey || "";
    if (!firstObjectiveKey) return;
    setForm((prev) => ({ ...prev, objectiveKey: firstObjectiveKey }));
  }, [objectives, form.objectiveKey]);

  const handleGenerate = async () => {
    if (!form.objectiveKey) return;
    setGenerating(true);
    try {
      const res = await api.post("/academic-excellence/tasks/generate", {
        objectiveKey: form.objectiveKey,
        objectiveName: selectedObj?.objectiveName || form.objectiveKey,
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
      /* silent – teacher can write manually */
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.objectiveKey) return;
    setSaving(true);
    try {
      await onAssign({
        studentId,
        classId,
        subjectId,
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
            <option value="">— Select an objective —</option>
            {(objectives || []).map((obj) => (
              <option key={obj.objectiveKey} value={obj.objectiveKey}>
                {obj.objectiveName || obj.objectiveKey}
              </option>
            ))}
          </select>
          {(!objectives || objectives.length === 0) && (
            <small style={{ color: "#b45309" }}>
              No objectives loaded for this class yet. Try Refresh on the Academic Excellence page.
            </small>
          )}
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

        {!isInteractiveType && (
          <div style={{ marginBottom: "0.5rem" }}>
            <button
              type="button"
              className="teacher-ae-btn-primary"
              style={{ width: "100%" }}
              onClick={handleGenerate}
              disabled={generating || !form.objectiveKey}
            >
              {generating ? (
                <>
                  <InlineSpinner size="md" /> Generating…
                </>
              ) : "✨ Generate Task with AI"}
            </button>
            {generating && (
              <div style={{ marginTop: '0.5rem' }}>
                <ProgressBar indeterminate size="sm" />
              </div>
            )}
          </div>
        )}

        {isInteractiveType && (
          <p style={{ margin: "0.25rem 0 0.75rem", color: "#0f766e", fontSize: "0.86rem" }}>
            An AI-guided quiz session will be generated automatically when the student starts this task.
          </p>
        )}

        <div className="teacher-ae-form-group">
          <label>Title</label>
          <input
            className="teacher-ae-input"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Practice adding fractions"
          />
        </div>

        {!isInteractiveType && (
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
        )}

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
