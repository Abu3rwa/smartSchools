/** Which stage chips a board shows, in workflow order, plus what the teacher does next. */

const STAGE_ORDER = [
  "not_started",
  "drafting",
  "submitted",
  "feedback_ready",
  "feedback_published",
  "revising",
  "compared",
  "ready_for_notebook",
  "awaiting_notebook_check",
  "completed",
];

export const sortStages = (stages) => stages.slice().sort(
  (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
);

export const teacherNextStepKey = (row) => {
  if (!row.hasProject) return "notOpened";
  switch (row.stage) {
    case "not_started":
    case "drafting":
      return "studentWriting";
    case "submitted":
      return "assessDraft";
    case "feedback_ready":
      return "publishFeedback";
    case "feedback_published":
    case "revising":
    case "compared":
      return "studentRevising";
    case "ready_for_notebook":
      return "notebookCopy";
    case "awaiting_notebook_check":
      return "checkNotebook";
    default:
      return "done";
  }
};

export const formatDateTime = (value, language) => (value
  ? new Date(value).toLocaleString(language, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  })
  : "");

export const formatDate = (value, language) => (value
  ? new Date(value).toLocaleDateString(language, { day: "2-digit", month: "short", year: "numeric" })
  : "");
