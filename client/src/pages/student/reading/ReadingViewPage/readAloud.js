const MAX_CHUNK = 200;

// Browsers stop a single utterance after a while, so long passages are spoken sentence by sentence.
export const chunkForSpeech = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?؟]+[.!?؟]*\s*/g) || [clean];
  return sentences.reduce((chunks, sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return chunks;
    if (trimmed.length <= MAX_CHUNK) {
      chunks.push(trimmed);
      return chunks;
    }
    let line = '';
    for (const word of trimmed.split(' ')) {
      if (line && `${line} ${word}`.length > MAX_CHUNK) {
        chunks.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) chunks.push(line);
    return chunks;
  }, []);
};

export const speechLang = (languageCode) => {
  const code = String(languageCode || 'en').trim().toLowerCase();
  if (code.startsWith('ar')) return 'ar-SA';
  return code === 'en' ? 'en-US' : code;
};

export const canSpeak = () => Boolean(globalThis.speechSynthesis);

/** Speaks the chunks in order. Returns { cancel }; onEnd fires when the last chunk finishes. */
export const speakChunks = (chunks, { lang = 'en-US', onEnd } = {}) => {
  const synth = globalThis.speechSynthesis;
  if (!synth || !chunks.length) {
    onEnd?.();
    return { cancel: () => {} };
  }
  let cancelled = false;
  let index = 0;
  const speakNext = () => {
    if (cancelled) return;
    if (index >= chunks.length) {
      onEnd?.();
      return;
    }
    const utterance = new globalThis.SpeechSynthesisUtterance(chunks[index]);
    index += 1;
    utterance.lang = lang;
    let settled = false;
    const advance = () => {
      if (settled) return;
      settled = true;
      speakNext();
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    synth.speak(utterance);
  };
  synth.cancel();
  speakNext();
  return {
    cancel: () => {
      cancelled = true;
      synth.cancel();
    },
  };
};
