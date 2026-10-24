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

test('gradeMapPracticeQuestion scores ordering, blank and numeric answers deterministically', () => {
  const orderingItems = [
    { id: 'i7', text: 'First' },
    { id: 'i3', text: 'Second' },
    { id: 'i9', text: 'Third' }
  ];

  const perfectOrder = gradeMapPracticeQuestion({
    questionType: 'ordering',
    studentAnswer: ['i7', 'i3', 'i9'],
    correctAnswer: 'i7>i3>i9',
    orderingItems
  });
  assert.equal(perfectOrder.isCorrect, true);
  assert.equal(perfectOrder.score, 1);
  assert.equal(perfectOrder.requiresTeacherReview, false);
  assert.equal(perfectOrder.gradingDetail.matched, 3);

  const oneSwapped = gradeMapPracticeQuestion({
    questionType: 'ordering',
    studentAnswer: ['i7', 'i9', 'i3'],
    correctAnswer: 'i7>i3>i9',
    orderingItems
  });
  assert.equal(oneSwapped.isCorrect, false);
  assert.equal(oneSwapped.score, 0.3333);

  const blankAnswer = gradeMapPracticeQuestion({
    questionType: 'fill_in_blank',
    studentAnswer: { nile: 'the Nile.', africa: 'Asia' },
    blanks: [
      { id: 'nile', accepts: ['Nile'], caseSensitive: false },
      { id: 'africa', accepts: ['Africa'], caseSensitive: true }
    ]
  });
  assert.equal(blankAnswer.isCorrect, false);
  assert.equal(blankAnswer.score, 0.5);

  const numeric = gradeMapPracticeQuestion({
    questionType: 'numeric_response',
    studentAnswer: '12.4 days',
    numericRule: { mode: 'tolerance', value: '12', tolerance: '0.5', unit: 'days' }
  });
  assert.equal(numeric.isCorrect, true);
  assert.equal(numeric.score, 1);

  const unitless = gradeMapPracticeQuestion({
    questionType: 'numeric_response',
    studentAnswer: '12',
    numericRule: { mode: 'exact', value: '12', unit: 'days' }
  });
  assert.equal(unitless.isCorrect, false);
  assert.equal(unitless.gradingDetail.reason, 'missing_unit');
});

test('gradeMapPracticeAttempt totals the new types and leaves unanswered items for review', () => {
  const evaluation = gradeMapPracticeAttempt({
    answers: [
      {
        questionType: 'ordering',
        response: ['i7', 'i3'],
        correctAnswer: 'i7>i3',
        orderingItems: [{ id: 'i7', text: 'First' }, { id: 'i3', text: 'Second' }]
      },
      { questionType: 'numeric_response', response: '', numericRule: { mode: 'exact', value: '5' } },
      { questionType: 'mcq', response: 'A', correctAnswer: 'A' }
    ]
  });

  assert.equal(evaluation.maxScore, 3);
  assert.equal(evaluation.score, 2);
  assert.equal(evaluation.graded[0].isCorrect, true);
  assert.equal(evaluation.graded[0].requiresTeacherReview, false);
  assert.equal(evaluation.graded[1].requiresTeacherReview, true);
  assert.equal(evaluation.graded[1].score, 0);
  assert.equal(evaluation.graded[2].isCorrect, true);
});
