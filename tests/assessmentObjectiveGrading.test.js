import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNumericValue,
  gradeNumericAgainstRule,
  splitNumericAndUnit,
  roundRational,
  rationalToText
} from '../services/assessment/numericAnswer.js';
import {
  parseNumericRule,
  parseOrderingItems,
  parseBlankDefinitions,
  findBlankTokens,
  renderBlankSegments,
  encodeOrderingKey,
  decodeResponseMap
} from '../services/assessment/answerFormat.js';
import {
  gradeObjectiveAnswer,
  gradeMultipleSelect,
  gradeMatching,
  gradeOrdering,
  gradeFillInBlank,
  gradeNumericResponse
} from '../services/assessment/objectiveGrading.js';

test('parses numbers exactly without floating-point drift', () => {
  assert.equal(rationalToText(parseNumericValue('0.1')), '0.1');
  assert.equal(rationalToText(parseNumericValue('1,234.5')), '1234.5');
  assert.equal(rationalToText(parseNumericValue('-12')), '-12');
  assert.equal(rationalToText(parseNumericValue('3/4', { allowFractions: true })), '0.75');
  assert.equal(parseNumericValue('3/4'), null);
  assert.equal(parseNumericValue('abc'), null);
  assert.equal(parseNumericValue(''), null);
  assert.equal(rationalToText(roundRational(parseNumericValue('2.675'), 2)), '2.68');
});

test('grades numeric rules by exact value, tolerance, range and unit', () => {
  assert.equal(gradeNumericAgainstRule('12', { mode: 'exact', value: '12' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12.00', { mode: 'exact', value: '12' }).matched, true);
  assert.equal(gradeNumericAgainstRule('0.1', { mode: 'exact', value: '0.10' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12.4', { mode: 'exact', value: '12' }).matched, false);

  assert.equal(gradeNumericAgainstRule('12.4', { mode: 'exact', value: '12', tolerance: '0.5' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12.5', { mode: 'exact', value: '12', tolerance: '0.5' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12.6', { mode: 'exact', value: '12', tolerance: '0.5' }).matched, false);

  assert.equal(gradeNumericAgainstRule('15', { mode: 'range', min: '10', max: '20' }).matched, true);
  assert.equal(gradeNumericAgainstRule('9', { mode: 'range', min: '10', max: '20' }).matched, false);
  assert.equal(gradeNumericAgainstRule('20', { mode: 'range', min: '10', max: '20' }).matched, true);

  assert.equal(gradeNumericAgainstRule('50', { mode: 'relative', value: '40', tolerance: '25' }).matched, true);
  assert.equal(gradeNumericAgainstRule('51', { mode: 'relative', value: '40', tolerance: '25' }).matched, false);

  assert.equal(gradeNumericAgainstRule('3/4', { mode: 'exact', value: '0.75', allowFractions: true }).matched, true);
  assert.equal(gradeNumericAgainstRule('12cm', { mode: 'exact', value: '12', unit: 'cm' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12 mm', { mode: 'exact', value: '12', unit: 'cm' }).reason, 'wrong_unit');
  assert.equal(gradeNumericAgainstRule('12', { mode: 'exact', value: '12', unit: 'cm' }).reason, 'missing_unit');
  assert.equal(gradeNumericAgainstRule('12 cm', { mode: 'exact', value: '12' }).reason, 'unexpected_unit');
  assert.equal(gradeNumericAgainstRule('12.341', { mode: 'exact', value: '12.34', decimalPlaces: '2' }).matched, true);
  assert.equal(gradeNumericAgainstRule('12.35', { mode: 'exact', value: '12.34', decimalPlaces: '2' }).matched, false);
  assert.equal(gradeNumericAgainstRule('x', { mode: 'exact', value: '12' }).reason, 'not_a_number');
});

test('splits a unit suffix from the number', () => {
  assert.deepEqual(splitNumericAndUnit('12.5 kg'), { numericText: '12.5', unitText: 'kg' });
  assert.deepEqual(splitNumericAndUnit('-3/4'), { numericText: '-3/4', unitText: '' });
});

test('reads authored CSV rules for every new type', () => {
  assert.deepEqual(parseNumericRule('12'), { rule: { mode: 'exact', value: '12' }, error: null });
  assert.deepEqual(parseNumericRule('tol::12~0.5'), { rule: { mode: 'tolerance', value: '12', tolerance: '0.5' }, error: null });
  assert.deepEqual(parseNumericRule('range::10~20'), { rule: { mode: 'range', min: '10', max: '20' }, error: null });
  assert.deepEqual(
    parseNumericRule('exact::12|unit::cm|decimals::2'),
    { rule: { mode: 'exact', value: '12', unit: 'cm', decimalPlaces: '2' }, error: null }
  );
  assert.match(parseNumericRule('range::10').error, /low and a high/);
  assert.match(parseNumericRule('exact::abc').error, /Could not read a number/);
  assert.match(parseNumericRule('exact::12|bogus::1').error, /Unknown numeric rule option/);

  const ordering = parseOrderingItems('seed>sprout>mature plant');
  assert.equal(ordering.error, null);
  assert.equal(ordering.items.length, 3);
  assert.equal(new Set(ordering.items.map((item) => item.id)).size, 3);
  assert.equal(parseOrderingItems('seed>sprout>mature plant').items[0].id, ordering.items[0].id);
  assert.equal(ordering.items.every((item) => !/^o\d$/.test(item.id)), true);
  assert.equal(parseOrderingItems('seed>sprout').error.includes('at least 3'), true);
  assert.deepEqual(parseOrderingItems('seed>seed>sprout>plant').items.length, 3);
  assert.equal(encodeOrderingKey(ordering.items), ordering.items.map((item) => item.id).join('>'));
});

test('blanks are validated against the tokens in the question text', () => {
  const prompt = 'The {{b1}} uses {{b2}} to make sugar.';
  assert.deepEqual(findBlankTokens(prompt), ['b1', 'b2']);

  const segments = renderBlankSegments(prompt, [{ id: 'b1' }, { id: 'b2' }]);
  assert.deepEqual(segments.filter((entry) => entry.type === 'blank').map((entry) => entry.id), ['b1', 'b2']);

  const keyed = parseBlankDefinitions('b1::photosynthesis~chlorophyll|b2::light~sunlight', prompt);
  assert.equal(keyed.error, null);
  assert.deepEqual(keyed.blanks[0].accepts, ['photosynthesis', 'chlorophyll']);

  const positional = parseBlankDefinitions('photosynthesis|light', prompt);
  assert.equal(positional.error, null);
  assert.deepEqual(positional.blanks.map((blank) => blank.id), ['b1', 'b2']);

  assert.match(parseBlankDefinitions('photosynthesis', prompt).error, /both|order|2 blank/);
  assert.match(parseBlankDefinitions('b1::photosynthesis', prompt).error, /Missing: b2/);
  assert.match(parseBlankDefinitions('photosynthesis', 'no tokens here').error, /{{b1}}/);
  assert.deepEqual(decodeResponseMap('{"b1":"light"}'), { b1: 'light' });
  assert.deepEqual(decodeResponseMap('b1::light|b2::sugar'), { b1: 'light', b2: 'sugar' });
});

test('multiple select grades the whole set and can award partial credit', () => {
  const correct = gradeMultipleSelect({ studentAnswer: ['A', 'C'], correctAnswer: 'A|C' });
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);

  const extra = gradeMultipleSelect({ studentAnswer: 'A|C|D', correctAnswer: 'A|C' });
  assert.equal(extra.isCorrect, false);
  assert.equal(extra.score, 0);

  const partial = gradeMultipleSelect({ studentAnswer: ['A'], correctAnswer: 'A|C', partialCredit: true });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, 0.5);
  assert.deepEqual(partial.detail.missing, ['C']);

  assert.equal(gradeMultipleSelect({ studentAnswer: [], correctAnswer: 'A|C' }).requiresTeacherReview, true);
});

test('matching awards credit per pair and sends blanks to review', () => {
  const pairs = [{ left: 'Photosynthesis', right: 'Makes sugar' }, { left: 'Respiration', right: 'Releases energy' }];
  const both = gradeMatching({ studentAnswer: [{ left: 'Photosynthesis', right: 'Makes sugar' }, { left: 'Respiration', right: 'Releases energy' }], matchingPairs: pairs });
  assert.equal(both.score, 1);

  const one = gradeMatching({ studentAnswer: 'Photosynthesis::Makes sugar', matchingPairs: pairs });
  assert.equal(one.score, 0.5);
  assert.equal(one.isCorrect, false);

  assert.equal(gradeMatching({ studentAnswer: [], matchingPairs: pairs }).requiresTeacherReview, true);
});

test('ordering scores each position and rejects an incomplete order', () => {
  const items = [{ id: 'o1', text: 'seed' }, { id: 'o2', text: 'sprout' }, { id: 'o3', text: 'plant' }];
  assert.equal(gradeOrdering({ studentAnswer: 'o1>o2>o3', orderingItems: items }).score, 1);

  const swapped = gradeOrdering({ studentAnswer: 'o2>o1>o3', orderingItems: items });
  assert.equal(swapped.score, Number((1 / 3).toFixed(4)));
  assert.equal(swapped.isCorrect, false);

  assert.equal(gradeOrdering({ studentAnswer: 'o1>o2', orderingItems: items }).requiresTeacherReview, true);
  assert.equal(gradeOrdering({ studentAnswer: 'o1>o2>o9', orderingItems: items }).requiresTeacherReview, true);
});

test('fill in the blank scores each blank independently', () => {
  const blanks = [
    { id: 'b1', accepts: ['photosynthesis', 'Photo-Synthesis'] },
    { id: 'b2', accepts: ['light', 'sunlight'] }
  ];
  assert.equal(gradeFillInBlank({ studentAnswer: { b1: 'Photosynthesis.', b2: 'sunlight' }, blanks }).score, 1);
  assert.equal(gradeFillInBlank({ studentAnswer: { b1: 'chlorophyll', b2: 'light' }, blanks }).score, 0.5);
  assert.equal(gradeFillInBlank({ studentAnswer: {}, blanks }).requiresTeacherReview, true);
  assert.equal(gradeFillInBlank({ studentAnswer: { b1: 'Photosynthesis' }, blanks }).score, 0.5);

  const caseSensitive = [{ id: 'b1', accepts: ['Paris'], caseSensitive: true }];
  assert.equal(gradeFillInBlank({ studentAnswer: { b1: 'paris' }, blanks: caseSensitive }).score, 0);
});

test('numeric response grading keeps the raw input for diagnostics', () => {
  const graded = gradeNumericResponse({ studentAnswer: '12.4cm', rule: { mode: 'exact', value: '12', tolerance: '0.5', unit: 'cm' } });
  assert.equal(graded.isCorrect, true);
  assert.equal(graded.detail.type, 'numeric');
  assert.equal(graded.detail.parsed, '12.4');
});

test('one dispatcher grades every objective type', () => {
  const items = [{ id: 'o1', text: 'a' }, { id: 'o2', text: 'b' }, { id: 'o3', text: 'c' }];
  assert.equal(gradeObjectiveAnswer({ questionType: 'ordering', studentAnswer: 'o1>o2>o3', orderingItems: items }).isCorrect, true);
  assert.equal(gradeObjectiveAnswer({ questionType: 'numeric_response', studentAnswer: '12', rule: { mode: 'exact', value: '12' } }).isCorrect, true);
  assert.equal(gradeObjectiveAnswer({ questionType: 'mcq', studentAnswer: 'A' }), null);
});
