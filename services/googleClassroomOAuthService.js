import { google } from 'googleapis';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import {
    CLASSROOM_EMAIL_SCOPE,
    CLASSROOM_SCOPES,
    getClassroomRedirectUri
} from '../config/classroomConfig.js';
import { ClassroomSyncError } from './classroomErrors.js';

const TOKEN_SELECT = '+googleClassroomTokens.accessToken +googleClassroomTokens.refreshToken';

const createOAuthClient = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new ClassroomSyncError('NOT_CONFIGURED', 'Google OAuth is not configured on the server');
    }
    return new google.auth.OAuth2(clientId, clientSecret, getClassroomRedirectUri());
};

export const missingRequiredScopes = (grantedScopes = []) => {
    const granted = new Set(grantedScopes);
    return CLASSROOM_SCOPES.filter((scope) => !granted.has(scope));
};

const parseGrantedScopes = (value) =>
    String(value || '').split(/\s+/).map((scope) => scope.trim()).filter(Boolean);

class GoogleClassroomOAuthService {
    getAuthUrl(state) {
        return createOAuthClient().generateAuthUrl({
            access_type: 'offline',
            scope: [...CLASSROOM_SCOPES, CLASSROOM_EMAIL_SCOPE],
            prompt: 'consent',
            state
        });
    }

    async exchangeCodeForTokens(code) {
        const { tokens } = await createOAuthClient().getToken(code);
        return tokens;
    }

    async storeTokens(userId, tokens) {
        const grantedScopes = parseGrantedScopes(tokens.scope);
        const missing = missingRequiredScopes(grantedScopes);
        if (missing.length > 0) {
            // Teachers can untick individual permissions on Google's consent screen.
            throw new ClassroomSyncError(
                'MISSING_SCOPES',
                'Google Classroom permissions were not fully granted. Please reconnect and allow all requested access.'
            );
        }

        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user) throw new ClassroomSyncError('USER_NOT_FOUND', 'User not found');

        const client = createOAuthClient();
        client.setCredentials({ access_token: tokens.access_token });
        const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();

        await user.updateGoogleClassroomTokens(tokens, data?.email, grantedScopes);
        return user;
    }

    async loadConnectedUser(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user || !user.hasGoogleClassroomConnected()) {
            throw new ClassroomSyncError(
                'NOT_CONNECTED',
                'Google Classroom is not connected. Connect your Google account first.'
            );
        }
        return user;
    }

    /** Returns an authenticated OAuth client for the user, refreshing the access token when needed. */
    async getAuthorizedClient(userId) {
        let user = await this.loadConnectedUser(userId);

        if (user.googleClassroomTokenNeedsRefresh()) {
            try {
                const refreshClient = createOAuthClient();
                refreshClient.setCredentials({ refresh_token: user.googleClassroomTokens.refreshToken });
                const { credentials } = await refreshClient.refreshAccessToken();
                await user.updateGoogleClassroomTokens(credentials, user.googleClassroomTokens.email);
            } catch (error) {
                const reason = error?.response?.data?.error || error?.message || '';
                if (/invalid_grant/i.test(reason)) {
                    // Consent was revoked or expired; require the teacher to reconnect.
                    await user.clearGoogleClassroomTokens();
                    throw new ClassroomSyncError(
                        'AUTH_REVOKED',
                        'Google Classroom access was revoked or expired. Please reconnect your account.'
                    );
                }
                logger.error('Google Classroom token refresh failed', { userId: String(userId), reason });
                throw new ClassroomSyncError(
                    'AUTH_REFRESH_FAILED',
                    'Could not refresh Google Classroom access. Please try again.',
                    { retryable: true }
                );
            }
            user = await this.loadConnectedUser(userId);
        }

        const client = createOAuthClient();
        client.setCredentials({
            access_token: user.googleClassroomTokens.accessToken,
            refresh_token: user.googleClassroomTokens.refreshToken
        });
        return { user, auth: client };
    }

    async getTokenStatus(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user || !user.hasGoogleClassroomConnected()) {
            return { connected: false, email: null };
        }
        return {
            connected: true,
            email: user.googleClassroomTokens.email || null,
            scopesGranted: missingRequiredScopes(user.googleClassroomTokens.scopes || []).length === 0
        };
    }

    async revokeTokens(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user || !user.hasGoogleClassroomConnected()) return;

        try {
            const client = createOAuthClient();
            client.setCredentials({ access_token: user.googleClassroomTokens.accessToken });
            await client.revokeCredentials();
        } catch (error) {
            logger.warn('Could not revoke Google Classroom token with Google', { message: error?.message });
        }
        await user.clearGoogleClassroomTokens();
    }
}

export default new GoogleClassroomOAuthService();
