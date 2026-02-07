import express from 'express';
import gmailOAuthService from '../services/gmailOAuthService.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   GET /api/auth/gmail/url
 * @desc    Get Google OAuth authorization URL
 * @access  Private
 */
router.get('/url', protect, async (req, res) => {
    try {
        const authUrl = gmailOAuthService.getAuthUrl(req.user._id.toString());

        res.json({
            success: true,
            authUrl
        });
    } catch (error) {
        console.error('Error generating auth URL:', error);
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
    try {
        const { code, state: userId, error } = req.query;

        if (error) {
            return res.redirect(`${process.env.CLIENT_URL}/settings?gmail_error=${encodeURIComponent(error)}`);
        }

        if (!code || !userId) {
            return res.redirect(`${process.env.CLIENT_URL}/settings?gmail_error=missing_parameters`);
        }

        // Exchange code for tokens
        const tokens = await gmailOAuthService.exchangeCodeForTokens(code);

        // Store tokens for user
        await gmailOAuthService.storeTokens(userId, tokens);

        // Redirect back to client with success
        res.redirect(`${process.env.CLIENT_URL}/settings?gmail_connected=true`);
    } catch (error) {
        console.error('Gmail OAuth callback error:', error);
        res.redirect(`${process.env.CLIENT_URL}/settings?gmail_error=${encodeURIComponent(error.message)}`);
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
        console.error('Error getting Gmail status:', error);
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
        console.error('Error disconnecting Gmail:', error);
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

        const mailOptions = {
            to: to || req.user.email,
            subject: 'GradeBook - Gmail Connection Test',
            text: 'This is a test email from GradeBook to verify your Gmail connection is working.',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2c3e50;">✅ Gmail Connected Successfully!</h2>
                    <p>This is a test email from GradeBook to verify your Gmail connection is working.</p>
                    <p>You can now send grade notifications and reports to parents using your Gmail account.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #6c757d; font-size: 12px;">This is an automated test message from GradeBook.</p>
                </div>
            `
        };

        await gmailOAuthService.sendEmail(req.user._id.toString(), mailOptions);

        res.json({
            success: true,
            message: 'Test email sent successfully'
        });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
