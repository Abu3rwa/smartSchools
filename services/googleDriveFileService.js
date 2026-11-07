import { Readable } from 'node:stream';
import { google } from 'googleapis';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { GOOGLE_DRIVE_FILE_SCOPES, hasDriveFileScope } from '../config/googleDriveFileScopes.js';

const DRIVE_FILE_FIELDS = 'id,name,mimeType,size,webViewLink,iconLink';

const connectionError = () => {
    const error = new Error('Connect Google Drive for attachments before uploading files.');
    error.code = 'DRIVE_FILE_NOT_CONNECTED';
    error.statusCode = 403;
    return error;
};

const driveApiError = (error) => {
    const wrapped = new Error('Google Drive rejected the request. Try again, or reconnect Google Drive for attachments.');
    wrapped.code = 'DRIVE_FILE_API_FAILED';
    wrapped.statusCode = 502;
    wrapped.expose = true;
    logger.error('google_drive_file_api_failed', {
        code: error?.code,
        message: error?.message
    });
    return wrapped;
};

const isNotFound = (error) =>
    Number(error?.code) === 404 || Number(error?.response?.status) === 404;

/**
 * Sibling of googleDriveOAuthService, never a replacement: that connection is
 * drive.readonly for curriculum imports, this one is drive.file for assignment
 * attachments and uses its own token store on the user.
 */
class GoogleDriveFileService {
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
        }
    }

    buildOAuthClient() {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth not configured');
        }
        return new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google-drive/callback'
        );
    }

    getAuthUrl(state) {
        return this.buildOAuthClient().generateAuthUrl({
            access_type: 'offline',
            scope: [...GOOGLE_DRIVE_FILE_SCOPES],
            prompt: 'consent',
            state
        });
    }

    async exchangeCodeForTokens(code) {
        const { tokens } = await this.buildOAuthClient().getToken(code);
        return tokens;
    }

    async storeTokens(userId, tokens) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        const oauth2Client = this.buildOAuthClient();
        oauth2Client.setCredentials({ access_token: tokens.access_token });
        const { data } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
        await user.updateGoogleDriveFileTokens(tokens, data.email);
        return user;
    }

    async refreshTokenIfNeeded(userId) {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');
        if (!user.hasGoogleDriveFileConnected()) throw connectionError();
        if (!user.googleDriveFileTokenNeedsRefresh()) return user;

        const oauth2Client = this.buildOAuthClient();
        oauth2Client.setCredentials({ refresh_token: user.googleDriveFileTokens.refreshToken });
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            await user.updateGoogleDriveFileTokens(credentials, user.googleDriveFileTokens.email);
        } catch (error) {
            logger.error('google_drive_file_refresh_failed', { user: String(userId), message: error?.message });
            throw connectionError();
        }
        return user;
    }

    async buildDriveClient(userId) {
        const user = await this.refreshTokenIfNeeded(userId);
        if (!hasDriveFileScope(user.googleDriveFileTokens?.grantedScopes)) {
            throw connectionError();
        }
        const oauth2Client = this.buildOAuthClient();
        oauth2Client.setCredentials({
            access_token: user.googleDriveFileTokens.accessToken,
            refresh_token: user.googleDriveFileTokens.refreshToken
        });
        return { user, drive: google.drive({ version: 'v3', auth: oauth2Client }) };
    }

    async isConnected(userId) {
        try {
            const user = await User.findById(userId);
            return Boolean(
                user?.hasGoogleDriveFileConnected()
                && hasDriveFileScope(user.googleDriveFileTokens?.grantedScopes)
            );
        } catch {
            return false;
        }
    }

    async getTokenStatus(userId) {
        const user = await User.findById(userId);
        const connected = Boolean(
            user?.hasGoogleDriveFileConnected()
            && hasDriveFileScope(user.googleDriveFileTokens?.grantedScopes)
        );
        return { connected, email: connected ? user.googleDriveFileTokens.email : null };
    }

    /** Uploads one file, then makes it viewable by anyone with the link. */
    async uploadAttachmentFile(userId, file) {
        const { drive } = await this.buildDriveClient(userId);
        let created;
        try {
            const response = await drive.files.create({
                requestBody: { name: file.originalname || 'attachment' },
                media: {
                    mimeType: file.mimetype || 'application/octet-stream',
                    body: Readable.from(file.buffer)
                },
                fields: DRIVE_FILE_FIELDS
            });
            created = response.data;
        } catch (error) {
            throw driveApiError(error);
        }

        try {
            await drive.permissions.create({
                fileId: created.id,
                requestBody: { role: 'reader', type: 'anyone' }
            });
        } catch (error) {
            // Never leave an unshared orphan the teacher can't find in the app.
            await drive.files.update({ fileId: created.id, requestBody: { trashed: true } }).catch(() => {});
            throw driveApiError(error);
        }

        return {
            fileId: String(created.id),
            fileName: created.name || file.originalname || '',
            mimeType: created.mimeType || file.mimetype || '',
            size: Number(created.size || file.size || file.buffer.length || 0),
            webViewLink: created.webViewLink || '',
            iconLink: created.iconLink || ''
        };
    }

    /** Trashes rather than deletes, so a mistaken removal is recoverable in Drive. */
    async trashFile(userId, fileId) {
        const { drive } = await this.buildDriveClient(userId);
        try {
            await drive.files.update({ fileId, requestBody: { trashed: true } });
        } catch (error) {
            if (isNotFound(error)) return;
            throw driveApiError(error);
        }
    }

    async trashFilesBestEffort(userId, fileIds) {
        if (!Array.isArray(fileIds) || fileIds.length === 0) return;
        if (!(await this.isConnected(userId))) return;
        await Promise.allSettled(fileIds.map((fileId) => this.trashFile(userId, fileId)));
    }

    async revokeTokens(userId) {
        const user = await User.findById(userId);
        if (!user || !user.hasGoogleDriveFileConnected()) return;
        try {
            const oauth2Client = this.buildOAuthClient();
            oauth2Client.setCredentials({ access_token: user.googleDriveFileTokens.accessToken });
            await oauth2Client.revokeCredentials();
        } catch (error) {
            logger.warn('Could not revoke Google Drive file token with Google:', error.message);
        }
        await user.clearGoogleDriveFileTokens();
    }
}

export default new GoogleDriveFileService();