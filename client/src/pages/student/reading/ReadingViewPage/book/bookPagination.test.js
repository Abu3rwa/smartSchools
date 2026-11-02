import assert from 'node:assert/strict';
import test from 'node:test';
import { paginateBlocks, splitSentences } from './bookPagination.js';

const lengthMeasure = ({ text = '', title = '' }) => text.length + title.length;

test('blocks are packed into pages by their measured height', () => {
  const blocks = [
    { key: 's-1', title: 'Start', text: '12345' },
    { key: 's-2', text: '12345' },
    { key: 'p-1', text: '123456' },
  ];
  const pages = paginateBlocks(blocks, lengthMeasure, { pageHeight: 15 });
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].paragraphs.map((paragraph) => paragraph.key), ['s-1', 's-2']);
  assert.deepEqual(pages[1].paragraphs.map((paragraph) => paragraph.text), ['123456']);
});

test('an oversized block breaks at sentence boundaries and keeps its title once', () => {
  const blocks = [
    { key: 'p-0', title: 'A walk', text: 'One two. Three four. Five six.' },
  ];
  const pages = paginateBlocks(blocks, lengthMeasure, { pageHeight: 16 });
  assert.deepEqual(
    pages.map((page) => page.paragraphs.map((paragraph) => paragraph.text)),
    [['One two.'], ['Three four.'], ['Five six.']]
  );
  assert.equal(pages[0].paragraphs[0].title, 'A walk');
  assert.deepEqual(pages.slice(1).map((page) => page.paragraphs[0].title), ['', '']);
});

test('Arabic sentence punctuation starts a new sentence', () => {
  assert.deepEqual(
    splitSentences('ذهب الولد إلى المدرسة۔ ثم عاد إلى البيت؟'),
    ['ذهب الولد إلى المدرسة۔', 'ثم عاد إلى البيت؟']
  );
  assert.deepEqual(
    splitSentences('انتظر… ثم مشى!'),
    ['انتظر…', 'ثم مشى!']
  );
});

test('a single sentence taller than a page is split between words', () => {
  const blocks = [{ key: 'p-0', text: 'one two three four five six' }];
  const pages = paginateBlocks(blocks, lengthMeasure, { pageHeight: 10 });
  assert.deepEqual(
    pages.map((page) => page.paragraphs.map((paragraph) => paragraph.text)),
    [['one two'], ['three four'], ['five six']]
  );
  assert.deepEqual(pages, paginateBlocks(blocks, lengthMeasure, { pageHeight: 10 }));
});

test('blocks without text are ignored and an empty reading has no pages', () => {
  assert.deepEqual(paginateBlocks([], lengthMeasure, { pageHeight: 100 }), []);
  assert.deepEqual(
    paginateBlocks([{ key: 'p-0', text: '   ' }], lengthMeasure, { pageHeight: 100 }),
    []
  );
});
