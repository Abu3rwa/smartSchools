import { toApiUrl } from '../config/apiBase.js';

export const VOICE_STORAGE_KEY = 'spelling.voice';
export const DEFAULT_VOICE_ID = 'default';
export const PLAYBACK_TIMEOUT_MS = 6000;

// Dictionary example-sentence recordings are hidden from the spelling UI for now.
// Pronunciation URLs are gone from spelling entirely (AI clips are the only source);
// this flag now gates example sentences and their admin tools only. The generic
// helpers below keep serving dictionary voices for vocabulary and reading.
export const SHOW_DICTIONARY_SOURCES = false;

export const DICTIONARY_LABELS = Object.freeze({ longman: 'Longman', oxford: 'Oxford', webster: 'Merriam-Webster', google: 'Google' });
const ACCENT_LABELS = Object.freeze({ us: 'US', uk: 'UK' });

// Flat list of the voices that actually exist for a word, e.g. [{ id: 'ai-us', url, label: 'US 1' }].
// Generated clips come first: when they exist they are the voice students hear by default.
export const getVoiceOptions = (audio) => {
    const options = [];
    for (const accent of ['us', 'uk']) {
        if (audio?.ai?.[accent]) {
            options.push({
                id: `ai-${accent}`,
                dictionary: 'ai',
                accent,
                url: toApiUrl(audio.ai[accent]),
                label: `AI ${ACCENT_LABELS[accent]}`
            });
        }
    }
    for (const [dictionary, section] of Object.entries(audio?.dictionaries || {})) {
        for (const accent of ['us', 'uk']) {
            if (section?.[accent]) {
                options.push({
                    id: `${dictionary}-${accent}`,
                    dictionary,
                    accent,
                    url: section[accent],
                    label: `${DICTIONARY_LABELS[dictionary] || dictionary} ${ACCENT_LABELS[accent]}`
                });
            }
        }
    }
    return options;
};

// Spelling voices are numbered per accent ("US 1", "US 2"). Only generated AI
// clips are spelling voices; dictionary pronunciation URLs are never offered.
export const getSpellingVoiceOptions = (audio) => {
    const counts = { us: 0, uk: 0 };
    return getVoiceOptions(audio)
        .filter((option) => option.dictionary === 'ai')
        .map((option) => {
            counts[option.accent] += 1;
            return { ...option, label: `${ACCENT_LABELS[option.accent]} ${counts[option.accent]}` };
        });
};

// A chosen voice that is missing for this word resolves to null, which means "use Default".
export const resolveVoice = (audio, voiceId) => {
    if (!voiceId || voiceId === DEFAULT_VOICE_ID) return null;
    return getVoiceOptions(audio).find((option) => option.id === voiceId) || null;
};

// The voice "Default" actually plays in spelling: a generated clip, UK first.
// A stale saved dictionary choice resolves to the generated clip instead, and
// with no clip the caller falls back to the browser voice. Dictionary
// pronunciation recordings are never played by spelling.
export const resolvePlaybackVoice = (audio, voiceId) => {
    const chosen = resolveVoice(audio, voiceId);
    if (chosen?.dictionary === 'ai') return chosen;
    for (const accent of ['uk', 'us']) {
        if (audio?.ai?.[accent]) return resolveVoice(audio, `ai-${accent}`);
    }
    return null;
};

export const readStoredVoice = (storage = globalThis.localStorage) => {
    try {
        return storage?.getItem(VOICE_STORAGE_KEY) || DEFAULT_VOICE_ID;
    } catch {
        return DEFAULT_VOICE_ID;
    }
};

export const storeVoice = (voiceId, storage = globalThis.localStorage) => {
    try {
        storage?.setItem(VOICE_STORAGE_KEY, voiceId);
    } catch {
        // Private mode / blocked storage: the choice just won't persist.
    }
};

/**
 * Plays one URL with a plain HTMLAudioElement. Calls onFail once if the file errors, is rejected by the
 * browser, or has not started within timeoutMs. Returns { audio, cancel }.
 */
export const playUrl = (url, { onEnded, onFail, timeoutMs = PLAYBACK_TIMEOUT_MS, createAudio = (src) => new Audio(src) } = {}) => {
    let settled = false;
    let audio = null;
    let timer = null;
    const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback?.();
    };
    try {
        audio = createAudio(url);
    } catch {
        finish(onFail);
        return { audio: null, cancel: () => {} };
    }
    audio.onplaying = () => clearTimeout(timer);
    audio.onended = () => finish(onEnded);
    audio.onerror = () => finish(onFail);
    timer = setTimeout(() => {
        if (settled) return;
        audio.pause?.();
        finish(onFail);
    }, timeoutMs);
    Promise.resolve(audio.play()).catch(() => finish(onFail));
    return {
        audio,
        cancel: () => {
            settled = true;
            clearTimeout(timer);
            audio.pause?.();
        }
    };
};

/**
 * Fallback chain: chosen voice URL -> Default (existing behaviour). Never throws.
 * playDefault() must start the existing default playback.
 */
export const playWithFallback = ({ url, playDefault, onFallback, onEnded, ...options }) => {
    if (!url) return { handle: playDefault(), usedDefault: true };
    const handle = playUrl(url, {
        ...options,
        onEnded,
        onFail: () => {
            onFallback?.();
            playDefault();
        }
    });
    return { handle, usedDefault: false };
};
