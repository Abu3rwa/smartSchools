import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPreset,
  buildPayload,
  emptyForm,
  formFromAssignment,
  formFromTemplate,
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

test('taught focus is typed one skill per line and saved as a trimmed list', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    taughtFocus: '  Topic sentences  \n\nOne reason per paragraph\n',
  };
  const payload = buildPayload(form);
  assert.deepEqual(payload.taughtFocus, [
    'Topic sentences',
    'One reason per paragraph',
  ]);

  const loaded = formFromAssignment({ taughtFocus: ['Topic sentences'] });
  assert.equal(loaded.taughtFocus, 'Topic sentences');
  assert.equal(emptyForm().taughtFocus, '');
});

test('a template fills the lesson and leaves the audience to the new task', () => {
  const current = {
    ...emptyForm(),
    title: 'My new task',
    classId: 'c1',
    studentIds: ['s1'],
    goals: [{ student: 's1', text: 'Join two reasons.' }],
    dueDate: '2026-12-01',
  };
  const next = formFromTemplate(current, {
    title: 'Homework in Finland (template)',
    writingType: 'essay',
    taughtFocus: ['Topic sentences'],
    sections: [{ key: 'body', label: 'Body', required: true }],
    rubric: [{ key: 'ideas', label: 'Ideas', maxScore: 5 }],
    supports: { wordBank: ['because'], wordSupport: { spelling: { enabled: true, maxWords: 4 } } },
    sourcePack: 'pack1',
    workflow: { teacherPublishesFeedback: false },
  });

  assert.equal(next.title, 'Homework in Finland');
  assert.equal(next.classId, 'c1');
  assert.deepEqual(next.studentIds, ['s1']);
  assert.deepEqual(next.goals, current.goals);
  assert.equal(next.dueDate, '2026-12-01');
  assert.equal(next.taughtFocus, 'Topic sentences');
  assert.deepEqual(next.sections.map((row) => row.key), ['body']);
  assert.equal(next.rubric[0].maxScore, 5);
  assert.deepEqual(next.supports.wordBank, ['because']);
  assert.equal(next.supports.wordSupport.spelling.enabled, true);
  assert.equal(next.sourcePackId, 'pack1');
  assert.equal(next.workflow.teacherPublishesFeedback, false);
});

test('a task cannot be published without a title, a class, or something to mark', () => {
  const base = emptyForm();
  assert.equal(validateForm({ ...base, classId: 'c1' }).errors.title, 'title');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: '' }).errors.classId, 'class');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: 'c1', rubric: [] }).errors.rubric, 'noRubric');
  assert.equal(validateForm({ ...base, title: 'Opinion essay', classId: 'c1' }).ok, true);
});

test('selected students need at least one name', () => {
  const base = { ...emptyForm(), title: 'Opinion essay', classId: 'c1', audienceMode: 'selected' };
  assert.equal(validateForm(base).errors.studentIds, 'students');
  assert.equal(validateForm({ ...base, studentIds: ['s1'] }).ok, true);
});

test('the class mode sends no student list and the selected mode sends only ticked students', () => {
  const base = { ...emptyForm(), title: 'Opinion essay', classId: 'c1' };
  const whole = buildPayload(base);
  assert.equal(whole.audienceMode, 'class');
  assert.equal(whole.studentIds, undefined);
  const some = buildPayload({ ...base, audienceMode: 'selected', studentIds: ['s1', 's2'] });
  assert.equal(some.audienceMode, 'selected');
  assert.deepEqual(some.studentIds, ['s1', 's2']);
});

test('a goal for a student outside the selection never reaches the server', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    audienceMode: 'selected',
    studentIds: ['s1'],
    goals: [
      { student: 's1', text: 'Add a second reason.' },
      { student: 's2', text: 'Vary sentence openings.' },
    ],
  };
  assert.deepEqual(buildPayload(form).goals, [{ student: 's1', text: 'Add a second reason.' }]);
});

test('a task saved for selected students reloads with the same selection', () => {
  const saved = {
    ...emptyForm(),
    _id: 'a1',
    title: 'Opinion essay',
    class: 'c1',
    audienceMode: 'selected',
    students: ['s1', 's2'],
  };
  const form = formFromAssignment(saved);
  assert.equal(form.audienceMode, 'selected');
  assert.deepEqual(form.studentIds, ['s1', 's2']);
  assert.equal(formFromAssignment({ ...saved, audienceMode: undefined }).audienceMode, 'class');
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
  assert.equal(preview.audienceMode, form.audienceMode);
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
    workflow: { teacherPublishesFeedback: true, requireNotebookCheck: false, autoSuggestNextStep: true },
  };
  const form = formFromAssignment(saved);
  assert.equal(form.classId, 'c1');
  assert.equal(form.dueDate, '2026-11-04');
  assert.deepEqual(form.goals, [{ student: 's1', text: 'Add a second reason.' }]);
  assert.equal(form.sections[0].maxCount, 4);
  assert.equal(form.workflow.requireNotebookCheck, false);
  assert.equal("maxDrafts" in form.workflow, false);
  assert.equal(buildPayload(form).rubric[0].maxScore, 5);
});

test('a lesson facts pack and an exemplar survive the round trip', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    sourcePackId: 'p1',
    exemplarText: 'A strong example of the task.',
  };
  const payload = buildPayload(form);
  assert.equal(payload.sourcePackId, 'p1');
  assert.equal(payload.exemplarText, 'A strong example of the task.');

  const reloaded = formFromAssignment({
    ...payload,
    class: 'c1',
    sourcePack: 'p1',
  });
  assert.equal(reloaded.sourcePackId, 'p1');
  assert.equal(reloaded.exemplarText, 'A strong example of the task.');

  // Clearing both is an explicit intent the server can act on.
  const cleared = buildPayload({ ...form, sourcePackId: '', exemplarText: '' });
  assert.equal(cleared.sourcePackId, '');
  assert.equal(cleared.exemplarText, '');
});

test('an Arabic task keeps every row and the keys the server stores', () => {
  const section = (label) => ({
    key: '', label, required: true, repeatable: false, minCount: 1, maxCount: 1, minWords: 0,
  });
  const form = {
    ...emptyForm(),
    title: 'مقال عن الزي المدرسي',
    classId: 'c1',
    sections: [section('المقدمة'), section('الزي  المدرسي'), section('الخاتمة')],
    rubric: [{ key: '', label: 'الأفكار', maxScore: 5, appliesToSections: ['*'] }],
  };

  assert.equal(slugify('الزي  المدرسي'), 'الزي_المدرسي');
  const payload = buildPayload(form);
  assert.deepEqual(payload.sections.map((row) => row.key), ['المقدمة', 'الزي_المدرسي', 'الخاتمة']);
  assert.deepEqual(payload.sections.map((row) => row.label), ['المقدمة', 'الزي  المدرسي', 'الخاتمة']);
  assert.equal(payload.rubric[0].key, 'الأفكار');
  assert.equal(validateForm(form).ok, true);
});

test('two Arabic parts with the same name are refused before save', () => {
  const section = (label) => ({
    key: '', label, required: true, repeatable: false, minCount: 1, maxCount: 1, minWords: 0,
  });
  const form = {
    ...emptyForm(),
    title: 'مقال',
    classId: 'c1',
    sections: [section('المقدمة'), section('المقدمة')],
  };
  assert.equal(validateForm(form).errors.sections, 'duplicateSection');
});

test('a mark line with neither a name nor a key is refused', () => {
  const form = {
    ...emptyForm(),
    title: 'Opinion essay',
    classId: 'c1',
    rubric: [{ key: '', label: '   ', maxScore: 5, appliesToSections: ['*'] }],
  };
  assert.equal(validateForm(form).errors.rubric, 'rubricIncomplete');
});
