import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuestionSteps,
  firstUnansweredStep,
  isStepAnswered,
  summarizeSteps,
} from './questionSteps.js';

const thinking = [
  { _id: 't2', order: 2, question: 'Why?' },
  { _id: 't1', order: 1, question: 'How?' },
];
const quiz = [
  { _id: 'q2', order: 2, question: 'Second?', options: ['a', 'b'] },
  { _id: 'q1', order: 1, question: 'First?', options: ['a', 'b', 'c'] },
];

test('steps run critical thinking first, each list in order', () => {
  const steps = buildQuestionSteps({ thinking, quiz });
  assert.deepEqual(
    steps.map((step) => step.key),
    ['t1', 't2', 'q1', 'q2'],
  );
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['thinking', 'thinking', 'quiz', 'quiz'],
  );
});

const q1 = quiz.find((item) => item._id === 'q1');

test('a quiz answer must point at one of its options', () => {
  const step = { key: 'q1', kind: 'quiz', question: q1 };
  assert.equal(isStepAnswered(step, {}), false);
  assert.equal(isStepAnswered(step, { q1: '2' }), true);
  assert.equal(isStepAnswered(step, { q1: '9' }), false);
  assert.equal(isStepAnswered(step, { q1: 'oops' }), false);
});

test('a short answer counts once it has visible text', () => {
  const step = { key: 't1', kind: 'thinking', question: thinking[1] };
  assert.equal(isStepAnswered(step, { t1: '   ' }), false);
  assert.equal(isStepAnswered(step, { t1: 'because' }), true);
});

test('review blocks submit only while an objective question is open', () => {
  const steps = buildQuestionSteps({ thinking, quiz });
  const partial = summarizeSteps(steps, { q1: '1' });
  assert.equal(partial.answered, 1);
  assert.equal(partial.total, 4);
  assert.deepEqual(partial.missing, ['q2']);
  assert.equal(partial.canSubmit, false);
  assert.equal(firstUnansweredStep(partial), 'q2');

  const objectiveDone = summarizeSteps(steps, { q1: '1', q2: '0' });
  assert.equal(objectiveDone.canSubmit, true);
  assert.equal(objectiveDone.answered, 2);
});

test('short answers alone never block submission', () => {
  const steps = buildQuestionSteps({ thinking });
  const summary = summarizeSteps(steps, {});
  assert.equal(summary.objectiveTotal, 0);
  assert.equal(summary.canSubmit, true);
  assert.equal(firstUnansweredStep(summary), null);
});
