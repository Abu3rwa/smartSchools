import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  INITIAL_ENROLL_SEARCH,
  enrollSearchReducer,
  filterEnrollableStudents,
  formatTeacherName,
  resolveDetailView,
  summarizeEnrollResult
} from './classDetailState.js';

const require = createRequire(import.meta.url);
const enDetail = require('../../../../i18n/locales/en/classes.json').detail;
const arDetail = require('../../../../i18n/locales/ar/classes.json').detail;

const flattenKeys = (node, prefix = '') =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? flattenKeys(value, path) : [path];
  });

test('the detail strings exist in both languages', () => {
  assert.deepEqual(flattenKeys(arDetail).sort(), flattenKeys(enDetail).sort());
  assert.ok(flattenKeys(enDetail).length > 80);
});

test('a matching class keeps its content while it reloads', () => {
  assert.deepEqual(
    resolveDetailView({ status: 'loading', routeId: 'a1', currentClassId: 'a1' }),
    { kind: 'ready', refreshing: true, error: null }
  );
});

test('a first load without a matching class shows the skeleton', () => {
  assert.equal(resolveDetailView({ status: 'loading', routeId: 'a1', currentClassId: null }).kind, 'loading');
  assert.equal(resolveDetailView({ status: 'loading', routeId: 'a2', currentClassId: 'a1' }).kind, 'loading');
  assert.equal(resolveDetailView({ status: 'idle', routeId: 'a1', currentClassId: 'a1' }).kind, 'loading');
});

test('a shell that has not confirmed the class yet is not treated as ready', () => {
  assert.equal(
    resolveDetailView({ status: 'ready', routeId: 'a2', currentClassId: 'a1' }).kind,
    'loading'
  );
  assert.equal(
    resolveDetailView({ status: 'ready', routeId: 'a2', currentClassId: 'a2', detailClassId: 'a1' }).kind,
    'loading'
  );
  assert.equal(
    resolveDetailView({ status: 'ready', routeId: 'a2', currentClassId: 'a2', detailClassId: 'a2' }).kind,
    'ready'
  );
});

test('a failed refresh keeps the loaded class and surfaces the error', () => {
  assert.deepEqual(
    resolveDetailView({ status: 'error', routeId: 'a1', currentClassId: 'a1', error: 'boom' }),
    { kind: 'ready', refreshing: false, error: 'boom' }
  );
  assert.deepEqual(
    resolveDetailView({ status: 'error', routeId: 'a1', currentClassId: 'a1' }),
    { kind: 'ready', refreshing: false, error: 'error' }
  );
});

test('missing, forbidden and failed first loads get distinct surfaces', () => {
  assert.equal(resolveDetailView({ status: 'notFound', routeId: 'a1', currentClassId: 'a1' }).kind, 'notFound');
  assert.equal(resolveDetailView({ status: 'forbidden', routeId: 'a1', currentClassId: 'a1' }).kind, 'forbidden');
  assert.equal(resolveDetailView({ status: 'error', routeId: 'a1', currentClassId: 'a2' }).kind, 'error');
});

test('the enrol search reset clears results and errors', () => {
  const loaded = enrollSearchReducer(INITIAL_ENROLL_SEARCH, {
    type: 'results',
    results: [{ _id: 's1' }],
    rawCount: 1
  });
  assert.equal(loaded.status, 'ready');
  assert.deepEqual(enrollSearchReducer(loaded, { type: 'reset' }), INITIAL_ENROLL_SEARCH);
  assert.deepEqual(enrollSearchReducer(loaded, { type: 'short-query' }), INITIAL_ENROLL_SEARCH);
});

test('typing again while results are shown marks the list as searching and drops the old error', () => {
  const failed = enrollSearchReducer(INITIAL_ENROLL_SEARCH, { type: 'error', error: 'nope' });
  const next = enrollSearchReducer(failed, { type: 'searching' });
  assert.equal(next.status, 'searching');
  assert.equal(next.error, null);
  assert.deepEqual(next.results, []);
});

test('an empty response and an all-enrolled response are different states', () => {
  const empty = enrollSearchReducer(INITIAL_ENROLL_SEARCH, { type: 'results', results: [], rawCount: 0 });
  assert.equal(empty.status, 'empty');

  const allEnrolled = enrollSearchReducer(INITIAL_ENROLL_SEARCH, {
    type: 'results',
    results: [],
    rawCount: 3
  });
  assert.equal(allEnrolled.status, 'all-enrolled');

  const ready = enrollSearchReducer(INITIAL_ENROLL_SEARCH, {
    type: 'results',
    results: [{ _id: 's1' }],
    rawCount: 2
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.results.length, 1);
});

test('a malformed payload cannot leave the enrol search stuck', () => {
  const odd = enrollSearchReducer(INITIAL_ENROLL_SEARCH, { type: 'results', results: null, rawCount: 'x' });
  assert.equal(odd.status, 'empty');
  assert.deepEqual(odd.results, []);
});

test('an unknown action leaves the enrol search untouched', () => {
  const state = { status: 'ready', results: [{ _id: 's1' }], rawCount: 1, error: null };
  assert.equal(enrollSearchReducer(state, { type: 'something-else' }), state);
});

test('the enrol summary distinguishes none, partial and full enrolments', () => {
  assert.deepEqual(summarizeEnrollResult({ requested: 3, modified: 0 }), {
    requested: 3,
    modified: 0,
    isNone: true,
    isPartial: false
  });
  assert.equal(summarizeEnrollResult({ requested: 3, modified: 2 }).isPartial, true);
  assert.equal(summarizeEnrollResult({ requested: 3, modified: 3 }).isPartial, false);
  assert.equal(summarizeEnrollResult({ requested: 0, modified: 0 }).isNone, true);
});

test('the enrol summary clamps bad numbers instead of reporting a false failure', () => {
  assert.deepEqual(summarizeEnrollResult({ requested: -2, modified: 'oops' }), {
    requested: 0,
    modified: 0,
    isNone: true,
    isPartial: false
  });
  assert.equal(summarizeEnrollResult({ requested: 2, modified: 5 }).isPartial, false);
});

test('teacher names ignore an empty half and a missing teacher', () => {
  assert.equal(formatTeacherName({ user: { firstName: 'Layla', lastName: 'Hassan' } }), 'Layla Hassan');
  assert.equal(formatTeacherName({ user: { firstName: 'Layla' } }), 'Layla');
  assert.equal(formatTeacherName({ user: { lastName: 'Hassan' } }), 'Hassan');
  assert.equal(formatTeacherName(null), '');
  assert.equal(formatTeacherName({}), '');
});

test('already enrolled students are filtered out of the search results', () => {
  const students = [{ _id: 's1' }, { _id: 's2' }, { _id: 's3' }];
  assert.deepEqual(filterEnrollableStudents(students, new Set(['s2'])).map((s) => s._id), ['s1', 's3']);
  assert.deepEqual(filterEnrollableStudents(students, null).map((s) => s._id), ['s1', 's2', 's3']);
  assert.deepEqual(filterEnrollableStudents(null, new Set()), []);
});
