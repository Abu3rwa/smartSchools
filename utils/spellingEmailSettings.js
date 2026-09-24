export const SPELLING_EMAIL_AUDIENCES = Object.freeze([
    'none',
    'student-only',
    'parents-only',
    'student-and-parents'
]);

export const DEFAULT_SPELLING_EMAIL_AUDIENCE = 'student-and-parents';

export const isSpellingEmailAudience = (value) => SPELLING_EMAIL_AUDIENCES.includes(value);
