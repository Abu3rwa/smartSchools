// Stateless preview receipt. The token binds the school, actor, the exact
// effective import plan (file, type, destination, operation, metadata and
// mappings) and the destination's authoring revision, so a commit can only
// apply the result the teacher actually reviewed.
import crypto from 'node:crypto';

export const PREVIEW_TTL_MS = 30 * 60 * 1000;
const TOKEN_VERSION = 'plan1';

const secret = () => process.env.JWT_SECRET || process.env.JWT_REFRESH_SECRET || 'language-games-preview';

const signatureFor = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export const fingerprintOf = (plan) => crypto
    .createHash('sha256')
    .update(JSON.stringify(plan), 'utf8')
    .digest('hex');

export const createPlanToken = ({ schoolId, userId, fingerprint, packRevision = null, now = Date.now() }) => {
    const expiresAt = now + PREVIEW_TTL_MS;
    const payload = JSON.stringify({
        v: TOKEN_VERSION,
        school: String(schoolId),
        user: String(userId),
        fingerprint,
        revision: packRevision === null ? null : Number(packRevision),
        expiresAt
    });
    const token = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signatureFor(payload)}`;
    return { token, expiresAt: new Date(expiresAt) };
};

export const verifyPlanToken = ({ token, schoolId, userId, now = Date.now() }) => {
    const [encoded, signature] = String(token || '').split('.');
    if (!encoded || !signature) throw new Error('Import preview token is missing or malformed');
    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const expected = signatureFor(payload);
    const given = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
        throw new Error('Import preview token is not valid');
    }
    let parsed;
    try {
        parsed = JSON.parse(payload);
    } catch {
        throw new Error('Import preview token is not valid');
    }
    if (parsed.v !== TOKEN_VERSION || parsed.school !== String(schoolId) || parsed.user !== String(userId)) {
        throw new Error('Import preview was made for a different import');
    }
    if (Number(parsed.expiresAt) < now) throw new Error('Import preview expired; preview the file again');
    return { fingerprint: parsed.fingerprint, packRevision: parsed.revision };
};
