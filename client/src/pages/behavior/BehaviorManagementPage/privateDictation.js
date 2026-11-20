export const privateSpeechSupport = async (language, host = globalThis) => {
    const Recognition = host.SpeechRecognition || host.webkitSpeechRecognition;
    if (
        !Recognition ||
        !('processLocally' in Recognition.prototype) ||
        typeof Recognition.available !== 'function'
    )
        return { available: false, reason: 'unsupported' };
    try {
        const state = await Recognition.available({
            langs: [language],
            processLocally: true
        });
        return {
            available: state === 'available',
            reason: state === 'available' ? null : 'languageUnavailable',
            Recognition
        };
    } catch {
        return { available: false, reason: 'unsupported' };
    }
};

export const insertDictation = (
    value,
    transcript,
    selectionStart,
    selectionEnd
) => {
    const start = Math.max(
        0,
        Math.min(selectionStart ?? value.length, value.length)
    );
    const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
    const before = value.slice(0, start);
    const after = value.slice(end);
    return `${before}${before && !/\s$/.test(before) ? ' ' : ''}${transcript}${after && !/^\s/.test(after) ? ' ' : ''}${after}`;
};
