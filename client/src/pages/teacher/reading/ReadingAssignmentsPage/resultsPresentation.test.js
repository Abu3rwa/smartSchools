import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerForQuestion,
  assignmentSummary,
  isObjectiveCorrect,
  objectiveAnswerLabel,
  scorePercent,
  studentFullName,
  submissionRate,
} from './resultsPresentation.js';

const mcq = { _id: 'q1', type: 'multiple_choice', options: ['Paris', 'Cairo', 'Khartoum'], correctIndex: 0 };
const tf = { _id: 'q2', type: 'true_false', options: ['True', 'False'], correctIndex: 1 };

test('saved answers are read back by question id', () => {
  const responses = [{ questionId: 'q1', answer: '2' }];
  assert.equal(answerForQuestion(responses, 'q1'), '2');
  assert.equal(answerForQuestion(responses, 'q2'), null);
  assert.equal(answerForQuestion(undefined, 'q1'), null);
});

test('objective answers show the chosen option, never a raw index', () => {
  assert.equal(objectiveAnswerLabel(mcq, '2'), 'Khartoum');
  assert.equal(objectiveAnswerLabel(tf, '1'), 'False');
  assert.equal(objectiveAnswerLabel(mcq, '9'), null);
  assert.equal(objectiveAnswerLabel(mcq, ''), null);
  assert.equal(objectiveAnswerLabel(mcq, null), null);
});

test('marking matches the stored answer key', () => {
  assert.equal(isObjectiveCorrect(mcq, '0'), true);
  assert.equal(isObjectiveCorrect(mcq, '1'), false);
  assert.equal(isObjectiveCorrect(mcq, null), false);
});

test('scores only become percentages when there is a quiz to grade', () => {
  assert.equal(scorePercent({ correctCount: 3, totalCount: 4 }), 75);
  assert.equal(scorePercent({ correctCount: 0, totalCount: 0 }), null);
  assert.equal(scorePercent(null), null);
});

test('submission rate ignores assignments with no roster', () => {
  assert.equal(submissionRate({ studentCount: 8, completedCount: 2 }), 25);
  assert.equal(submissionRate({ studentCount: 0, completedCount: 0 }), null);
});

test('summary totals add up across every assignment', () => {
  assert.deepEqual(
    assignmentSummary([
      { studentCount: 10, completedCount: 4 },
      { studentCount: 5, completedCount: 5 },
    ]),
    { total: 2, students: 15, submitted: 9 },
  );
  assert.deepEqual(assignmentSummary([]), { total: 0, students: 0, submitted: 0 });
});

test('student names never render empty', () => {
  assert.equal(studentFullName({ firstName: 'Mona', lastName: 'Ali' }), 'Mona Ali');
  assert.equal(studentFullName({ firstName: 'Mona' }), 'Mona');
  assert.equal(studentFullName(null), '—');
});
