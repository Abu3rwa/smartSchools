import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSpellingCompletionRecipients } from '../services/spellingEmailService.js';

test('spelling completion recipients honor each audience', () => {
    const student = {
        getAllContactEmailEntries: () => [
            { email: 'student@school.test', type: 'student' },
            { email: 'father@school.test', type: 'father' },
            { email: 'mother@school.test', type: 'mother' },
            { email: 'student@school.test', type: 'student' }
        ]
    };

    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'none'), []);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-only'), ['student@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'parents-only'), ['father@school.test', 'mother@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-and-parents'), [
        'student@school.test',
        'father@school.test',
        'mother@school.test'
    ]);
});

test('spelling completion recipients safely return no addresses without the model helper', () => {
    assert.deepEqual(resolveSpellingCompletionRecipients({}, 'student-and-parents'), []);
});
