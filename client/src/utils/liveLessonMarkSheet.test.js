import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMarkDrafts,
  buildMarkPayload,
  clearMarkDrafts,
  draftOutcome,
  groupMarkAnswers,
  liveMarkStateLabel,
  markSheetSaved,
  markSheetSummary,
  mergeMarkSheet,
  pendingMarkCount
} from './liveLessonMarkSheet.js';

const question = {
  slideId: 'slide-2',
  kind: 'text',
  maxMarks: 2,
  answers: [
    { studentId: 'ada', name: 'Ada', kind: 'text', state: 'pending', marks: null, maxMarks: null, feedback: '', released: false },
    { studentId: 'grace', name: 'Grace', kind: 'text', state: 'correct', marks: 2, maxMarks: 2, feedback: 'Well argued', released: true }
  ]
};

test('the mark sheet starts from what the server already holds', () => {
  const sheet = mergeMarkSheet(undefined, question);
  assert.equal(sheet.maxMarks, '2');
  assert.deepEqual(sheet.rows.ada, { marks: '', feedback: '', released: false });
  assert.deepEqual(sheet.rows.grace, { marks: '2', feedback: 'Well argued', released: true });
});

test('a mark half written survives the answer that lands mid-keystroke', () => {
  const current = {
    maxMarks: '3',
    rows: { ada: { marks: '1', feedback: 'Check your tense', released: false } }
  };
  const later = {
    ...question,
    answers: [...question.answers, { studentId: 'bo', name: 'Bo', kind: 'text', state: 'pending' }]
  };
  const sheet = mergeMarkSheet(current, later);
  assert.deepEqual(sheet.rows.ada, { marks: '1', feedback: 'Check your tense', released: false });
  assert.equal(sheet.maxMarks, '3');
  assert.equal(sheet.rows.bo.marks, '');
});

test('an answer with no verdict reads as to mark, never as incorrect', () => {
  assert.equal(liveMarkStateLabel('pending'), 'To mark');
  assert.equal(liveMarkStateLabel('partial'), 'Partially correct');
});

test('the queue is what is left over once the typed marks are counted', () => {
  const sheet = mergeMarkSheet(undefined, question);
  assert.deepEqual(markSheetSummary(question, sheet), {
    total: 2,
    marked: 1,
    released: 1,
    toMark: 1,
    suggested: 0,
    invalid: false,
    error: ''
  });
  sheet.rows.ada.marks = '4';
  const invalid = markSheetSummary(question, sheet);
  assert.equal(invalid.invalid, true);
  assert.equal(invalid.error, 'A mark cannot be above 2.');
});

test('an empty mark goes back to the queue instead of scoring zero', () => {
  const sheet = {
    maxMarks: '4',
    rows: {
      ada: { marks: '', feedback: 'Try again', released: true },
      grace: { marks: '3.5', feedback: '', released: false }
    }
  };
  assert.deepEqual(buildMarkPayload(question, sheet), {
    slideId: 'slide-2',
    maxMarks: 4,
    marks: [
      { studentId: 'ada', marks: null, feedback: 'Try again', released: false },
      { studentId: 'grace', marks: 3.5, feedback: '', released: false }
    ]
  });
});

test('a levelled question marks each level as its own block', () => {
  const levelled = {
    ...question,
    levels: [{ level: 'Needs support' }, { level: 'Class' }],
    answers: [
      { studentId: 'ada', name: 'Ada', level: 'Class', kind: 'mcq' },
      { studentId: 'bo', name: 'Bo', level: 'Needs support', kind: 'mcq' },
      { studentId: 'cal', name: 'Cal', level: 'Class', kind: 'mcq' }
    ]
  };
  assert.deepEqual(
    groupMarkAnswers(levelled).map((group) => [group.level, group.answers.map((answer) => answer.name)]),
    [['Needs support', ['Bo']], ['Class', ['Ada', 'Cal']]]
  );
});

test('only the answers waiting for a teacher can be drafted', () => {
  assert.equal(pendingMarkCount(question), 1);
});

test('a suggestion fills the row but is neither saved nor shared', () => {
  const sheet = mergeMarkSheet(undefined, question);
  const { sheet: next, applied } = applyMarkDrafts(sheet, question, {
    maxMarks: 2,
    drafts: [
      { studentId: 'ada', marks: 1.5, feedback: 'Say which fear.', confidence: 'medium' },
      // a suggestion for an answer that is not on this sheet cannot invent a row
      { studentId: 'stranger', marks: 2, feedback: 'well done', confidence: 'high' }
    ]
  });

  assert.equal(applied, 1);
  assert.deepEqual(next.rows.ada, {
    marks: '1.5',
    feedback: 'Say which fear.',
    released: false,
    suggested: true,
    confidence: 'medium'
  });
  assert.equal(Object.keys(next.rows).length, 2);
  // an answer that already has a verdict keeps its released mark untouched
  assert.deepEqual(next.rows.grace, { marks: '2', feedback: 'Well argued', released: true });
  assert.equal(markSheetSummary(question, next).suggested, 1);
  assert.equal(markSheetSummary(question, next).released, 1);
});

test('the mark the teacher already typed is not moved by a suggestion', () => {
  const sheet = { maxMarks: '4', rows: { ada: { marks: '3', feedback: 'mine', released: true } } };
  const { sheet: next, applied } = applyMarkDrafts(sheet, question, {
    maxMarks: 2,
    drafts: [{ studentId: 'ada', marks: 0.5, feedback: '', confidence: 'low' }]
  });
  // a box with a number in it stays the teacher's, and the question keeps their own allocation
  assert.equal(applied, 0);
  assert.deepEqual(next.rows.ada, { marks: '3', feedback: 'mine', released: true });
  assert.equal(next.maxMarks, '4');
  assert.equal(markSheetSummary(question, next).suggested, 0);

  // an empty box with only a comment offered gets the comment, and still no mark
  const blank = mergeMarkSheet(undefined, question);
  const commented = applyMarkDrafts(blank, question, {
    maxMarks: 2,
    drafts: [{ studentId: 'ada', marks: null, feedback: 'One more sentence.', confidence: 'low' }]
  });
  assert.deepEqual(commented.sheet.rows.ada, {
    marks: '', feedback: 'One more sentence.', released: false, suggested: true, confidence: 'low'
  });
  assert.equal(commented.applied, 1);
});

test('clearing suggestions leaves the saved mark and whatever the teacher typed', () => {
  const sheet = {
    maxMarks: '2',
    rows: {
      ada: { marks: '1.5', feedback: 'Say which fear.', released: false, suggested: true, confidence: 'medium' },
      grace: { marks: '1', feedback: 'typed by hand', released: false }
    }
  };
  const cleared = clearMarkDrafts(sheet, question);
  // the answer goes back to what the session actually stores, which for Ada is nothing
  assert.deepEqual(cleared.rows.ada, { marks: '', feedback: '', released: false });
  assert.deepEqual(cleared.rows.grace, { marks: '1', feedback: 'typed by hand', released: false });
  assert.equal(markSheetSummary(question, cleared).suggested, 0);
});

test('saving is the approval, so the suggestion marker goes with it', () => {
  const sheet = { maxMarks: '2', rows: { ada: { marks: '1.5', feedback: 'Say which fear.', released: false, suggested: true } } };
  const saved = markSheetSaved(sheet);
  assert.deepEqual(saved.rows.ada, { marks: '1.5', feedback: 'Say which fear.', released: false, suggested: false });
});

test('a suggestion that cannot be made says so without touching the sheet', () => {
  const waiting = { waiting: 3 };
  assert.match(draftOutcome({ unavailable: true, reason: 'credit_limit' }, waiting).message, /monthly allowance/);
  assert.match(draftOutcome({ unavailable: true, reason: 'unavailable' }, waiting).message, /Nothing on your mark sheet changed/);
  assert.equal(draftOutcome({ unavailable: false }, { waiting: 0, applied: 0 }).kind, 'empty');
  assert.equal(draftOutcome({ unavailable: false }, { waiting: 2, applied: 2 }).kind, 'ready');
  // nothing landed because the teacher had already written every box
  assert.match(draftOutcome({ unavailable: false }, { waiting: 2, applied: 0 }).message, /already has a mark/);
});
