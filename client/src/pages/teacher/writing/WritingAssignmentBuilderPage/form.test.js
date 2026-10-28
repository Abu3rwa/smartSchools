import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPreset,
  buildPayload,
  emptyForm,
  formFromAssignment,
  moveRow,
  normalizeSectionRow,
  slugify,
  studentViewPreview,
  totalRubricPoints,
  validateForm,
} from './form.js';

test('a new task starts from the essay plan the server also uses', () => {
  const form = emptyForm();
  assert.equal(form.writingType, 'essay');
  assert.deepEqual(form.sections.map((row) => row.key), [
    'introduction', 'body', 'counterargument', 'rebuttal', 'conclusion',
  ]);
  assert.equal(totalRubricPoints(form.rubric), 18);
});

test('choosing another kind replaces the plan but keeps what the teacher typed', () => {
  const form = { ...emptyForm(), title: 'Letter to the head teacher' };
  const next = applyPreset(form, 'letter');
  assert.equal(next.title, 'Letter to the head teacher');
  assert.deepEqual(next.sections.map((row) => row.key), ['greeting', 'body', 'signoff']);
});

test('a section that cannot repeat always stores one slot', () => {
  const row = normalizeSectionRow({ key: 'intro', repeatable: false, minCount: 3, maxCount: 9 });
  assert.deepEqual({ minCount: row.minCount, maxCount: row.maxCount }, { minCount: 1, maxCount: 1 });
});

test('a repeatable section never stores a maximum below its minimum', () => {
  const row = normalizeSectionRow({ key: 'body', repeatable: true, minCount: 3, maxCount: 1 });
  assert.equal(row.maxCount, 3);
});

test('reordering a section stops at both ends', () => {
  const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  assert.deepEqual(moveRow(list, 0, -1), list);
  assert.deepEqual(moveRow(list, 2, 1), list);
  assert.deepEqual(moveRow(list, 1, -1).map((row) => row.key), ['b', 'a', 'c']);
});

test('a task cannot be published without a title, a class, or something to mark', () => {
  const base = emptyForm();
  assert.equal(validateForm({ ...base, classId: 'c1' }).errors.title, 'title');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: '' }).errors.classId, 'class');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: 'c1', rubric: [] }).errors.rubric, 'noRubric');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: 'c1' }).ok, true);
});

test('two parts that would share a stored key are refused', () => {
  const form = {
    ...emptyForm(),
    title: 'Book review',
    classId: 'c1',
    sections: [
      { key: '', label: 'What works', required: true, repeatable: false, minCount: 1, maxCount: 1, minWords: 0 },
      { key: '', label: 'what works', required: true, repeatable: false, minCount: 1, maxCount: 1, minWords: 0 },
    ],
  };
  assert.equal(validateForm(form).errors.sections, 'duplicateSection');
});

test('a mark line with no marks left on it is refused', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    rubric: [{ key: 'ideas', label: 'Ideas', maxScore: 0 }],
  };
  assert.equal(validateForm(form).errors.rubric, 'rubricIncomplete');
});

test('the word ceiling cannot sit under the floor', () => {
  const form = { ...emptyForm(), title: 'Opinion essay', classId: 'c1', minWords: 150, maxWords: 100 };
  assert.equal(validateForm(form).errors.maxWords, 'maxBelowMin');
});

test('a part named without a key is stored under a key the server can match', () => {
  const form = {
    ...emptyForm(),
    title: 'My holiday',
    classId: 'c1',
    sections: [{ key: '', label: 'My holiday', required: true, repeatable: false, minCount: 1, maxCount: 1, minWords: 0 }],
  };
  assert.equal(buildPayload(form).sections[0].key, slugify('My holiday'));
});

test('half-written goals never reach the server', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    goals: [{ student: 's1', text: 'Add a second reason.' }, { student: 's2', text: '  ' }],
    aiConstraints: '',
  };
  const payload = buildPayload(form);
  assert.deepEqual(payload.goals, [{ student: 's1', text: 'Add a second reason.' }]);
  assert.equal(payload.aiConstraints, undefined);
});

test('the review panel counts the boxes the student actually gets', () => {
  const form = applyPreset(emptyForm(), 'essay');
  const preview = studentViewPreview(form);
  assert.equal(preview.sectionCount, 5);
  assert.equal(preview.requiredCount, 3);
  assert.equal(preview.writingSlots, 4);
  assert.equal(preview.totalPoints, 18);
  assert.equal(preview.drafts, form.workflow.maxDrafts);
});

test('an assignment saved on the server reloads into the editor unchanged', () => {
  const saved = {
    _id: 'a1',
    title: 'Opinion essay',
    instructions: 'Two reasons.',
    writingType: 'essay',
    class: 'c1',
    dueDate: '2026-11-04T00:00:00.000Z',
    minWords: 120,
    maxWords: 0,
    goals: [{ student: { _id: 's1' }, text: 'Add a second reason.' }],
    sections: [{ key: 'body', label: 'Body', kind: 'body', required: true, repeatable: true, minCount: 2, maxCount: 4, minWords: 20, criteria: ['One detail'] }],
    supports: { wordBank: ['because'], transitions: [], sentenceStarters: [], guidingQuestions: [], modelText: '', plannerPrompt: '' },
    rubric: [{ key: 'ideas', label: 'Ideas', description: '', maxScore: 5, appliesToSections: ['*'] }],
    workflow: { teacherPublishesFeedback: true, maxDrafts: 3, requireNotebookCheck: false, autoSuggestNextStep: true },
  };
  const form = formFromAssignment(saved);
  assert.equal(form.classId, 'c1');
  assert.equal(form.dueDate, '2026-11-04');
  assert.deepEqual(form.goals, [{ student: 's1', text: 'Add a second reason.' }]);
  assert.equal(form.sections[0].maxCount, 4);
  assert.equal(form.workflow.maxDrafts, 3);
  assert.equal(buildPayload(form).rubric[0].maxScore, 5);
});
