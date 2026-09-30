import test from 'node:test';
import assert from 'node:assert/strict';

import { gradePracticeAnswer } from '../services/practiceAnswerGrading.js';

const options = [
  { label: 'A', text: 'A habitat' },
  { label: 'B', text: 'A planet' },
];

test('grades multiple-choice labels and option text without AI', () => {
  assert.equal(gradePracticeAnswer({
    questionType: 'multiple_choice',
    studentAnswer: 'A. A habitat',
    correctAnswer: 'A',
    questionOptions: options,
  }).isCorrect, true);

  assert.equal(gradePracticeAnswer({
    questionType: 'multiple_choice',
    studentAnswer: 'a habitat',
    correctAnswer: 'A',
    questionOptions: options,
  }).isCorrect, true);

  assert.equal(gradePracticeAnswer({
    questionType: 'multiple_choice',
    studentAnswer: 'B',
    correctAnswer: 'A',
    questionOptions: options,
  }).isCorrect, false);
});

test('grades true/false aliases and option labels deterministically', () => {
  assert.equal(gradePracticeAnswer({
    questionType: 'true_false',
    studentAnswer: 'yes',
    correctAnswer: 'True',
  }).isCorrect, true);

  assert.equal(gradePracticeAnswer({
    questionType: 'true_false',
    studentAnswer: 'B',
    correctAnswer: 'False',
    questionOptions: [
      { label: 'A', text: 'True' },
      { label: 'B', text: 'False' },
    ],
  }).isCorrect, true);
});

test('submits short and unsupported answers for teacher review', () => {
  for (const questionType of ['short_answer', 'unknown']) {
    const result = gradePracticeAnswer({
      questionType,
      studentAnswer: 'student response',
      correctAnswer: 'expected response',
    });

    assert.equal(result.isCorrect, null);
    assert.equal(result.requiresTeacherReview, true);
  }
});

test('does not mark empty multiple-choice values correct', () => {
  const result = gradePracticeAnswer({
    questionType: 'multiple_choice',
    studentAnswer: '',
    correctAnswer: '',
  });

  assert.equal(result.isCorrect, null);
  assert.equal(result.requiresTeacherReview, true);
});