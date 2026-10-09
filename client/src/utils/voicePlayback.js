export const VOICE_STORAGE_KEY = 'spelling.voice';
export const DEFAULT_VOICE_ID = 'default';
export const PLAYBACK_TIMEOUT_MS = 6000;

export const DICTIONARY_LABELS = Object.freeze({ longman: 'Longman', oxford: 'Oxford', webster: 'Merriam-Webster' });
const ACCENT_LABELS = Object.freeze({ us: 'US', uk: 'UK' });

// Flat list of the voices that actually exist for a word, e.g. [{ id: 'longman-us', url, label: 'Longman US' }].
export const getVoiceOptions = (audio) => {
    const options = [];
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

// A chosen voice that is missing for this word resolves to null, which means "use Default".
export const resolveVoice = (audio, voiceId) => {
    if (!voiceId || voiceId === DEFAULT_VOICE_ID) return null;
    return getVoiceOptions(audio).find((option) => option.id === voiceId) || null;
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
