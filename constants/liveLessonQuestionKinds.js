// Live lessons kept the short `mcq`/`tf` tokens from the first CSV, so the added kinds use the
// same short style. Every kind except `text` grades through the shared objective engines, which
// resolve these tokens through PRACTICE_TYPE_ALIASES.
export const LIVE_QUESTION_KINDS = ["mcq", "tf", "multi_select", "matching", "ordering", "fill_in_blank", "numeric", "text"];

export const LIVE_OBJECTIVE_KINDS = ["multi_select", "matching", "ordering", "fill_in_blank", "numeric"];

export const LIVE_WRITTEN_KINDS = ["text"];

export const isLiveObjectiveKind = (kind) => LIVE_OBJECTIVE_KINDS.includes(kind);

export const isLiveWrittenKind = (kind) => LIVE_WRITTEN_KINDS.includes(kind);

/**
 * Question kinds only exist from the slice that introduced them, so every lesson and every session
 * snapshot stored before it holds questions with no kind at all — and those were option questions.
 * Read a stored kind through here so a legacy lesson keeps auto-grading, keeps its answer key in the
 * report and keeps its answers in the PDF instead of parking every answer for the teacher.
 */
export const liveQuestionKind = (question) => String(question?.kind ?? "").trim() || "mcq";
