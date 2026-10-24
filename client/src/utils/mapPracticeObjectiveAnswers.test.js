import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlankResponse,
  describeCorrectAnswer,
  describeStudentAnswer,
  getBlankIds,
  moveOrderingItem,
  readBlankAnswers,
  readOrderingOrder,
  splitStemByBlanks
} from './mapPracticeObjectiveAnswers.js';

const orderingQuestion = {
  _id: 'question-1',
  questionType: 'ordering',
  correctAnswer: 'i7>i3>i9',
  orderingItems: [
    { id: 'i7', text: 'Hieroglyphs are developed' },
    { id: 'i3', text: 'The Rosetta Stone is carved' },
    { id: 'i9', text: 'The stone is deciphered' }
  ]
};

test('ordering responses keep only the ids the student placed and move without touching the rest', () => {
  assert.deepEqual(readOrderingOrder(['i7', 'i3']), ['i7', 'i3']);
  assert.deepEqual(readOrderingOrder('i7>i3'), ['i7', 'i3']);
  assert.deepEqual(readOrderingOrder([{ id: 'i7' }, null, '']), ['i7']);
  assert.deepEqual(moveOrderingItem(['i7', 'i3', 'i9'], 0, 1), ['i3', 'i7', 'i9']);
  assert.deepEqual(moveOrderingItem(['i7', 'i3', 'i9'], 0, -1), ['i7', 'i3', 'i9']);
  assert.deepEqual(moveOrderingItem(['i7', 'i3', 'i9'], 2, 1), ['i7', 'i3', 'i9']);
});

test('a student answer is read as words while the teacher key never leaks ids', () => {
  assert.equal(
    describeStudentAnswer(orderingQuestion, ['i9', 'i7', 'i3']),
    'The stone is deciphered > Hieroglyphs are developed > The Rosetta Stone is carved'
  );
  assert.equal(
    describeCorrectAnswer(orderingQuestion),
    'Hieroglyphs are developed > The Rosetta Stone is carved > The stone is deciphered'
  );
});

test('blank ids come from the server payload or the stem tokens and answers round-trip', () => {
  const question = { questionType: 'fill_in_blank', stem: 'The {{nile}} feeds the {{sea}}.' };
  assert.deepEqual(getBlankIds(question), ['nile', 'sea']);

  const answers = readBlankAnswers(question.blankIds);
  assert.equal(answers.size, 0);

  const saved = readBlankAnswers(buildBlankResponse(new Map([['nile', 'Nile'], ['sea', '  ']])));
  assert.deepEqual([...saved.entries()], [['nile', 'Nile']]);
  assert.deepEqual(buildBlankResponse(new Map([['nile', 'the Nile']])), [{ id: 'nile', text: 'the Nile' }]);
});

test('the stem keeps its sentence and only swaps tokens for inputs', () => {
  const segments = splitStemByBlanks('The {{nile}} feeds the {{sea}}.', ['nile', 'sea']);
  assert.deepEqual(segments.map((segment) => segment.type), ['text', 'blank', 'text', 'blank', 'text']);
  assert.equal(segments[1].id, 'nile');
  assert.equal(segments[3].position, 2);

  const noTokens = splitStemByBlanks('Which river is it?', ['b1']);
  assert.deepEqual(noTokens.map((segment) => segment.type), ['text', 'blank']);
});

test('blank and numeric answers read back as the teacher wrote them', () => {
  const blanks = {
    questionType: 'fill_in_blank',
    stem: 'The {{nile}} feeds the {{sea}}.',
    blanks: [
      { id: 'nile', accepts: ['Nile'] },
      { id: 'sea', accepts: ['Mediterranean Sea', 'Mediterranean'] }
    ]
  };
  assert.equal(describeStudentAnswer(blanks, [{ id: 'nile', text: 'Nile' }]), 'nile: Nile; sea: —');
  assert.equal(describeCorrectAnswer(blanks), 'nile: Nile; sea: Mediterranean Sea / Mediterranean');

  const numeric = { questionType: 'numeric_response', numericRule: { mode: 'tolerance', value: '12', tolerance: '0.5', unit: 'km' } };
  assert.equal(describeStudentAnswer(numeric, ' 12.4 '), '12.4');
  assert.equal(describeCorrectAnswer(numeric), '12 ± 0.5 km');
});
