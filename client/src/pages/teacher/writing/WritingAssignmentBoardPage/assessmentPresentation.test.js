import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  STALE_ASSESSMENT_MS,
  WORD_USE_DEFAULT_SHOWN,
  formFromAssessment,
  isStaleAssessment,
  joinLines,
  latestForDraft,
  payloadFromForm,
  publishCheck,
  publishedFeedbackForEmail,
  reviewStateOf,
  splitLines,
  splitWordUse,
} from './assessmentPresentation.js';

test('a run left behind by a restart is offered as a retry, a live one is not', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0);
  const running = { aiStatus: 'running' };
  assert.equal(isStaleAssessment({ ...running, updatedAt: new Date(now - 60_000).toISOString() }, now), false);
  assert.equal(isStaleAssessment({ ...running, updatedAt: new Date(now - STALE_ASSESSMENT_MS - 1).toISOString() }, now), true);
  assert.equal(isStaleAssessment({ ...running, createdAt: new Date(now - STALE_ASSESSMENT_MS - 1).toISOString() }, now), true);
});

test('only an unfinished run can be stale', () => {
  const now = Date.now();
  const old = new Date(now - STALE_ASSESSMENT_MS - 1).toISOString();
  assert.equal(isStaleAssessment({ aiStatus: 'done', updatedAt: old }, now), false);
  assert.equal(isStaleAssessment({ aiStatus: 'failed', updatedAt: old }, now), false);
  assert.equal(isStaleAssessment(null, now), false);
});

test('the panel tells the four assessment states apart', () => {
  const now = Date.UTC(2026, 10, 16, 9, 0, 0);
  const fresh = { updatedAt: new Date(now - 30_000).toISOString() };
  const old = { updatedAt: new Date(now - STALE_ASSESSMENT_MS - 1).toISOString() };
  assert.equal(reviewStateOf(null, now), 'none');
  assert.equal(reviewStateOf({ aiStatus: 'pending', ...fresh }, now), 'running');
  assert.equal(reviewStateOf({ aiStatus: 'running', ...fresh }, now), 'running');
  assert.equal(reviewStateOf({ aiStatus: 'running', ...old }, now), 'stalled');
  assert.equal(reviewStateOf({ aiStatus: 'failed', ...fresh }, now), 'failed');
  assert.equal(reviewStateOf({ aiStatus: 'done', ...old }, now), 'done');
});

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

test('mechanics are structured rows that survive the form and payload losslessly', () => {
  const form = formFromAssessment({
    ...assessment,
    sections: [
      {
        ...assessment.sections[0],
        mechanics: [
          {
            category: 'spelling',
            original: 'becaus',
            correction: 'because',
            explanation: 'Spell it with “se”.',
            anchor: { start: 0, end: 6 },
          },
          { original: 'skool', correction: 'school' },
          {
            category: 'verb_tense',
            original: 'time',
            correction: '',
            explanation: 'The repeated word is not needed.',
            anchor: { start: 7, end: 11 },
          },
        ],
      },
    ],
  });
  assert.deepEqual(form.sections[0].mechanics, [
    {
      category: 'spelling',
      original: 'becaus',
      correction: 'because',
      explanation: 'Spell it with “se”.',
      anchor: { start: 0, end: 6 },
      deletion: false,
    },
    {
      category: '',
      original: 'skool',
      correction: 'school',
      explanation: '',
      anchor: null,
      deletion: false,
    },
    {
      category: 'verb_tense',
      original: 'time',
      correction: '',
      explanation: 'The repeated word is not needed.',
      anchor: { start: 7, end: 11 },
      deletion: true,
    },
  ]);
  assert.equal('mechanicsText' in form.sections[0], false);

  const payload = payloadFromForm(form);
  assert.deepEqual(payload.sections[0].mechanics, [
    {
      category: 'spelling',
      original: 'becaus',
      correction: 'because',
      explanation: 'Spell it with “se”.',
      anchor: { start: 0, end: 6 },
    },
    { original: 'skool', correction: 'school' },
    {
      category: 'verb_tense',
      original: 'time',
      correction: '',
      explanation: 'The repeated word is not needed.',
      anchor: { start: 7, end: 11 },
    },
  ]);
  assert.deepEqual(payload.sections[0].improvements, ['Add an example']);
});

test('a fresh blank row is kept in the form but never sent as a deletion', () => {
  const form = formFromAssessment(assessment);
  form.sections[0].mechanics = [
    {
      category: 'grammar',
      original: '',
      correction: '',
      explanation: '',
      anchor: null,
      deletion: false,
    },
  ];
  assert.deepEqual(payloadFromForm(form).sections[0].mechanics, []);
  assert.equal(form.sections[0].mechanics.length, 1);
});

test('the teacher-only notes and focus budget reach the form without touching the child payload', () => {
  const form = formFromAssessment({
    ...assessment,
    teacherOnly: {
      notes: [{ key: 'body', label: 'Body paragraph 1', text: 'A third note' }],
      priorities: ['A fourth priority'],
    },
    focus: {
      tier: 'emerging',
      totalImprovements: 2,
      priorities: 1,
      childSections: ['body:0'],
    },
  });

  assert.deepEqual(form.teacherOnly.notes, [
    { label: 'Body paragraph 1', text: 'A third note' },
  ]);
  assert.deepEqual(form.teacherOnly.priorities, ['A fourth priority']);
  assert.deepEqual(form.focus, {
    tier: 'emerging',
    totalImprovements: 2,
    priorities: 1,
    childSections: ['body:0'],
  });

  const payload = payloadFromForm(form);
  assert.equal('teacherOnly' in payload, false);
  assert.equal('focus' in payload, false);
});

test('line helpers ignore blanks', () => {
  assert.deepEqual(splitLines(' one\n\n two \n'), ['one', 'two']);
  assert.equal(joinLines(['one', 'two']), 'one\ntwo');
  assert.equal(joinLines(undefined), '');
});

test('resend offers the newest published feedback per draft, never private reassessments or comparisons', () => {
  const published = { kind: 'feedback', aiStatus: 'done', publish: { state: 'published' } };
  const rows = [
    { ...published, _id: 'private', draft: 'd2', publish: { state: 'draft' } },
    { ...published, _id: 'comparison', draft: 'd2', kind: 'comparison' },
    { ...published, _id: 'running', draft: 'd2', aiStatus: 'running' },
    { ...published, _id: 'latest', draft: 'd2' },
    { ...published, _id: 'older', draft: 'd2' },
    { ...published, _id: 'first-draft', draft: 'd1' },
  ];
  assert.deepEqual(publishedFeedbackForEmail(rows).map((row) => row._id), ['latest', 'first-draft']);
  assert.deepEqual(publishedFeedbackForEmail(), []);
});

test('spelling targets survive the form round trip and a removal reaches the payload', () => {
  const form = formFromAssessment({
    ...assessment,
    spellingTargets: [
      { word: 'because', grade: 'G4', week: 3 },
      { word: 'judged', grade: 'G4', week: 4 },
    ],
    spellingWins: [{ word: 'because' }],
  });

  assert.deepEqual(form.spellingTargets.map((row) => row.word), ['because', 'judged']);
  assert.deepEqual(form.spellingWins, ['because']);

  form.spellingTargets = form.spellingTargets.filter((row) => row.word !== 'judged');
  const payload = payloadFromForm(form);
  assert.deepEqual(payload.spellingTargets, [{ word: 'because' }]);
});

test('an assessment from before spelling targets existed sends an empty list, not null', () => {
  const payload = payloadFromForm(formFromAssessment(assessment));
  assert.deepEqual(payload.spellingTargets, []);
});

test('word use evidence survives the form round trip and keeps decisions', () => {
  const withEvidence = {
    ...assessment,
    wordUseEvidence: {
      spelling: [
        {
          word: 'beautiful',
          used: true,
          count: 2,
          nearMisses: [],
          teacherDecision: 'confirmed',
        },
      ],
      vocabulary: [
        {
          word: 'photosynthesis',
          listId: 'S1-L1',
          used: false,
          count: 0,
          nearMisses: ['photosyntesis'],
          teacherDecision: '',
        },
      ],
    },
  };
  const form = formFromAssessment(withEvidence);
  assert.deepEqual(
    form.wordUse.map((row) => [row.source, row.word, row.decision]),
    [
      ['spelling', 'beautiful', 'confirmed'],
      ['vocabulary', 'photosynthesis', ''],
    ],
  );
  const payload = payloadFromForm(form);
  assert.deepEqual(payload.wordUse, [
    { source: 'spelling', word: 'beautiful', decision: 'confirmed' },
    { source: 'vocabulary', word: 'photosynthesis', decision: '' },
  ]);
});

test('review word use is safe before any assessment exists', async () => {
  const source = await readFile(new URL('./ReviewPanel.jsx', import.meta.url), 'utf8');
  assert.match(source, /splitWordUse\(form\?\.wordUse\)/);
  for (const assessments of [undefined, [], [{ ...assessment, draft: 'older-draft' }]]) {
    const form = formFromAssessment(latestForDraft(assessments, 'd1', 'feedback'));
    assert.equal(form, null);
    assert.deepEqual(splitWordUse(form?.wordUse), { active: [], unused: [] });
  }
});

test('review word use is empty for assessments without word evidence', () => {
  for (const aiStatus of ['pending', 'running', 'failed', 'done']) {
    const form = formFromAssessment({ ...assessment, aiStatus });
    assert.deepEqual(splitWordUse(form?.wordUse), { active: [], unused: [] });
  }
});

test('word use splits words that need a look from words simply not used', () => {
  const rows = [
    { source: 'spelling', word: 'beautiful', used: true, nearMisses: [] },
    { source: 'vocabulary', word: 'photosynthesis', used: false, nearMisses: ['photosyntesis'] },
    { source: 'vocabulary', word: 'adapt', used: false, nearMisses: [] },
  ];
  const { active, unused } = splitWordUse(rows);
  assert.deepEqual(active.map((row) => row.word), ['beautiful', 'photosynthesis']);
  assert.deepEqual(unused.map((row) => row.word), ['adapt']);
  assert.deepEqual(splitWordUse(), { active: [], unused: [] });
});

test('G1: the review word-use list shows eight rows before expanding', () => {
  assert.equal(WORD_USE_DEFAULT_SHOWN, 8);
});

test('G4: a spelling target carries the reason the server chose it, read-only', () => {
  const form = formFromAssessment({
    ...assessment,
    spellingTargets: [
      {
        word: 'because',
        grade: 'G4',
        week: 3,
        reason: "On the student's missed-word list.",
      },
    ],
  });
  assert.equal(form.spellingTargets[0].reason, "On the student's missed-word list.");
  const payload = payloadFromForm(form);
  // The reason is evidence for the teacher; the server keeps its own copy.
  assert.deepEqual(payload.spellingTargets, [{ word: 'because' }]);
});

test('D3–D6: the comparison story reaches the form but never the payload', () => {
  const form = formFromAssessment({
    ...assessment,
    tasks: [{ id: 't1', text: 'Add a reason.' }],
    comparison: {
      improvedFacts: [
        { kind: 'rubric', label: 'Organization', detail: 'Score rose by 1.' },
      ],
      newIssueChecks: [
        {
          text: 'The ending stops suddenly.',
          evidence: 'and then we went home',
          verified: true,
        },
      ],
      changes: [
        {
          kind: 'added',
          key: 'conclusion',
          index: 2,
          label: 'Conclusion',
          wordDelta: 6,
        },
      ],
      mostlyReworded: true,
      taskResults: [
        {
          id: 't1',
          applied: true,
          note: 'Quoted the new sentence.',
          claimed: true,
          verified: false,
        },
      ],
    },
  });

  assert.deepEqual(form.comparison.improvedFacts, [
    { kind: 'rubric', label: 'Organization', detail: 'Score rose by 1.' },
  ]);
  assert.deepEqual(form.comparison.newIssueChecks, [
    {
      text: 'The ending stops suddenly.',
      evidence: 'and then we went home',
      verified: true,
    },
  ]);
  assert.deepEqual(form.comparison.changes, [
    {
      kind: 'added',
      key: 'conclusion',
      index: 2,
      label: 'Conclusion',
      wordDelta: 6,
    },
  ]);
  assert.equal(form.comparison.mostlyReworded, true);
  assert.deepEqual(form.comparison.taskResults[0], {
    id: 't1',
    text: 'Add a reason.',
    note: 'Quoted the new sentence.',
    applied: true,
    claimed: true,
    verified: false,
    quote: '',
  });

  const payload = payloadFromForm(form);
  // Every Phase 4 field is computed by the server, so the form never sends it.
  assert.equal('improvedFacts' in payload.comparison, false);
  assert.equal('newIssueChecks' in payload.comparison, false);
  assert.equal('changes' in payload.comparison, false);
  assert.deepEqual(payload.comparison.taskResults, [{ id: 't1', applied: true }]);
});

// F6: the confirmation block lists what the child receives and what blocks it.
const checkAssessment = {
  _id: 'a-check',
  draft: 'd-check',
  kind: 'feedback',
  overall: {
    summary: 'Strong opening.',
    nextPriorities: ['Add evidence'],
  },
  sections: [
    {
      key: 'body',
      index: 0,
      label: 'Body',
      strengths: ['One clear reason'],
      improvements: ['Add evidence'],
      evidence: 'Schools save time',
    },
  ],
  scores: [],
  recommendation: { path: 'notebook', reason: 'Ready for the notebook' },
  spellingTargets: [{ word: 'because' }],
};

const checkDraft = {
  _id: 'd-check',
  sections: [
    { key: 'body', index: 0, text: 'Schools save time every morning.' },
  ],
};

test('the publish checklist counts what the child receives', () => {
  const form = formFromAssessment(checkAssessment);
  const check = publishCheck({
    form,
    assessment: checkAssessment,
    latestDraft: checkDraft,
    email: { student: true, parents: false },
  });
  assert.equal(check.blocked, false);
  assert.deepEqual(check.blockers, []);
  assert.equal(check.notes, 2);
  assert.equal(check.parts, 1);
  assert.equal(check.path, 'notebook');
  assert.equal(check.targets, 1);
  assert.deepEqual(check.email, { student: true, parents: false });
});

test('the checklist blocks a raw token the child would read as braces', () => {
  const form = formFromAssessment(checkAssessment);
  const check = publishCheck({
    form: { ...form, summary: 'Dear {{name}}, your opening is clear.' },
    assessment: checkAssessment,
    latestDraft: checkDraft,
  });
  assert.equal(check.blocked, true);
  assert.deepEqual(check.blockers, [
    { kind: 'tokens', items: ['{{name}}'] },
  ]);
});

test('the checklist blocks a quote that is not in the draft', () => {
  const form = formFromAssessment(checkAssessment);
  const check = publishCheck({
    form: {
      ...form,
      sections: [{ ...form.sections[0], evidence: 'A line that never existed' }],
    },
    assessment: checkAssessment,
    latestDraft: checkDraft,
  });
  assert.deepEqual(check.blockers, [
    { kind: 'anchors', items: ['Body'] },
  ]);
});

test('a newer draft makes the feedback stale before anything else', () => {
  const form = formFromAssessment(checkAssessment);
  const check = publishCheck({
    form,
    assessment: checkAssessment,
    latestDraft: { _id: 'd-newer', sections: [] },
  });
  assert.equal(check.stale, true);
  assert.deepEqual(check.blockers[0], { kind: 'stale', items: [] });
});

test('the private teacher note is never scanned for tokens', () => {
  const form = formFromAssessment(checkAssessment);
  const check = publishCheck({
    form: { ...form, note: 'Ask {{principal}} about the trip' },
    assessment: checkAssessment,
    latestDraft: checkDraft,
  });
  assert.equal(check.blocked, false);
});
