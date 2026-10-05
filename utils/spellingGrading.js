export function normalizeForGrading(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/[\p{P}\p{S}]/gu, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export function isCorrect(studentInput, canonicalWord) {
    return normalizeForGrading(studentInput) === normalizeForGrading(canonicalWord);
}

export function evaluateSpellingAnswer({ mode, studentInput, correct, skipped, canonicalWord }) {
    const isSkipped = mode === 'self-serve'
        && skipped === true
        && !String(studentInput ?? '').trim();
    const isAnswerCorrect = !isSkipped && (mode === 'self-serve'
        ? isCorrect(studentInput, canonicalWord)
        : correct === true);

    return {
        correct: isAnswerCorrect,
        skipped: isSkipped,
        countsAsMistake: !isAnswerCorrect && !isSkipped
    };
}
