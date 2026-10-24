import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_QUESTION_KINDS } from '../constants/liveLessonQuestionKinds.js';
import {
  addLiveMatchingPair,
  addLiveOption,
  addLiveOrderingItem,
  buildLiveQuestionPayload,
  changeLiveQuestionKind,
  createLiveQuestion,
  liveBlankIds,
  linkLiveLessonLevels,
  moveLiveOrderingItem,
  patchLiveNumericRule,
  prepareLiveQuestion,
  removeLiveMatchingPair,
  removeLiveOption,
  removeLiveOrderingItem,
  syncLiveQuestionBlanks,
  toggleLiveCorrectOption
} from './liveLessonQuestionDraft.js';

test('every live kind opens with the smallest set the server accepts', () => {
  for (const kind of LIVE_QUESTION_KINDS) {
    const question = createLiveQuestion(kind);
    assert.equal(question.kind, kind);
    if (kind === 'matching') assert.equal(question.matchingPairs.length, 2);
    if (kind === 'ordering') assert.equal(question.orderingItems.length, 3);
    if (kind === 'numeric') assert.equal(question.numericRule.mode, 'exact');
    if (kind === 'multi_select') assert.deepEqual(question.correctOptionIds, []);
    assert.equal(changeLiveQuestionKind(question, kind).kind, kind);
  }
});

test('switching kind keeps what the teacher typed and replaces only the true/false rows', () => {
  const mcq = prepareLiveQuestion({
    kind: 'mcq',
    prompt: 'Which one?',
    options: [{ id: 'a', text: 'Simile' }, { id: 'b', text: 'Metaphor' }],
    correctOptionId: 'b',
    explanation: 'B is right.'
  });

  const toText = changeLiveQuestionKind(mcq, 'text');
  assert.equal(toText.prompt, 'Which one?');
  assert.equal(toText.explanation, 'B is right.');
  // The rows and the key stay in the draft so flipping back costs nothing, and the payload drops them.
  assert.equal(toText.options.length, 2);
  assert.equal(toText.correctOptionId, 'b');
  assert.deepEqual(buildLiveQuestionPayload(toText).options, []);
  assert.equal(buildLiveQuestionPayload(toText).correctOptionId, '');

  const toMatching = changeLiveQuestionKind(mcq, 'matching');
  assert.deepEqual(toMatching.matchingPairs, [{ left: '', right: '' }, { left: '', right: '' }]);
  assert.equal(toMatching.correctOptionId, 'b');

  const back = changeLiveQuestionKind(toMatching, 'mcq');
  assert.equal(back.correctOptionId, 'b');
  assert.equal(back.options.length, 2);

  // True/false owns its option ids, so an mcq landing on it moves the key onto one of them.
  const toTf = changeLiveQuestionKind(mcq, 'tf');
  assert.deepEqual(toTf.options.map((option) => option.id), ['true', 'false']);
  assert.equal(toTf.correctOptionId, 'true');
  assert.deepEqual(buildLiveQuestionPayload(toTf).options, [
    { id: 'true', text: 'True' },
    { id: 'false', text: 'False' }
  ]);
});

test('option rows stay inside the range the practice grammar uses', () => {
  let question = createLiveQuestion('mcq');
  assert.equal(question.options.length, 4);
  question = addLiveOption(addLiveOption(addLiveOption(addLiveOption(question))));
  assert.equal(question.options.length, 6);
  assert.equal(addLiveOption(question).options.length, 6);
  assert.equal(question.options.map((option) => option.id).join(''), 'abcdef');

  const trimmed = removeLiveOption(removeLiveOption(question, 'f'), 'e');
  assert.equal(trimmed.options.length, 4);
  assert.equal(trimmed.kind, 'mcq');
  assert.equal(removeLiveOption(removeLiveOption(trimmed, 'd'), 'c').options.length, 2);
});

test('a multi-select answer is a set the teacher can tick and untick', () => {
  const base = createLiveQuestion('multi_select');
  const question = {
    ...base,
    options: base.options.map((option, index) => ({ ...option, text: `Option ${index + 1}` }))
  };
  const ticked = toggleLiveCorrectOption(toggleLiveCorrectOption(question, 'a'), 'c');
  assert.deepEqual(ticked.correctOptionIds, ['a', 'c']);
  assert.deepEqual(toggleLiveCorrectOption(ticked, 'a').correctOptionIds, ['c']);
  assert.deepEqual(buildLiveQuestionPayload(ticked).correctOptionIds, ['a', 'c']);

  // An option row the teacher cleared cannot stay in the key.
  const cleared = { ...ticked, options: ticked.options.map((o) => (o.id === 'c' ? { ...o, text: '' } : o)) };
  assert.deepEqual(buildLiveQuestionPayload(cleared).correctOptionIds, ['a']);
  assert.deepEqual(buildLiveQuestionPayload(cleared).options.map((o) => o.id), ['a', 'b', 'd']);
});

test('blank rows follow the tokens written in the question text', () => {
  assert.deepEqual(liveBlankIds('The {{b1}} flows into the {{b2}} and {{b1}} again'), ['b1', 'b2']);
  const withBlanks = syncLiveQuestionBlanks({
    kind: 'fill_in_blank',
    prompt: 'The {{b1}} flows into the {{b2}}.',
    blanks: [{ id: 'b2', accepts: ['Nile', 'the Nile'] }]
  });
  assert.deepEqual(withBlanks.blanks, [
    { id: 'b1', acceptsText: '' },
    { id: 'b2', acceptsText: 'Nile~the Nile' }
  ]);

  const payload = buildLiveQuestionPayload({ ...withBlanks, prompt: 'The {{b1}} flows.' });
  assert.deepEqual(payload.blanks, []);

  const filled = buildLiveQuestionPayload(syncLiveQuestionBlanks({
    kind: 'fill_in_blank',
    prompt: 'The {{b1}} flows.',
    blanks: [{ id: 'b1', acceptsText: 'Nile~the Nile' }]
  }));
  assert.deepEqual(filled.blanks, [{ id: 'b1', accepts: ['Nile', 'the Nile'] }]);
});

test('pair, step and numeric rows stay inside the grammar the server accepts', () => {
  let matching = createLiveQuestion('matching');
  assert.equal(matching.matchingPairs.length, 2);
  matching = addLiveMatchingPair(matching);
  assert.equal(matching.matchingPairs.length, 3);
  assert.equal(removeLiveMatchingPair(matching, 2).matchingPairs.length, 2);
  assert.equal(removeLiveMatchingPair(removeLiveMatchingPair(matching, 2), 1).matchingPairs.length, 2);

  let ordering = createLiveQuestion('ordering');
  assert.equal(ordering.orderingItems.length, 3);
  for (let step = 0; step < 8; step += 1) ordering = addLiveOrderingItem(ordering);
  assert.equal(ordering.orderingItems.length, 8);
  assert.equal(removeLiveOrderingItem(ordering, 0).orderingItems.length, 7);
  assert.equal(
    removeLiveOrderingItem(removeLiveOrderingItem(removeLiveOrderingItem(ordering, 7), 6), 5).orderingItems.length,
    5,
  );

  const numeric = patchLiveNumericRule(createLiveQuestion('numeric'), {
    mode: 'range',
    min: '10',
    max: '20'
  });
  assert.equal(numeric.numericRule.mode, 'range');
  assert.equal(numeric.numericRule.tolerance, '');
  assert.equal(buildLiveQuestionPayload(numeric).numericRule.max, '20');
});

test('an imported level adopts the id of the class group with the same name', () => {
  const slides = [
    { type: 'question', variants: [{ group: 'Needs support ', question: createLiveQuestion('mcq') }] },
    { type: 'question', variants: [{ group: 'Made up later', question: createLiveQuestion('mcq') }] },
    { type: 'question', variants: [{ groupId: 'already-linked', question: createLiveQuestion('mcq') }] },
  ];
  const groups = [{ _id: 'group-1', name: 'needs support' }, { _id: 'group-2', name: 'Ready to stretch' }];
  const linked = linkLiveLessonLevels(slides, groups);

  assert.equal(linked[0].variants[0].groupId, 'group-1');
  assert.equal(linked[1].variants[0].groupId, undefined);
  assert.equal(linked[2].variants[0].groupId, 'already-linked');
  // the slide's own work is never rewritten on the way through
  assert.equal(linked[0].type, 'question');
  assert.equal(slides[0].variants[0].groupId, undefined);
  assert.equal(linkLiveLessonLevels(linked, groups), linked);
});

test('reordering a list only swaps the two rows it names', () => {
  const items = [{ id: 'x', text: 'one' }, { id: 'y', text: 'two' }, { id: 'z', text: 'three' }];
  assert.deepEqual(moveLiveOrderingItem(items, 0, 1).map((item) => item.id), ['y', 'x', 'z']);
  assert.deepEqual(moveLiveOrderingItem(items, 2, -1).map((item) => item.id), ['x', 'z', 'y']);
  assert.deepEqual(moveLiveOrderingItem(items, 0, -1), items);
  assert.deepEqual(moveLiveOrderingItem(items, 2, 1), items);
});

test('only the fields the kind uses reach the server', () => {
  const numeric = buildLiveQuestionPayload({
    kind: 'numeric',
    prompt: 'How many?',
    numericRule: { mode: 'tolerance', value: '12', tolerance: '2', unit: 'cm' },
    matchingPairs: [{ left: 'stale', right: 'stale' }],
    guidance: 'ignore me'
  });
  assert.deepEqual(numeric.numericRule.mode, 'tolerance');
  assert.deepEqual(numeric.matchingPairs, []);
  assert.equal(numeric.guidance, '');
  assert.deepEqual(numeric.options, []);

  const written = buildLiveQuestionPayload({
    kind: 'text',
    prompt: 'Explain it.',
    guidance: 'Two sentences.',
    criteria: 'Names the technique.',
    minWords: 20,
    maxWords: 80
  });
  assert.equal(written.guidance, 'Two sentences.');
  assert.equal(written.minWords, 20);
  assert.equal(written.numericRule, undefined);
});
