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

test('gradeMapPracticeQuestion scores matching answers with credit for every correct pair', () => {
  const pairs = [
    { left: 'Solar system', right: 'A group of planets orbiting a star' },
    { left: 'Orbit', right: 'The path a planet takes' },
    { left: 'Asteroid', right: 'A rocky body that orbits the sun' }
  ];

  const partial = gradeMapPracticeQuestion({
    questionType: 'matching',
    studentAnswer: [
      { left: 'Solar system', right: 'A group of planets orbiting a star' },
      { left: 'Orbit', right: 'A rocky body that orbits the sun' }
    ],
    matchingPairs: pairs
  });

  assert.equal(partial.isCorrect, false);
  assert.equal(partial.requiresTeacherReview, false);
  assert.equal(partial.score, 0.33);

  const complete = gradeMapPracticeQuestion({
    questionType: 'matching',
    studentAnswer: pairs.map((pair) => ({ left: pair.left, right: pair.right })),
    matchingPairs: pairs
  });

  assert.equal(complete.isCorrect, true);
  assert.equal(complete.score, 1);

  const untouched = gradeMapPracticeQuestion({ questionType: 'matching', studentAnswer: [], matchingPairs: pairs });

  assert.equal(untouched.isCorrect, null);
  assert.equal(untouched.requiresTeacherReview, true);
});

test('gradeMapPracticeAttempt matches pairing text case-insensitively and totals partial credit', () => {
  const evaluation = gradeMapPracticeAttempt({
    answers: [{
      questionType: 'matching',
      response: [{ left: 'Nile', right: 'the longest river in Africa.' }],
      matchingPairs: [
        { left: 'Nile', right: 'The longest river in Africa' },
        { left: 'Sahara', right: 'The largest hot desert' }
      ]
    }]
  });

  assert.equal(evaluation.maxScore, 1);
  assert.equal(evaluation.score, 0.5);
  assert.equal(evaluation.graded[0].isCorrect, false);
  assert.equal(evaluation.graded[0].requiresTeacherReview, false);
});
