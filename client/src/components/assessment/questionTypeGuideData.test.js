import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { LIVE_QUESTION_KINDS } from '../../constants/liveLessonQuestionKinds.js';
import { PRACTICE_QUESTION_TYPES } from '../../constants/practiceQuestionTypes.js';
import { questionGuideIntroKey, questionGuideLimits, questionGuideRows, questionGuideRuleKeys, questionGuideSeparators } from './questionTypeGuideData.js';
import { mapPracticeExampleRows } from '../../pages/mapTestPrep/mapPracticeTemplate.js';

const require = createRequire(import.meta.url);
const enGuide = require('../../i18n/locales/en/questionTypes.json').guide;
const arGuide = require('../../i18n/locales/ar/questionTypes.json').guide;

test('the map guide covers exactly the question types the map sample file uses', () => {
  const fromGuide = questionGuideRows('map').map((row) => row.token).sort();
  const fromSamples = [...new Set(mapPracticeExampleRows.map((row) => row.question_type))].sort();
  assert.deepEqual(fromGuide, fromSamples);
});

test('the guides cover the shared question type vocabulary', () => {
  assert.deepEqual(questionGuideRows('standards').map((row) => row.key).sort(), [...PRACTICE_QUESTION_TYPES].sort());
  assert.deepEqual(
    questionGuideRows('map').map((row) => row.key).sort(),
    PRACTICE_QUESTION_TYPES.filter((type) => type !== 'true_false').sort()
  );
});

test('the live guide covers exactly the answer kinds a live lesson accepts', () => {
  assert.deepEqual(questionGuideRows('live').map((row) => row.token).sort(), [...LIVE_QUESTION_KINDS].sort());
});

test('every guided type names its columns and shows a grammar example', () => {
  for (const flow of ['map', 'standards', 'live']) {
    for (const row of questionGuideRows(flow)) {
      assert.ok(row.columns.length > 0, `${flow}/${row.key} lists no column`);
      assert.ok(row.example.length > 0, `${flow}/${row.key} has no example`);
      assert.ok(enGuide.types[row.key]?.name && arGuide.types[row.key]?.name, `${row.key} needs a translated name`);
      assert.ok(enGuide.types[row.key]?.write && arGuide.types[row.key]?.write, `${row.key} needs translated instructions`);
      assert.ok(enGuide.types[row.key]?.grading && arGuide.types[row.key]?.grading, `${row.key} needs a translated scoring note`);
    }
  }
  const blanks = questionGuideRows('standards').find((row) => row.key === 'fill_in_blank');
  assert.equal(blanks.stemExample.value.includes('{{b1}}'), true);
});

test('every flow states its own intro and shared rules in both languages', () => {
  for (const flow of ['map', 'standards', 'live']) {
    assert.ok(enGuide[questionGuideIntroKey(flow)], `${flow} needs an English intro`);
    assert.ok(arGuide[questionGuideIntroKey(flow)], `${flow} needs an Arabic intro`);
    for (const rule of questionGuideRuleKeys(flow)) {
      assert.ok(enGuide[rule] && arGuide[rule], `${flow}/${rule} needs a translated rule`);
    }
  }
});

test('the guide states the separators and limits the parser enforces', () => {
  assert.deepEqual(questionGuideSeparators().map((entry) => entry.symbol), ['|', '::', '~', '>']);
  assert.deepEqual(questionGuideLimits(), {
    maxOrderItems: 8,
    minOptions: 2,
    minOrderItems: 3,
    minPairs: 2
  });
});
