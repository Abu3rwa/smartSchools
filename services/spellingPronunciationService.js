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
import { normalizeForGrading } from '../utils/spellingGrading.js';

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
    // Removed clips keep their key, so they count as existing here: bulk generation
    // must never recreate a clip an admin removed. Only regeneratePronunciation does.
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
    const clipDocs = allKeys.length
        ? await SpellingPronunciation.find({ key: { $in: allKeys } }).select('key removedAt').lean()
        : [];
    const existing = new Set(clipDocs.filter((entry) => !entry.removedAt).map((entry) => entry.key));
    const removedKeys = new Set(clipDocs.filter((entry) => entry.removedAt).map((entry) => entry.key));
    const centsPerMinute = audioCentsPerMinute(config.model, env) || 0;

    const grades = [...byGrade.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([grade, words]) => {
            let withUs = 0;
            let withUk = 0;
            let withBoth = 0;
            let removedClips = 0;
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
                for (const entry of keys) if (removedKeys.has(entry.key)) removedClips += 1;
                // Removed clips are deliberately absent: they are not "missing" and
                // bulk generation will not recreate them, so they carry no cost estimate.
                const absent = keys.filter((entry) => !existing.has(entry.key) && !removedKeys.has(entry.key));
                if (absent.length > 0) {
                    missingWords.push(word);
                    remainingClips += absent.length;
                    missingSeconds += absent.length * estimateSpeechSeconds(word);
                }
            }
            return {
                grade,
                totalWords: words.size,
                withUs,
                withUk,
                withBoth,
                removedClips,
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
        const docs = await SpellingPronunciation.find({ key: { $in: keys.map((entry) => entry.key) }, removedAt: null })
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
 * Returns Map<normalizedWord, { clips: { us, uk }, removed: ['us'|'uk'] }> and never throws.
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
            .select('key publicId accent removedAt')
            .lean();
        const byKey = new Map(docs.map((doc) => [doc.key, doc]));
        const result = new Map();
        for (const entry of entries) {
            const doc = byKey.get(entry.key);
            if (!doc) continue;
            const current = result.get(entry.normalized) || { clips: {}, removed: [] };
            if (doc.removedAt) current.removed.push(doc.accent);
            else current.clips[doc.accent] = pronunciationUrl(doc.publicId);
            result.set(entry.normalized, current);
        }
        return result;
    } catch (error) {
        logger.warn('spelling_pronunciation_preview_failed', { error: error?.message });
        return new Map();
    }
};

const assertSchoolWord = async (schoolId, word) => {
    const key = normalizeWordKey(word);
    if (!key || key.length > MAX_WORD_LENGTH) throw badRequest('A valid spelling word is required');
    if (!(await SpellingWord.exists({ school: schoolId, normalizedWord: normalizeForGrading(word) }))) {
        throw Object.assign(new Error('Spelling word not found in this school'), { statusCode: 404 });
    }
    return key;
};

const assertAccent = (accent) => {
    const value = String(accent || '').toLowerCase();
    if (!ACCENTS.includes(value)) throw badRequest('accent must be us or uk');
    return value;
};

/**
 * Removes one accent's clip for every school at once. The document stays as a
 * tombstone: its key keeps bulk generation from recreating the clip, and the
 * public route stops serving it. Only regeneratePronunciation brings it back.
 */
export const removePronunciation = async ({ schoolId, userId, word, accent, env = process.env }) => {
    const normalized = await assertSchoolWord(schoolId, word);
    const chosen = assertAccent(accent);
    const config = resolveTtsConfig(env);
    const entry = keysForWord(normalized, config).find((candidate) => candidate.accent === chosen);
    const removed = await SpellingPronunciation.findOneAndUpdate(
        { key: entry.key, removedAt: null },
        { $set: { removedAt: new Date(), removedBy: userId || null } },
        { new: true }
    ).select('key accent').lean();
    if (!removed) {
        throw Object.assign(new Error('No active AI clip exists for this word and accent; it may already be removed'), { statusCode: 404 });
    }
    const preview = (await lookupPronunciations([normalized], env)).get(normalized) || { clips: {}, removed: [] };
    return { word: String(word).trim(), accent: chosen, ai: preview.clips, aiRemoved: preview.removed };
};

/**
 * Explicit admin regeneration: synthesizes first, and only a successful result
 * replaces the stored clip. The new publicId changes the URL, so browsers that
 * cached the old immutable response fetch the new bytes instead.
 */
export const regeneratePronunciation = async ({ schoolId, userId, word, accent, env = process.env }) => {
    const normalized = await assertSchoolWord(schoolId, word);
    const chosen = assertAccent(accent);
    if (!(await isAiAudioEnabled(env))) return { available: false };
    const config = resolveTtsConfig(env);
    const entry = keysForWord(normalized, config).find((candidate) => candidate.accent === chosen);
    const seconds = estimateSpeechSeconds(normalized);

    let speech;
    try {
        speech = await synthesizeSpeech({
            text: normalized,
            model: config.model,
            voice: entry.voice,
            instructions: entry.instructions
        });
    } catch (error) {
        logger.warn('spelling_pronunciation_regenerate_failed', { word: normalized, accent: chosen, error: error?.message });
        throw Object.assign(new Error('The AI voice service could not generate a new clip. The existing clip was not changed.'), {
            statusCode: 502,
            code: 'SPELLING_PRONUNCIATION_REGENERATE_FAILED',
            expose: true
        });
    }

    await SpellingPronunciation.findOneAndUpdate(
        { key: entry.key },
        {
            $set: {
                publicId: publicId(),
                word: String(word).trim(),
                model: config.model,
                voice: entry.voice,
                instructions: entry.instructions,
                contentType: speech.contentType,
                speechSeconds: seconds,
                data: speech.buffer,
                removedAt: null,
                removedBy: null
            },
            $setOnInsert: { key: entry.key, accent: chosen }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const centsPerMinute = audioCentsPerMinute(config.model, env) || 0;
    const costCents = roundCents((seconds / 60) * centsPerMinute);
    if (schoolId && userId) {
        await chargeUsage({
            schoolId,
            userId,
            feature: 'spelling-pronunciation',
            outcome: 'done',
            extraCostCents: costCents,
            audio: { speechSeconds: seconds, ttsModel: config.model }
        });
    }

    const preview = (await lookupPronunciations([normalized], env)).get(normalized) || { clips: {}, removed: [] };
    return { available: true, word: String(word).trim(), accent: chosen, ai: preview.clips, aiRemoved: preview.removed, speechSeconds: seconds, costCents };
};

export const findPronunciationByPublicId = async (value) => {
    const id = String(value || '').trim();
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    return SpellingPronunciation.findOne({ publicId: id, removedAt: null }).select('+data contentType key').lean();
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
