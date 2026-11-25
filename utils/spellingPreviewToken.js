import crypto from 'crypto';

const DOMAIN = 'spelling-library-preview-v1';
const TOKEN_MAX_BYTES = 16384;
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export const canonicalStringify = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
};

export const hashPayload = (value) => crypto
    .createHash('sha256')
    .update(canonicalStringify(value))
    .digest('hex');

const secretOrThrow = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Preview signing is not configured');
    return secret;
};

const sign = (payloadB64, secret) => crypto
    .createHmac('sha256', secret)
    .update(`${DOMAIN}.${payloadB64}`)
    .digest('base64url');

export const createPreviewToken = (payload, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) => {
    const secret = secretOrThrow();
    const body = {
        ...payload,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString()
    };
    const payloadB64 = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const token = `${payloadB64}.${sign(payloadB64, secret)}`;
    if (Buffer.byteLength(token) > TOKEN_MAX_BYTES) {
        throw new Error('Preview token exceeds the size limit');
    }
    return token;
};

export const verifyPreviewToken = (token, { now = Date.now() } = {}) => {
    const raw = String(token || '');
    if (!raw || Buffer.byteLength(raw) > TOKEN_MAX_BYTES) return { ok: false, reason: 'missing' };
    const [payloadB64, signature] = raw.split('.');
    if (!payloadB64 || !signature) return { ok: false, reason: 'malformed' };
    const expected = sign(payloadB64, secretOrThrow());
    const received = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (received.length !== wanted.length || !crypto.timingSafeEqual(received, wanted)) {
        return { ok: false, reason: 'signature' };
    }
    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    if (new Date(payload.expiresAt).getTime() <= now) return { ok: false, reason: 'expired' };
    return { ok: true, payload };
};

/** Compares the previewed state with the transaction's re-read state. */
export const previewMatches = (preview, expected) => canonicalStringify(preview) === canonicalStringify(expected);
