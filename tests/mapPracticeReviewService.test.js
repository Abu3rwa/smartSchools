import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMapPracticeReviewMarks,
  hideMapPracticeAttemptAnswerKeys,
  hideMapPracticeQuestionAnswers
} from '../services/mapPracticeReviewService.js';

test('teacher marks update per-answer grading, totals, and review completion', () => {
  const result = applyMapPracticeReviewMarks([
    { _id: 'answer-1', isCorrect: null, score: 0 },
    { _id: 'answer-2', isCorrect: false, score: 0 }
  ], [
    { answerId: 'answer-1', isCorrect: true },
    { answerId: 'answer-2', isCorrect: false }
  ]);

  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 2);
  assert.equal(result.reviewStatus, 'reviewed');
  assert.equal(result.status, 'reviewed');
  assert.equal(result.answers[0].teacherOverride, true);
  assert.equal(result.answers[1].teacherOverride, false);
});

test('unmarked answers keep the attempt pending and unknown answer IDs are rejected', () => {
  const pending = applyMapPracticeReviewMarks([
    { _id: 'answer-1', isCorrect: null, score: 0 },
    { _id: 'answer-2', isCorrect: null, score: 0 }
  ], [{ answerId: 'answer-1', isCorrect: true }]);

  assert.equal(pending.status, 'submitted');
  assert.equal(pending.reviewStatus, 'pending');
  assert.equal(pending.score, 1);

  const invalid = applyMapPracticeReviewMarks(
    [{ _id: 'answer-1', isCorrect: null, score: 0 }],
    [{ answerId: 'other-answer', isCorrect: false }]
  );
  assert.equal(invalid.error, 'One or more answers do not belong to this attempt.');
});

test('unchanged legacy correct marks retain their point in the recalculated score', () => {
  const result = applyMapPracticeReviewMarks([
    { _id: 'legacy-correct-answer', isCorrect: true }
  ], [{ answerId: 'legacy-correct-answer', isCorrect: true }]);

  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 1);
  assert.equal(result.answers[0].teacherOverride, false);
});

test('student payload helpers remove answer keys without hiding their own responses and marks', () => {
  const question = hideMapPracticeQuestionAnswers({
    stem: 'Choose one',
    options: [{ key: 'A', text: 'One' }],
    correctAnswer: 'A',
    explanation: 'Because it matches.',
    distractorNote: 'Misleading option'
  });
  const attempt = hideMapPracticeAttemptAnswerKeys({
    answers: [{
      response: 'A',
      isCorrect: true,
      teacherComment: 'Nice work',
      correctAnswerSnapshot: 'A',
      explanationSnapshot: 'Reason'
    }]
  });

  assert.equal(question.stem, 'Choose one');
  assert.equal('correctAnswer' in question, false);
  assert.equal(attempt.answers[0].response, 'A');
  assert.equal(attempt.answers[0].isCorrect, true);
  assert.equal(attempt.answers[0].teacherComment, 'Nice work');
  assert.equal('correctAnswerSnapshot' in attempt.answers[0], false);
  assert.equal('explanationSnapshot' in attempt.answers[0], false);
});

test('matching questions reach students as shuffled columns without the pairing key', () => {
  const pairs = [
    { left: 'Solar system', right: 'A group of planets orbiting a star' },
    { left: 'Orbit', right: 'The path a planet takes' },
    { left: 'Asteroid', right: 'A rocky body that orbits the sun' },
    { left: 'Comet', right: 'An icy body with a glowing tail' },
    { left: 'Galaxy', right: 'A vast system of stars and gas' },
    { left: 'Eclipse', right: 'One body casting a shadow on another' },
    { left: 'Crater', right: 'A bowl-shaped mark left by an impact' },
    { left: 'Satellite', right: 'An object that orbits a larger body' }
  ];
  const question = { _id: 'question-1', questionType: 'matching', stem: 'Match each term.', matchingPairs: pairs };
  const firstStudent = hideMapPracticeQuestionAnswers({ ...question, student: 'student-1' });
  const sameStudentAgain = hideMapPracticeQuestionAnswers({ ...question, student: 'student-1' });
  const secondStudent = hideMapPracticeQuestionAnswers({ ...question, student: 'student-2' });

  assert.equal('matchingPairs' in firstStudent, false);
  assert.deepEqual(firstStudent.matchingColumns.terms, pairs.map((pair) => pair.left));
  assert.deepEqual([...firstStudent.matchingColumns.choices].sort(), pairs.map((pair) => pair.right).sort());
  assert.deepEqual(firstStudent.matchingColumns, sameStudentAgain.matchingColumns);
  assert.notEqual(firstStudent.matchingColumns.choices.join('|'), secondStudent.matchingColumns.choices.join('|'));

  const snapshot = hideMapPracticeAttemptAnswerKeys({
    student: 'student-1',
    answers: [{
      response: [{ left: 'Orbit', right: 'The path a planet takes' }],
      questionSnapshot: { questionId: 'Q-1', matchingColumns: { terms: ['Orbit'], choices: ['The path a planet takes'] } },
      matchingPairsSnapshot: pairs
    }]
  });

  assert.equal('matchingPairsSnapshot' in snapshot.answers[0], false);
  assert.deepEqual(snapshot.answers[0].response, [{ left: 'Orbit', right: 'The path a planet takes' }]);
});
