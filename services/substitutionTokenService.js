import crypto from 'crypto';
import SubRequestToken from '../models/SubRequestToken.js';

const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically secure random token.
 * @returns {string} Raw token (hex-encoded)
 */
export function generateRawToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Hash token with SHA-256 for storage.
 * @param {string} token - Raw token
 * @returns {string} Hash
 */
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create and store a token for an assignment.
 * @param {Object} params
 * @param {ObjectId} params.schoolId
 * @param {ObjectId} params.requestId
 * @param {ObjectId} params.assignmentId
 * @param {ObjectId} params.periodId
 * @param {ObjectId} params.substituteTeacherId
 * @param {Date} params.expiresAt
 * @returns {Promise<{rawToken: string, tokenDoc: Object}>}
 */
export async function createToken({ schoolId, requestId, assignmentId, periodId, substituteTeacherId, expiresAt }) {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    const tokenDoc = await SubRequestToken.create({
        school: schoolId,
        requestId,
        assignmentId,
        periodId,
        substituteTeacherId,
        tokenHash,
        expiresAt
    });

    return { rawToken, tokenDoc };
}

/**
 * Validate token: unused and not expired.
 * @param {string} rawToken
 * @returns {Promise<{valid: boolean, tokenDoc?: Object, requestId?: ObjectId, assignmentId?: ObjectId, substituteTeacherId?: ObjectId}>}
 */
export async function validateToken(rawToken) {
    const tokenHash = hashToken(rawToken);
    const tokenDoc = await SubRequestToken.findOne({ tokenHash }).setOptions({ skipTenantFilter: true });

    if (!tokenDoc) {
        return { valid: false };
    }

    if (tokenDoc.usedAt) {
        return { valid: false };
    }

    if (new Date() > new Date(tokenDoc.expiresAt)) {
        return { valid: false };
    }

    return {
        valid: true,
        tokenDoc,
        requestId: tokenDoc.requestId,
        assignmentId: tokenDoc.assignmentId,
        substituteTeacherId: tokenDoc.substituteTeacherId
    };
}

/**
 * Mark token as used (burn it).
 * @param {ObjectId} tokenDocId
 */
export async function markTokenUsed(tokenDocId) {
    await SubRequestToken.findByIdAndUpdate(tokenDocId, { usedAt: new Date() });
}

/**
 * Atomically claim token (set usedAt) if still unused. Prevents double-use race.
 * @param {string} rawToken
 * @returns {Promise<{claimed: boolean, tokenDoc?: Object}>}
 */
export async function claimToken(rawToken) {
    const tokenHash = hashToken(rawToken);
    const tokenDoc = await SubRequestToken.findOneAndUpdate(
        { tokenHash, usedAt: null },
        { $set: { usedAt: new Date() } },
        { new: true }
    ).setOptions({ skipTenantFilter: true });

    if (!tokenDoc) return { claimed: false };
    return { claimed: true, tokenDoc };
}
