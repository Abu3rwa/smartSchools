export function normalizeForGrading(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export function isCorrect(studentInput, canonicalWord) {
    return normalizeForGrading(studentInput) === normalizeForGrading(canonicalWord);
}
