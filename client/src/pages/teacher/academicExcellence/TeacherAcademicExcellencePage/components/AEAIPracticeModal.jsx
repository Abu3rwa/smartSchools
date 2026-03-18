import { useMemo, useState } from "react";
import { ProgressBar } from "@/components/ui";

const QUESTION_TYPE_OPTIONS = [
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "short_answer", label: "Short Answer" },
  { value: "true_false", label: "True / False" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const SESSION_TYPE_OPTIONS = [
  { value: "practice", label: "Practice" },
  { value: "homework", label: "Homework" },
  { value: "classwork", label: "Classwork" },
  { value: "assessment", label: "Assessment" },
];

const parseCount = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
};

const isFutureDate = (value) => {
  if (!value) return true;
  const selected = new Date(value);
  if (Number.isNaN(selected.getTime())) return false;
  const now = new Date();
  selected.setHours(23, 59, 59, 999);
  return selected.getTime() > now.getTime();
};

const AEAIPracticeModal = ({
  studentId,
  studentName,
  isBulk,
  classId,
  objectiveKey,
  objectiveName,
  trackingMode = "objectives",
  subjectId,
  subjectName,
  creating,
  onCreate,            // legacy — kept for backward compat
  onCreateAssignment,  // canonical name used by TeacherAcademicExcellencePage
  onSuccess,
  onClose,
}) => {
  const entityLabel = trackingMode === "standards" ? "Standard" : "Objective";
  const [form, setForm] = useState({
    questionCount: 10,
    questionTypes: ["multiple_choice"],
    difficulties: ["easy", "medium", "hard"],
    sessionType: "practice",
    dueDate: "",
    title: "",
  });
  const [error, setError] = useState("");

  const questionCountNumber = parseCount(form.questionCount);
  const questionCountValid = Number.isInteger(questionCountNumber) && questionCountNumber >= 1 && questionCountNumber <= 50;
  const questionTypesValid = Array.isArray(form.questionTypes) && form.questionTypes.length > 0;
  const difficultiesValid = Array.isArray(form.difficulties) && form.difficulties.length > 0;
  const dueDateValid = isFutureDate(form.dueDate);
  const titleValid = String(form.title || "").length <= 200;

  const formValid = questionCountValid && questionTypesValid && difficultiesValid && dueDateValid && titleValid;

  const selectedAudienceText = useMemo(() => {
    if (isBulk) return "This will assign AI practice to all students in the selected class.";
    if (studentId) return `This will assign AI practice to ${studentName || "the selected student"}.`;
    return "This will assign AI practice to the selected class.";
  }, [isBulk, studentId, studentName]);

  const toggleValue = (key, value) => {
    setForm((prev) => {
      const existing = Array.isArray(prev[key]) ? prev[key] : [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      return { ...prev, [key]: next };
    });
  };

  const handleSubmit = async () => {
    if (!formValid || creating) return;
    setError("");

    const payload = {
      objectiveKey,
      objectiveName,
      classId,
      subjectId,
      questionCount: questionCountNumber,
      questionTypes: form.questionTypes,
      difficulties: form.difficulties,
      sessionType: form.sessionType,
      dueDate: form.dueDate || undefined,
      title: form.title.trim() || undefined,
      students: isBulk ? [] : (studentId ? [studentId] : []),
    };

    try {
      // Support both `onCreateAssignment` (page prop name) and legacy `onCreate`
      const createFn = onCreateAssignment || onCreate;
      const result = await createFn(payload);
      if (result) onSuccess(result);
    } catch (err) {
      const responseCode = err?.response?.data?.code;
      const message = err?.response?.data?.message || "Failed to create AI practice assignment.";
      setError(responseCode === "STANDARD_NOT_FOUND" ? message : message);
    }
  };

  return (
    <div className="teacher-ae-modal-overlay" onClick={onClose}>
      <div className="teacher-ae-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Assign AI Practice</h2>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary, #6b7280)" }}>
          {selectedAudienceText}
        </p>

        {error ? (
          <div className="teacher-ae-error" style={{ marginTop: "0.75rem" }}>
            {error}
          </div>
        ) : null}

        <div className="teacher-ae-form-group">
          <label>{entityLabel} Key</label>
          <input className="teacher-ae-input" value={objectiveKey || ""} readOnly />
        </div>

        <div className="teacher-ae-form-group">
          <label>{entityLabel} Name</label>
          <input className="teacher-ae-input" value={objectiveName || ""} readOnly />
        </div>

        <div className="teacher-ae-form-group">
          <label>Subject</label>
          <input className="teacher-ae-input" value={subjectName || ""} readOnly />
        </div>

        <div className="teacher-ae-form-group">
          <label>Question Count (1-50)</label>
          <input
            type="number"
            className="teacher-ae-input"
            min={1}
            max={50}
            value={form.questionCount}
            onChange={(event) => setForm((prev) => ({ ...prev, questionCount: event.target.value }))}
          />
          {!questionCountValid && (
            <small style={{ color: "#dc2626" }}>Enter an integer between 1 and 50.</small>
          )}
        </div>

        <div className="teacher-ae-form-group">
          <label>Question Types</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
            {QUESTION_TYPE_OPTIONS.map((option) => (
              <label key={option.value} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.questionTypes.includes(option.value)}
                  onChange={() => toggleValue("questionTypes", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {!questionTypesValid && (
            <small style={{ color: "#dc2626" }}>Select at least one question type.</small>
          )}
        </div>

        <div className="teacher-ae-form-group">
          <label>Difficulties</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <label key={option.value} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.difficulties.includes(option.value)}
                  onChange={() => toggleValue("difficulties", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {!difficultiesValid && (
            <small style={{ color: "#dc2626" }}>Select at least one difficulty.</small>
          )}
        </div>

        <div className="teacher-ae-form-group">
          <label>Session Type</label>
          <select
            className="teacher-ae-select"
            value={form.sessionType}
            onChange={(event) => setForm((prev) => ({ ...prev, sessionType: event.target.value }))}
          >
            {SESSION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="teacher-ae-form-group">
          <label>Due Date (optional)</label>
          <input
            type="date"
            className="teacher-ae-input"
            value={form.dueDate}
            onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
          />
          {!dueDateValid && (
            <small style={{ color: "#dc2626" }}>Due date must be in the future.</small>
          )}
        </div>

        <div className="teacher-ae-form-group">
          <label>Title (optional, max 200)</label>
          <input
            type="text"
            className="teacher-ae-input"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            maxLength={220}
          />
          {!titleValid && (
            <small style={{ color: "#dc2626" }}>Title must be 200 characters or less.</small>
          )}
        </div>

        {creating ? (
          <div style={{ padding: '1rem', width: '100%', textAlign: 'center' }}>
            <ProgressBar indeterminate label="Creating AI practice assignment…" color="primary" />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)', marginTop: '0.5rem' }}>
              Generating questions — this usually takes 15–30 seconds
            </p>
          </div>
        ) : (
          <div className="teacher-ae-modal-actions">
            <button type="button" className="teacher-ae-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="teacher-ae-btn-primary"
              onClick={handleSubmit}
              disabled={!formValid}
            >
              Create AI Practice
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AEAIPracticeModal;
