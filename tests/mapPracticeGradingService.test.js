import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeMapPracticeQuestion, gradeMapPracticeAttempt } from '../services/mapPracticeGradingService.js';

test('gradeMapPracticeQuestion marks a correct multi-select answer exact and rejects missing short text', () => {
  const mcq = gradeMapPracticeQuestion({
    questionType: 'mcq',
    studentAnswer: 'B',
    correctAnswer: 'B',
    options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }]
  });

  assert.equal(mcq.isCorrect, true);
  assert.equal(mcq.score, 1);

  const multiSelect = gradeMapPracticeQuestion({
    questionType: 'multi_select',
    studentAnswer: ['A', 'C'],
    correctAnswer: 'A|C',
    options: [{ key: 'A', text: 'One' }, { key: 'B', text: 'Two' }, { key: 'C', text: 'Three' }],
    partialCreditMultiSelect: false
  });

  assert.equal(multiSelect.isCorrect, true);
  assert.equal(multiSelect.score, 1);

  const matchingShortText = gradeMapPracticeQuestion({
    questionType: 'short_text',
    studentAnswer: 'Egyptians',
    correctAnswer: 'egyptian|egyptians',
    options: []
  });

  assert.equal(matchingShortText.isCorrect, true);
  assert.equal(matchingShortText.requiresTeacherReview, false);

  const mismatchedShortText = gradeMapPracticeQuestion({
    questionType: 'short_text',
    studentAnswer: 'phoenix',
    correctAnswer: 'egyptian|egyptians',
    options: []
  });

  assert.equal(mismatchedShortText.requiresTeacherReview, true);
  assert.equal(mismatchedShortText.isCorrect, null);
});

test('gradeMapPracticeAttempt totals exact scores and marks pending review for unrecognized short-text answers', () => {
  const evaluation = gradeMapPracticeAttempt({
    answers: [
      {
        questionType: 'mcq',
        response: 'A',
        correctAnswer: 'A',
        options: [{ key: 'A', text: 'Red' }, { key: 'B', text: 'Blue' }]
      },
      {
        questionType: 'short_text',
        response: 'mystery',
        correctAnswer: 'blue|green',
        options: []
      }
    ]
  });

  assert.equal(evaluation.maxScore, 2);
  assert.equal(evaluation.score, 1);
  assert.equal(evaluation.graded[1].requiresTeacherReview, true);
});
