import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attentionRank,
  canReturnSubmission,
  sortBoardRows,
  teacherNextStepKey,
} from './boardPresentation.js';

const row = (stage, extra = {}) => ({ hasProject: true, stage, ...extra });

test('a submitted draft names the assessment state, not just the stage', () => {
  assert.equal(teacherNextStepKey(row('submitted')), 'assessDraft');
  assert.equal(
    teacherNextStepKey(row('submitted', { assessmentStatus: 'failed' })),
    'retryAssessment',
  );
  assert.equal(
    teacherNextStepKey(row('submitted', { assessmentStatus: 'pending' })),
    'assessmentRunning',
  );
  assert.equal(
    teacherNextStepKey(row('submitted', { assessmentStatus: 'running' })),
    'assessmentRunning',
  );
  assert.equal(
    teacherNextStepKey(row('submitted', { assessmentStatus: 'done' })),
    'assessDraft',
  );
});

test('the other stages keep their next step', () => {
  assert.equal(teacherNextStepKey({ hasProject: false }), 'notOpened');
  assert.equal(teacherNextStepKey(row('drafting')), 'studentWriting');
  assert.equal(teacherNextStepKey(row('feedback_ready')), 'publishFeedback');
  assert.equal(
    teacherNextStepKey(row('revising', { assessmentStatus: 'failed' })),
    'studentRevising',
  );
  assert.equal(teacherNextStepKey(row('completed')), 'done');
});

test('a submission can only be returned while it waits on the teacher', () => {
  assert.equal(canReturnSubmission({ stage: 'submitted' }), true);
  assert.equal(canReturnSubmission({ stage: 'feedback_ready' }), true);
  assert.equal(canReturnSubmission({ stage: 'submitted', published: true }), false);
  assert.equal(canReturnSubmission({ stage: 'drafting' }), false);
  assert.equal(canReturnSubmission({ stage: 'feedback_published' }), false);
  assert.equal(canReturnSubmission({}), false);
});

test('what the teacher owes is ranked before what the student owes', () => {
  assert.ok(attentionRank(row('submitted')) < attentionRank(row('feedback_ready')));
  assert.ok(
    attentionRank(row('feedback_ready')) <
      attentionRank(row('awaiting_notebook_check')),
  );
  assert.ok(
    attentionRank(row('awaiting_notebook_check')) < attentionRank(row('revising')),
  );
  assert.ok(attentionRank(row('revising')) < attentionRank(row('completed')));
  assert.ok(
    attentionRank(row('submitted', { assessmentStatus: 'failed' })) <
      attentionRank(row('submitted')),
  );
});

test('the default order leads with the longest-waiting teacher action', () => {
  const rows = [
    { name: 'Done', stage: 'completed', lastEditedAt: '2026-11-10T09:00:00Z' },
    { name: 'Fresh', stage: 'submitted', submittedAt: '2026-11-16T09:00:00Z' },
    { name: 'Old', stage: 'submitted', submittedAt: '2026-11-14T09:00:00Z' },
    { name: 'Writing', stage: 'drafting', lastEditedAt: '2026-11-15T09:00:00Z' },
  ];
  assert.deepEqual(sortBoardRows(rows).map((item) => item.name), [
    'Old',
    'Fresh',
    'Writing',
    'Done',
  ]);
});

test('name order is a plain alphabetical list for finding a student', () => {
  const rows = [
    { name: 'zara', stage: 'submitted' },
    { name: 'Amir', stage: 'completed' },
  ];
  assert.deepEqual(sortBoardRows(rows, 'name').map((item) => item.name), [
    'Amir',
    'zara',
  ]);
});
