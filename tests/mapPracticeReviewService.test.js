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
