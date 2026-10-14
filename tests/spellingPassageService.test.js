import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueMissedWords } from '../services/spellingPassageService.js';

test('uniqueMissedWords includes only distinct incorrect, non-skipped words from the selected session', () => {
    const words = uniqueMissedWords({
        attempts: [
            { wordSnapshot: 'giraffe', correct: false, skipped: false },
            { wordSnapshot: 'Giraffe', correct: false, skipped: false },
            { wordSnapshot: 'sheep', correct: true, skipped: false },
            { wordSnapshot: 'cow', correct: false, skipped: true },
            { wordSnapshot: '  ', correct: false, skipped: false }
        ]
    });

    assert.deepEqual(words, ['giraffe']);
});

test('uniqueMissedWords returns no words when the selected session has no incorrect answers', () => {
    assert.deepEqual(uniqueMissedWords({
        attempts: [
            { wordSnapshot: 'giraffe', correct: true, skipped: false },
            { wordSnapshot: 'cow', correct: false, skipped: true }
        ]
    }), []);
});
