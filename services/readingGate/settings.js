/**
 * The `readingGate` block on a reading assignment and the reading-time math the
 * student page shows. Kept separate so assignment creation and the student
 * endpoints agree on defaults and limits.
 */
export const DEFAULT_READING_GATE = Object.freeze({
  enabled: false,
  minReadSeconds: null,
  lockScope: 'quiz_and_thinking'
});

export const READING_GATE_LIMITS = Object.freeze({
  minReadSeconds: { min: 0, max: 1800 }
});

export const READING_GATE_SCOPES = Object.freeze(['quiz', 'quiz_and_thinking']);

export const AUTO_MIN_READ_SECONDS = Object.freeze({ min: 15, max: 300 });

const WORDS_PER_MINUTE = 200;
const HALF_MINUTE = 30;

const badRequest = (message) => Object.assign(new Error(message), {
  statusCode: 400,
  code: 'READING_GATE_INVALID'
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const readRaw = (value) => (typeof value?.toObject === 'function' ? value.toObject() : (value || {}));

export const countWords = (text) => (
  String(text || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []
).length;

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
      return clamp(Math.round(number), READING_GATE_LIMITS.minReadSeconds.min, READING_GATE_LIMITS.minReadSeconds.max);
    }
  }
  return autoMinReadSeconds(wordCount);
};

/** Full, validated settings. Missing fields take their defaults. */
export const sanitizeReadingGate = (input = {}) => {
  const raw = readRaw(input);
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false;
  const lockScope = raw.lockScope === undefined || raw.lockScope === null || raw.lockScope === ''
    ? DEFAULT_READING_GATE.lockScope
    : String(raw.lockScope);
  if (!READING_GATE_SCOPES.includes(lockScope)) {
    throw badRequest('Unknown lock scope.');
  }
  let minReadSeconds = null;
  const rawMin = raw.minReadSeconds;
  if (rawMin !== null && rawMin !== undefined && rawMin !== '') {
    const number = Number(rawMin);
    if (!Number.isFinite(number)) {
      throw badRequest('Minimum reading time must be a number of seconds.');
    }
    minReadSeconds = clamp(
      Math.round(number),
      READING_GATE_LIMITS.minReadSeconds.min,
      READING_GATE_LIMITS.minReadSeconds.max
    );
  }
  return { enabled, minReadSeconds, lockScope };
};

/** Existing assignments predate the block, so every read goes through this. */
export const mergeReadingGate = (value) => {
  try {
    return sanitizeReadingGate(readRaw(value));
  } catch {
    return { ...DEFAULT_READING_GATE };
  }
};

/** A gate with nothing to lock is treated as already unlocked. */
export const gateLocksQuestions = (gate, comprehensionCount, criticalThinkingCount) => {
  if (!gate?.enabled) return false;
  const quizCount = Number(comprehensionCount) || 0;
  const thinkingCount = Number(criticalThinkingCount) || 0;
  return gate.lockScope === 'quiz_and_thinking'
    ? quizCount + thinkingCount > 0
    : quizCount > 0;
};

/** Word count of the version the student is viewing, used for the automatic time. */
export const wordCountForLevel = (text, level) => {
  const raw = readRaw(text);
  const versions = Array.isArray(raw.simplifiedVersions) ? raw.simplifiedVersions : [];
  if (versions.length === 0) return countWords(raw.originalText);
  const target = Number(level);
  const match = Number.isFinite(target)
    ? versions.find((version) => Number(version.targetLevel) === target)
    : null;
  return countWords(match?.simplifiedText || raw.originalText);
};
