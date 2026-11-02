/**
 * Turns one alignment into the numbers a student sees: accuracy, completion,
 * pace, pauses and smoothness. Everything here is arithmetic over word times
 * and status codes; nothing asks a model to judge the reader.
 */
import { isHallucinationPhrase } from './normalize.js';

const round = (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
};

const nearestReferenceIndex = (refByHeard, heardIndex, heardCount) => {
    if (refByHeard.has(heardIndex)) return refByHeard.get(heardIndex);
    for (let index = heardIndex - 1; index >= 0; index -= 1) {
        if (refByHeard.has(index)) return refByHeard.get(index);
    }
    for (let index = heardIndex + 1; index < heardCount; index += 1) {
        if (refByHeard.has(index)) return refByHeard.get(index);
    }
    return null;
};

const findPauses = ({ reference, transcript, alignment }) => {
    const words = transcript?.words || [];
    const pauses = [];
    for (let index = 1; index < words.length; index += 1) {
        const previous = words[index - 1];
        const current = words[index];
        if (!Number.isFinite(previous?.end) || !Number.isFinite(current?.start)) continue;
        const gap = current.start - previous.end;
        if (gap <= 0) continue;

        const refIndex = nearestReferenceIndex(alignment.refByHeard, index - 1, words.length);
        const sentenceEnd = refIndex != null && Boolean(reference?.words?.[refIndex]?.sentenceEnd);
        const threshold = sentenceEnd ? 2.0 : 1.0;
        if (gap >= threshold) {
            pauses.push({
                after: refIndex,
                sec: round(gap, 2),
                sentenceEnd
            });
        }
    }
    return pauses;
};

export const smoothnessFor = (longPauses, wordsCorrect) => {
    if (!wordsCorrect) return 3;
    const perHundred = (longPauses / wordsCorrect) * 100;
    if (perHundred <= 1) return 3;
    if (perHundred <= 3) return 2;
    return 1;
};

export const computeMetrics = ({ reference, transcript, alignment }) => {
    const refWordCount = reference?.words?.length || 0;
    const wordsAttempted = Number(alignment?.wordsAttempted) || 0;
    const wordsCorrect = Number(alignment?.wordsCorrect) || 0;
    const completionRatio = refWordCount ? wordsAttempted / refWordCount : 0;
    const accuracyRatio = wordsAttempted ? wordsCorrect / wordsAttempted : 0;

    const timed = (transcript?.words || []).filter(
        (word) => Number.isFinite(word?.start) && Number.isFinite(word?.end)
    );
    const spokenSec = timed.length > 1
        ? round(timed[timed.length - 1].end - timed[0].start, 2)
        : 0;

    const pauses = spokenSec > 0 ? findPauses({ reference, transcript, alignment }) : [];
    const longPauses = pauses.length;
    const longestPauseSec = pauses.reduce((longest, pause) => Math.max(longest, pause.sec), 0);

    const canShowPace = wordsAttempted >= 40 && spokenSec >= 1;
    const wpm = canShowPace ? Math.round(wordsCorrect / (spokenSec / 60)) : null;
    const smoothness = smoothnessFor(longPauses, wordsCorrect);

    return {
        refWordCount,
        wordsAttempted,
        wordsCorrect,
        errors: wordsAttempted - wordsCorrect,
        accuracy: Math.round(accuracyRatio * 100),
        completion: Math.round(completionRatio * 100),
        counted: completionRatio >= 0.8,
        spokenSec,
        wpm,
        paceHidden: !canShowPace,
        longPauses,
        longestPauseSec: round(longestPauseSec, 2),
        pauses,
        smoothness,
        longPausesPer100: wordsCorrect ? round((longPauses / wordsCorrect) * 100, 1) : 0
    };
};

/**
 * Catches silence, noise and the speech model's stock phrases before they can
 * count as a reading. A missed recording is never charged against a part cap.
 */
export const assessRecordingQuality = ({
    transcript,
    reference,
    alignment,
    segments = [],
    minWords = 10,
    minAlignedRatio = 0.25,
    noSpeechThreshold = 0.9
}) => {
    const words = transcript?.words?.length || 0;
    const refWordCount = reference?.words?.length || 0;
    const alignedRatio = refWordCount ? (alignment?.alignedCount || 0) / refWordCount : 0;
    const hallucination = isHallucinationPhrase(transcript?.text);
    const highNoSpeech = (segments || []).some(
        (segment) => Number(segment?.no_speech_prob) >= noSpeechThreshold
    );

    let reason = null;
    if (hallucination) reason = 'hallucination';
    else if (highNoSpeech) reason = 'silence';
    else if (words < minWords) reason = 'too_short';
    else if (alignedRatio < minAlignedRatio) reason = 'low_alignment';

    return {
        notHeard: Boolean(reason),
        reason,
        words,
        alignedRatio: round(alignedRatio, 3),
        hallucination,
        highNoSpeech
    };
};
