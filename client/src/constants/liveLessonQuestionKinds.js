// Mirrors server/constants/liveLessonQuestionKinds.js so the lesson editor, the live student view
// and the server agree on one token per answer kind.
export const LIVE_QUESTION_KINDS = [
    'mcq',
    'tf',
    'multi_select',
    'matching',
    'ordering',
    'fill_in_blank',
    'numeric',
    'text'
];

export const LIVE_OBJECTIVE_KINDS = ['multi_select', 'matching', 'ordering', 'fill_in_blank', 'numeric'];

export const LIVE_WRITTEN_KINDS = ['text'];

export const isLiveObjectiveKind = (kind) => LIVE_OBJECTIVE_KINDS.includes(kind);

export const isLiveWrittenKind = (kind) => LIVE_WRITTEN_KINDS.includes(kind);

// Questions authored before the kind field existed store none, and every one of them was an option
// question, so an empty kind reads as mcq rather than dropping the answer key or the grading.
export const liveQuestionKind = (question) => String(question?.kind ?? '').trim() || 'mcq';
