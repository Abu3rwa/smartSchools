import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_WINDOW, pagesWindow } from './pagesWindow.js';

const makePages = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index}` }));

test('a long session keeps only its newest pages mounted', () => {
    const pages = makePages(10);
    const window = pagesWindow(pages);
    assert.equal(PAGE_WINDOW, 6);
    assert.deepEqual(window.visible.map((page) => page.id), ['p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
    assert.deepEqual(window.hidden.map((page) => page.id), ['p0', 'p1', 'p2', 'p3']);
    assert.equal(window.hiddenCount, 4);
    assert.equal(window.canExpand, true);
});

test('expanding returns every page and nothing stays hidden', () => {
    const pages = makePages(10);
    const window = pagesWindow(pages, true);
    assert.deepEqual(window.visible.map((page) => page.id), pages.map((page) => page.id));
    assert.deepEqual(window.hidden, []);
    assert.equal(window.hiddenCount, 0);
    assert.equal(window.canExpand, false);
});

test('a short session is never split', () => {
    const pages = makePages(3);
    const window = pagesWindow(pages);
    assert.deepEqual(window.visible, pages);
    assert.equal(window.canExpand, false);
});

test('the window size can be overridden and never drops below one', () => {
    const pages = makePages(5);
    assert.deepEqual(pagesWindow(pages, false, 2).visible.map((page) => page.id), ['p3', 'p4']);
    assert.equal(pagesWindow(makePages(10), false, 0).visible.length, PAGE_WINDOW);
    assert.equal(pagesWindow(pages, false, -3).visible.length, 1);
});

test('page objects keep their identity, so expanding does not remount them', () => {
    const pages = makePages(8);
    const window = pagesWindow(pages);
    const latest = pages[pages.length - 1];
    assert.equal(window.visible[window.visible.length - 1], latest);
    assert.equal(pagesWindow(pages, true).visible[0], pages[0]);
});

test('a missing list is just an empty board', () => {
    assert.deepEqual(pagesWindow(), { visible: [], hidden: [], hiddenCount: 0, canExpand: false });
    assert.deepEqual(pagesWindow(null).visible, []);
});
