import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLiveAnswerPayload,
  countLiveAnswerWords,
  describeLiveStudentAnswer,
  isLiveAnswerReady,
  liveAnswerDraft,
  liveAnswerQuestion,
  liveSelectedOptionIds
} from './liveLessonStudentAnswer.js';

// A student payload is the shape the server prepared: shuffled presentation, no answer key.
const choice = {
  kind: 'multi_select',
  prompt: 'Which of these are similes?',
  options: [{ id: 'a', text: 'as bright as a bell' }, { id: 'b', text: 'a beehive' }, { id: 'c', text: 'fell like rain' }]
};
const matching = {
  kind: 'matching',
  prompt: 'Match each technique.',
  matchingColumns: { terms: ['Simile', 'Metaphor'], choices: ['a beehive', 'using like or as'] }
};
const ordering = {
  kind: 'ordering',
  prompt: 'Order the steps.',
  orderingItems: [{ id: 'o3', text: 'Name the tense' }, { id: 'o1', text: 'Read the sentence' }, { id: 'o2', text: 'Find the verb' }]
};
const blanks = {
  kind: 'fill_in_blank',
  prompt: 'A {{b1}} compares two things using {{b2}}.',
  blankIds: ['b1', 'b2']
};
const numeric = { kind: 'numeric', prompt: 'How many techniques?', numericHint: { unit: 'techniques' } };
const written = { kind: 'text', prompt: 'Explain the difference.', guidance: 'Two sentences.', minWords: 20 };

test('a live question wears the practice shape the shared answer inputs read', () => {
  const adapted = liveAnswerQuestion(choice);
  assert.equal(adapted.questionType, 'multiple_select');
  assert.equal(adapted.stem, choice.prompt);
  assert.deepEqual(adapted.options.map((option) => option.label), ['A', 'B', 'C']);
  // the letter the student clicks is only display; the session stores the authored id
  assert.deepEqual(liveSelectedOptionIds(choice, ['A', 'C']), ['a', 'c']);
  assert.deepEqual(liveSelectedOptionIds(choice, 'B'), ['b']);
  assert.deepEqual(liveSelectedOptionIds(choice, ['A', 'zz']), ['a']);
  assert.deepEqual(liveAnswerQuestion({ kind: 'mcq', options: [{ id: 'true', text: '' }, { id: 'b', text: 'Real' }] }).options
    .map((option) => option.id), ['b']);
});

test('only an answerable draft lets the student submit', () => {
  assert.equal(isLiveAnswerReady(choice, []), false);
  assert.equal(isLiveAnswerReady(choice, ['A']), true);
  assert.equal(isLiveAnswerReady(matching, []), false);
  // one chosen partner is enough, because a half-matched list still earns part credit
  assert.equal(isLiveAnswerReady(matching, [{ left: 'Simile', right: 'using like or as' }]), true);
  assert.equal(isLiveAnswerReady(matching, [{ left: 'Simile', right: '' }]), false);
  assert.equal(isLiveAnswerReady(ordering, ['o1', 'o2']), false);
  assert.equal(isLiveAnswerReady(ordering, ['o3', 'o1', 'o2']), true);
  assert.equal(isLiveAnswerReady(blanks, []), false);
  assert.equal(isLiveAnswerReady(blanks, [{ id: 'b1', text: 'simile' }]), true);
  assert.equal(isLiveAnswerReady(numeric, '  '), false);
  assert.equal(isLiveAnswerReady(numeric, '3'), true);
  assert.equal(isLiveAnswerReady(written, '   '), false);
  assert.equal(isLiveAnswerReady(written, 'A simile says like.'), true);
  assert.equal(isLiveAnswerReady({ kind: 'unknown' }, 'anything'), false);
});

test('each kind submits the field the live session grades it from', () => {
  assert.deepEqual(buildLiveAnswerPayload(choice, ['A', 'C']), { response: ['a', 'c'] });
  assert.deepEqual(buildLiveAnswerPayload({ kind: 'tf', options: choice.options }, 'b'), { selectedOptionId: 'b' });
  assert.deepEqual(buildLiveAnswerPayload(matching, [{ left: 'Simile', right: 'using like or as' }]),
    { response: [{ left: 'Simile', right: 'using like or as' }] });
  assert.deepEqual(buildLiveAnswerPayload(ordering, ['o3', 'o1', 'o2']), { response: ['o3', 'o1', 'o2'] });
  assert.deepEqual(buildLiveAnswerPayload(blanks, [{ id: 'b1', text: 'simile' }]),
    { response: [{ id: 'b1', text: 'simile' }] });
  assert.deepEqual(buildLiveAnswerPayload(numeric, ' 3 '), { response: '3' });
  assert.deepEqual(buildLiveAnswerPayload(written, ' A simile says like. '), { response: 'A simile says like.' });
  // the server bounds the same fields, so a long paste cannot arrive as an unbounded string
  assert.equal(buildLiveAnswerPayload(written, 'x'.repeat(5000)).response.length, 4000);
});

test('a submitted answer reads back as the words the student chose', () => {
  assert.equal(describeLiveStudentAnswer({ kind: 'mcq', options: choice.options }, { selectedOptionId: 'b' }),
    'B. a beehive');
  assert.equal(describeLiveStudentAnswer(choice, { response: ['a', 'c'] }), 'A, C');
  assert.equal(describeLiveStudentAnswer(matching, { response: [{ left: 'Simile', right: 'using like or as' }] }),
    'Simile = using like or as');
  assert.equal(describeLiveStudentAnswer(ordering, { response: ['o1', 'o2', 'o3'] }),
    'Read the sentence > Find the verb > Name the tense');
  assert.equal(describeLiveStudentAnswer(blanks, { response: [{ id: 'b1', text: 'simile' }, { id: 'b2', text: '' }] }),
    'b1: simile; b2: —');
  assert.equal(describeLiveStudentAnswer(numeric, { response: '3' }), '3');
  assert.equal(describeLiveStudentAnswer(written, { text: 'Like or as.' }), 'Like or as.');
  assert.equal(describeLiveStudentAnswer(choice, { response: [] }), '');
});

test('a stored answer fills the same input the student used', () => {
  assert.equal(liveAnswerDraft({ kind: 'mcq', options: choice.options }, { selectedOptionId: 'b' }), 'b');
  assert.deepEqual(liveAnswerDraft(choice, { response: ['a', 'c'] }), ['A', 'C']);
  assert.deepEqual(liveAnswerDraft(ordering, { response: ['o1', 'o2', 'o3'] }), ['o1', 'o2', 'o3']);
  assert.deepEqual(liveAnswerDraft(blanks, { response: [{ id: 'b1', text: 'simile' }] }),
    [{ id: 'b1', text: 'simile' }]);
  assert.equal(liveAnswerDraft(numeric, { response: '3' }), '3');
  assert.equal(liveAnswerDraft(written, { text: 'Like or as.' }), 'Like or as.');
  assert.deepEqual(liveAnswerDraft(matching, {}), []);
  // and what goes in one way comes out the other
  assert.deepEqual(liveSelectedOptionIds(choice, liveAnswerDraft(choice, { response: ['a', 'c'] })), ['a', 'c']);
});

test('the written answer counts the words the teacher set a budget for', () => {
  assert.equal(countLiveAnswerWords('  one   two three\t'), 3);
  assert.equal(countLiveAnswerWords(''), 0);
});

// Live question kinds only exist from the slice that added them, so a lesson written before it
// stores questions with no kind. Those were option questions, and the card must still work.
test('a lesson written before question kinds existed still behaves as multiple choice', () => {
  const legacy = { prompt: 'Which word means brave?', options: [{ id: 'a', text: 'bold' }, { id: 'b', text: 'timid' }], correctOptionId: 'a' };
  assert.equal(liveAnswerQuestion(legacy).kind, 'mcq');
  assert.equal(liveAnswerQuestion(legacy).questionType, 'multiple_choice');
  assert.equal(liveAnswerDraft(legacy, { selectedOptionId: 'b' }), 'b');
  assert.equal(isLiveAnswerReady(legacy, 'a'), true);
  assert.deepEqual(buildLiveAnswerPayload(legacy, 'a'), { selectedOptionId: 'a' });
  assert.equal(describeLiveStudentAnswer(legacy, { selectedOptionId: 'a' }), 'A. bold');
});
