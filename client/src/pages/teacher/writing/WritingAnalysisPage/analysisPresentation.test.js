import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allStandardSelection,
  attentionOf,
  codeDepth,
  DEFAULT_STANDARD_COUNT,
  defaultStandardSelection,
  fromDateInput,
  initialLevelDraft,
  overlappingStandards,
  overlapSummary,
  progressOf,
  scaleLabel,
  splitPatterns,
  standardGroups,
  toDateInput,
  windowRange,
} from './analysisPresentation.js';

test('month, term and year windows follow the school calendar', () => {
  const november = new Date(2026, 10, 10, 9, 0, 0);
  const month = windowRange('month', november);
  assert.equal(month.from.getFullYear(), 2026);
  assert.equal(month.from.getMonth(), 10);
  assert.equal(month.from.getDate(), 1);
  assert.equal(month.to, null);

  const term = windowRange('term', november);
  assert.equal(term.from.getMonth(), 7);
  assert.equal(term.from.getFullYear(), 2026);
  assert.equal(term.to.getMonth(), 0);
  assert.equal(term.to.getFullYear(), 2027);

  const march = new Date(2026, 2, 4);
  const secondTerm = windowRange('term', march);
  assert.equal(secondTerm.from.getMonth(), 1);
  assert.equal(secondTerm.to.getMonth(), 6);

  const year = windowRange('year', march);
  assert.equal(year.from.getMonth(), 7);
  assert.equal(year.from.getFullYear(), 2025);
});

test('all time sends no dates at all', () => {
  assert.deepEqual(windowRange('all'), { from: null, to: null });
});

test('a date input round-trips through the API instant', () => {
  const iso = fromDateInput('2026-11-10');
  assert.equal(toDateInput(iso), '2026-11-10');
  assert.equal(toDateInput(''), '');
  assert.equal(fromDateInput(''), '');
});

test('progress counts successful, failed and unusable pieces', () => {
  const analysis = {
    status: 'running',
    draftSelection: [{ draft: 'd1' }, { draft: 'd2' }, { draft: 'd3' }],
    pieceRuns: [
      { draft: 'd1', aiStatus: 'done' },
      { draft: 'd2', aiStatus: 'unusable' },
      { draft: 'd3', aiStatus: 'pending' },
    ],
  };
  assert.deepEqual(progressOf(analysis), {
    total: 3,
    done: 1,
    failed: 1,
    settled: 2,
  });
});

test('the level draft starts from the teacher level only', () => {
  const draft = initialLevelDraft([
    { standard: 's1', teacherLevel: 3, proposedLevel: 2 },
    { standard: 's2', proposedLevel: 2 },
  ]);
  assert.equal(draft.s1.level, 3);
  assert.equal(draft.s2.level, null);
  assert.equal(draft.s2.note, '');
});

test('default standards prefer assigned rows and drop a covered parent', () => {
  const standards = [
    { _id: 'a', code: 'L.1' },
    { _id: 'b', code: 'L.1.A' },
    { _id: 'c', code: 'L.2' },
  ];
  assert.deepEqual(defaultStandardSelection(standards, [], 12), ['b', 'c']);
  assert.deepEqual(defaultStandardSelection(standards, ['a'], 12), ['a']);
  assert.deepEqual(defaultStandardSelection(standards, ['b', 'c'], 1), ['b']);
});

test('the default count only pre-ticks; select all takes every standard', () => {
  const standards = [
    ...Array.from({ length: 30 }, (_, index) => ({
      _id: `s${index}`,
      code: `W.${index + 1}`,
    })),
    { _id: 'p', code: 'L.1' },
    { _id: 'q', code: 'L.1.A' },
  ];
  assert.equal(
    defaultStandardSelection(standards).length,
    DEFAULT_STANDARD_COUNT,
  );

  const chosen = allStandardSelection(standards);
  assert.equal(chosen.length, 31);
  assert.equal(chosen.includes('p'), false);
  assert.equal(chosen[chosen.length - 1], 'q');
});

test('a parent and child ticked by hand are reported as an overlap', () => {
  const standards = [
    { _id: 'a', code: 'L.1' },
    { _id: 'b', code: 'L.1.A' },
    { _id: 'c', code: 'L.2' },
  ];
  const pairs = overlappingStandards(standards, ['a', 'b', 'c']);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].parent._id, 'a');
  assert.equal(pairs[0].child._id, 'b');
  assert.equal(overlappingStandards(standards, ['b', 'c']).length, 0);
});

test('overlaps are summarised once per parent', () => {
  const summary = overlapSummary([
    { parent: { code: 'L.2' }, child: { code: 'L.2.A' } },
    { parent: { code: 'L.2' }, child: { code: 'L.2.B' } },
    { parent: { code: 'L.3' }, child: { code: 'L.3.C' } },
  ]);
  assert.equal(summary, 'L.2 · L.2.A, L.2.B; L.3 · L.3.C');
  assert.equal(overlapSummary([]), '');
});

test('standards group by category and sort by code depth', () => {
  const groups = standardGroups([
    { _id: 'a', code: 'L.10', category: 'Language' },
    { _id: 'b', code: 'L.2', category: 'Language' },
    { _id: 'c', code: 'W.1', category: '' },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].rows.map((row) => row.code), ['L.2', 'L.10']);
  assert.equal(groups[1].category, '');
  assert.equal(codeDepth('L.1.A'), 2);
});

test('attention lists standards with no met evidence and no proposal', () => {
  const attention = attentionOf({
    standards: [
      { code: 'L.1', counts: { applicable: 2, met: 0 }, proposedLevel: 1 },
      { code: 'L.2', counts: { applicable: 2, met: 2 }, proposedLevel: 3 },
      { code: 'L.3', counts: { applicable: 0, met: 0 }, proposedLevel: null },
    ],
  });
  assert.deepEqual(attention.weak, [{ code: 'L.1', met: 0, applicable: 2 }]);
  assert.equal(attention.weakCount, 1);
  assert.equal(attention.noProposal, 1);
});

test('patterns split into recurring and seen-once, and scale labels follow language', () => {
  const { recurring, single } = splitPatterns([
    { pieces: 2, recurring: true },
    { pieces: 1, recurring: false },
    { pieces: 3 },
  ]);
  assert.equal(recurring.length, 2);
  assert.equal(single.length, 1);
  assert.equal(scaleLabel(4, 'en'), 'Exceeds Standard');
  assert.equal(scaleLabel(0, 'ar'), 'لم يُظهر أي أداء');
});
