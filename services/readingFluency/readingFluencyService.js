/**
 * Reading-aloud practice: guards, transcription, scoring, progress and billing.
 *
 * The recording lives only in this function's buffer. Nothing here writes it to
 * disk or keeps it on the attempt; only the transcript and the word-level marks
 * survive.
 */
import ReadingAssignment from '../../models/ReadingAssignment.js';
import ReadingFluencyAttempt from '../../models/ReadingFluencyAttempt.js';
import ReadingFluencyProgress from '../../models/ReadingFluencyProgress.js';
import ReadingModelAudio from '../../models/ReadingModelAudio.js';
import SimplifiedText from '../../models/SimplifiedText.js';
import StudentReadingProfile from '../../models/StudentReadingProfile.js';
import { getSimplifiedForStudent } from '../readingAssistantService.js';
import { transcribeWithWordTimes } from '../voiceSpeech.js';
import { assertHasCredit, chargeUsage, roundCents } from '../aiCreditService.js';
import { audioCentsPerMinute } from '../../config/aiPricing.js';
import {
    DEFAULT_SCHOOL_TIMEZONE,
    getSchoolDayRange,
    resolveTimeZone
} from '../../utils/schoolTimezone.js';
import { withTransaction } from '../../utils/withTransaction.js';
import { assertObjectId } from '../../utils/assertObjectId.js';
import logger from '../../utils/logger.js';
import { buildReadingLevels, findLevelIndex, readingBlocksFor, readingTextHash } from '../../utils/readingBlocks.js';
import { isAssignmentLocked, readingLockedError } from '../readingGate/publish.js';
import { normalizeReference, normalizeTranscript } from './normalize.js';
import { alignReferenceToTranscript } from './align.js';
import { assessRecordingQuality, computeMetrics, smoothnessFor } from './metrics.js';
import { buildFeedback } from './feedback.js';
import {
    isEnglishLanguage,
    mergeFluencySettings,
    mergeSettingsPatch,
    partByKey
} from './settings.js';
import { fluencyPartsForText } from './parts.js';

export const DAILY_ATTEMPT_LIMIT = 20;
export const MAX_RECORDING_SEC = 240;
// A background tab throttles the client's auto-stop timer, so it can overshoot.
export const RECORDING_SLACK_SEC = 15;
export const FLUENCY_CONSENT_VERSION = 1;
const STT_MODEL = 'whisper-1';
const MAX_TRANSCRIPT = 6000;
const MAX_ATTEMPT_RETRIES = 3;

// In-process dedupe and cap reservations. They only help within this instance;
// the unique indexes and the in-transaction re-checks cover other servers.
const inFlight = new Map();
const reserved = { daily: new Map(), part: new Map() };

const isAttemptNumberDuplicate = (error) => Number(error?.code) === 11000
    && (error?.keyPattern?.attemptNumber !== undefined
        || error?.keyValue?.attemptNumber !== undefined);

const isTransientTransaction = (error) => Array.isArray(error?.errorLabels)
    && error.errorLabels.includes('TransientTransactionError');

const fail = (message, statusCode, code) => Object.assign(new Error(message), {
    statusCode,
    code
});

const textIdOf = (assignment) => String(assignment?.text?._id || assignment?.text || '');

const loadAssignment = async ({
    schoolId,
    studentId,
    assignmentId,
    academicYear,
    allowInactive = false
}) => {
    const query = { _id: assignmentId, school: schoolId, students: studentId };
    if (!allowInactive) query.isActive = true;
    if (academicYear) query.academicYear = academicYear;

    const assignment = await ReadingAssignment.findOne(query)
        .populate('text', 'title language subjectArea originalComplexity')
        .lean();
    if (!assignment) {
        throw fail('This reading practice is not available.', 404, 'FLUENCY_ASSIGNMENT_NOT_FOUND');
    }
    if (!assignment.text) {
        throw fail('The reading for this practice is no longer available.', 409, 'FLUENCY_TEXT_NOT_FOUND');
    }
    if (isAssignmentLocked(assignment)) throw readingLockedError();
    return assignment;
};

const readingContentFor = async ({ assignment, studentId, schoolId, academicYear }) => {
    try {
        return await getSimplifiedForStudent(
            textIdOf(assignment),
            studentId,
            schoolId,
            academicYear,
            { requireAssignment: false, includeVocabulary: false }
        );
    } catch (error) {
        if (error?.statusCode) throw error;
        throw fail('The reading for this practice is no longer available.', 404, 'FLUENCY_TEXT_NOT_FOUND');
    }
};

const referenceForPart = ({ levels, content, part, blockKey, requestedLevel }) => {
    let levelIndex;
    if (part.level !== null && part.level !== undefined) {
        levelIndex = levels.findIndex((level) => level.targetLevel === part.level);
    } else {
        levelIndex = findLevelIndex(levels, content.targetLevel);
    }
    const level = levels[levelIndex];
    if (!level) {
        throw fail('That part is no longer in this reading.', 409, 'FLUENCY_PART_MISSING');
    }

    const wantsLevel = requestedLevel !== null
        && requestedLevel !== undefined
        && requestedLevel !== ''
        && requestedLevel !== 'null';
    if (wantsLevel && Number(requestedLevel) !== Number(level.targetLevel)) {
        throw fail(
            'This reading changed while you were practising. Reload the page and try again.',
            409,
            'FLUENCY_LEVEL_MISMATCH'
        );
    }

    const block = readingBlocksFor(level).find((item) => item.key === blockKey);
    if (!block || !String(block.text || '').trim()) {
        throw fail('That part is no longer in this reading.', 409, 'FLUENCY_PART_MISSING');
    }

    const reference = normalizeReference(block.text);
    if (!reference.wordCount) {
        throw fail('That part has no words to read.', 409, 'FLUENCY_PART_EMPTY');
    }

    return {
        level,
        block,
        reference,
        textHash: readingTextHash({
            targetLevel: level.targetLevel,
            blockKey,
            text: block.text
        })
    };
};

const settingsFor = (assignment) => {
    const settings = mergeFluencySettings(assignment.fluency);
    if (!settings.enabled) {
        throw fail('Reading aloud is not turned on for this reading.', 409, 'FLUENCY_DISABLED');
    }
    if (!isEnglishLanguage(assignment.text?.language)) {
        throw fail('Reading aloud practice is only available for English readings.', 409, 'FLUENCY_ENGLISH_ONLY');
    }
    return settings;
};

const emptyPair = () => ({ accuracy: null, wpm: null });

const shapeProgress = (row) => ({
    listens: Number(row?.listens) || 0,
    readings: Number(row?.readings) || 0,
    attempts: Number(row?.attempts) || 0,
    first: {
        accuracy: row?.first?.accuracy ?? null,
        wpm: row?.first?.wpm ?? null
    },
    best: {
        accuracy: row?.best?.accuracy ?? null,
        wpm: row?.best?.wpm ?? null
    },
    bestWpm: row?.bestWpm ?? null,
    latest: {
        accuracy: row?.latest?.accuracy ?? null,
        wpm: row?.latest?.wpm ?? null,
        at: row?.latest?.at || null
    },
    goalMet: Boolean(row?.goalMet),
    focusWords: (row?.focusWords || []).map((item) => ({
        word: item.word,
        misses: Number(item.misses) || 1
    }))
});

const publicSettings = (settings) => ({
    minReadings: settings.minReadings,
    maxReadingsPerPart: settings.maxReadingsPerPart,
    targetAccuracy: settings.targetAccuracy,
    targetWpm: settings.targetWpm,
    showPace: settings.showPace,
    requireListenFirst: settings.requireListenFirst
});

const modelAudioFields = (audio) => ({
    modelAudio: Boolean(audio),
    modelAudioHash: audio?.textHash || '',
    wordTimes: Array.isArray(audio?.wordTimes) ? audio.wordTimes : [],
    modelAudioSeconds: Number(audio?.speechSeconds) || 0
});

/**
 * A text with no simplified versions gets a level label from the student's
 * profile, while the teacher's model voice is generated with no label. Match
 * on the block's exact text instead, so the generated clip is not missed.
 */
export const findPartAudio = ({ audioRows, partKey, level, textHash, text }) => {
    const exact = audioRows.find((row) => row.blockKey === partKey
        && (row.level ?? null) === (level ?? null)
        && row.textHash === textHash);
    if (exact) return exact;
    return audioRows.find((row) => row.blockKey === partKey
        && readingTextHash({
            targetLevel: row.level ?? null,
            blockKey: partKey,
            text
        }) === row.textHash) || null;
};

const publicAttempt = (attempt, settings) => ({
    id: String(attempt._id || ''),
    blockKey: String(attempt.blockKey || ''),
    attemptNumber: Number(attempt.attemptNumber) || 1,
    status: attempt.status,
    notHeardReason: attempt.notHeardReason || null,
    counted: Boolean(attempt.counted),
    accuracy: Number(attempt.accuracy) || 0,
    completion: Number(attempt.completion) || 0,
    wpm: settings.showPace ? (attempt.wpm ?? null) : null,
    paceHidden: !settings.showPace || attempt.wpm === null || attempt.wpm === undefined,
    wordsAttempted: Number(attempt.wordsAttempted) || 0,
    wordsCorrect: Number(attempt.wordsCorrect) || 0,
    errors: Number(attempt.errors) || 0,
    selfCorrections: Number(attempt.selfCorrections) || 0,
    longPauses: Number(attempt.longPauses) || 0,
    longestPauseSec: Number(attempt.longestPauseSec) || 0,
    smoothness: smoothnessFor(Number(attempt.longPauses) || 0, Number(attempt.wordsCorrect) || 0),
    statusMap: String(attempt.statusMap || ''),
    issues: (attempt.issues || []).map((issue) => ({
        i: Number(issue.i),
        heard: String(issue.heard || '')
    })),
    pauseCount: Array.isArray(attempt.pauses) ? attempt.pauses.length : 0,
    recordedSec: Number(attempt.recordedSec) || 0,
    spokenSec: Number(attempt.spokenSec) || 0,
    createdAt: attempt.createdAt || null
});

const feedbackFor = ({ attempt, progress, settings, previous }) => {
    if (attempt.status !== 'scored') return null;
    return buildFeedback({
        accuracy: attempt.accuracy,
        completion: attempt.completion,
        wpm: attempt.wpm,
        targetAccuracy: settings.targetAccuracy,
        targetWpm: settings.targetWpm,
        previous,
        focusWords: progress?.focusWords,
        goalMet: Boolean(progress?.goalMet),
        readings: progress?.readings || 0,
        selfCorrections: attempt.selfCorrections || 0
    });
};

const shapeResult = ({ attempt, progress, settings, previous = null }) => ({
    attempt: publicAttempt(attempt, settings),
    progress: shapeProgress(progress),
    settings: publicSettings(settings),
    feedback: feedbackFor({ attempt, progress, settings, previous }),
    goalMet: Boolean(progress?.goalMet)
});

const replayAttempt = async ({
    existing,
    schoolId,
    studentId,
    assignmentId,
    academicYear,
    credit = { assertHasCredit, chargeUsage }
}) => {
    const assignment = await loadAssignment({
        schoolId,
        studentId,
        assignmentId,
        academicYear,
        allowInactive: true
    });
    const settings = mergeFluencySettings(assignment.fluency);
    const progress = await ReadingFluencyProgress.findOne({
        school: schoolId,
        student: studentId,
        assignment: assignmentId,
        blockKey: existing.blockKey
    }).lean();

    // The Whisper cost was already incurred; recover it once if the first charge missed.
    if (existing.chargeFailed) {
        const seconds = Number(existing.recordedSec) || 0;
        let charge = null;
        try {
            charge = await credit.chargeUsage(chargePayload({
                schoolId,
                userId: assignment.assignedBy,
                seconds,
                status: existing.status,
                assignmentId: assignment._id,
                studentId,
                assignmentTitle: assignment.text?.title || '',
                sttModel: existing.sttModel
            }));
        } catch (error) {
            logger.error('reading_fluency_replay_charge_failed', {
                attemptId: String(existing._id),
                error: error?.message
            });
        }
        if (charge && charge.charged !== false && !charge.error) {
            const costCents = charge.chargedCents !== undefined ? charge.chargedCents : 0;
            await ReadingFluencyAttempt.updateOne(
                { _id: existing._id },
                { $set: { chargeFailed: false, costCents } }
            ).catch(() => {});
            existing.chargeFailed = false;
        }
    }

    return shapeResult({ attempt: existing, progress, settings });
};

const rememberFocusWords = ({ prior = [], reference, issues = [], status }) => {
    if (status !== 'scored') return prior.slice(0, 8);
    const current = [];
    for (const issue of issues) {
        const word = reference.words?.[issue.i]?.display;
        if (word) current.push(word);
    }
    const currentSet = new Set(current);
    const counts = new Map(prior.map((item) => [item.word, Number(item.misses) || 1]));
    for (const word of current) {
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((left, right) => {
            const leftCurrent = currentSet.has(left[0]) ? 1 : 0;
            const rightCurrent = currentSet.has(right[0]) ? 1 : 0;
            return rightCurrent - leftCurrent || right[1] - left[1];
        })
        .slice(0, 8)
        .map(([word, misses]) => ({ word, misses }));
};

const progressUpdate = ({ prior, settings, status, metrics, reference, alignment, now }) => {
    const scored = status === 'scored';
    const counted = scored && Boolean(metrics?.counted);
    const readings = (Number(prior?.readings) || 0) + (counted ? 1 : 0);

    const first = prior?.first?.accuracy !== null && prior?.first?.accuracy !== undefined
        ? prior.first
        : (scored ? { accuracy: metrics.accuracy, wpm: metrics.wpm } : emptyPair());

    const priorBest = Number(prior?.best?.accuracy);
    const best = scored && (!Number.isFinite(priorBest) || metrics.accuracy > priorBest)
        ? { accuracy: metrics.accuracy, wpm: metrics.wpm }
        : (prior?.best || emptyPair());

    const latest = scored
        ? { accuracy: metrics.accuracy, wpm: metrics.wpm, at: now }
        : (prior?.latest || { accuracy: null, wpm: null, at: null });

    const bestAccuracy = Number(best?.accuracy);
    const priorBestWpm = Number(prior?.bestWpm);
    const pace = counted ? Number(metrics?.wpm) : NaN;
    const bestWpm = Number.isFinite(pace)
        ? (Number.isFinite(priorBestWpm) ? Math.max(priorBestWpm, pace) : pace)
        : (Number.isFinite(priorBestWpm) ? priorBestWpm : null);

    const paceTarget = Number(settings.targetWpm) > 0 ? Number(settings.targetWpm) : null;
    const paceMet = paceTarget === null || Number(bestWpm) >= paceTarget;
    // A missed recording must not take away a goal the student already met.
    const goalMet = scored
        ? (
            readings >= settings.minReadings
            && Number.isFinite(bestAccuracy)
            && bestAccuracy >= settings.targetAccuracy
            && paceMet
        )
        : Boolean(prior?.goalMet);

    return {
        update: {
            $inc: { attempts: 1, readings: counted ? 1 : 0 },
            $set: {
                first,
                best,
                bestWpm,
                latest,
                goalMet,
                focusWords: rememberFocusWords({
                    prior: prior?.focusWords || [],
                    reference,
                    issues: alignment?.issues || [],
                    status
                })
            },
            $setOnInsert: {}
        },
        readings,
        goalMet
    };
};

const whisperCostCents = (seconds) => {
    const rate = audioCentsPerMinute(STT_MODEL);
    const minutes = Math.max(0, Number(seconds) || 0) / 60;
    return roundCents(minutes * (Number.isFinite(rate) ? rate : 0));
};

const attemptPayload = ({
    schoolId,
    studentId,
    assignment,
    blockKey,
    level,
    textHash,
    reference,
    attemptNumber,
    status,
    notHeardReason,
    recordedSec,
    metrics,
    alignment,
    heard,
    idempotencyKey
}) => ({
    school: schoolId,
    student: studentId,
    assignment: assignment._id,
    text: textIdOf(assignment),
    blockKey,
    level: level.targetLevel ?? null,
    textHash,
    refWordCount: reference.wordCount,
    attemptNumber,
    status,
    notHeardReason: status === 'not_heard' ? notHeardReason : null,
    counted: Boolean(metrics?.counted),
    recordedSec: Math.min(MAX_RECORDING_SEC, Math.max(0, Number(recordedSec) || 0)),
    spokenSec: Number(metrics?.spokenSec) || 0,
    wordsAttempted: Number(metrics?.wordsAttempted) || 0,
    wordsCorrect: Number(metrics?.wordsCorrect) || 0,
    errors: Number(metrics?.errors) || 0,
    insertions: Number(alignment?.insertionCount) || 0,
    selfCorrections: Number(alignment?.selfCorrections) || 0,
    accuracy: Number(metrics?.accuracy) || 0,
    completion: Number(metrics?.completion) || 0,
    wpm: metrics?.wpm ?? null,
    longPauses: Number(metrics?.longPauses) || 0,
    longestPauseSec: Number(metrics?.longestPauseSec) || 0,
    statusMap: String(alignment?.statusMap || ''),
    issues: (alignment?.issues || []).slice(0, 500).map((issue) => ({
        i: issue.i,
        heard: String(issue.heard || '').slice(0, 200)
    })),
    pauses: (metrics?.pauses || []).slice(0, 100).map((pause) => ({
        after: pause.after,
        sec: pause.sec
    })),
    transcript: String(heard?.text || '').slice(0, MAX_TRANSCRIPT),
    sttModel: heard?.model || STT_MODEL,
    idempotencyKey
});

// A transcript far longer than the passage makes alignment O(R x C) blow up.
export const truncateTranscript = (transcript, reference) => {
    const limit = (Number(reference?.wordCount) || 0) * 3 + 50;
    const words = transcript?.words || [];
    if (words.length <= limit) return transcript;
    return { ...transcript, words: words.slice(0, limit) };
};

const chargePayload = ({
    schoolId,
    userId,
    seconds,
    status,
    assignmentId,
    studentId,
    assignmentTitle,
    sttModel
}) => ({
    schoolId,
    userId,
    reply: {
        modelName: sttModel || STT_MODEL,
        inputtokenCount: 0,
        cachedInputtokenCount: 0,
        outputtokenCount: 0,
        totalTokenCount: 0
    },
    rates: {
        model: sttModel || STT_MODEL,
        inputPerMillionCents: 0,
        cachedInputPerMillionCents: 0,
        outputPerMillionCents: 0
    },
    extraCostCents: whisperCostCents(seconds),
    feature: 'reading-fluency',
    outcome: status,
    refs: {
        assignment: assignmentId,
        student: studentId,
        assignmentTitle: assignmentTitle || ''
    },
    audio: {
        transcriptSeconds: seconds,
        speechSeconds: 0,
        sttModel: sttModel || STT_MODEL,
        ttsModel: ''
    }
});

/* ------------------------------------------------------------------ */
/* Consent                                                             */
/* ------------------------------------------------------------------ */

const hasConsent = (profile) => Boolean(
    profile?.micConsent?.acceptedAt
    && Number(profile.micConsent.version) >= FLUENCY_CONSENT_VERSION
);

const consentPayload = (profile) => ({
    accepted: hasConsent(profile),
    version: FLUENCY_CONSENT_VERSION,
    acceptedAt: profile?.micConsent?.acceptedAt || null
});

export async function recordConsent({ schoolId, studentId }) {
    const existing = await StudentReadingProfile.findOne({
        school: schoolId,
        student: studentId
    }).select('micConsent').lean();
    if (hasConsent(existing)) return consentPayload(existing);

    try {
        // Only the first acceptance is kept, so the recorded date stays honest.
        const profile = await StudentReadingProfile.findOneAndUpdate(
            {
                school: schoolId,
                student: studentId,
                $or: [
                    { 'micConsent.acceptedAt': { $exists: false } },
                    { 'micConsent.acceptedAt': null },
                    { 'micConsent.version': { $lt: FLUENCY_CONSENT_VERSION } }
                ]
            },
            {
                $set: {
                    'micConsent.acceptedAt': new Date(),
                    'micConsent.version': FLUENCY_CONSENT_VERSION
                },
                $setOnInsert: { school: schoolId, student: studentId }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        return consentPayload(profile);
    } catch (error) {
        // A concurrent first acceptance already stored the row.
        if (error?.code !== 11000) throw error;
        const current = await StudentReadingProfile.findOne({
            school: schoolId,
            student: studentId
        }).select('micConsent').lean();
        return consentPayload(current);
    }
}

/* ------------------------------------------------------------------ */
/* Student view                                                        */
/* ------------------------------------------------------------------ */

export async function getStudentAssignmentView({
    schoolId,
    studentId,
    assignmentId,
    academicYear = null,
    timeZone = DEFAULT_SCHOOL_TIMEZONE
}) {
    const assignment = await loadAssignment({ schoolId, studentId, assignmentId, academicYear });
    const settings = settingsFor(assignment);
    const content = await readingContentFor({ assignment, studentId, schoolId, academicYear });
    const levels = buildReadingLevels(content);

    const partKeys = settings.parts.map((part) => part.key);
    const [progressRows, attemptRows, audioRows, profile] = await Promise.all([
        ReadingFluencyProgress.find({
            school: schoolId,
            student: studentId,
            assignment: assignmentId,
            blockKey: { $in: partKeys }
        }).lean(),
        ReadingFluencyAttempt.find({
            school: schoolId,
            student: studentId,
            assignment: assignmentId,
            blockKey: { $in: partKeys }
        }).select('blockKey status').lean(),
        ReadingModelAudio.find({
            school: schoolId,
            text: textIdOf(assignment),
            blockKey: { $in: partKeys }
        }).select('blockKey level textHash wordTimes speechSeconds').lean(),
        StudentReadingProfile.findOne({
            school: schoolId,
            student: studentId
        }).select('micConsent').lean()
    ]);

    const progressByKey = new Map(progressRows.map((row) => [row.blockKey, row]));
    const scoredByKey = new Map();
    for (const row of attemptRows) {
        if (row.status !== 'scored') continue;
        scoredByKey.set(row.blockKey, (scoredByKey.get(row.blockKey) || 0) + 1);
    }
    const audioByKey = new Map(
        audioRows.map((row) => [`${row.blockKey}|${row.level ?? ''}|${row.textHash}`, row])
    );
    const audioForPart = (partKey, level, textHash, text) => (
        audioByKey.get(`${partKey}|${level ?? ''}|${textHash}`)
        || findPartAudio({ audioRows, partKey, level, textHash, text })
    );

    const zone = resolveTimeZone(timeZone) || DEFAULT_SCHOOL_TIMEZONE;
    const day = getSchoolDayRange(new Date(), zone);
    const todayAttempts = await ReadingFluencyAttempt.countDocuments({
        school: schoolId,
        student: studentId,
        createdAt: { $gte: day.start, $lte: day.end }
    });
    const dailyOpen = todayAttempts < DAILY_ATTEMPT_LIMIT;

    const parts = settings.parts.map((part) => {
        const progress = progressByKey.get(part.key);
        const scored = scoredByKey.get(part.key) || 0;
        const remaining = Math.max(0, settings.maxReadingsPerPart - scored);
        try {
            const resolved = referenceForPart({
                levels,
                content,
                part,
                blockKey: part.key,
                requestedLevel: null
            });
            return {
                key: part.key,
                available: true,
                level: resolved.level.targetLevel ?? null,
                title: resolved.block.title || '',
                text: resolved.block.text,
                wordCount: resolved.reference.wordCount,
                estimatedSeconds: Math.max(10, Math.round(resolved.reference.wordCount / 2.2)),
                vocabulary: resolved.level.vocabularySubstitutions || [],
                textHash: resolved.textHash,
                ...modelAudioFields(audioForPart(
                    part.key,
                    resolved.level.targetLevel,
                    resolved.textHash,
                    resolved.block.text
                )),
                progress: shapeProgress(progress),
                remaining,
                canRecord: dailyOpen && remaining > 0
            };
        } catch {
            return {
                key: part.key,
                available: false,
                level: part.level ?? null,
                title: '',
                text: '',
                wordCount: 0,
                estimatedSeconds: 0,
                vocabulary: [],
                textHash: '',
                modelAudio: false,
                modelAudioHash: '',
                wordTimes: [],
                modelAudioSeconds: 0,
                progress: shapeProgress(progress),
                remaining,
                canRecord: false
            };
        }
    });

    const totals = parts.reduce((sum, part) => ({
        readings: sum.readings + part.progress.readings,
        partsDone: sum.partsDone + (part.progress.readings >= settings.minReadings ? 1 : 0)
    }), { readings: 0, partsDone: 0 });

    return {
        assignment: {
            id: String(assignment._id),
            textId: textIdOf(assignment),
            title: assignment.text?.title || content.text?.title || '',
            instructions: assignment.instructions || '',
            dueDate: assignment.dueDate || null,
            academicYear: assignment.academicYear || null,
            ...publicSettings(settings),
            partsTotal: parts.length,
            partsDone: totals.partsDone,
            readings: totals.readings,
            allPartsDone: parts.length > 0 && totals.partsDone === parts.length
        },
        parts,
        daily: { used: todayAttempts, limit: DAILY_ATTEMPT_LIMIT },
        consent: consentPayload(profile),
        canRecord: dailyOpen && parts.some((part) => part.canRecord)
    };
}

export const LISTEN_DEDUPE_MS = 20 * 1000;

export async function recordListen({
    schoolId,
    studentId,
    assignmentId,
    blockKey,
    academicYear = null
}) {
    const assignment = await loadAssignment({ schoolId, studentId, assignmentId, academicYear });
    const settings = settingsFor(assignment);
    if (!partByKey(settings, blockKey)) {
        throw fail('That part is not part of this reading practice.', 409, 'FLUENCY_PART_NOT_ENABLED');
    }

    const now = new Date();
    const identity = { school: schoolId, student: studentId, assignment: assignmentId, blockKey };
    try {
        // The filter does the throttling, so two concurrent calls cannot both count.
        const progress = await ReadingFluencyProgress.findOneAndUpdate(
            {
                ...identity,
                $or: [
                    { lastListenAt: { $exists: false } },
                    { lastListenAt: null },
                    { lastListenAt: { $lte: new Date(now.getTime() - LISTEN_DEDUPE_MS) } }
                ]
            },
            {
                $inc: { listens: 1 },
                $set: { lastListenAt: now },
                $setOnInsert: identity
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        return {
            blockKey,
            listens: Number(progress?.listens) || 0,
            counted: true
        };
    } catch (error) {
        // The filter missed because the row is too recent, so the upsert collided.
        if (error?.code !== 11000) throw error;
        const current = await ReadingFluencyProgress.findOne(identity)
            .select('listens')
            .lean();
        return {
            blockKey,
            listens: Number(current?.listens) || 0,
            counted: false
        };
    }
}

/* ------------------------------------------------------------------ */
/* Attempt                                                             */
/* ------------------------------------------------------------------ */

export async function scoreAttempt({
    schoolId,
    studentId,
    assignmentId,
    blockKey,
    level = null,
    recordedSec = 0,
    idempotencyKey,
    buffer,
    mimeType = 'audio/webm',
    academicYear = null,
    timeZone = DEFAULT_SCHOOL_TIMEZONE
}, deps = {}) {
    const transcribe = deps.transcribe || transcribeWithWordTimes;
    const runTransaction = deps.runTransaction || withTransaction;
    const credit = deps.credit || { assertHasCredit, chargeUsage };

    const key = String(idempotencyKey || '').trim();
    if (!key) {
        throw fail('A recording needs an idempotency key.', 400, 'FLUENCY_IDEMPOTENCY_REQUIRED');
    }
    if (key.length > 120) {
        throw fail('The idempotency key is too long.', 400, 'FLUENCY_IDEMPOTENCY_INVALID');
    }
    const partKey = String(blockKey || '').trim();
    if (!partKey || partKey.length > 120) {
        throw fail('Choose a part to read.', 400, 'FLUENCY_PART_REQUIRED');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw fail('Record a reading first.', 400, 'FLUENCY_AUDIO_REQUIRED');
    }
    const seconds = Number(recordedSec) || 0;
    if (seconds > MAX_RECORDING_SEC + RECORDING_SLACK_SEC) {
        throw fail(
            `Keep a recording under ${MAX_RECORDING_SEC / 60} minutes.`,
            422,
            'FLUENCY_RECORDING_TOO_LONG'
        );
    }
    assertObjectId(assignmentId, 'assignment');
    assertObjectId(studentId, 'student');

    // Two identical requests in flight share one run so Whisper is paid once.
    const flightKey = `${String(schoolId)}:${key}`;
    const running = inFlight.get(flightKey);
    if (running) {
        if (
            running.student !== String(studentId)
            || running.assignment !== String(assignmentId)
            || running.blockKey !== partKey
        ) {
            throw fail('That recording key is already in use.', 409, 'FLUENCY_IDEMPOTENCY_CONFLICT');
        }
        return running.promise;
    }

    const run = async () => {
        const existing = await ReadingFluencyAttempt.findOne({
            school: schoolId,
            idempotencyKey: key
        }).lean();
        if (existing) {
            if (
                String(existing.student) !== String(studentId)
                || String(existing.assignment) !== String(assignmentId)
                || existing.blockKey !== partKey
            ) {
                throw fail('That recording key is already in use.', 409, 'FLUENCY_IDEMPOTENCY_CONFLICT');
            }
            return replayAttempt({ existing, schoolId, studentId, assignmentId, academicYear, credit });
        }

        const assignment = await loadAssignment({ schoolId, studentId, assignmentId, academicYear });
        const settings = settingsFor(assignment);
        const part = partByKey(settings, partKey);
        if (!part) {
            throw fail('That part is not part of this reading practice.', 409, 'FLUENCY_PART_NOT_ENABLED');
        }

        // Checked before the stored text and the paid transcription.
        const profile = await StudentReadingProfile.findOne({
            school: schoolId,
            student: studentId
        }).select('micConsent').lean();
        if (!hasConsent(profile)) {
            throw fail(
                'Microphone permission is required before recording.',
                403,
                'FLUENCY_CONSENT_REQUIRED'
            );
        }

        const content = await readingContentFor({ assignment, studentId, schoolId, academicYear });
        const levels = buildReadingLevels(content);
        if (level !== null && level !== undefined && level !== '' && level !== 'null') {
            const requestedLevel = Number(level);
            if (!Number.isFinite(requestedLevel)
                || !levels.some((item) => Number(item.targetLevel) === requestedLevel)) {
                throw fail('That level is not part of this reading.', 400, 'FLUENCY_INVALID_LEVEL');
            }
        }
        const resolved = referenceForPart({
            levels,
            content,
            part,
            blockKey: partKey,
            requestedLevel: level
        });

        const zone = resolveTimeZone(timeZone) || DEFAULT_SCHOOL_TIMEZONE;
        const day = getSchoolDayRange(new Date(), zone);

        // Reserve this run against the caps before the slow transcription, so
        // parallel requests cannot all pass the same check.
        const dailyReservationKey = String(studentId);
        const partReservationKey = `${String(studentId)}:${String(assignmentId)}:${partKey}`;
        const todayAttempts = await ReadingFluencyAttempt.countDocuments({
            school: schoolId,
            student: studentId,
            createdAt: { $gte: day.start, $lte: day.end }
        });
        if (todayAttempts + (reserved.daily.get(dailyReservationKey) || 0) >= DAILY_ATTEMPT_LIMIT) {
            throw fail(
                'You have recorded a lot today. Try again tomorrow.',
                429,
                'FLUENCY_DAILY_CAP_REACHED'
            );
        }
        const scoredAttempts = await ReadingFluencyAttempt.countDocuments({
            school: schoolId,
            student: studentId,
            assignment: assignmentId,
            blockKey: partKey,
            status: 'scored'
        });
        if (scoredAttempts + (reserved.part.get(partReservationKey) || 0) >= settings.maxReadingsPerPart) {
            throw fail(
                'You have already read this part as many times as the assignment allows.',
                409,
                'FLUENCY_PART_CAP_REACHED'
            );
        }
        reserved.daily.set(dailyReservationKey, (reserved.daily.get(dailyReservationKey) || 0) + 1);
        reserved.part.set(partReservationKey, (reserved.part.get(partReservationKey) || 0) + 1);

        try {
            await credit.assertHasCredit({ schoolId, userId: assignment.assignedBy });

            const heard = await transcribe({ buffer, mimeType, language: 'en' });
            let transcript = normalizeTranscript(heard?.text, { words: heard?.words });
            transcript = truncateTranscript(transcript, resolved.reference);
            const alignment = alignReferenceToTranscript(resolved.reference, transcript);
            const quality = assessRecordingQuality({
                transcript,
                reference: resolved.reference,
                alignment,
                segments: heard?.segments
            });
            const metrics = quality.notHeard
                ? null
                : computeMetrics({ reference: resolved.reference, transcript, alignment });
            const status = quality.notHeard ? 'not_heard' : 'scored';
            const now = new Date();

            let saved;
            for (let attempt = 0; attempt < MAX_ATTEMPT_RETRIES; attempt += 1) {
                try {
                    saved = await runTransaction(async (session) => {
                        const prior = await ReadingFluencyProgress.findOne({
                            school: schoolId,
                            student: studentId,
                            assignment: assignmentId,
                            blockKey: partKey
                        }).session(session).lean();

                        // Re-check the caps inside the transaction to catch
                        // requests that raced across server instances.
                        const todayCount = await ReadingFluencyAttempt.countDocuments({
                            school: schoolId,
                            student: studentId,
                            createdAt: { $gte: day.start, $lte: day.end }
                        }).session(session);
                        if (todayCount >= DAILY_ATTEMPT_LIMIT) {
                            throw fail(
                                'You have recorded a lot today. Try again tomorrow.',
                                429,
                                'FLUENCY_DAILY_CAP_REACHED'
                            );
                        }
                        const scoredCount = await ReadingFluencyAttempt.countDocuments({
                            school: schoolId,
                            student: studentId,
                            assignment: assignmentId,
                            blockKey: partKey,
                            status: 'scored'
                        }).session(session);
                        if (scoredCount >= settings.maxReadingsPerPart) {
                            throw fail(
                                'You have already read this part as many times as the assignment allows.',
                                409,
                                'FLUENCY_PART_CAP_REACHED'
                            );
                        }

                        const attemptCount = await ReadingFluencyAttempt.countDocuments({
                            school: schoolId,
                            student: studentId,
                            assignment: assignmentId,
                            blockKey: partKey
                        }).session(session);

                        const { update } = progressUpdate({
                            prior,
                            settings,
                            status,
                            metrics,
                            reference: resolved.reference,
                            alignment,
                            now
                        });
                        update.$setOnInsert = {
                            school: schoolId,
                            student: studentId,
                            assignment: assignmentId,
                            blockKey: partKey
                        };

                        const progress = await ReadingFluencyProgress.findOneAndUpdate(
                            { school: schoolId, student: studentId, assignment: assignmentId, blockKey: partKey },
                            update,
                            { upsert: true, new: true, setDefaultsOnInsert: true, session }
                        ).lean();

                        const [created] = await ReadingFluencyAttempt.create([attemptPayload({
                            schoolId,
                            studentId,
                            assignment,
                            blockKey: partKey,
                            level: resolved.level,
                            textHash: resolved.textHash,
                            reference: resolved.reference,
                            attemptNumber: attemptCount + 1,
                            status,
                            notHeardReason: quality.reason,
                            recordedSec: seconds,
                            metrics,
                            alignment,
                            heard,
                            idempotencyKey: key
                        })], { session });

                        return {
                            attempt: created.toObject(),
                            progress,
                            previous: prior?.latest || null
                        };
                    });
                    break;
                } catch (error) {
                    if (Number(error?.code) === 11000 && error?.keyPattern?.idempotencyKey) {
                        const first = await ReadingFluencyAttempt.findOne({
                            school: schoolId,
                            idempotencyKey: key
                        }).lean();
                        if (first) {
                            return replayAttempt({
                                existing: first,
                                schoolId,
                                studentId,
                                assignmentId,
                                academicYear,
                                credit
                            });
                        }
                    }
                    const retriable = isAttemptNumberDuplicate(error) || isTransientTransaction(error);
                    if (retriable && attempt < MAX_ATTEMPT_RETRIES - 1) {
                        continue;
                    }
                    if (retriable) {
                        throw fail('Please try again.', 409, 'FLUENCY_ATTEMPT_CONFLICT');
                    }
                    throw error;
                }
            }

            // Only Whisper's own measurement is trusted for billing; the client's is capped.
            const billedSeconds = Number(heard?.duration) > 0
                ? Number(heard.duration)
                : Math.min(seconds, MAX_RECORDING_SEC);

            let charge = null;
            try {
                charge = await credit.chargeUsage(chargePayload({
                    schoolId,
                    userId: assignment.assignedBy,
                    seconds: billedSeconds,
                    status,
                    assignmentId: assignment._id,
                    studentId,
                    assignmentTitle: content.text?.title || assignment.text?.title || '',
                    sttModel: heard?.model
                }));
            } catch (error) {
                logger.error('reading_fluency_charge_failed', {
                    attemptId: String(saved.attempt._id),
                    error: error?.message
                });
            }

            if (!charge || charge.charged === false || charge.error) {
                saved.attempt.chargeFailed = true;
                saved.attempt.costCents = 0;
                await ReadingFluencyAttempt.updateOne(
                    { _id: saved.attempt._id },
                    { $set: { chargeFailed: true } }
                ).catch(() => {});
                logger.error('reading_fluency_charge_failed', {
                    attemptId: String(saved.attempt._id)
                });
            } else {
                const costCents = charge.chargedCents !== undefined ? charge.chargedCents : 0;
                saved.attempt.costCents = costCents;
                await ReadingFluencyAttempt.updateOne(
                    { _id: saved.attempt._id },
                    { $set: { costCents } }
                ).catch(() => {});
            }

            return shapeResult({
                attempt: saved.attempt,
                progress: saved.progress,
                settings,
                previous: saved.previous
            });
        } finally {
            const dailyValue = (reserved.daily.get(dailyReservationKey) || 0) - 1;
            if (dailyValue <= 0) reserved.daily.delete(dailyReservationKey);
            else reserved.daily.set(dailyReservationKey, dailyValue);
            const partValue = (reserved.part.get(partReservationKey) || 0) - 1;
            if (partValue <= 0) reserved.part.delete(partReservationKey);
            else reserved.part.set(partReservationKey, partValue);
        }
    };

    const promise = run();
    inFlight.set(flightKey, {
        student: String(studentId),
        assignment: String(assignmentId),
        blockKey: partKey,
        promise
    });
    try {
        return await promise;
    } finally {
        inFlight.delete(flightKey);
    }
}

/* ------------------------------------------------------------------ */
/* History and teacher settings                                        */
/* ------------------------------------------------------------------ */

export async function getStudentPartAttempts({
    schoolId,
    studentId,
    assignmentId,
    blockKey,
    academicYear = null
}) {
    const assignment = await loadAssignment({
        schoolId,
        studentId,
        assignmentId,
        academicYear,
        allowInactive: true
    });
    const settings = mergeFluencySettings(assignment.fluency);
    if (!partByKey(settings, blockKey)) {
        throw fail('That part is not part of this reading practice.', 409, 'FLUENCY_PART_NOT_ENABLED');
    }

    const [progress, attempts] = await Promise.all([
        ReadingFluencyProgress.findOne({
            school: schoolId,
            student: studentId,
            assignment: assignmentId,
            blockKey
        }).lean(),
        ReadingFluencyAttempt.find({
            school: schoolId,
            student: studentId,
            assignment: assignmentId,
            blockKey
        }).sort({ attemptNumber: 1 }).lean()
    ]);

    return {
        blockKey,
        progress: shapeProgress(progress),
        attempts: attempts.map((attempt) => publicAttempt(attempt, settings))
    };
}

export async function updateFluencySettings({
    schoolId,
    assignmentId,
    userId,
    isAdmin = false,
    patch = {}
}) {
    const assignment = await ReadingAssignment.findOne({ _id: assignmentId, school: schoolId });
    if (!assignment) {
        throw fail('Reading assignment not found.', 404, 'FLUENCY_ASSIGNMENT_NOT_FOUND');
    }
    if (!isAdmin && String(assignment.assignedBy) !== String(userId)) {
        throw fail(
            'Only the teacher who assigned this reading or a school admin can change reading aloud.',
            403,
            'FLUENCY_SETTINGS_FORBIDDEN'
        );
    }

    const settings = mergeSettingsPatch(assignment.fluency, patch);
    let warnings = [];
    if (settings.enabled) {
        const text = await SimplifiedText.findOne({ _id: assignment.text, school: schoolId }).lean();
        if (!text) {
            throw fail('The reading for this practice is no longer available.', 409, 'FLUENCY_TEXT_NOT_FOUND');
        }
        if (!isEnglishLanguage(text.language)) {
            throw fail('Reading aloud practice is only available for English readings.', 400, 'FLUENCY_ENGLISH_ONLY');
        }
        ({ warnings } = fluencyPartsForText(text, settings.parts));
    }

    assignment.fluency = settings;
    await assignment.save();
    return { settings, warnings };
}
