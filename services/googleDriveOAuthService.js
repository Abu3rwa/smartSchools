import { google } from 'googleapis';
import User from '../models/User.js';
import logger from '../utils/logger.js';

class GoogleDriveOAuthService {
    constructor() {
        this.oauth2Client = null;
        this.initialize();
    }

    initialize() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback';

        if (clientId && clientSecret) {
            this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        } else {
            logger.warn('Google Drive OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
        }
    }

    getAuthUrl(state = 'drive') {
        if (!this.oauth2Client) {
            throw new Error('Google OAuth not configured');
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback'
        );

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile'
            ],
            prompt: 'consent',
            state
        });
    }

    async exchangeCodeForTokens(code) {
        if (!this.oauth2Client) {
            throw new Error('Google OAuth not configured');
        }
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback'
        );
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    }

    async getUserEmail(accessToken) {
        this.oauth2Client.setCredentials({ access_token: accessToken });
        const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
        const { data } = await oauth2.userinfo.get();
        return data.email;
    }

    async storeTokens(userId, tokens) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        const email = await this.getUserEmail(tokens.access_token);
        await user.updateGoogleDriveTokens(tokens, email);
        return user;
    }

    async refreshTokenIfNeeded(userId, force = false) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        if (!user.hasGoogleDriveConnected()) {
            throw new Error('Google Drive not connected. Please connect your Google account first.');
        }
        if (!force && !user.googleDriveTokenNeedsRefresh()) return user;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback'
        );
        oauth2Client.setCredentials({
            refresh_token: user.googleDriveTokens.refreshToken
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        await user.updateGoogleDriveTokens(credentials, user.googleDriveTokens.email);
        return user;
    }

    async buildDriveClient(userId) {
        const user = await this.refreshTokenIfNeeded(userId, false);
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback'
        );
        oauth2Client.setCredentials({
            access_token: user.googleDriveTokens.accessToken,
            refresh_token: user.googleDriveTokens.refreshToken
        });
        return {
            user,
            drive: google.drive({ version: 'v3', auth: oauth2Client })
        };
    }

    parseGoogleDocId(value = '') {
        const input = String(value || '').trim();
        if (!input) return null;

        if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;

        const match = input.match(/\/document\/d\/([a-zA-Z0-9_-]+)/i);
        if (match?.[1]) return match[1];
        return null;
    }

    async exportGoogleDocAsText({ userId, docId }) {
        const resolvedDocId = this.parseGoogleDocId(docId);
        if (!resolvedDocId) {
            throw new Error('Invalid Google Doc id or URL');
        }

        const { drive } = await this.buildDriveClient(userId);
        const metaResponse = await drive.files.get({
            fileId: resolvedDocId,
            fields: 'id,name,mimeType'
        });

        const mimeType = String(metaResponse?.data?.mimeType || '');
        if (mimeType !== 'application/vnd.google-apps.document') {
            throw new Error('Only Google Docs are supported for import');
        }

        const exportResponse = await drive.files.export(
            { fileId: resolvedDocId, mimeType: 'text/plain' },
            { responseType: 'arraybuffer' }
        );

        const buffer = Buffer.from(exportResponse.data || '');
        return {
            docId: resolvedDocId,
            title: metaResponse?.data?.name || 'Google Doc',
            mimeType: 'text/plain',
            buffer,
            text: buffer.toString('utf8')
        };
    }

    async hasValidTokens(userId) {
        try {
            const user = await User.findById(userId);
            return user?.hasGoogleDriveConnected() || false;
        } catch {
            return false;
        }
    }

    async getTokenStatus(userId) {
        const user = await User.findById(userId);
        if (!user || !user.hasGoogleDriveConnected()) {
            return {
                connected: false,
                email: null,
                expiresAt: null
            };
        }

        return {
            connected: true,
            email: user.googleDriveTokens.email,
            expiresAt: user.googleDriveTokens.expiryDate,
            needsRefresh: user.googleDriveTokenNeedsRefresh()
        };
    }

    async revokeTokens(userId) {
        const user = await User.findById(userId);
        if (!user || !user.hasGoogleDriveConnected()) return;

        try {
            this.oauth2Client.setCredentials({ access_token: user.googleDriveTokens.accessToken });
            await this.oauth2Client.revokeCredentials();
        } catch (error) {
            logger.warn('Could not revoke Google Drive token with Google:', error.message);
        }

        await user.clearGoogleDriveTokens();
    }
}

export default new GoogleDriveOAuthService();

