import crypto from 'crypto';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getSecret = () => {
    const secret = process.env.GOOGLE_CLASSROOM_OAUTH_STATE_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OAuth state secret is not configured');
    return secret;
};

const sign = (encodedPayload) =>
    crypto.createHmac('sha256', getSecret()).update(encodedPayload).digest('base64url');

export const buildSignedState = (userId, now = Date.now()) => {
    const payload = {
        userId,
        purpose: 'google-classroom',
        nonce: crypto.randomBytes(16).toString('hex'),
        exp: now + OAUTH_STATE_TTL_MS
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const parseSignedState = (state, now = Date.now()) => {
    if (!state || typeof state !== 'string') return null;
    const [encodedPayload, signature, extra] = state.split('.');
    if (!encodedPayload || !signature || extra !== undefined) return null;

    const actual = Buffer.from(signature);
    const expected = Buffer.from(sign(encodedPayload));
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    let payload;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (payload?.purpose !== 'google-classroom') return null;
    if (!payload?.userId || !payload?.exp || now > payload.exp) return null;
    return payload;
};
