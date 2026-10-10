// Pure practice logic for Vocabulary Practice (grading, mastery, ordering). No database access.

export const NEAR_MISS_MESSAGE = 'Almost! This word needs an ending.';
export const PRACTICE_TYPES = ['spelling', 'match', 'fill', 'pos', 'mcq', 'use_it'];
export const MAX_SENTENCE_LENGTH = 500;

export const normalizeAnswer = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizePos = (value) => normalizeAnswer(value).replace(/\./g, '');

// Strict spelling: exact match, case-insensitive. The base word is a near miss unless the list accepts it.
export const gradeSpelling = ({ answer, word, baseWord = '', form = '', acceptBaseForm = false }) => {
    const given = normalizeAnswer(answer);
    const target = normalizeAnswer(word);
    const base = normalizeAnswer(baseWord);
    if (given && given === target) return { correct: true };
    if (given && form && base && given === base) {
        return acceptBaseForm ? { correct: true, acceptedBaseForm: true } : { correct: false, nearMiss: true, message: NEAR_MISS_MESSAGE };
    }
    return { correct: false };
};

/**
 * Grades one answer. Returns { error } for malformed input, otherwise
 * { correct: true|false|null, status, given, choice?, correctAnswer?, nearMiss?, message?, explanation? }.
 * correct === null means "pending teacher review" (never auto-marked).
 */
export const gradeAnswer = ({ type, word, list, mcq, body = {}, chosenWord }) => {
    switch (type) {
    case 'spelling': {
        const result = gradeSpelling({ answer: body.answer, word: word.word, baseWord: word.baseWord, form: word.form, acceptBaseForm: Boolean(list?.acceptBaseForm) });
        return { ...result, status: 'graded', given: String(body.answer ?? '').slice(0, 200), correctAnswer: word.word };
    }
    case 'match': {
        if (!chosenWord) return { error: 'Choose one of the options' };
        return { correct: String(chosenWord._id) === String(word._id), status: 'graded', given: chosenWord.word, correctAnswer: word.word };
    }
    case 'fill': {
        const given = normalizeAnswer(body.answer);
        if (!given) return { error: 'An answer is required' };
        return { correct: given === normalizeAnswer(word.word), status: 'graded', given: given.slice(0, 200), correctAnswer: word.word };
    }
    case 'pos': {
        const given = normalizePos(body.answer);
        if (!['n', 'v', 'adj', 'adv'].includes(given)) return { error: 'Choose a part of speech' };
        return { correct: (word.partOfSpeech || []).includes(given), status: 'graded', given, correctAnswer: (word.partOfSpeech || []).map((entry) => `${entry}.`).join('/') };
    }
    case 'mcq': {
        const choice = String(body.answer ?? '').toUpperCase();
        const option = mcq?.options?.find((entry) => entry.key === choice);
        if (!option) return { error: 'Choose one of the options' };
        const right = mcq.options.find((entry) => entry.key === mcq.correct);
        return { correct: choice === mcq.correct, status: 'graded', given: option.text.slice(0, 200), choice, correctAnswer: right?.text || '', explanation: mcq.explanation || '' };
    }
    case 'use_it': {
        const sentence = String(body.answer ?? '').trim();
        if (!sentence) return { error: 'Write a sentence first' };
        if (sentence.length > MAX_SENTENCE_LENGTH) return { error: `Keep your sentence under ${MAX_SENTENCE_LENGTH} characters` };
        return { correct: null, status: 'pending', given: sentence };
    }
    default:
        return { error: 'Unknown practice type' };
    }
};

// ---- Mastery -------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export const applyAnswer = (mastery, correct, { threshold = 2, inactivityDays = 7, now = new Date() } = {}) => {
    const consecutiveCorrect = correct ? (mastery?.consecutiveCorrect || 0) + 1 : 0;
    const state = consecutiveCorrect >= threshold ? 'mastered' : 'practicing';
    return {
        consecutiveCorrect,
        attempts: (mastery?.attempts || 0) + 1,
        correct: (mastery?.correct || 0) + (correct ? 1 : 0),
        state,
        lastSeen: now,
        nextDue: state === 'mastered' ? new Date(now.getTime() + inactivityDays * DAY_MS) : now
    };
};

// Derived at read time so a changed threshold or inactivity setting applies immediately.
export const effectiveState = (mastery, { threshold = 2, inactivityDays = 7, now = new Date() } = {}) => {
    if (!mastery || !mastery.attempts) return 'not_started';
    if ((mastery.consecutiveCorrect || 0) < threshold) return 'practicing';
    const idleMs = now.getTime() - new Date(mastery.lastSeen).getTime();
    return idleMs > inactivityDays * DAY_MS ? 'needs_review' : 'mastered';
};

const STATE_RANK = { practicing: 0, needs_review: 1, not_started: 2, mastered: 3 };

// Weak words first, then words due for review, then unseen words, then mastered words.
export const orderWords = (words, stateOf) => [...words].sort((a, b) => {
    const rank = STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)];
    if (rank !== 0) return rank;
    if (a.listId !== b.listId) return a.listId < b.listId ? -1 : 1;
    return String(a.word).localeCompare(String(b.word));
});

export const shuffle = (items, random = Math.random) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
};

// An MCQ is available for the selected lists when its scope is ALL or overlaps the selection.
export const mcqInScope = (mcq, listIds) => mcq.scopeAll || mcq.listIds.some((id) => listIds.includes(id));
