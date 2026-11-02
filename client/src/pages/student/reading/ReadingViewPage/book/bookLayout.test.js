import assert from 'node:assert/strict';
import test from 'node:test';
import {
  layoutCssVars,
  layoutForWidth,
  passageTextHeight,
} from './bookLayout.js';

test('the spread is chosen from the container width only', () => {
  assert.equal(layoutForWidth(879).wide, false);
  assert.equal(layoutForWidth(880).wide, true);
  assert.equal(layoutForWidth(1200).wide, true);
  assert.equal(layoutForWidth(519).wide, false);
});

test('layout sizes change at the container thresholds', () => {
  assert.equal(layoutForWidth(519).size, 'compact');
  assert.equal(layoutForWidth(520).size, 'single');
  assert.equal(layoutForWidth(767).size, 'single');
  assert.equal(layoutForWidth(768).size, 'single');
  assert.equal(layoutForWidth(879).size, 'single');
  assert.equal(layoutForWidth(880).size, 'spread');
  assert.equal(layoutForWidth(0).size, 'compact');
});

test('each size carries the padding and type the page renders', () => {
  const spread = layoutForWidth(1000);
  const single = layoutForWidth(700);
  const compact = layoutForWidth(400);
  assert.equal(spread.padInline, 38);
  assert.equal(single.padInline, 22);
  assert.equal(compact.padInline, 16);
  assert.ok(spread.textSize > single.textSize);
  assert.equal(single.textSize, compact.textSize);
  assert.deepEqual(layoutCssVars(spread), {
    '--book-page-pad-block': '26px',
    '--book-page-pad-bottom': '24px',
    '--book-page-pad-inline': '38px',
    '--book-text-size': '17.6px',
    '--book-text-line': '31.33px',
  });
});

test('the footer is reserved in the measured text height', () => {
  const layout = layoutForWidth(1000);
  const textHeight = passageTextHeight(700, layout);
  assert.equal(textHeight, 700 - layout.chrome);
  assert.ok(layout.chrome - layout.padBlock - layout.padBottom >= 60);
  assert.equal(passageTextHeight(40, layout), 160);
});
