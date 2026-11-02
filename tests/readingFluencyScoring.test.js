import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeReference, normalizeTranscript } from '../services/readingFluency/normalize.js';
import { alignReferenceToTranscript } from '../services/readingFluency/align.js';
import { assessRecordingQuality, computeMetrics } from '../services/readingFluency/metrics.js';
import {
    accuracyTier,
    buildFeedback,
    teacherAccuracyBand
} from '../services/readingFluency/feedback.js';
import { PASSAGE, SHORT_PASSAGE, firstWords, timedWords } from './fixtures/readingFluency.js';

const score = (said, { text = PASSAGE, timed = null, segments = [] } = {}) => {
    const reference = normalizeReference(text);
    const transcript = normalizeTranscript(said, timed ? { words: timed } : {});
    const alignment = alignReferenceToTranscript(reference, transcript);
    const metrics = computeMetrics({ reference, transcript, alignment });
    const quality = assessRecordingQuality({ transcript, reference, alignment, segments });
    return { reference, transcript, alignment, metrics, quality };
};

test('a perfect read is all correct and counts', () => {
    const result = score(PASSAGE);
    assert.equal(result.alignment.statusMap.length, result.reference.wordCount);
    assert.equal(result.alignment.statusMap, 'c'.repeat(result.reference.wordCount));
    assert.equal(result.metrics.accuracy, 100);
    assert.equal(result.metrics.completion, 100);
    assert.equal(result.metrics.counted, true);
    assert.equal(result.metrics.errors, 0);
    assert.equal(result.quality.notHeard, false);
});

test('one close substitution is marked as a different word', () => {
    const result = score('Parliament repeated the law in 1766.', {
        text: 'Parliament repealed the law in 1766.'
    });
    assert.equal(result.alignment.statusMap, 'cscccc');
    assert.equal(result.metrics.accuracy, 83);
    assert.deepEqual(result.alignment.issues, [{ i: 1, heard: 'repeated' }]);
});

test('a skipped sentence lowers accuracy but not completion', () => {
    const result = score('The colonists were angry. Parliament repealed the law.', {
        text: 'The colonists were angry. They refused to pay the tax. Parliament repealed the law.'
    });
    assert.equal(result.alignment.statusMap, 'cccckkkkkkcccc');
    assert.equal(result.metrics.completion, 100);
    assert.equal(result.metrics.errors, 6);
    assert.ok(result.metrics.accuracy < 80);
});

test('stopping halfway lowers completion, not accuracy', () => {
    const result = score('The colonists were angry', {
        text: 'The colonists were angry and afraid of the new law.'
    });
    assert.equal(result.alignment.wordsAttempted, 4);
    assert.equal(result.metrics.completion, 40);
    assert.equal(result.metrics.accuracy, 100);
    assert.equal(result.metrics.counted, false);
});

test('a repeated word is counted kindly, not as an error', () => {
    const result = score('The the colonists were angry.', {
        text: 'The colonists were angry.'
    });
    assert.equal(result.metrics.accuracy, 100);
    assert.equal(result.alignment.insertionCount, 1);
    assert.equal(result.alignment.repeats, 1);
    assert.equal(result.alignment.selfCorrections, 1);
});

test('a self-correction is not an error', () => {
    const result = score('The colony colonists were angry.', {
        text: 'The colonists were angry.'
    });
    assert.equal(result.metrics.accuracy, 100);
    assert.equal(result.alignment.insertionCount, 1);
    assert.equal(result.alignment.repeats, 0);
    assert.equal(result.alignment.selfCorrections, 1);
});

test('a missing final sound is an ending, not a different word', () => {
    const result = score('The colonist were angry.', {
        text: 'The colonists were angry.'
    });
    assert.equal(result.alignment.statusMap, 'cecc');
    assert.equal(result.alignment.issues[0].heard, 'colonist');
});

test('years are accepted in spoken and long form', () => {
    const referenceText = 'In 1765, Parliament passed the Stamp Act.';
    const spoken = score('In seventeen sixty five Parliament passed the Stamp Act.', {
        text: referenceText
    });
    const long = score('In one thousand seven hundred sixty five Parliament passed the Stamp Act.', {
        text: referenceText
    });
    assert.equal(spoken.metrics.accuracy, 100);
    assert.equal(long.metrics.accuracy, 100);
});

test('a possessive is matched without its marker', () => {
    const result = score('Colonists anger grew.', {
        text: "Colonists' anger grew."
    });
    assert.equal(result.metrics.accuracy, 100);
});

test('em dash and joined compounds are both accepted', () => {
    const referenceText = 'They dumped the cargo—tea—overboard.';
    const split = score('They dumped the cargo tea overboard.', { text: referenceText });
    const joined = score('They dumped the cargoteaoverboard.', { text: referenceText });
    assert.equal(split.metrics.accuracy, 100);
    assert.equal(joined.metrics.accuracy, 100);
});

test('a hyphenated word spoken joined is accepted', () => {
    const result = score('They dumped the wellknown cargo.', {
        text: 'They dumped the well-known cargo.'
    });
    assert.equal(result.metrics.accuracy, 100);
});

test('Roman numerals accept the ordinal and the cardinal reading', () => {
    const referenceText = 'George III sent soldiers.';
    const ordinal = score('George the third sent soldiers.', { text: referenceText });
    const cardinal = score('George three sent soldiers.', { text: referenceText });
    assert.equal(ordinal.metrics.accuracy, 100);
    assert.equal(cardinal.metrics.accuracy, 100);
});

test('dates accept ordinal and cardinal day names', () => {
    const referenceText = 'On July 4, 1776, the colonies declared independence.';
    const ordinal = score('On July fourth seventeen seventy six the colonies declared independence.', {
        text: referenceText
    });
    const cardinal = score('On July four seventeen seventy six the colonies declared independence.', {
        text: referenceText
    });
    assert.equal(ordinal.metrics.accuracy, 100);
    assert.equal(cardinal.metrics.accuracy, 100);
});

test('US and UK spellings are the same word', () => {
    const result = score('The color was gray.', {
        text: 'The colour was grey.'
    });
    assert.equal(result.metrics.accuracy, 100);
});

test('filler words do not become insertions', () => {
    const result = score('The um colonists uh were angry.', {
        text: 'The colonists were angry.'
    });
    assert.equal(result.metrics.accuracy, 100);
    assert.equal(result.alignment.insertionCount, 0);
    assert.equal(result.transcript.words.length, 4);
});

test('silence hallucinations are not heard', () => {
    const result = score('Thank you for watching', { text: PASSAGE });
    assert.equal(result.quality.notHeard, true);
    assert.equal(result.quality.reason, 'hallucination');
});

test('a short read hides pace and still counts as heard', () => {
    const said = firstWords(PASSAGE, 30);
    const result = score('', { timed: timedWords(said) });
    assert.ok(result.metrics.wordsAttempted < 40);
    assert.equal(result.metrics.wpm, null);
    assert.equal(result.metrics.paceHidden, true);
    assert.equal(result.quality.notHeard, false);
});

test('a longer read reports pace', () => {
    const said = firstWords(PASSAGE, 45);
    const result = score('', { timed: timedWords(said) });
    assert.ok(result.metrics.wordsAttempted >= 40);
    assert.ok(result.metrics.wpm > 0);
    assert.equal(result.metrics.paceHidden, false);
});

test('long pauses use different thresholds inside and at the end of a sentence', () => {
    const spoken = timedWords(SHORT_PASSAGE, { pauses: { 4: 2.5, 7: 1.2 } });
    const result = score('', { text: SHORT_PASSAGE, timed: spoken });
    assert.equal(result.metrics.longPauses, 2);
    assert.ok(result.metrics.longestPauseSec > 2.5);
    assert.deepEqual(result.metrics.pauses.map((pause) => pause.after), [3, 6]);
    assert.equal(result.metrics.pauses[0].sentenceEnd, true);
    assert.equal(result.metrics.pauses[1].sentenceEnd, false);
});

test('smoothness stars follow long pauses per hundred words', () => {
    const calm = score('', { text: SHORT_PASSAGE, timed: timedWords(SHORT_PASSAGE) });
    assert.equal(calm.metrics.smoothness, 3);

    const oneSentence = 'The colonists were angry and they refused to pay the tax and they met in Boston and they wrote a letter to the king and they asked for help and they waited for an answer and the king sent soldiers and the soldiers stayed in the city and the people grew more angry and the city grew quiet';
    const even = score('', { text: oneSentence, timed: timedWords(oneSentence) });
    assert.equal(even.metrics.smoothness, 3);
    const hesitant = score('', {
        text: oneSentence,
        timed: timedWords(oneSentence, { pauses: { 30: 1.5 } })
    });
    assert.equal(hesitant.metrics.longPauses, 1);
    assert.equal(hesitant.metrics.smoothness, 2);
});

test('quality guards catch a short recording, low alignment and silence', () => {
    const short = score('The colonists were angry', { text: SHORT_PASSAGE });
    assert.equal(short.quality.reason, 'too_short');

    const unrelated = 'zebra quantum orange purple silver garden window tiger yellow mountain river pencil';
    const lowAlignment = score(unrelated, { timed: timedWords(unrelated) });
    assert.equal(lowAlignment.quality.reason, 'low_alignment');

    const silence = score(PASSAGE, { segments: [{ text: '', no_speech_prob: 0.96 }] });
    assert.equal(silence.quality.reason, 'silence');
});

test('feedback bands, strengths and next steps are deterministic', () => {
    assert.equal(accuracyTier(95), 'strong');
    assert.equal(accuracyTier(92), 'getting');
    assert.equal(accuracyTier(80), 'keep');
    assert.equal(teacherAccuracyBand(96), 'independent');
    assert.equal(teacherAccuracyBand(91), 'instructional');
    assert.equal(teacherAccuracyBand(70), 'needs-support');

    const improved = buildFeedback({
        accuracy: 92,
        completion: 100,
        previous: { accuracy: 86, wpm: 70 },
        targetAccuracy: 95
    });
    assert.equal(improved.strength.key, 'fluency.feedback.strength.improved');
    assert.equal(improved.strength.params.delta, 6);
    assert.equal(improved.nextStep.key, 'fluency.feedback.nextStep.listenThenRead');

    const goal = buildFeedback({
        accuracy: 96,
        completion: 100,
        goalMet: true,
        readings: 3
    });
    assert.equal(goal.strength.key, 'fluency.feedback.strength.goalMet');
    assert.deepEqual(goal.strength.params, { n: 3 });
    assert.equal(goal.nextStep.key, 'fluency.feedback.nextStep.nextPart');

    const words = buildFeedback({
        accuracy: 88,
        completion: 100,
        targetAccuracy: 95,
        focusWords: ['repealed', { word: 'Parliament', misses: 2 }, 'Intolerable']
    });
    assert.equal(words.nextStep.key, 'fluency.feedback.nextStep.practiceWords');
    assert.equal(words.nextStep.params.words, 'repealed, Parliament, Intolerable');
    assert.deepEqual(words.words, ['repealed', 'Parliament', 'Intolerable']);
});

test('feedback keeps pace encouraging and never asks for more speed', () => {
    const result = buildFeedback({
        accuracy: 100,
        completion: 100,
        wpm: 78,
        targetWpm: 90,
        previous: { accuracy: 100, wpm: 74 }
    });
    assert.equal(result.nextStep.key, 'fluency.feedback.nextStep.smoothPace');
    assert.deepEqual(result.nextStep.params, { target: 90 });
});

test('a met goal sends the student on even when this read was slower', () => {
    const result = buildFeedback({
        accuracy: 100,
        completion: 100,
        wpm: 78,
        targetWpm: 90,
        goalMet: true,
        readings: 3
    });
    assert.equal(result.strength.key, 'fluency.feedback.strength.goalMet');
    assert.equal(result.nextStep.key, 'fluency.feedback.nextStep.nextPart');
});
