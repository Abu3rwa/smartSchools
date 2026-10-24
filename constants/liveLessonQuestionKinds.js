// Live lessons kept the short `mcq`/`tf` tokens from the first CSV, so the added kinds use the
// same short style. Every kind except `text` grades through the shared objective engines, which
// resolve these tokens through PRACTICE_TYPE_ALIASES.
export const LIVE_QUESTION_KINDS = ["mcq", "tf", "multi_select", "matching", "ordering", "fill_in_blank", "numeric", "text"];

export const LIVE_OBJECTIVE_KINDS = ["multi_select", "matching", "ordering", "fill_in_blank", "numeric"];

export const LIVE_WRITTEN_KINDS = ["text"];

export const isLiveObjectiveKind = (kind) => LIVE_OBJECTIVE_KINDS.includes(kind);

export const isLiveWrittenKind = (kind) => LIVE_WRITTEN_KINDS.includes(kind);
