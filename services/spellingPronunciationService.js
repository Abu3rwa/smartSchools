/**
 * AI word pronunciations for spelling. Clips are generated ahead of time and
 * stored as our own bytes, so a student's practice path never calls AI and no
 * publisher URL is ever played.
 */
import crypto from 'crypto';
import { parseBooleanEnv } from '../config/booleanEnv.js';
import { audioCentsPerMinute } from '../config/aiPricing.js';
import AiCreditSetting from '../models/AiCreditSetting.js';
import SpellingPronunciation from '../models/SpellingPronunciation.js';
import SpellingWord from '../models/SpellingWord.js';
import { chargeUsage, roundCents } from './aiCreditService.js';
import { estimateSpeechSeconds, synthesizeSpeech } from './voiceSpeech.js';
import logger from '../utils/logger.js';
import { normalizeWordKey } from '../utils/wordAudio.js';

export const AI_AUDIO_ENV = 'SPELLING_AI_AUDIO';
export const ACCENTS = Object.freeze(['us', 'uk']);
const MAX_WORD_LENGTH = 200;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const PLATFORM_KEY = 'default';

/** An explicit false in the deployment forces AI audio off, whatever the platform switch says. */
export const isEnvForcedOff = (env = process.env) => {
    const raw = String(env[AI_AUDIO_ENV] ?? '').trim();
    return raw !== '' && !parseBooleanEnv(raw);
};

/** True unless the deployment forces AI audio off. Does not read the platform switch. */
export const isAiAudioAllowed = (env = process.env) => !isEnvForcedOff(env);

export const resolveTtsConfig = (env = process.env) => ({
    model: String(env.SPELLING_TTS_MODEL || '').trim() || 'gpt-4o-mini-tts',
    voices: {
        us: String(env.SPELLING_TTS_VOICE_US || '').trim() || 'alloy',
        uk: String(env.SPELLING_TTS_VOICE_UK || '').trim() || 'fable'
    }
});

/** One instruction per accent, kept in the cache key so changing it regenerates cleanly. */
export const instructionFor = (accent) => [
    'Say only the word, once, clearly and naturally for a young learner.',
    `Use ${accent === 'us' ? 'American' : 'British'} English pronunciation.`,
    'Do not add any other words or spell the word out.'
].join(' ');

export const pronunciationKey = ({ word, accent, model, voice, instructions }) => crypto
    .createHash('sha256')
    .update([normalizeWordKey(word), accent, model, voice, instructions].join('\n'))
    .digest('hex');

const publicId = () => crypto.randomBytes(16).toString('hex');
// Bumped when the bytes behind a publicId start serving differently: old
// responses were cached immutable for a year, so the URL has to change.
export const AUDIO_URL_VERSION = 2;

export const pronunciationUrl = (id) => `/api/spelling/pronunciation/${id}?v=${AUDIO_URL_VERSION}`;

const mapWithConcurrency = async (items, limit, worker) => {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            await worker(items[index]);
        }
    });
    await Promise.all(runners);
};

const uniqueWords = (words = []) => {
    const byKey = new Map();
    for (const raw of words) {
        const value = String(raw ?? '').trim();
        const key = normalizeWordKey(value);
        if (!key || key.length > MAX_WORD_LENGTH || byKey.has(key)) continue;
        byKey.set(key, value);
    }
    return byKey;
};

/** The one switch that covers every school. `available` is what students actually get. */
export const getPlatformSpellingAudioSettings = async (env = process.env) => {
    const setting = await AiCreditSetting.findOne({ key: PLATFORM_KEY }).select('spellingAudio').lean();
    const enabled = setting?.spellingAudio?.enabled === true;
    const envForcedOff = isEnvForcedOff(env);
    return { enabled, envForcedOff, available: enabled && !envForcedOff };
};

export const savePlatformSpellingAudioSettings = async ({ enabled, updatedBy, env = process.env } = {}) => {
    if (typeof enabled !== 'boolean') throw badRequest('enabled must be true or false');
    await AiCreditSetting.findOneAndUpdate(
        { key: PLATFORM_KEY },
        { $set: { 'spellingAudio.enabled': enabled, updatedBy } },
        { upsert: true, setDefaultsOnInsert: true }
    );
    return getPlatformSpellingAudioSettings(env);
};

export const isAiAudioEnabled = async (env = process.env) => {
    const { available } = await getPlatformSpellingAudioSettings(env);
    return available;
};

/** Kept for the school admin page: the platform owns the switch, so the answer is never per school. */
export const getAiAudioSettings = async (env = process.env) => {
    const { enabled, envForcedOff, available } = await getPlatformSpellingAudioSettings(env);
    return { available, wordAudioEnabled: enabled, platformControlled: true, envForcedOff };
};

export const isAiAudioEnabledForSchool = async (_schoolId, env = process.env) => isAiAudioEnabled(env);

const keysForWord = (word, config) => ACCENTS.map((accent) => {
    const instructions = instructionFor(accent);
    return {
        accent,
        voice: config.voices[accent],
        instructions,
        key: pronunciationKey({ word, accent, model: config.model, voice: config.voices[accent], instructions })
    };
});

/**
 * Generates only the clips that do not exist yet. A word generated by another
 * school is reused for free. Charged once per batch, never per clip, so tiny
 * one-word requests still land a visible ledger row.
 */
export const generateMissingPronunciations = async ({
    schoolId,
    userId,
    words = [],
    env = process.env,
    maxClips = 80
}) => {
    if (!(await isAiAudioEnabled(env))) {
        return { available: false, generated: 0, failed: 0, remaining: 0, speechSeconds: 0, costCents: 0 };
    }
    const config = resolveTtsConfig(env);
    const dictionary = uniqueWords(words);
    if (dictionary.size === 0) {
        return { available: true, generated: 0, failed: 0, remaining: 0, speechSeconds: 0, costCents: 0 };
    }

    const candidates = [];
    for (const [normalized, word] of dictionary) {
        for (const entry of keysForWord(normalized, config)) {
            candidates.push({ ...entry, word, normalized });
        }
    }

    const existing = new Set(
        (await SpellingPronunciation.find({ key: { $in: candidates.map((entry) => entry.key) } })
            .select('key')
            .lean()).map((entry) => entry.key)
    );
    const missing = candidates.filter((entry) => !existing.has(entry.key));
    const batch = missing.slice(0, Math.max(0, Math.floor(Number(maxClips)) || 0));

    let generated = 0;
    let failed = 0;
    let raced = 0;
    let speechSeconds = 0;

    await mapWithConcurrency(batch, 4, async (entry) => {
        const seconds = estimateSpeechSeconds(entry.word);
        try {
            const speech = await synthesizeSpeech({
                text: entry.word,
                model: config.model,
                voice: entry.voice,
                instructions: entry.instructions
            });
            await SpellingPronunciation.create({
                key: entry.key,
                publicId: publicId(),
                word: entry.word,
                accent: entry.accent,
                model: config.model,
                voice: entry.voice,
                instructions: entry.instructions,
                contentType: speech.contentType,
                speechSeconds: seconds,
                data: speech.buffer
            });
            generated += 1;
            speechSeconds += seconds;
        } catch (error) {
            if (error?.code === 11000) {
                // Another request generated the same word first: the clip exists, nothing is lost.
                raced += 1;
                return;
            }
            failed += 1;
            logger.warn('spelling_pronunciation_failed', {
                word: entry.normalized,
                accent: entry.accent,
                error: error?.message
            });
        }
    });

    const centsPerMinute = audioCentsPerMinute(config.model, env) || 0;
    const costCents = roundCents((speechSeconds / 60) * centsPerMinute);
    if (generated > 0 && schoolId && userId) {
        await chargeUsage({
            schoolId,
            userId,
            feature: 'spelling-pronunciation',
            outcome: 'done',
            extraCostCents: costCents,
            audio: { speechSeconds, ttsModel: config.model }
        });
    }

    return {
        available: true,
        generated,
        failed,
        remaining: Math.max(0, missing.length - generated - raced),
        speechSeconds,
        costCents
    };
};

export const generateForSchool = async ({ schoolId, userId, grade = '', limit = 80, env = process.env }) => {
    if (!(await isAiAudioEnabled(env))) return { available: false, generated: 0, failed: 0, remaining: 0, speechSeconds: 0, costCents: 0 };
    const normalizedGrade = String(grade || '').trim().toUpperCase();
    const words = await SpellingWord.find({
        school: schoolId,
        ...(normalizedGrade ? { grade: normalizedGrade } : {})
    }).select('word').lean();
    return generateMissingPronunciations({
        schoolId,
        userId,
        words: words.map((entry) => entry.word),
        env,
        maxClips: limit
    });
};

const wordsByGrade = (rows = []) => {
    const byGrade = new Map();
    for (const row of rows) {
        if (!row?.grade) continue;
        const key = normalizeWordKey(row.word);
        if (!key) continue;
        if (!byGrade.has(row.grade)) byGrade.set(row.grade, new Map());
        if (!byGrade.get(row.grade).has(key)) byGrade.get(row.grade).set(key, String(row.word || '').trim());
    }
    return byGrade;
};

export const getAiCoverage = async ({ schoolId, env = process.env }) => {
    const config = resolveTtsConfig(env);
    const [rows, platform] = await Promise.all([
        SpellingWord.find({ school: schoolId }).select('grade word').lean(),
        getPlatformSpellingAudioSettings(env)
    ]);
    const byGrade = wordsByGrade(rows);
    const allKeys = [];
    for (const words of byGrade.values()) {
        for (const word of words.values()) {
            for (const entry of keysForWord(word, config)) allKeys.push(entry.key);
        }
    }
    const existing = new Set(
        (allKeys.length
            ? await SpellingPronunciation.find({ key: { $in: allKeys } }).select('key').lean()
            : []).map((entry) => entry.key)
    );
    const centsPerMinute = audioCentsPerMinute(config.model, env) || 0;

    const grades = [...byGrade.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([grade, words]) => {
            let withUs = 0;
            let withUk = 0;
            let withBoth = 0;
            let remainingClips = 0;
            let missingSeconds = 0;
            const missingWords = [];
            for (const word of words.values()) {
                const keys = keysForWord(word, config);
                const hasUs = existing.has(keys[0].key);
                const hasUk = existing.has(keys[1].key);
                if (hasUs) withUs += 1;
                if (hasUk) withUk += 1;
                if (hasUs && hasUk) withBoth += 1;
                if (!hasUs || !hasUk) {
                    missingWords.push(word);
                    const missingForWord = (hasUs ? 0 : 1) + (hasUk ? 0 : 1);
                    remainingClips += missingForWord;
                    missingSeconds += missingForWord * estimateSpeechSeconds(word);
                }
            }
            return {
                grade,
                totalWords: words.size,
                withUs,
                withUk,
                withBoth,
                remainingClips,
                missingWords: missingWords.slice(0, 50),
                missingWordCount: missingWords.length,
                estimatedCents: roundCents((missingSeconds / 60) * centsPerMinute)
            };
        });

    return {
        available: platform.available,
        wordAudioEnabled: platform.enabled,
        platformControlled: true,
        envForcedOff: platform.envForcedOff,
        ttsModel: config.model,
        centsPerMinute,
        grades
    };
};

/** Student-facing URLs for one word, or null. Never throws for the caller. */
export const getAiAudioForWord = async ({ schoolId, word, env = process.env }) => {
    try {
        if (!word || !(await isAiAudioEnabledForSchool(schoolId, env))) return null;
        const config = resolveTtsConfig(env);
        const keys = keysForWord(word, config);
        const docs = await SpellingPronunciation.find({ key: { $in: keys.map((entry) => entry.key) } })
            .select('key publicId accent')
            .lean();
        if (docs.length === 0) return null;
        const ai = {};
        for (const doc of docs) ai[doc.accent] = pronunciationUrl(doc.publicId);
        return Object.keys(ai).length > 0 ? ai : null;
    } catch (error) {
        logger.warn('spelling_pronunciation_lookup_failed', { error: error?.message });
        return null;
    }
};

/**
 * Admin preview: existing clips for a list of words, ignoring the switches.
 * Returns Map<normalizedWord, { us, uk }> and never throws.
 */
export const lookupPronunciations = async (words = [], env = process.env) => {
    try {
        const config = resolveTtsConfig(env);
        const entries = [];
        for (const word of words) {
            const normalized = normalizeWordKey(word);
            if (!normalized) continue;
            for (const entry of keysForWord(normalized, config)) entries.push({ ...entry, normalized });
        }
        if (entries.length === 0) return new Map();
        const docs = await SpellingPronunciation.find({ key: { $in: entries.map((entry) => entry.key) } })
            .select('key publicId accent')
            .lean();
        const byKey = new Map(docs.map((doc) => [doc.key, doc]));
        const result = new Map();
        for (const entry of entries) {
            const doc = byKey.get(entry.key);
            if (!doc) continue;
            const clips = result.get(entry.normalized) || {};
            clips[doc.accent] = pronunciationUrl(doc.publicId);
            result.set(entry.normalized, clips);
        }
        return result;
    } catch (error) {
        logger.warn('spelling_pronunciation_preview_failed', { error: error?.message });
        return new Map();
    }
};

export const findPronunciationByPublicId = async (value) => {
    const id = String(value || '').trim();
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    return SpellingPronunciation.findOne({ publicId: id }).select('+data contentType key').lean();
};

const startsLikeAudio = (bytes) => Boolean(bytes?.length >= 2 && (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) // ID3
    || (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) // RIFF
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) // MPEG frame sync
));

const toBuffer = (value) => {
    if (!value) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    // A lean() document can hand back a BSON Binary, which Express would
    // serialise as JSON (a quoted base64 string) instead of audio bytes.
    if (value.buffer instanceof Uint8Array) return Buffer.from(value.buffer);
    if (typeof value.value === 'function' && value.value() instanceof Uint8Array) return Buffer.from(value.value());
    return Buffer.from(value);
};

/**
 * Some clips were stored as a base64 string instead of audio bytes. The browser
 * rejects those with media error 4, so decode them when serving. New clips are
 * written as raw bytes and pass straight through.
 */
export const normalizeStoredAudio = (value) => {
    const bytes = toBuffer(value);
    if (!bytes?.length) return null;
    if (startsLikeAudio(bytes)) return bytes;
    const text = bytes.toString('utf8').trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, '');
    if (!text || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return bytes;
    const decoded = Buffer.from(text, 'base64');
    return startsLikeAudio(decoded) ? decoded : bytes;
};
