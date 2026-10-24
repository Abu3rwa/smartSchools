import assert from 'node:assert/strict';
import test from 'node:test';

import { getMapPracticeAttemptState, getMapPracticeSetAction, isMapPracticeAnswerRecorded } from './studentMapPracticeProgress.js';

test('only a real answer unlocks the submit step that reveals feedback', () => {
  assert.equal(isMapPracticeAnswerRecorded(''), false);
  assert.equal(isMapPracticeAnswerRecorded('   '), false);
  assert.equal(isMapPracticeAnswerRecorded(undefined), false);
  assert.equal(isMapPracticeAnswerRecorded([]), false);
  assert.equal(isMapPracticeAnswerRecorded(['', '  ']), false);
  assert.equal(isMapPracticeAnswerRecorded('B'), true);
  assert.equal(isMapPracticeAnswerRecorded(['A', 'C']), true);
  assert.equal(isMapPracticeAnswerRecorded([{ left: 'Simile', right: 'A comparison using like or as' }]), true);
});

test('shows review and submit when every answer is saved but the attempt is unsubmitted', () => {
  assert.deepEqual(
    getMapPracticeSetAction({ status: 'in_progress' }, { answered: 15, total: 15 }),
    { label: 'Review & submit', disabled: false }
  );
});

test('offers answer review instead of continuation for a submitted attempt', () => {
  assert.deepEqual(
    getMapPracticeSetAction({ status: 'submitted' }, { answered: 15, total: 15 }),
    { label: 'Review answers', disabled: false }
  );
  assert.equal(getMapPracticeSetAction({ status: 'reviewed' }, { answered: 15, total: 15 }).label, 'Review answers');
});

test('uses Start and Continue for untouched and partially answered attempts', () => {
  assert.equal(getMapPracticeSetAction(null, { answered: 0, total: 15 }).label, 'Start');
  assert.equal(getMapPracticeSetAction({ status: 'in_progress' }, { answered: 14, total: 15 }).label, 'Continue');
});

test('restores saved answers and resumes at the first unanswered question', () => {
  const questions = Array.from({ length: 15 }, (_, index) => ({ _id: `question-${index + 1}` }));
  const attempt = {
    answers: questions.slice(0, 14).map((question) => ({
      question: question._id,
      response: `answer-${question._id}`,
    })),
  };

  const state = getMapPracticeAttemptState(questions, attempt);

  assert.equal(Object.keys(state.answers).length, 14);
  assert.equal(state.answers['question-1'], 'answer-question-1');
  assert.equal(state.currentIndex, 14);
});

test('ignores answers for questions no longer in the active set', () => {
  const questions = [{ _id: 'question-1' }, { _id: 'question-2' }];
  const attempt = {
    answers: [
      { question: 'old-question', response: 'stale' },
      { question: 'question-2', response: ['A', 'B'] },
    ],
  };

  const state = getMapPracticeAttemptState(questions, attempt);

  assert.deepEqual(state.answers, { 'question-2': ['A', 'B'] });
  assert.equal(state.currentIndex, 0);
});

test('opens the last question for review when every question is answered', () => {
  const questions = [{ _id: 'question-1' }, { _id: 'question-2' }];
  const attempt = {
    answers: questions.map((question) => ({ question: question._id, response: 'saved' })),
  };

  assert.equal(getMapPracticeAttemptState(questions, attempt).currentIndex, 1);
});
