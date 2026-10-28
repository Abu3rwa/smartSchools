import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOARD_GROUPS,
  countWords,
  draftReadiness,
  slotId,
  stageTone,
} from './writingWorkflow.js';

const definition = (key, extra = {}) => ({
  key,
  label: key,
  required: true,
  repeatable: false,
  minCount: 1,
  maxCount: 1,
  minWords: 0,
  ...extra,
});

test('word counts ignore line breaks and repeated spaces', () => {
  assert.equal(countWords('one  two\nthree\r\nfour'), 4);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords(null), 0);
});

test('a slot is named by key and index', () => {
  assert.equal(slotId({ key: 'body', index: 2 }), 'body:2');
  assert.equal(slotId({ key: 'body' }), 'body:0');
});

test('a required section with no box at all is missing, not short', () => {
  const result = draftReadiness({
    assignment: { sections: [definition('introduction'), definition('conclusion')] },
    sections: [{ key: 'introduction', index: 0, text: 'My view is clear.' }],
  });
  assert.deepEqual(result.missingRequired, [{ key: 'conclusion', label: 'conclusion' }]);
  assert.deepEqual(result.shortSections, []);
  assert.equal(result.totalWords, 4);
});

test('an empty box and a box under its own minimum are both reported', () => {
  const result = draftReadiness({
    assignment: {
      sections: [definition('topic'), definition('support', { minWords: 8 })],
    },
    sections: [
      { key: 'topic', index: 0, text: '   ' },
      { key: 'support', index: 0, text: 'only three words' },
    ],
  });
  assert.deepEqual(result.shortSections, [
    { key: 'topic', label: 'topic', empty: true },
    { key: 'support', label: 'support', words: 3, minWords: 8 },
  ]);
});

test('a repeatable section under its minimum count needs more boxes', () => {
  const result = draftReadiness({
    assignment: {
      sections: [definition('body', { repeatable: true, minCount: 2, maxCount: 4 })],
    },
    sections: [{ key: 'body', index: 0, text: 'One reason and one example.' }],
  });
  assert.deepEqual(result.belowMinCount, [{ key: 'body', label: 'body', needed: 1 }]);
  assert.deepEqual(result.missingRequired, []);
});

test('the whole-piece range is checked against the assignment', () => {
  const assignment = {
    minWords: 20,
    maxWords: 30,
    sections: [definition('body')],
  };
  const short = draftReadiness({ assignment, sections: [{ key: 'body', index: 0, text: 'too short' }] });
  assert.equal(short.belowRange, true);
  assert.equal(short.aboveRange, false);

  const long = draftReadiness({
    assignment,
    sections: [{ key: 'body', index: 0, text: Array(40).fill('word').join(' ') }],
  });
  assert.equal(long.belowRange, false);
  assert.equal(long.aboveRange, true);
});

test('an optional section that is not written is not a problem', () => {
  const result = draftReadiness({
    assignment: { sections: [definition('body'), definition('counter', { required: false })] },
    sections: [{ key: 'body', index: 0, text: 'A point and a reason.' }],
  });
  assert.deepEqual(result.missingRequired, []);
  assert.deepEqual(result.belowMinCount, []);
});

test('every stage maps to a colour so the board never shows a bare token', () => {
  assert.equal(stageTone('completed'), 'is-done');
  assert.equal(stageTone('submitted'), 'is-waiting');
  assert.equal(stageTone('ready_for_notebook'), 'is-ready');
  assert.equal(stageTone('revising'), 'is-active');
  assert.equal(stageTone('not_started'), 'is-idle');
});

test('the board funnel has a group for every summary column', () => {
  assert.ok(BOARD_GROUPS.includes('notebookToCheck'));
  assert.equal(new Set(BOARD_GROUPS).size, BOARD_GROUPS.length);
});
