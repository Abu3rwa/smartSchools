import assert from 'node:assert/strict';
import test from 'node:test';
import { humanizeFeatureKey, resolveFeatureLabel } from './featureNames.js';

test('feature keys read as names instead of code', () => {
  assert.equal(humanizeFeatureKey('gradebookSpreadsheet'), 'Gradebook Spreadsheet');
  assert.equal(humanizeFeatureKey('aiEmailDrafts'), 'Ai Email Drafts');
  assert.equal(humanizeFeatureKey('spelling_analysis'), 'Spelling Analysis');
  assert.equal(humanizeFeatureKey(''), '');
});

test('the translated name wins over the server label and the key', () => {
  const t = (key, options) => (key.endsWith('readingAssistant') ? 'مساعد القراءة' : options.defaultValue);
  assert.equal(resolveFeatureLabel(t, 'readingAssistant', 'Reading Assistant'), 'مساعد القراءة');
  assert.equal(resolveFeatureLabel(t, 'mapTestPrep', 'MAP Test Prep'), 'MAP Test Prep');
  assert.equal(resolveFeatureLabel(t, 'brandNewThing'), 'Brand New Thing');
  assert.equal(resolveFeatureLabel(null, 'brandNewThing'), 'Brand New Thing');
});
