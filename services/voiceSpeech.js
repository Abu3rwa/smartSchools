/**
 * Speech in and out. Audio is used once and discarded: the transcript is stored
 * on the session, the recording never is.
 */
import logger from '../utils/logger.js';

const timeoutMs = () => Number(process.env.OPENAI_TIMEOUT_MS) || 120000;
const baseUrl = () => String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const apiKey = () => process.env.OPENAI_API_KEY;

const fail = (message, statusCode = 502, code = 'VOICE_SPEECH_FAILED') =>
    Object.assign(new Error(message), { statusCode, code });

const extensionFor = (mimeType = '') => {
    if (/wav/i.test(mimeType)) return 'wav';
    if (/mp4|m4a|aac/i.test(mimeType)) return 'm4a';
    if (/ogg/i.test(mimeType)) return 'ogg';
    return 'webm';
};

/** One recording in, one transcript out. An empty or missed recording is a 422, not a silent pass. */
export const transcribeAudio = async ({
    buffer,
    mimeType = 'audio/webm',
    model = 'gpt-4o-mini-transcribe',
    language = 'en'
} = {}) => {
    const key = apiKey();
    if (!key) {
        logger.error('voice_speech_not_configured', { model });
        throw fail('The voice tutor is not set up yet. Ask your teacher or the school office.', 422, 'VOICE_NOT_CONFIGURED');
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw fail('The recording was empty. Hold the button and say it again.', 422);
    }

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), `answer.${extensionFor(mimeType)}`);
    form.append('model', model);
    form.append('language', language);

    let response;
    try {
        response = await fetch(`${baseUrl()}/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}` },
            body: form,
            signal: AbortSignal.timeout(timeoutMs())
        });
    } catch (error) {
        logger.warn('voice_transcribe_failed', { message: error?.message });
        throw fail('The tutor could not hear that. Try again.');
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        logger.warn('voice_transcribe_rejected', { status: response.status, message: payload?.error?.message });
        throw fail('The tutor could not hear that. Try again.');
    }
    const text = String(payload?.text || '').trim();
    if (!text) throw fail("I didn't catch that. Hold the button and say it again.", 422);
    return { text };
};

const CACHE_LIMIT = 40;
const CACHE_TTL_MS = 60 * 60 * 1000;
const speechCache = new Map();

const cacheGet = (key) => {
    const hit = speechCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        speechCache.delete(key);
        return null;
    }
    return hit.value;
};

const cacheSet = (key, value) => {
    speechCache.set(key, { at: Date.now(), value });
    while (speechCache.size > CACHE_LIMIT) {
        speechCache.delete(speechCache.keys().next().value);
    }
};

/** The spoken reply as MP3 bytes. Repeated text costs nothing the second time. */
export const synthesizeSpeech = async ({
    text,
    model = 'gpt-4o-mini-tts',
    voice = 'alloy'
} = {}) => {
    const key = `speech|${model}|${voice}|${String(text || '').trim()}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    if (!apiKey()) {
        logger.error('voice_speech_not_configured', { model });
        throw fail('The voice tutor is not set up yet. Ask your teacher or the school office.', 422, 'VOICE_NOT_CONFIGURED');
    }
    if (!String(text || '').trim()) throw fail('There is nothing to read.', 400);

    let response;
    try {
        response = await fetch(`${baseUrl()}/audio/speech`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                voice,
                input: String(text).trim(),
                response_format: 'mp3'
            }),
            signal: AbortSignal.timeout(timeoutMs())
        });
    } catch (error) {
        logger.warn('voice_speech_failed', { message: error?.message });
        throw fail('The tutor could not speak just now. Try again.');
    }

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        logger.warn('voice_speech_rejected', { status: response.status, message: payload?.error?.message });
        throw fail('The tutor could not speak just now. Try again.');
    }

    const value = {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: 'audio/mpeg'
    };
    cacheSet(key, value);
    return value;
};

/** Speech runs about 2.5 words a second; used to price a spoken reply. */
export const estimateSpeechSeconds = (text) => {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.round((words / 2.5) * 10) / 10;
};
