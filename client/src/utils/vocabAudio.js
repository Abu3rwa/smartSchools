import { DEFAULT_VOICE_ID, getVoiceOptions, playUrl, resolveVoice } from './voicePlayback.js';

// One place to edit the wording shown to students.
export const FORM_LABELS = Object.freeze({
    plural: 'a plural (more than one)',
    verb_s: 'a verb with -s',
    past: 'a past form',
    ing: 'an -ing form',
    comparative: 'a comparative',
    superlative: 'a superlative',
    contraction: 'a contraction'
});

export const baseWordNotice = (word) => `Listen carefully: the recording says the single word "${word.baseWord}". This word is ${FORM_LABELS[word.form] || 'a different form'}. Ask your teacher if you need help with how to say it.`;

const DICTIONARY_ORDER = ['oxford', 'longman', 'webster'];

export const hasRecording = (audio) => getVoiceOptions(audio).length > 0;

// The recording is of the base word when the word has a form; show the notice before the student answers.
export const needsBaseWordNotice = (word) => Boolean(word?.form && word?.baseWord && hasRecording(word.audio));

/**
 * Ordered list of recording URLs to try: the chosen voice, then every other recorded source.
 * Text-to-speech is the last resort and is handled by playChain. Only this word's own recordings are listed.
 */
export const planAudio = (audio, voiceId = DEFAULT_VOICE_ID) => {
    const options = getVoiceOptions(audio).sort((a, b) => {
        const byDictionary = DICTIONARY_ORDER.indexOf(a.dictionary) - DICTIONARY_ORDER.indexOf(b.dictionary);
        return byDictionary || (a.accent === b.accent ? 0 : a.accent === 'us' ? -1 : 1);
    });
    const chosen = resolveVoice(audio, voiceId);
    const urls = [...(chosen ? [chosen.url] : []), ...options.map((option) => option.url)];
    return [...new Set(urls)];
};

export const speakText = (text, lang = 'en-US') => {
    const synth = globalThis.speechSynthesis;
    if (!synth || !text) return false;
    synth.cancel();
    const utterance = new globalThis.SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    synth.speak(utterance);
    return true;
};

/** Tries each URL in turn, then text-to-speech. onFallback('other' | 'tts') reports a change. Returns { cancel }. */
export const playChain = ({ urls, text, onFallback, play = playUrl, speak = speakText }) => {
    let cancelled = false;
    let current = null;
    const next = (index) => {
        if (cancelled) return;
        if (index >= urls.length) {
            if (urls.length > 0) onFallback?.('tts');
            speak(text);
            return;
        }
        if (index > 0) onFallback?.('other');
        current = play(urls[index], { onFail: () => next(index + 1) });
    };
    next(0);
    return {
        cancel: () => {
            cancelled = true;
            current?.cancel?.();
            globalThis.speechSynthesis?.cancel?.();
        }
    };
};
