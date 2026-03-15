import { google } from 'googleapis';
import User from '../models/User.js';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { getPlatformBranding } from './platformBrandingService.js';

class GmailOAuthService {
    constructor() {
        this.oauth2Client = null;
        this.initialize();
    }

    initialize() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/gmail/callback';

        if (clientId && clientSecret) {
            this.oauth2Client = new google.auth.OAuth2(
                clientId,
                clientSecret,
                redirectUri
            );
        } else {
            logger.warn('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
        }
    }

    /**
     * Get the OAuth2 authorization URL
     * @param {string} state - State to pass through (userId or 'login')
     * @returns {string} Authorization URL
     */
    getAuthUrl(state = 'login') {
        if (!this.oauth2Client) {
            throw new Error('Google OAuth not configured');
        }

        const scopes = [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ];

        // Use the Google login callback for login flow
        const redirectUri = state === 'login'
            ? (process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback')
            : (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/gmail/callback');

        // Create a new OAuth2 client with the correct redirect URI
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent', // Force consent to always get refresh token
            state: state
        });
    }

    /**
     * Exchange authorization code for tokens
     * @param {string} code - Authorization code from OAuth callback
     * @param {boolean} isLogin - Whether this is a login flow (uses different redirect URI)
     * @returns {Object} Token response
     */
    async exchangeCodeForTokens(code, isLogin = true) {
        if (!this.oauth2Client) {
            throw new Error('Google OAuth not configured');
        }

        // Use the correct redirect URI based on flow type
        const redirectUri = isLogin
            ? (process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback')
            : (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/gmail/callback');

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );

        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    }

    /**
     * Get user email from access token
     * @param {string} accessToken - Access token
     * @returns {string} User email
     */
    async getUserEmail(accessToken) {
        this.oauth2Client.setCredentials({ access_token: accessToken });

        const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
        const { data } = await oauth2.userinfo.get();

        return data.email;
    }

    /**
     * Get user profile (name, picture) from access token
     * @param {string} accessToken - Access token
     * @returns {Object} User profile
     */
    async getUserProfile(accessToken) {
        this.oauth2Client.setCredentials({ access_token: accessToken });

        const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
        const { data } = await oauth2.userinfo.get();

        return {
            email: data.email,
            given_name: data.given_name || '',
            family_name: data.family_name || '',
            picture: data.picture || null
        };
    }

    /**
     * Store tokens for a user
     * @param {string} userId - User ID
     * @param {Object} tokens - OAuth tokens
     * @returns {Object} Updated user
     */
    async storeTokens(userId, tokens) {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const email = await this.getUserEmail(tokens.access_token);
        await user.updateGmailTokens(tokens, email);

        return user;
    }

    /**
     * Refresh access token if needed
     * @param {string} userId - User ID
     * @returns {Object} User with updated tokens
     */
    async refreshTokenIfNeeded(userId, force = false) {
        const user = await User.findById(userId);

        if (!user) {
            throw new Error('User not found');
        }

        if (!user.hasGmailConnected()) {
            throw new Error('Gmail not connected. Please authenticate with Google first.');
        }

        if (!force && !user.gmailTokenNeedsRefresh()) {
            return user;
        }

        logger.info(`Refreshing Gmail token for user ${user.gmailTokens.email}`, { force });

        try {
            // Create a local client to avoid race conditions
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
            );

            oauth2Client.setCredentials({
                refresh_token: user.gmailTokens.refreshToken
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            await user.updateGmailTokens(credentials, user.gmailTokens.email);

            return user;
        } catch (error) {
            logger.error('Error refreshing token:', error.message);
            throw error;
        }
    }

    /**
     * Build raw RFC 2822 email (supports HTML + MIME attachments).
     * @param {object} message
     * @returns {Promise<string>} base64url encoded message
     */
    async buildRawGmailMessage(message = {}) {
        const composer = nodemailer.createTransport({
            streamTransport: true,
            buffer: true,
            newline: 'unix'
        });

        const info = await composer.sendMail({
            from: message.from,
            to: message.to,
            ...(message.cc ? { cc: message.cc } : {}),
            subject: message.subject || '',
            text: message.text || '',
            html: message.html || message.text || '',
            attachments: Array.isArray(message.attachments) ? message.attachments : []
        });

        const rawMessage = Buffer.isBuffer(info.message)
            ? info.message
            : Buffer.from(String(info.message || ''), 'utf8');

        return rawMessage
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Internal helper: send message via Gmail API
     * @param {object} oauth2Client - Configured OAuth2 client
     * @param {string} from - From email
     * @param {string} to - Recipient email
     * @param {object} mailOptions - mail options (subject, text, html, attachments)
     * @returns {Promise<object>} Gmail API response
     */
    async sendViaGmailApi(oauth2Client, from, to, mailOptions) {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const encodedEmail = await this.buildRawGmailMessage({
            from,
            to,
            cc: mailOptions.cc,
            subject: mailOptions.subject || '',
            text: mailOptions.text || '',
            html: mailOptions.html || mailOptions.text || '',
            attachments: mailOptions.attachments || []
        });

        return gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedEmail
            }
        });
    }

    /**
     * Send email using Gmail OAuth via Gmail API (preferred)
     * @param {string} userId - User ID
     * @param {Object} mailOptions - mail options (to, subject, text, html)
     * @returns {Object} Send result (Gmail API response)
     */
    async sendEmail(userId, mailOptions) {
        try {
            const user = await this.refreshTokenIfNeeded(userId, false);
            const branding = await getPlatformBranding();

            if (!user.gmailTokens || !user.gmailTokens.email) {
                throw new Error('Gmail not connected. Please authenticate with Google first.');
            }

            const fromName = user.fullName || user.firstName || branding.appName;
            const fromEmail = user.gmailTokens.email;
            const from = mailOptions.from || `"${fromName}" <${fromEmail}>`;
            const to = mailOptions.to;

            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
            );

            oauth2Client.setCredentials({
                access_token: user.gmailTokens.accessToken,
                refresh_token: user.gmailTokens.refreshToken
            });

            const result = await this.sendViaGmailApi(oauth2Client, from, to, mailOptions);
            return {
                messageId: result.data.id,
                threadId: result.data.threadId,
                raw: result.data
            };
        } catch (error) {
            logger.error('Send attempt 1 failed:', error.message);

            // If auth-related error, force refresh and retry once
            if (error.code === 401 || error.code === 403) {
                logger.info('Auth failed (Gmail API), forcing token refresh and retrying');
                const user = await this.refreshTokenIfNeeded(userId, true);
                const branding = await getPlatformBranding();

                if (!user.gmailTokens || !user.gmailTokens.email) {
                    throw error;
                }

                const fromName = user.fullName || user.firstName || branding.appName;
                const fromEmail = user.gmailTokens.email;
                const from = mailOptions.from || `"${fromName}" <${fromEmail}>`;
                const to = mailOptions.to;

                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback'
                );

                oauth2Client.setCredentials({
                    access_token: user.gmailTokens.accessToken,
                    refresh_token: user.gmailTokens.refreshToken
                });

                const result = await this.sendViaGmailApi(oauth2Client, from, to, mailOptions);
                return {
                    messageId: result.data.id,
                    threadId: result.data.threadId,
                    raw: result.data
                };
            }

            throw error;
        }
    }

    /**
     * Check if a user has valid Gmail tokens
     * @param {string} userId - User ID
     * @returns {boolean} Whether user has valid tokens
     */
    async hasValidTokens(userId) {
        try {
            const user = await User.findById(userId);
            return user?.hasGmailConnected() || false;
        } catch {
            return false;
        }
    }

    /**
     * Get token status for a user
     * @param {string} userId - User ID
     * @returns {Object} Token status
     */
    async getTokenStatus(userId) {
        const user = await User.findById(userId);

        if (!user || !user.hasGmailConnected()) {
            return {
                connected: false,
                email: null,
                expiresAt: null
            };
        }

        return {
            connected: true,
            email: user.gmailTokens.email,
            expiresAt: user.gmailTokens.expiryDate,
            needsRefresh: user.gmailTokenNeedsRefresh()
        };
    }

    /**
     * Revoke and delete tokens for a user
     * @param {string} userId - User ID
     */
    async revokeTokens(userId) {
        const user = await User.findById(userId);

        if (user && user.hasGmailConnected()) {
            // Try to revoke the token with Google
            try {
                this.oauth2Client.setCredentials({
                    access_token: user.gmailTokens.accessToken
                });
                await this.oauth2Client.revokeCredentials();
            } catch (error) {
                logger.warn('Could not revoke token with Google:', error.message);
            }

            // Clear tokens from user
            await user.clearGmailTokens();
        }
    }
}

export default new GmailOAuthService();
