import crypto from 'crypto';
import express from 'express';
import { protect } from '../middleware/auth.js';
import googleDriveOAuthService from '../services/googleDriveOAuthService.js';
import logger from '../utils/logger.js';

const router = express.Router();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_SECRET = process.env.GOOGLE_DRIVE_OAUTH_STATE_SECRET || process.env.JWT_SECRET;

const signStatePayload = (encodedPayload) => {
    if (!OAUTH_STATE_SECRET) {
        throw new Error('OAuth state secret is not configured');
    }
    return crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(encodedPayload).digest('base64url');
};

const buildSignedState = (userId) => {
    const payload = {
        userId,
        nonce: crypto.randomBytes(16).toString('hex'),
        exp: Date.now() + OAUTH_STATE_TTL_MS
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = signStatePayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
};

const parseSignedState = (state) => {
    if (!state || typeof state !== 'string') return null;
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) return null;

    const expectedSignature = signStatePayload(encodedPayload);
    const actualSigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);
    if (
        actualSigBuffer.length !== expectedSigBuffer.length ||
        !crypto.timingSafeEqual(actualSigBuffer, expectedSigBuffer)
    ) {
        return null;
    }

    let payload = null;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!payload?.userId || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
};

router.get('/url', protect, async (req, res) => {
    try {
        const state = buildSignedState(req.user._id.toString());
        const authUrl = googleDriveOAuthService.getAuthUrl(state);
        return res.json({ success: true, authUrl });
    } catch (error) {
        logger.error('Error generating Google Drive auth URL:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/callback', async (req, res) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    try {
        const { code, state, error } = req.query;
        if (error) return res.redirect(`${clientUrl}/curriculum?drive_error=${encodeURIComponent(error)}`);
        if (!code || !state) return res.redirect(`${clientUrl}/curriculum?drive_error=missing_parameters`);

        const parsedState = parseSignedState(state);
        if (!parsedState?.userId) {
            return res.redirect(`${clientUrl}/curriculum?drive_error=invalid_state`);
        }

        const tokens = await googleDriveOAuthService.exchangeCodeForTokens(code);
        await googleDriveOAuthService.storeTokens(parsedState.userId, tokens);
        return res.redirect(`${clientUrl}/curriculum?drive_connected=true`);
    } catch (err) {
        logger.error('Google Drive OAuth callback error:', err);
        return res.redirect(`${clientUrl}/curriculum?drive_error=${encodeURIComponent(err.message || 'oauth_failed')}`);
    }
});

router.get('/status', protect, async (req, res) => {
    try {
        const status = await googleDriveOAuthService.getTokenStatus(req.user._id.toString());
        return res.json({ success: true, ...status });
    } catch (error) {
        logger.error('Error getting Google Drive status:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/disconnect', protect, async (req, res) => {
    try {
        await googleDriveOAuthService.revokeTokens(req.user._id.toString());
        return res.json({ success: true, message: 'Google Drive disconnected successfully' });
    } catch (error) {
        logger.error('Error disconnecting Google Drive:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

export default router;

