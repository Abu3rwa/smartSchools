import assert from 'node:assert/strict';
import test from 'node:test';
import { arrowAction, bookDirection, isArabicLanguage } from './bookDirection.js';

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

test('arrow keys turn the page in the reading direction', () => {
  assert.equal(arrowAction('ArrowRight', 'ltr'), 'next');
  assert.equal(arrowAction('ArrowLeft', 'ltr'), 'prev');
  assert.equal(arrowAction('ArrowRight', 'rtl'), 'prev');
  assert.equal(arrowAction('ArrowLeft', 'rtl'), 'next');
  assert.equal(arrowAction('PageDown', 'rtl'), 'next');
  assert.equal(arrowAction('PageUp', 'ltr'), 'prev');
  assert.equal(arrowAction('Escape', 'ltr'), null);
});
