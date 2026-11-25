/**
 * Pronunciation review queue: a school admin (or a teacher of that grade)
 * listens to each word of a grade and week and either approves the clip or
 * asks for a new one.
 *
 * The clip itself is global - one recording serves every school that has the
 * word - so the verdict is stored on the clip and the queue is only the list
 * of words this school teaches.
 */
import SpellingPronunciation from '../models/SpellingPronunciation.js';
import SpellingWord from '../models/SpellingWord.js';
import { teacherLibraryGrades } from './spellingLibraryAccessService.js';
import { normalizeForGrading } from '../utils/spellingGrading.js';
import { normalizeWordKey } from '../utils/wordAudio.js';
import {
    ACCENTS,
    REVIEW_ATTEMPT_LIMIT,
    keysForWord,
    pronunciationUrl,
    resolveTtsConfig
} from './spellingPronunciationService.js';

export const REVIEW_GRADES = Object.freeze(['KG', 'G1', 'G2', 'G3', 'G4', 'G5']);
export const FLAG_REASONS = Object.freeze(['silent', 'unclear', 'wrong']);

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });

const isTeacher = (role) => role === 'teacher';

const assertAccent = (accent) => {
    const value = String(accent || '').toLowerCase();
    if (!ACCENTS.includes(value)) throw badRequest('accent must be us or uk');
    return value;
};

// One grade-scope calculation for pronunciation review and library editing.
export const teacherReviewGrades = teacherLibraryGrades;

const allowedGradesFor = async ({ schoolId, user, role }) => {
    if (!isTeacher(role)) return [...REVIEW_GRADES];
    return teacherReviewGrades({ schoolId, userId: user?._id });
};

const wordRowsFor = async ({ schoolId, grade, week }) => {
    const rows = await SpellingWord.find({ school: schoolId, grade, week })
        .select('word category order')
        .sort({ order: 1 })
        .lean();
    // The same word can sit in two categories of the same week; the queue shows it once.
    const seen = new Set();
    const words = [];
    for (const row of rows) {
        const key = normalizeWordKey(row.word);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        words.push({ word: row.word, category: row.category || '', order: row.order, key });
    }
    return words;
};

const clipsFor = async (words) => {
    const config = resolveTtsConfig();
    const byKey = new Map();
    for (const word of words) {
        for (const entry of keysForWord(word.key, config)) byKey.set(entry.key, entry);
    }
    const docs = byKey.size
        ? await SpellingPronunciation.find({ key: { $in: [...byKey.keys()] } })
            .select('key publicId accent removedAt reviewedAt reviewedBy reviewAttempts flaggedAt flagReason')
            .lean()
        : [];
    const docByKey = new Map(docs.map((doc) => [doc.key, doc]));
    return { config, docByKey };
};

const accentState = (doc) => {
    if (!doc) {
        return {
            url: null,
            missing: true,
            removed: false,
            reviewed: false,
            reviewedAt: null,
            reviewedBy: null,
            attempts: 0,
            flagged: false,
            flagReason: null,
            canRegenerate: true
        };
    }
    const attempts = Number(doc.reviewAttempts || 0);
    return {
        url: doc.removedAt ? null : pronunciationUrl(doc.publicId),
        missing: false,
        removed: Boolean(doc.removedAt),
        reviewed: Boolean(doc.reviewedAt) && !doc.removedAt,
        reviewedAt: doc.reviewedAt || null,
        reviewedBy: doc.reviewedBy || null,
        attempts,
        flagged: Boolean(doc.flaggedAt),
        flagReason: doc.flagReason || null,
        canRegenerate: attempts < REVIEW_ATTEMPT_LIMIT
    };
};

/**
 * Which grade and week pairs this reviewer can work on, so the page does not
 * offer an empty week or a grade the reviewer may not open.
 */
export const getReviewIndex = async ({ schoolId, user, role }) => {
    const allowedGrades = await allowedGradesFor({ schoolId, user, role });
    if (allowedGrades.length === 0) return { allowedGrades, weeks: [] };
    const rows = await SpellingWord.find({ school: schoolId, grade: { $in: allowedGrades } })
        .select('grade week')
        .lean();
    const counts = new Map();
    for (const row of rows) {
        const key = `${row.grade}|${row.week}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const weeks = [...counts.entries()]
        .map(([key, totalWords]) => {
            const [grade, week] = key.split('|');
            return { grade, week: Number(week), totalWords };
        })
        .sort((a, b) => a.grade.localeCompare(b.grade) || a.week - b.week);
    return { allowedGrades, weeks };
};

/**
 * The queue for one grade and week: every word, both accents, and whether its
 * clip has been reviewed.
 */
export const getReviewQueue = async ({ schoolId, user, role, grade, week, onlyPending = false }) => {
    const normalizedGrade = String(grade || '').trim().toUpperCase();
    const weekNumber = Number(week);
    if (!REVIEW_GRADES.includes(normalizedGrade)) throw badRequest('Choose a valid grade.');
    if (!Number.isInteger(weekNumber) || weekNumber < 1) throw badRequest('Choose a valid week.');

    const allowedGrades = await allowedGradesFor({ schoolId, user, role });
    if (!allowedGrades.includes(normalizedGrade)) {
        throw forbidden('You can only review words for the grades you teach.');
    }

    const words = await wordRowsFor({ schoolId, grade: normalizedGrade, week: weekNumber });
    const { config, docByKey } = await clipsFor(words);

    const entries = words.map((word) => {
        const accents = {};
        for (const entry of keysForWord(word.key, config)) {
            accents[entry.accent] = accentState(docByKey.get(entry.key));
        }
        return {
            word: word.word,
            category: word.category,
            order: word.order,
            accents
        };
    });

    const visible = onlyPending
        ? entries.filter((entry) => !(entry.accents.us?.reviewed && entry.accents.uk?.reviewed))
        : entries;

    const summary = {
        totalWords: entries.length,
        reviewedWords: entries.filter((entry) => entry.accents.us?.reviewed && entry.accents.uk?.reviewed).length,
        pendingWords: entries.filter((entry) => !(entry.accents.us?.reviewed && entry.accents.uk?.reviewed)).length,
        missingClips: entries.filter((entry) => entry.accents.us?.missing || entry.accents.uk?.missing).length,
        flaggedClips: entries.filter((entry) => entry.accents.us?.flagged || entry.accents.uk?.flagged).length,
        removedClips: entries.filter((entry) => entry.accents.us?.removed || entry.accents.uk?.removed).length
    };

    return {
        grade: normalizedGrade,
        week: weekNumber,
        allowedGrades,
        attemptLimit: REVIEW_ATTEMPT_LIMIT,
        words: visible,
        summary
    };
};

const assertSchoolWord = async ({ schoolId, word }) => {
    const key = normalizeWordKey(word);
    if (!key || key.length > 200) throw badRequest('A valid spelling word is required');
    const rows = await SpellingWord.find({ school: schoolId, normalizedWord: normalizeForGrading(word) })
        .select('grade')
        .lean();
    if (rows.length === 0) throw notFound('Spelling word not found in this school');
    return { key, grades: rows.map((row) => row.grade) };
};

/** A teacher may only touch the words of the grades they teach. */
const assertReviewScope = async ({ schoolId, user, role, grades }) => {
    if (!isTeacher(role)) return;
    const allowed = await teacherReviewGrades({ schoolId, userId: user?._id });
    if (!grades.some((grade) => allowed.includes(grade))) {
        throw forbidden('You can only review words for the grades you teach.');
    }
};

const clipDocFor = async ({ word, accent, config }) => {
    const entry = keysForWord(word, config).find((candidate) => candidate.accent === accent);
    const doc = await SpellingPronunciation.findOne({ key: entry.key, removedAt: null })
        .select('key accent reviewedAt reviewedBy reviewAttempts flaggedAt flagReason')
        .lean();
    return { entry, doc };
};

/** Approves one accent's clip. Idempotent: approving twice changes nothing. */
export const markPronunciationReviewed = async ({ schoolId, user, role, word, accent }) => {
    const chosen = assertAccent(accent);
    const { key, grades } = await assertSchoolWord({ schoolId, word });
    await assertReviewScope({ schoolId, user, role, grades });
    const config = resolveTtsConfig();
    const { entry, doc } = await clipDocFor({ word: key, accent: chosen, config });
    if (!doc) throw notFound('There is no active AI clip for this word and accent yet. Generate it first.');

    const reviewedAt = doc.reviewedAt || new Date();
    await SpellingPronunciation.updateOne(
        { key: entry.key },
        {
            $set: {
                reviewedAt,
                reviewedBy: doc.reviewedAt ? doc.reviewedBy || user?._id || null : user?._id || null,
                // An approved clip is not broken, so any earlier report is settled.
                flaggedAt: null,
                flaggedBy: null,
                flagReason: null
            }
        }
    );
    return {
        word: String(word).trim(),
        accent: chosen,
        reviewed: true,
        reviewedAt,
        reviewedBy: doc.reviewedAt ? doc.reviewedBy || user?._id || null : user?._id || null
    };
};

/** Reports a clip as broken. Teachers use this instead of regenerating, which costs credits. */
export const flagPronunciation = async ({ schoolId, user, role, word, accent, reason }) => {
    const chosen = assertAccent(accent);
    const chosenReason = String(reason || '').trim().toLowerCase();
    if (!FLAG_REASONS.includes(chosenReason)) throw badRequest('Choose what is wrong with the clip.');
    const { key, grades } = await assertSchoolWord({ schoolId, word });
    await assertReviewScope({ schoolId, user, role, grades });
    const config = resolveTtsConfig();
    const { entry, doc } = await clipDocFor({ word: key, accent: chosen, config });
    if (!doc) throw notFound('There is no active AI clip for this word and accent yet. Generate it first.');

    const flaggedAt = new Date();
    await SpellingPronunciation.updateOne(
        { key: entry.key },
        { $set: { flaggedAt, flaggedBy: user?._id || null, flagReason: chosenReason } }
    );
    return { word: String(word).trim(), accent: chosen, flagged: true, flagReason: chosenReason, flaggedAt };
};
