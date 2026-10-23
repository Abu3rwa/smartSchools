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

test('auto-grades short answers from the accepted answer list without AI', () => {
  const base = {
    questionType: 'short_answer',
    correctAnswer: 'It provides the energy for cell activity',
    gradingMode: 'normalized_match',
    acceptableAnswers: ['energy', 'ATP', 'power source'],
  };

  assert.equal(gradePracticeAnswer({ ...base, studentAnswer: 'Energy' }).isCorrect, true);
  assert.equal(gradePracticeAnswer({ ...base, studentAnswer: 'The ATP.' }).isCorrect, true);
  assert.equal(
    gradePracticeAnswer({ ...base, studentAnswer: 'It stores waste in the vacuole' }).isCorrect,
    false,
  );
});

test('conceptual short answers and answers with no accepted list go to teacher review', () => {
  const conceptual = gradePracticeAnswer({
    questionType: 'short_answer',
    studentAnswer: 'Because the cells need energy',
    correctAnswer: 'energy',
    gradingMode: 'conceptual',
    acceptableAnswers: ['energy'],
  });
  const withoutRules = gradePracticeAnswer({
    questionType: 'short_answer',
    studentAnswer: 'Because the cells need energy',
    correctAnswer: 'energy',
    gradingMode: 'normalized_match',
  });

  assert.equal(conceptual.requiresTeacherReview, true);
  assert.equal(conceptual.isCorrect, null);
  assert.equal(withoutRules.requiresTeacherReview, true);
  assert.equal(withoutRules.isCorrect, null);
});

test('exact_match short answers reject longer sentences that merely contain the key term', () => {
  const result = gradePracticeAnswer({
    questionType: 'short_answer',
    studentAnswer: 'It is the power source of the cell',
    correctAnswer: 'power source',
    gradingMode: 'exact_match',
    acceptableAnswers: ['power source'],
  });

  assert.equal(result.isCorrect, false);
  assert.equal(result.requiresTeacherReview, false);
});