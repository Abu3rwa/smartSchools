import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchingResponse, getMatchingAnswerRows, getMatchingColumns, readMatchingSelections } from './mapPracticeMatching.js';

test('matching columns prefer the shuffled student payload and fall back to the saved pairs', () => {
  const pairs = [
    { left: 'Nile', right: 'The longest river in Africa' },
    { left: 'Sahara', right: 'The largest hot desert' }
  ];

  assert.deepEqual(getMatchingColumns({ matchingPairs: pairs }), {
    terms: ['Nile', 'Sahara'],
    choices: ['The longest river in Africa', 'The largest hot desert']
  });
  assert.deepEqual(getMatchingColumns({
    matchingPairs: pairs,
    matchingColumns: { terms: ['Nile', 'Sahara'], choices: ['The largest hot desert', 'The longest river in Africa'] }
  }), {
    terms: ['Nile', 'Sahara'],
    choices: ['The largest hot desert', 'The longest river in Africa']
  });
});

test('only the pairs a student actually chose are saved and read back', () => {
  const response = buildMatchingResponse(new Map([
    ['Nile', 'The longest river in Africa'],
    ['Sahara', '  ']
  ]));

  assert.deepEqual(response, [{ left: 'Nile', right: 'The longest river in Africa' }]);
  assert.deepEqual([...readMatchingSelections(response).entries()], [['Nile', 'The longest river in Africa']]);
  assert.equal(readMatchingSelections(undefined).size, 0);
});

test('answer rows mark chosen pairs, wrong pairs, and blanks for the teacher', () => {
  const question = {
    matchingColumns: { terms: ['Nile', 'Sahara', 'Atlas'], choices: ['a', 'b', 'c'] },
    matchingPairs: [
      { left: 'Nile', right: 'The longest river in Africa' },
      { left: 'Sahara', right: 'The largest hot desert' },
      { left: 'Atlas', right: 'The mountains of north-west Africa' }
    ]
  };

  assert.deepEqual(getMatchingAnswerRows(question, [
    { left: 'Nile', right: 'the longest river in africa' },
    { left: 'Sahara', right: 'The mountains of north-west Africa' }
  ]), [
    { term: 'Nile', choice: 'the longest river in africa', correct: 'The longest river in Africa', unmatched: false, isCorrect: true },
    { term: 'Sahara', choice: 'The mountains of north-west Africa', correct: 'The largest hot desert', unmatched: false, isCorrect: false },
    { term: 'Atlas', choice: '', correct: 'The mountains of north-west Africa', unmatched: true, isCorrect: false }
  ]);
});

test('a reveal colours every row in display order from the pairs the grader sent back', () => {
  const studentQuestion = {
    matchingColumns: {
      terms: ['Alliteration', 'Simile', 'Metaphor'],
      choices: ['A direct comparison', 'A comparison using like or as', 'Repeated starting sounds']
    }
  };
  const gradedPairs = [
    { left: 'Simile', right: 'A comparison using like or as' },
    { left: 'Metaphor', right: 'A direct comparison' },
    { left: 'Alliteration', right: 'Repeated starting sounds' }
  ];

  const rows = getMatchingAnswerRows({ ...studentQuestion, matchingPairs: gradedPairs }, [
    { left: 'Alliteration', right: 'Repeated starting sounds' },
    { left: 'Simile', right: 'A direct comparison' }
  ]);

  assert.deepEqual(rows.map((row) => [row.term, row.isCorrect]), [
    ['Alliteration', true],
    ['Simile', false],
    ['Metaphor', false]
  ]);
});
