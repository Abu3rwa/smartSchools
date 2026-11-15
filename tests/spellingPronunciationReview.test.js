import test from 'node:test';
import assert from 'node:assert/strict';
import AiCreditSetting from '../models/AiCreditSetting.js';
import Class from '../models/Class.js';
import SpellingPronunciation from '../models/SpellingPronunciation.js';
import SpellingWord from '../models/SpellingWord.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import {
    flagPronunciation,
    getReviewIndex,
    getReviewQueue,
    markPronunciationReviewed
} from '../services/spellingPronunciationReviewService.js';
import {
    REVIEW_ATTEMPT_LIMIT,
    keysForWord,
    regenerationUpdate,
    regeneratePronunciation,
    resolveTtsConfig
} from '../services/spellingPronunciationService.js';

const chain = (rows) => {
    const stub = {
        select: () => stub,
        sort: () => stub,
        lean: async () => rows
    };
    return stub;
};

// The queue looks clips up by the hashed key, so the fake clips have to carry
// the same key the service computes.
const clipKey = (word, accent) => {
    const entry = keysForWord(word, resolveTtsConfig()).find((candidate) => candidate.accent === accent);
    return entry.key;
};

const clipDoc = (word, accent, extra = {}) => ({
    key: clipKey(word, accent),
    publicId: 'a'.repeat(32),
    accent,
    removedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewAttempts: 0,
    flaggedAt: null,
    flaggedBy: null,
    flagReason: null,
    ...extra
});

const admin = { _id: 'u-admin', role: 'admin' };
const teacherUser = { _id: 'u-teacher', role: 'teacher' };

const mockWordRows = (t, rows) => {
    t.mock.method(SpellingWord, 'find', (filter = {}) => {
        const gradeFilter = typeof filter.grade === 'object' && filter.grade ? filter.grade.$in : filter.grade;
        const matchesGrade = (row) => {
            if (!gradeFilter) return true;
            if (Array.isArray(gradeFilter)) return gradeFilter.includes(row.grade);
            return row.grade === gradeFilter;
        };
        if (filter.week) return chain(rows.filter((row) => matchesGrade(row) && row.week === filter.week));
        if (filter.normalizedWord) return chain(rows.filter((row) => row.normalizedWord === filter.normalizedWord));
        return chain(rows.filter(matchesGrade));
    });
};

const mockTeacherScope = (t, grades) => {
    t.mock.method(Teacher, 'findOne', () => ({ _id: 't1', school: 's1', user: 'u-teacher' }));
    t.mock.method(Teacher, 'findById', () => chain({ _id: 't1', user: 'u-teacher', assignedClasses: [] }));
    t.mock.method(Class, 'find', () => ({ distinct: async () => ['c1c1c1c1c1c1c1c1c1c1c1c1'] }));
    t.mock.method(TeacherPeriodAssignment, 'find', () => ({ distinct: async () => [] }));
    t.mock.method(Student, 'find', () => chain(grades.map((grade) => ({ spelling: { currentGrade: grade } }))));
};

test('the queue lists the week\'s words with both accents and their review state', async (t) => {
    mockWordRows(t, [
        { word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' },
        { word: 'bridge', grade: 'G3', week: 5, category: 'nouns', order: 2, normalizedWord: 'bridge' },
        { word: 'castle', grade: 'G3', week: 6, category: 'verbs', order: 1, normalizedWord: 'castle' }
    ]);
    t.mock.method(SpellingPronunciation, 'find', () => chain([
        clipDoc('castle', 'us', { reviewedAt: new Date() }),
        clipDoc('castle', 'uk', { reviewAttempts: 1 }),
        clipDoc('bridge', 'us')
    ]));

    const queue = await getReviewQueue({ schoolId: 's1', user: admin, role: 'admin', grade: 'G3', week: 5 });

    assert.equal(queue.grade, 'G3');
    assert.equal(queue.week, 5);
    assert.equal(queue.words.length, 2, 'the same word twice in a week is listed once');
    assert.equal(queue.words[0].word, 'castle');
    assert.equal(queue.words[0].accents.us.reviewed, true);
    assert.equal(queue.words[0].accents.uk.reviewed, false);
    assert.equal(queue.words[0].accents.uk.attempts, 1);
    assert.match(queue.words[0].accents.us.url, /^\/api\/spelling\/pronunciation\//);
    assert.equal(queue.words[1].accents.uk.missing, true, 'a word without a clip says so');
    assert.equal(queue.summary.totalWords, 2);
    assert.equal(queue.summary.reviewedWords, 0);
    assert.equal(queue.summary.missingClips, 1);
});

test('only words that still need review can be filtered out of the queue', async (t) => {
    mockWordRows(t, [
        { word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' },
        { word: 'bridge', grade: 'G3', week: 5, category: 'nouns', order: 2, normalizedWord: 'bridge' }
    ]);
    t.mock.method(SpellingPronunciation, 'find', () => chain([
        clipDoc('castle', 'us', { reviewedAt: new Date() }),
        clipDoc('castle', 'uk', { reviewedAt: new Date() }),
        clipDoc('bridge', 'us')
    ]));

    const queue = await getReviewQueue({ schoolId: 's1', user: admin, role: 'admin', grade: 'G3', week: 5, onlyPending: true });
    assert.equal(queue.words.length, 1);
    assert.equal(queue.words[0].word, 'bridge');
});

test('a teacher only opens the grades their students are placed in', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    mockTeacherScope(t, ['G3']);
    t.mock.method(SpellingPronunciation, 'find', () => chain([]));

    const queue = await getReviewQueue({ schoolId: 's1', user: teacherUser, role: 'teacher', grade: 'G3', week: 5 });
    assert.deepEqual(queue.allowedGrades, ['G3']);
    assert.equal(queue.words.length, 1);

    await assert.rejects(
        () => getReviewQueue({ schoolId: 's1', user: teacherUser, role: 'teacher', grade: 'G2', week: 5 }),
        /grades you teach/
    );
});

test('marking a clip reviewed records it and settles an earlier report', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    let update;
    t.mock.method(SpellingPronunciation, 'findOne', () => chain({
        key: 'us-castle', accent: 'us', reviewedAt: null, reviewedBy: null,
        reviewAttempts: 1, flaggedAt: new Date(), flaggedBy: 'u-other', flagReason: 'silent'
    }));
    t.mock.method(SpellingPronunciation, 'updateOne', async (_filter, mutation) => {
        update = mutation;
        return { acknowledged: true };
    });

    const result = await markPronunciationReviewed({
        schoolId: 's1', user: admin, role: 'admin', word: 'castle', accent: 'us'
    });

    assert.equal(result.reviewed, true);
    assert.ok(result.reviewedAt);
    assert.ok(update.$set.reviewedAt);
    assert.equal(update.$set.reviewedBy, 'u-admin');
    assert.equal(update.$set.flaggedAt, null);
    assert.equal(update.$set.flagReason, null);
});

test('a word with no clip cannot be marked reviewed', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    t.mock.method(SpellingPronunciation, 'findOne', () => chain(null));

    await assert.rejects(
        () => markPronunciationReviewed({ schoolId: 's1', user: admin, role: 'admin', word: 'castle', accent: 'us' }),
        /no active AI clip/
    );
});

test('a teacher cannot review a word outside the grades they teach', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G2', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    mockTeacherScope(t, ['G3']);
    t.mock.method(SpellingPronunciation, 'findOne', () => chain({ key: 'us-castle', accent: 'us', reviewedAt: null }));

    await assert.rejects(
        () => markPronunciationReviewed({ schoolId: 's1', user: teacherUser, role: 'teacher', word: 'castle', accent: 'us' }),
        /grades you teach/
    );
});

test('a report needs a known reason', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    t.mock.method(SpellingPronunciation, 'findOne', () => chain({ key: 'us-castle', accent: 'us' }));

    await assert.rejects(
        () => flagPronunciation({ schoolId: 's1', user: admin, role: 'admin', word: 'castle', accent: 'us', reason: 'loud' }),
        /what is wrong/
    );
});

test('a report is stored on the clip so an admin can act on it', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    mockTeacherScope(t, ['G3']);
    let update;
    t.mock.method(SpellingPronunciation, 'findOne', () => chain({ key: 'us-castle', accent: 'us', reviewedAt: null }));
    t.mock.method(SpellingPronunciation, 'updateOne', async (_filter, mutation) => {
        update = mutation;
        return { acknowledged: true };
    });

    const result = await flagPronunciation({
        schoolId: 's1', user: teacherUser, role: 'teacher', word: 'castle', accent: 'us', reason: 'unclear'
    });

    assert.equal(result.flagged, true);
    assert.equal(result.flagReason, 'unclear');
    assert.equal(update.$set.flagReason, 'unclear');
    assert.equal(update.$set.flaggedBy, 'u-teacher');
});

test('the index lists the grade and week pairs that have words', async (t) => {
    mockWordRows(t, [
        { word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' },
        { word: 'bridge', grade: 'G3', week: 5, category: 'nouns', order: 2, normalizedWord: 'bridge' },
        { word: 'stone', grade: 'G4', week: 1, category: 'nouns', order: 1, normalizedWord: 'stone' }
    ]);

    const index = await getReviewIndex({ schoolId: 's1', user: admin, role: 'admin' });
    assert.deepEqual(index.weeks, [
        { grade: 'G3', week: 5, totalWords: 2 },
        { grade: 'G4', week: 1, totalWords: 1 }
    ]);
});

test('a teacher with no placed students gets an empty index', async (t) => {
    mockWordRows(t, []);
    mockTeacherScope(t, []);

    const index = await getReviewIndex({ schoolId: 's1', user: teacherUser, role: 'teacher' });
    assert.deepEqual(index.allowedGrades, []);
    assert.deepEqual(index.weeks, []);
});

test('a clip stops being regenerated once it has failed too many times', async (t) => {
    mockWordRows(t, [{ word: 'castle', grade: 'G3', week: 5, category: 'verbs', order: 1, normalizedWord: 'castle' }]);
    t.mock.method(AiCreditSetting, 'findOne', () => chain({ spellingAudio: { enabled: true } }));
    t.mock.method(SpellingWord, 'exists', async () => ({ _id: 'w1' }));
    t.mock.method(SpellingPronunciation, 'findOne', () => chain({ reviewAttempts: REVIEW_ATTEMPT_LIMIT }));

    await assert.rejects(
        () => regeneratePronunciation({ schoolId: 's1', userId: 'u-admin', word: 'castle', accent: 'us' }),
        (error) => {
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, 'SPELLING_PRONUNCIATION_ATTEMPT_LIMIT');
            return true;
        }
    );
});

test('a regenerated clip starts unreviewed and counts the attempt', () => {
    const update = regenerationUpdate({
        word: 'castle',
        entry: { key: 'us-castle', accent: 'us', voice: 'alloy', instructions: 'Say it.' },
        config: { model: 'gpt-4o-mini-tts' },
        speech: { contentType: 'audio/mpeg', buffer: Buffer.from([0xff, 0xf3]) },
        seconds: 1,
        attempts: 1
    });

    assert.equal(update.$set.reviewedAt, null);
    assert.equal(update.$set.reviewedBy, null);
    assert.equal(update.$set.flaggedAt, null);
    assert.equal(update.$set.flagReason, null);
    assert.equal(update.$set.reviewAttempts, 2);
    assert.equal(update.$set.removedAt, null);
    assert.ok(update.$set.publicId);
});
