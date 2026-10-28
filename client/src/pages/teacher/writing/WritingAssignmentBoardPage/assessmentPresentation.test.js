import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formFromAssessment,
  joinLines,
  latestForDraft,
  payloadFromForm,
  splitLines,
} from './assessmentPresentation.js';

const assessment = {
  _id: 'a1',
  draft: 'd1',
  kind: 'feedback',
  overall: {
    summary: 'Clear opening.',
    nextPriorities: ['Add evidence', 'Join paragraphs'],
  },
  sections: [
    {
      key: 'body',
      index: 0,
      label: 'Body paragraph 1',
      strengths: ['One clear reason'],
      improvements: ['Add an example'],
      evidence: 'Uniforms save time',
      why: 'The reason needs proof',
      nextStep: 'Add one fact',
      score: 3,
      maxScore: 5,
    },
  ],
  scores: [{ key: 'ideas', label: 'Ideas', score: 3, maxScore: 5, explanation: 'Supported once' }],
  recommendation: { path: 'notebook', reason: 'Meets the brief' },
  comparison: {},
};

test('latestForDraft picks the newest row of one kind for one draft', () => {
  const assessments = [
    { _id: 'c9', draft: 'd2', kind: 'comparison' },
    { _id: 'f9', draft: 'd2', kind: 'feedback' },
    { _id: 'f1', draft: 'd1', kind: 'feedback' },
  ];
  assert.equal(latestForDraft(assessments, 'd2', 'feedback')._id, 'f9');
  assert.equal(latestForDraft(assessments, 'd2', 'comparison')._id, 'c9');
  assert.equal(latestForDraft(assessments, 'd3', 'feedback'), null);
});

test('list fields survive a form round trip', () => {
  const form = formFromAssessment(assessment);
  assert.equal(form.priorities.length, 3);
  assert.equal(form.priorities[2], '');
  assert.equal(form.sections[0].strengthsText, 'One clear reason');
  assert.equal(form.sections[0].improvementsText, 'Add an example');

  const payload = payloadFromForm(form);
  assert.deepEqual(payload.sections[0].strengths, ['One clear reason']);
  assert.deepEqual(payload.overall.nextPriorities, ['Add evidence', 'Join paragraphs']);
  assert.equal(payload.recommendation.path, 'notebook');
  assert.equal(payload.sections[0].score, 3);
});

test('teacher edits in the form reach the payload', () => {
  const form = formFromAssessment(assessment);
  form.summary = 'Edited summary';
  form.sections[0].strengthsText = 'One clear reason\nA second strength';
  form.sections[0].score = 4;
  form.path = 'revise';

  const payload = payloadFromForm(form);
  assert.equal(payload.overall.summary, 'Edited summary');
  assert.deepEqual(payload.sections[0].strengths, ['One clear reason', 'A second strength']);
  assert.equal(payload.sections[0].score, 4);
  assert.equal(payload.recommendation.path, 'revise');
});

test('a comparison form keeps changed sections and applied feedback', () => {
  const form = formFromAssessment({
    _id: 'c1',
    draft: 'd2',
    kind: 'comparison',
    overall: { summary: 'Moved forward', nextPriorities: [] },
    scores: [],
    recommendation: { path: 'revise', reason: 'One gap' },
    comparison: {
      encouragement: 'You listened to the feedback.',
      criteriaImproved: ['Evidence'],
      criteriaUnresolved: ['Organisation'],
      newIssues: ['New spelling slips'],
      wordDelta: 40,
      changedBySection: [{ key: 'body', index: 0, label: 'Body 1', summary: 'Added a fact', meaningful: true, kind: 'changed' }],
      feedbackApplied: [{ key: 'body', index: 0, note: 'Add one fact', applied: true }],
    },
  });

  assert.equal(form.comparison.wordDelta, 40);
  assert.equal(form.comparison.improvedText, 'Evidence');

  const payload = payloadFromForm(form);
  assert.deepEqual(payload.comparison.criteriaImproved, ['Evidence']);
  assert.equal(payload.comparison.changedBySection[0].summary, 'Added a fact');
  assert.equal(payload.comparison.feedbackApplied[0].applied, true);
});

test('line helpers ignore blanks', () => {
  assert.deepEqual(splitLines(' one\n\n two \n'), ['one', 'two']);
  assert.equal(joinLines(['one', 'two']), 'one\ntwo');
  assert.equal(joinLines(undefined), '');
});
