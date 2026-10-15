import express from 'express';
import crypto from 'crypto';
import gmailOAuthService from '../services/gmailOAuthService.js';
import { getPlatformBranding } from '../services/platformBrandingService.js';
import { protect } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OAUTH_STATE_SECRET = process.env.GMAIL_OAUTH_STATE_SECRET || process.env.JWT_SECRET;

const signStatePayload = (encodedPayload) => {
    if (!OAUTH_STATE_SECRET) {
        throw new Error('OAuth state secret is not configured');
    }
    return crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(encodedPayload).digest('base64url');
};

const buildSignedState = (userId, returnTo = 'settings', cleanupAccess = false) => {
    const payload = {
        userId,
        returnTo: returnTo === 'notifications' ? 'notifications' : 'settings',
        cleanupAccess,
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

    let payload;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }

    if (!payload?.userId || !payload?.exp || Date.now() > payload.exp) {
        return null;
    }

    return payload;
};

/**
 * @route   GET /api/auth/gmail/url
 * @desc    Get Google OAuth authorization URL
 * @access  Private
 */
router.get('/url', protect, async (req, res) => {
    try {
        const cleanupAccess = req.query.cleanup === 'true';
        const returnTo = req.query.returnTo === 'notifications' ? 'notifications' : 'settings';
        const state = buildSignedState(req.user._id.toString(), returnTo, cleanupAccess);
        const authUrl = gmailOAuthService.getAuthUrl(state, { includeModifyScope: cleanupAccess });

        res.json({
            success: true,
            authUrl
        });
    } catch (error) {
        logger.error('Error generating auth URL:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * @route   GET /api/auth/gmail/callback
 * @desc    Handle OAuth callback from Google
 * @access  Public (state contains user ID)
 */
router.get('/callback', async (req, res) => {
    let redirectPath = '/settings';
    let cleanupAccess = false;
    try {
        const { code, state, error } = req.query;
        const parsedState = parseSignedState(state);
        redirectPath = parsedState?.returnTo === 'notifications' ? '/portal/notifications' : '/settings';
        cleanupAccess = Boolean(parsedState?.cleanupAccess);

        if (error) {
            const queryKey = parsedState?.cleanupAccess ? 'gmail_cleanup_error' : 'gmail_error';
            return res.redirect(`${process.env.CLIENT_URL}${redirectPath}?${queryKey}=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
            const queryKey = cleanupAccess ? 'gmail_cleanup_error' : 'gmail_error';
            const query = cleanupAccess ? `?tab=gmail-cleanup&${queryKey}=missing_parameters` : `?${queryKey}=missing_parameters`;
            return res.redirect(`${process.env.CLIENT_URL}${redirectPath}${query}`);
        }

        if (!parsedState?.userId) {
            return res.redirect(`${process.env.CLIENT_URL}/settings?gmail_error=invalid_state`);
        }

        // Exchange code for tokens
        const tokens = await gmailOAuthService.exchangeCodeForTokens(code, false);
        const grantedScopes = String(tokens.scope || '').split(/\s+/);
        if (parsedState.cleanupAccess && !grantedScopes.includes('https://www.googleapis.com/auth/gmail.modify')) {
            return res.redirect(`${process.env.CLIENT_URL}${redirectPath}?tab=gmail-cleanup&gmail_cleanup_error=missing_scope`);
        }

        // Store tokens for user
        await gmailOAuthService.storeTokens(parsedState.userId, tokens);

        // Redirect back to client with success
        const queryKey = parsedState.cleanupAccess ? 'gmail_cleanup_connected' : 'gmail_connected';
        const query = parsedState.cleanupAccess ? `?tab=gmail-cleanup&${queryKey}=true` : `?${queryKey}=true`;
        res.redirect(`${process.env.CLIENT_URL}${redirectPath}${query}`);
    } catch (error) {
        logger.error('Gmail OAuth callback error:', error);
        const queryKey = cleanupAccess ? 'gmail_cleanup_error' : 'gmail_error';
        const query = cleanupAccess ? `?tab=gmail-cleanup&${queryKey}=` : `?${queryKey}=`;
        res.redirect(`${process.env.CLIENT_URL}${redirectPath}${query}${encodeURIComponent(error.message)}`);
    }
});

/**
 * @route   GET /api/auth/gmail/status
 * @desc    Get Gmail connection status
 * @access  Private
 */
router.get('/status', protect, async (req, res) => {
    try {
        const status = await gmailOAuthService.getTokenStatus(req.user._id.toString());

        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error('Error getting Gmail status:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * @route   DELETE /api/auth/gmail/disconnect
 * @desc    Disconnect Gmail account
 * @access  Private
 */
router.delete('/disconnect', protect, async (req, res) => {
    try {
        await gmailOAuthService.revokeTokens(req.user._id.toString());

        res.json({
            success: true,
            message: 'Gmail account disconnected successfully'
        });
    } catch (error) {
        logger.error('Error disconnecting Gmail:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * @route   POST /api/auth/gmail/test
 * @desc    Send a test email to verify connection
 * @access  Private
 */
router.post('/test', protect, async (req, res) => {
    try {
        const { to } = req.body;
        const branding = await getPlatformBranding();
        const appName = branding.appName;

        const mailOptions = {
            to: to || req.user.email,
            subject: `${appName} - Gmail Connection Test`,
            text: `This is a test email from ${appName} to verify your Gmail connection is working.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0f172a;">✅ Gmail Connected Successfully!</h2>
                    <p>This is a test email from ${appName} to verify your Gmail connection is working.</p>
                    <p>You can now send grade notifications and reports to parents using your Gmail account.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #334155; font-size: 12px;">This is an automated test message from ${appName}.</p>
                </div>
            `
        };

        await gmailOAuthService.sendEmail(req.user._id.toString(), mailOptions);

        res.json({
            success: true,
            message: 'Test email sent successfully'
        });
    } catch (error) {
        logger.error('Error sending test email:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
