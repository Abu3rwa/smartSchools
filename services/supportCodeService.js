import crypto from 'crypto';

export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^\d{6}$/;
export const MAX_FAILED_ATTEMPTS = 8;
export const LOCK_MINUTES = 20;

const pepper = () => (
    process.env.SUPPORT_CODE_PEPPER
    || process.env.JWT_SECRET
    || 'gradebook-support-code'
);

export const normalizeCode = (raw) => String(raw ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);

export const isWellFormedCode = (code) => CODE_PATTERN.test(normalizeCode(code));

/** A six-digit code that never starts with zero, so it is easy to read aloud. */
export const generateCode = (randomInt = crypto.randomInt) => {
    const value = randomInt(100000, 1000000);
    return String(value);
};

export const hashCode = (code) => crypto
    .createHmac('sha256', pepper())
    .update(normalizeCode(code))
    .digest('hex');

export const codeHint = (code) => normalizeCode(code).slice(-2);

export const verifyCode = (code, hash) => {
    if (!hash || !isWellFormedCode(code)) return false;
    const expected = Buffer.from(String(hash), 'hex');
    const actual = Buffer.from(hashCode(code), 'hex');
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
};

export const isLocked = (respondent, now = new Date()) => (
    Boolean(respondent?.lockedUntil) && respondent.lockedUntil > now
);

export const lockStateAfterFailure = (failedAttempts = 0, now = new Date()) => {
    const attempts = failedAttempts + 1;
    if (attempts < MAX_FAILED_ATTEMPTS) {
        return { failedAttempts: attempts, lockedUntil: null };
    }
    return {
        failedAttempts: 0,
        lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000),
    };
};
