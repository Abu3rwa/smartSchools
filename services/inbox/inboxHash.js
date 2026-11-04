import crypto from 'crypto';

/** Tells a refresh whether the stored copy of an email still matches Gmail. */
export const hashBody = (subject, bodyText) =>
    crypto
        .createHash('sha256')
        .update(`${String(subject ?? '').trim()}\n${String(bodyText ?? '').trim()}`)
        .digest('hex');
