import crypto from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

const getSecret = () => {
    const secret = String(process.env.GOOGLE_FORMS_OAUTH_STATE_SECRET || process.env.JWT_SECRET || '').trim();
    if (!secret) throw new Error('Google Forms OAuth state secret is not configured');
    return secret;
};

const sign = (payload) => crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

export const buildGoogleFormsOAuthState = (userId, now = Date.now()) => {
    const payload = Buffer.from(JSON.stringify({
        userId: String(userId),
        purpose: 'google-forms',
        nonce: crypto.randomBytes(16).toString('hex'),
        exp: now + STATE_TTL_MS
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
};

export const parseGoogleFormsOAuthState = (state, now = Date.now()) => {
    if (typeof state !== 'string') return null;
    const [payload, signature, extra] = state.split('.');
    if (!payload || !signature || extra !== undefined) return null;

    const actual = Buffer.from(signature);
    const expected = Buffer.from(sign(payload));
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    try {
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decoded.purpose !== 'google-forms' || !decoded.userId || !decoded.exp || now > decoded.exp) return null;
        return decoded;
    } catch {
        return null;
    }
};
