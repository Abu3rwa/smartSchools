export const AUTO_MIN_READ_SECONDS = Object.freeze({ min: 15, max: 300 });

export const READING_GATE_MIN_SECONDS = Object.freeze({ min: 0, max: 1800 });

const WORDS_PER_MINUTE = 200;
const HALF_MINUTE = 30;

/** 30 seconds for every 200 words, never below 15s and never above 5 minutes. */
export const autoMinReadSeconds = (wordCount) => {
  const words = Math.max(0, Number(wordCount) || 0);
  const seconds = Math.ceil((words / WORDS_PER_MINUTE) * HALF_MINUTE);
  return Math.min(
    AUTO_MIN_READ_SECONDS.max,
    Math.max(AUTO_MIN_READ_SECONDS.min, seconds)
  );
};

export const requiredReadSeconds = (gate, wordCount) => {
  const value = gate?.minReadSeconds;
  if (value !== null && value !== undefined && value !== '') {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return Math.min(
        READING_GATE_MIN_SECONDS.max,
        Math.max(READING_GATE_MIN_SECONDS.min, Math.round(number))
      );
    }
  }
  return autoMinReadSeconds(wordCount);
};
