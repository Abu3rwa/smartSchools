import assert from 'node:assert/strict';
import test from 'node:test';
import { arrowAction, bookDirection, isArabicLanguage, swipeDirection } from './bookDirection.js';

test('Arabic interface or passage turns the book right-to-left', () => {
  assert.equal(bookDirection({ uiLanguage: 'ar' }), 'rtl');
  assert.equal(bookDirection({ uiLanguage: 'en', textLanguage: 'ar' }), 'rtl');
  assert.equal(bookDirection({ uiLanguage: 'ar-SA', textLanguage: 'en' }), 'rtl');
  assert.equal(bookDirection({ uiLanguage: 'en', textLanguage: 'en' }), 'ltr');
  assert.equal(bookDirection({}), 'ltr');
  assert.equal(isArabicLanguage('Arabic'), true);
  assert.equal(isArabicLanguage('ar-EG'), true);
  assert.equal(isArabicLanguage('en'), false);
});

test('swipes only come from touch and pen', () => {
  assert.equal(swipeDirection({ dx: -80, dy: 4, pointerType: 'mouse' }), null);
  assert.equal(swipeDirection({ dx: -80, dy: 4 }), null);
  assert.equal(swipeDirection({ dx: -80, dy: 4, pointerType: 'touch' }), 'next');
  assert.equal(swipeDirection({ dx: 80, dy: 4, pointerType: 'pen' }), 'prev');
});

test('swipes flip the page in the reading direction', () => {
  assert.equal(swipeDirection({ dx: 80, dy: 4, direction: 'rtl', pointerType: 'touch' }), 'next');
  assert.equal(swipeDirection({ dx: -80, dy: 4, direction: 'rtl', pointerType: 'touch' }), 'prev');
  assert.equal(swipeDirection({ dx: 80, dy: 4, direction: 'ltr', pointerType: 'touch' }), 'prev');
});

test('short or mostly vertical gestures are not swipes', () => {
  assert.equal(swipeDirection({ dx: -47, dy: 2, pointerType: 'touch' }), null);
  assert.equal(swipeDirection({ dx: -60, dy: 80, pointerType: 'touch' }), null);
  assert.equal(swipeDirection({ dx: 0, dy: 0, pointerType: 'touch' }), null);
});

test('arrow keys turn the page in the reading direction', () => {
  assert.equal(arrowAction('ArrowRight', 'ltr'), 'next');
  assert.equal(arrowAction('ArrowLeft', 'ltr'), 'prev');
  assert.equal(arrowAction('ArrowRight', 'rtl'), 'prev');
  assert.equal(arrowAction('ArrowLeft', 'rtl'), 'next');
  assert.equal(arrowAction('PageDown', 'rtl'), 'next');
  assert.equal(arrowAction('PageUp', 'ltr'), 'prev');
  assert.equal(arrowAction('Escape', 'ltr'), null);
});
