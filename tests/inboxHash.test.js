import assert from 'node:assert/strict';
import test from 'node:test';

import { hashBody } from '../services/inbox/inboxHash.js';

test('the same subject and body always give the same hash', () => {
    const first = hashBody('Quiz on Thursday', 'Please send the marks.');
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(hashBody('  Quiz on Thursday ', 'Please send the marks.  '), first);
});

test('a changed subject or body changes the hash', () => {
    const base = hashBody('Quiz', 'Body text');
    assert.notEqual(hashBody('Quiz 2', 'Body text'), base);
    assert.notEqual(hashBody('Quiz', 'Body text edited'), base);
});

test('the subject and body cannot be confused with each other', () => {
    assert.notEqual(hashBody('ab', 'c'), hashBody('a', 'bc'));
});
