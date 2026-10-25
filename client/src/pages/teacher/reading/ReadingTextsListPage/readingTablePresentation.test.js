import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterReadings,
  nextSort,
  readingLevelTargets,
  readingOwnerName,
  readingQuestionCounts,
  readingSummary,
  sortReadings,
} from './readingTablePresentation.js';

const readings = [
  {
    _id: '1',
    title: 'Zoo Day',
    originalComplexity: 6,
    createdAt: '2026-01-05T00:00:00.000Z',
    isShared: false,
    subjectArea: 'Science',
    topicTags: ['animals'],
    createdBy: { firstName: 'Amina', lastName: 'Hassan' },
    simplifiedVersions: [{ targetLevel: 6 }, { targetLevel: 4 }],
    comprehensionQuestions: [{ _id: 'q1' }, { _id: 'q2' }],
    criticalThinkingQuestions: [{ _id: 'q3' }],
  },
  {
    _id: '2',
    title: 'River Songs',
    originalComplexity: 9,
    createdAt: '2026-03-01T00:00:00.000Z',
    isShared: true,
    subjectArea: 'Arabic',
    createdBy: '665f0000000000000000000abc',
    simplifiedVersions: [],
    comprehensionQuestions: [],
    criticalThinkingQuestions: [],
  },
  {
    _id: '3',
    title: 'Ancient Maps',
    createdAt: '2026-02-10T00:00:00.000Z',
    topicTags: ['history', 'geography'],
    simplifiedVersions: [{ targetLevel: 5 }],
    comprehensionQuestions: [{ _id: 'q4' }],
  },
];

test('level targets are unique and ranked from simplest to hardest', () => {
  assert.deepEqual(readingLevelTargets(readings[0]), [4, 6]);
  assert.deepEqual(readingLevelTargets(readings[2]), [5]);
  assert.deepEqual(readingLevelTargets(undefined), []);
});

test('owner names only resolve for populated authors', () => {
  assert.equal(readingOwnerName(readings[0]), 'Amina Hassan');
  assert.equal(readingOwnerName(readings[1]), '');
});

test('question counts separate the auto-graded quiz from open-ended answers', () => {
  assert.deepEqual(readingQuestionCounts(readings[0]), { objective: 2, thinking: 1 });
  assert.deepEqual(readingQuestionCounts(readings[1]), { objective: 0, thinking: 0 });
  assert.deepEqual(readingQuestionCounts(readings[2]), { objective: 1, thinking: 0 });
});

test('summary counts readings by assignment and sharing state', () => {
  const counts = { 1: 2, 2: 0 };
  assert.deepEqual(
    readingSummary(readings, (id) => counts[id] || 0),
    { total: 3, assigned: 1, shared: 1 },
  );
});

test('sorting is stable and sinks readings with no difficulty to the end', () => {
  assert.deepEqual(
    sortReadings(readings, 'difficulty', 'asc', () => 0).map((text) => text._id),
    ['1', '2', '3'],
  );
  assert.deepEqual(
    sortReadings(readings, 'difficulty', 'desc', () => 0).map((text) => text._id),
    ['2', '1', '3'],
  );
  assert.deepEqual(
    sortReadings(readings, 'reading', 'asc', () => 0).map((text) => text.title),
    ['Ancient Maps', 'River Songs', 'Zoo Day'],
  );
  assert.deepEqual(
    sortReadings(readings, 'added', 'desc', () => 0).map((text) => text._id),
    ['2', '3', '1'],
  );
});

test('assignment sorting uses the live count for each reading', () => {
  const byCount = { 1: 5, 2: 1, 3: 3 };
  assert.deepEqual(
    sortReadings(readings, 'assignments', 'asc', (id) => byCount[id]).map((text) => text._id),
    ['2', '3', '1'],
  );
});

test('equal levels fall back to the title so the order never shuffles', () => {
  const tie = [
    { _id: 'a', title: 'Onyx', simplifiedVersions: [{ targetLevel: 3 }] },
    { _id: 'b', title: 'Amber', simplifiedVersions: [{ targetLevel: 3 }] },
  ];
  assert.deepEqual(sortReadings(tie, 'levels', 'asc').map((text) => text._id), ['b', 'a']);
});

test('the default sort for a new column is newest first for Added', () => {
  assert.deepEqual(nextSort({ key: 'reading', direction: 'asc' }, 'added'), { key: 'added', direction: 'desc' });
  assert.deepEqual(nextSort({ key: 'added', direction: 'desc' }, 'added'), { key: 'added', direction: 'asc' });
  assert.deepEqual(nextSort({ key: 'added', direction: 'desc' }, 'levels'), { key: 'levels', direction: 'asc' });
});

test('search matches titles, subjects, tags and authors', () => {
  assert.deepEqual(filterReadings(readings, 'river').map((text) => text._id), ['2']);
  assert.deepEqual(filterReadings(readings, 'geography').map((text) => text._id), ['3']);
  assert.deepEqual(filterReadings(readings, 'amina').map((text) => text._id), ['1']);
  assert.deepEqual(filterReadings(readings, '  ').map((text) => text._id), ['1', '2', '3']);
});
