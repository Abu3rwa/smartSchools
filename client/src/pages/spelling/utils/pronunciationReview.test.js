import test from 'node:test';
import assert from 'node:assert/strict';
import {
    accentLabel,
    applyAccentPatch,
    canRegenerateClip,
    isWordReviewed,
    summarizeWords
} from './pronunciationReview.js';

const word = (name, us = {}, uk = {}) => ({
    word: name,
    accents: { us: { missing: false, removed: false, reviewed: false, attempts: 0, ...us }, uk: { missing: false, removed: false, reviewed: false, attempts: 0, ...uk } }
});

test('a word counts as reviewed only when both accents are reviewed', () => {
    assert.equal(isWordReviewed(word('castle', { reviewed: true }, { reviewed: true })), true);
    assert.equal(isWordReviewed(word('castle', { reviewed: true }, { reviewed: false })), false);
    assert.equal(isWordReviewed(word('castle')), false);
});

test('the queue summary counts reviewed, pending and broken words', () => {
    const summary = summarizeWords([
        word('castle', { reviewed: true }, { reviewed: true }),
        word('bridge', { reviewed: true }),
        word('stone', { missing: true }, { missing: true }),
        word('tower', { flagged: true }),
        word('house', { removed: true })
    ]);

    assert.equal(summary.totalWords, 5);
    assert.equal(summary.reviewedWords, 1);
    assert.equal(summary.pendingWords, 4);
    assert.equal(summary.missingClips, 1);
    assert.equal(summary.flaggedClips, 1);
    assert.equal(summary.removedClips, 1);
});

test('approving one accent only changes that accent', () => {
    const words = [word('castle'), word('bridge')];
    const updated = applyAccentPatch(words, 'castle', 'us', { reviewed: true });

    assert.equal(updated[0].accents.us.reviewed, true);
    assert.equal(updated[0].accents.uk.reviewed, false);
    assert.equal(updated[1].accents.us.reviewed, false);
    assert.equal(words[0].accents.us.reviewed, false, 'the original list is untouched');
});

test('a clip can be regenerated until it reaches the attempt limit', () => {
    assert.equal(canRegenerateClip({ missing: false, removed: false, attempts: 0 }, 3), true);
    assert.equal(canRegenerateClip({ missing: false, removed: false, attempts: 2 }, 3), true);
    assert.equal(canRegenerateClip({ missing: false, removed: false, attempts: 3 }, 3), false);
    assert.equal(canRegenerateClip({ missing: true, removed: false, attempts: 0 }, 3), false);
    assert.equal(canRegenerateClip({ missing: false, removed: true, attempts: 0 }, 3), false);
    assert.equal(canRegenerateClip(null, 3), false);
});

test('accents are shown as US and UK', () => {
    assert.equal(accentLabel('us'), 'US');
    assert.equal(accentLabel('uk'), 'UK');
});
