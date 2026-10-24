import { LIVE_QUESTION_KIND_LABELS } from './liveLessonQuestionDraft.js';

const STATE_LABELS = {
  correct: 'Correct',
  partial: 'Partially correct',
  wrong: 'Incorrect',
  // Submitted, but nobody has read it. It is never shown as incorrect.
  pending: 'To mark',
};

export const liveMarkStateLabel = (state) => STATE_LABELS[state] || '—';

export const liveQuestionKindLabel = (kind) => LIVE_QUESTION_KIND_LABELS[kind] || 'Written answer';

const markValue = (answer) => (
  answer.marks === null || answer.marks === undefined ? '' : String(answer.marks)
);

/**
 * The rows the teacher types into. An answer that lands while they are still writing gets its own
 * row, and the rows already touched keep what is on the screen, so the live poll never overwrites a
 * half-finished mark.
 */
export const mergeMarkSheet = (current, question) => {
  const rows = { ...(current?.rows || {}) };
  for (const answer of question.answers || []) {
    if (rows[answer.studentId]) continue;
    rows[answer.studentId] = {
      marks: markValue(answer),
      feedback: answer.feedback || '',
      released: Boolean(answer.released),
    };
  }
  return {
    maxMarks: current?.maxMarks ?? String(question.maxMarks ?? ''),
    rows,
  };
};

export const allocationError = (value) => {
  const maxMarks = Number(value);
  if (!Number.isFinite(maxMarks) || maxMarks < 0.25 || maxMarks > 100) {
    return 'A question is worth between 0.25 and 100 marks.';
  }
  return '';
};

export const markRowError = (row, maxMarks) => {
  if (!row?.marks) return '';
  const marks = Number(row.marks);
  if (!Number.isFinite(marks)) return 'Enter a mark, or leave the box empty to send it back to the queue.';
  if (marks < 0) return 'A mark cannot be below zero.';
  if (marks > maxMarks) return `A mark cannot be above ${maxMarks}.`;
  return '';
};

export const markSheetSummary = (question, sheet) => {
  const maxMarks = Number(sheet?.maxMarks);
  const answers = question.answers || [];
  const rows = answers.map((answer) => sheet?.rows?.[answer.studentId]).filter(Boolean);
  const marked = rows.filter((row) => row.marks !== '').length;
  const released = rows.filter((row) => row.marks !== '' && row.released).length;
  const errors = [
    allocationError(sheet?.maxMarks),
    ...rows.map((row) => markRowError(row, Number.isFinite(maxMarks) ? maxMarks : 0)),
  ].filter(Boolean);
  return {
    total: answers.length,
    marked,
    released,
    toMark: answers.length - marked,
    // Marks the teacher has not approved yet: they are on the sheet but not in the book.
    suggested: rows.filter((row) => row.suggested).length,
    invalid: Boolean(errors.length) || answers.length > 500,
    error: errors[0] || '',
  };
};

/** One request per question, all levels at once: a blank mark is sent as null, not as a zero. */
export const buildMarkPayload = (question, sheet) => {
  const maxMarks = Number(sheet.maxMarks);
  return {
    slideId: question.slideId,
    maxMarks,
    marks: (question.answers || []).map((answer) => {
      const row = sheet.rows?.[answer.studentId] || { marks: '', feedback: '', released: false };
      const marked = row.marks !== '';
      return {
        studentId: answer.studentId,
        marks: marked ? Number(row.marks) : null,
        feedback: row.feedback || '',
        released: marked && Boolean(row.released),
      };
    }),
  };
};

/** The answers only a teacher can settle: a written one, or an objective one nothing could score. */
export const pendingMarkCount = (question) => (
  (question?.answers || []).filter((answer) => answer.state === 'pending').length
);

/**
 * A suggestion fills the rows that are still empty and stays unsaved and unshared: only the teacher's
 * Save turns it into a mark, and a suggested comment is never released by itself. A box the teacher
 * has already written in is theirs to keep - drafting never overwrites a mark in progress.
 */
export const applyMarkDrafts = (sheet, question, { maxMarks, drafts }) => {
  const rows = { ...(sheet?.rows || {}) };
  let applied = 0;
  for (const draft of drafts || []) {
    const row = rows[draft.studentId];
    const filled = row && row.marks !== '' && row.marks != null;
    if (!row || filled) continue;
    applied += 1;
    rows[draft.studentId] = {
      ...row,
      marks: draft.marks === null || draft.marks === undefined ? '' : String(draft.marks),
      feedback: draft.feedback || row.feedback,
      released: false,
      suggested: true,
      confidence: draft.confidence || 'low',
    };
  }
  return {
    applied,
    sheet: {
      maxMarks: sheet?.maxMarks === '' || sheet?.maxMarks == null ? String(maxMarks ?? '') : sheet.maxMarks,
      rows,
    },
  };
};

/** Throwing the suggestions away leaves whatever the teacher had typed or saved, untouched. */
export const clearMarkDrafts = (sheet, question) => {
  const stored = new Map((question?.answers || []).map((answer) => [answer.studentId, answer]));
  const rows = { ...(sheet?.rows || {}) };
  for (const [studentId, row] of Object.entries(rows)) {
    if (!row?.suggested) continue;
    const answer = stored.get(studentId);
    rows[studentId] = {
      marks: markValue(answer),
      feedback: answer?.feedback || '',
      released: Boolean(answer?.released),
    };
  }
  return { maxMarks: sheet?.maxMarks ?? '', rows };
};

/** Once the teacher saves, the rows hold their marks, so the suggestion marker is no longer true. */
export const markSheetSaved = (sheet) => ({
  ...sheet,
  rows: Object.fromEntries(Object.entries(sheet.rows || {}).map(([studentId, row]) => [
    studentId,
    { ...row, suggested: false },
  ])),
});

const DRAFT_MESSAGES = {
  credit_limit: 'This school has used up its monthly allowance for suggestions, so these answers need your own mark for now.',
  unavailable: 'Suggestions are not available right now. Nothing on your mark sheet changed.',
};

/** What one draft request ended up meaning, in the teacher's words. */
export const draftOutcome = (data, { waiting = 0, applied = 0 } = {}) => {
  if (data?.unavailable) {
    return { kind: 'error', message: DRAFT_MESSAGES[data.reason] || DRAFT_MESSAGES.unavailable };
  }
  if (!waiting) {
    return { kind: 'empty', message: 'Nothing on this question is waiting for a mark.' };
  }
  if (!applied) {
    return { kind: 'empty', message: 'Every box on this question already has a mark, so nothing was filled in.' };
  }
  return {
    kind: 'ready',
    message: `${applied} suggestion${applied === 1 ? '' : 's'} ready. Check them, then save to make them count.`,
  };
};

/** A levelled slide asks each group something different, so their answers are marked in blocks. */
export const groupMarkAnswers = (question) => {
  const order = (question.levels || []).map((level) => level.level);
  const groups = new Map();
  for (const answer of question.answers || []) {
    const level = answer.level || 'Class';
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(answer);
  }
  return [...groups.entries()]
    .sort((first, second) => {
      const firstIndex = order.indexOf(first[0]);
      const secondIndex = order.indexOf(second[0]);
      return (firstIndex === -1 ? order.length : firstIndex) - (secondIndex === -1 ? order.length : secondIndex);
    })
    .map(([level, answers]) => ({
      level,
      question: (question.levels || []).find((entry) => entry.level === level) || question,
      answers,
    }));
};
