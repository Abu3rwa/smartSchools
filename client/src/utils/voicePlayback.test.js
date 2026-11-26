import test from 'node:test';
import assert from 'node:assert/strict';
import { accentPlaybackKey, getAccentPlayback } from './voicePlayback.js';

test('an accent plays its generated clip when the word has one', () => {
    const audio = { ai: { us: '/audio/us-1.mp3', uk: '/audio/uk-1.mp3' } };
    const us = getAccentPlayback(audio, 'us');
    const uk = getAccentPlayback(audio, 'uk');
    assert.equal(us.accent, 'us');
    assert.equal(us.lang, 'en-US');
    assert.match(us.url, /us-1\.mp3$/);
    assert.equal(uk.lang, 'en-GB');
    assert.match(uk.url, /uk-1\.mp3$/);
});

test('without a clip the accent still chooses the browser voice language', () => {
    const us = getAccentPlayback(null, 'us');
    assert.deepEqual({ accent: us.accent, lang: us.lang, url: us.url }, { accent: 'us', lang: 'en-US', url: null });
    const uk = getAccentPlayback({ ai: { us: '/audio/us-1.mp3' } }, 'uk');
    assert.equal(uk.url, null);
    assert.equal(uk.lang, 'en-GB');
});

test('dictionary pronunciation recordings are never used for spelling accents', () => {
    const audio = { dictionaries: { longman: { us: 'https://dictionary.example/us.mp3', uk: 'https://dictionary.example/uk.mp3' } } };
    assert.equal(getAccentPlayback(audio, 'us').url, null);
    assert.equal(getAccentPlayback(audio, 'uk').url, null);
});

test('an unknown accent falls back to UK', () => {
    const playback = getAccentPlayback({ ai: { uk: '/audio/uk-1.mp3' } }, 'au');
    assert.equal(playback.accent, 'uk');
    assert.equal(playback.lang, 'en-GB');
    assert.match(playback.url, /uk-1\.mp3$/);
});

test('the playing key identifies word and accent, ignoring case and padding', () => {
    assert.equal(accentPlaybackKey('  Stationery ', 'us'), accentPlaybackKey('stationery', 'us'));
    assert.notEqual(accentPlaybackKey('stationery', 'us'), accentPlaybackKey('stationery', 'uk'));
    assert.equal(accentPlaybackKey('stationery', 'au'), accentPlaybackKey('stationery', 'uk'));
});
