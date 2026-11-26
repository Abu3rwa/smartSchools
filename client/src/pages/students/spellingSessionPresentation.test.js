import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getCelebrationTier,
    getLanternStats,
    getReviewWords,
    isCelebratoryCompletion
} from './spellingSessionPresentation.js';

test('celebration tiers scale with the words answered', () => {
    assert.equal(getCelebrationTier(0), 'none');
    assert.equal(getCelebrationTier(1), 'sprout');
    assert.equal(getCelebrationTier(4), 'sprout');
    assert.equal(getCelebrationTier(5), 'bunch');
    assert.equal(getCelebrationTier(9), 'bunch');
    assert.equal(getCelebrationTier(10), 'garden');
    assert.equal(getCelebrationTier(19), 'garden');
    assert.equal(getCelebrationTier(20), 'bouquet');
    assert.equal(getCelebrationTier(80), 'bouquet');
    assert.equal(getCelebrationTier(null), 'none');
});

test('only a finished word list is celebrated, never a mistake-limit ending', () => {
    assert.equal(isCelebratoryCompletion({ status: 'in-progress', completionReason: 'word-list-complete' }), false);
    assert.equal(isCelebratoryCompletion({ status: 'completed', completionReason: 'word-list-complete' }), true);
    assert.equal(isCelebratoryCompletion({ status: 'completed', completionReason: 'curriculum-exhausted' }), true);
    assert.equal(isCelebratoryCompletion({ status: 'completed', completionReason: 'retest-quiz-complete' }), true);
    assert.equal(isCelebratoryCompletion({ status: 'completed', completionReason: 'mistake-limit' }), false);
    assert.equal(isCelebratoryCompletion({ status: 'completed', completionReason: 'teacher-ended' }), false);
    assert.equal(isCelebratoryCompletion(null), false);
});

test('a completed session without a recorded reason falls back to the mistake budget', () => {
    assert.equal(isCelebratoryCompletion({ status: 'completed', mistakeCount: 1, maxMistakesAllowed: 3 }), true);
    assert.equal(isCelebratoryCompletion({ status: 'completed', mistakeCount: 3, maxMistakesAllowed: 3 }), false);
    assert.equal(isCelebratoryCompletion({ status: 'completed', mistakeCount: 4, maxMistakesAllowed: 3 }), false);
});

test('review words are the attempts that were not correct, skipped included', () => {
    const attempts = [
        { wordSnapshot: 'neighbour', correct: false },
        { wordSnapshot: 'separate', correct: true },
        { wordSnapshot: 'rhythm', correct: false, skipped: true }
    ];
    assert.deepEqual(getReviewWords(attempts).map((attempt) => attempt.wordSnapshot), ['neighbour', 'rhythm']);
    assert.deepEqual(getReviewWords(undefined), []);
});

test('lantern stats cap the strip but keep the totals honest', () => {
    const attempts = Array.from({ length: 25 }, (_, index) => ({ correct: index < 18 }));
    assert.deepEqual(getLanternStats({ attempts, max: 18 }), {
        answered: 25,
        correct: 18,
        lanterns: 18,
        lit: 18,
        hidden: 7
    });
    assert.deepEqual(getLanternStats({ attempts: [{ correct: true }, { correct: false }], max: 18 }), {
        answered: 2,
        correct: 1,
        lanterns: 2,
        lit: 1,
        hidden: 0
    });
    assert.deepEqual(getLanternStats({}), { answered: 0, correct: 0, lanterns: 0, lit: 0, hidden: 0 });
});
