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

// F13: a submission can go back only while it waits on the teacher and nothing
// has been published from it.
const RETURN_STAGES = ["submitted", "feedback_ready"];

export const canReturnSubmission = ({ stage, published } = {}) =>
  RETURN_STAGES.includes(stage) && !published;

export const teacherNextStepKey = (row) => {
  if (!row.hasProject) return "notOpened";
  switch (row.stage) {
    case "not_started":
    case "drafting":
      return "studentWriting";
    case "submitted":
      // The row reports the run itself, so a failed or in-flight assessment
      // never reads as "nothing has happened yet".
      if (row.assessmentStatus === "failed") return "retryAssessment";
      if (["pending", "running"].includes(row.assessmentStatus))
        return "assessmentRunning";
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

/**
 * F5: what the teacher must do comes first — a failed run before a fresh
 * submission, then feedback waiting to be published, then notebook checks.
 * Everything else is the student's move; finished work sits at the bottom.
 */
const ATTENTION_RANK = {
  submitted: 0,
  feedback_ready: 1,
  awaiting_notebook_check: 2,
  ready_for_notebook: 3,
  feedback_published: 4,
  revising: 4,
  compared: 4,
  drafting: 5,
  not_started: 6,
  completed: 7,
};

export const attentionRank = (row = {}) => {
  // A submitted draft whose assessment failed is a retry the teacher owes.
  if (row.stage === "submitted" && row.assessmentStatus === "failed") return -1;
  return ATTENTION_RANK[row.stage] ?? 6;
};

const waitingSince = (row) =>
  Date.parse(row.submittedAt || row.lastEditedAt || "") || 0;

const byName = (left, right) =>
  String(left.name || "").localeCompare(String(right.name || ""), undefined, {
    sensitivity: "base",
  });

export const BOARD_SORT_MODES = ["attention", "name"];

export const sortBoardRows = (rows = [], mode = "attention") => {
  const copy = rows.slice();
  if (mode === "name") return copy.sort(byName);
  return copy.sort((left, right) => {
    const rank = attentionRank(left) - attentionRank(right);
    if (rank !== 0) return rank;
    // Inside a group the teacher owes, the draft that has waited longest leads.
    // Inside the student's groups, the freshest work leads.
    if (attentionRank(left) <= 2) {
      const waited = waitingSince(left) - waitingSince(right);
      if (waited !== 0) return waited;
    } else {
      const fresh = waitingSince(right) - waitingSince(left);
      if (fresh !== 0) return fresh;
    }
    return byName(left, right);
  });
};
