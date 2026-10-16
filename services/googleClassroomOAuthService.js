import { google } from 'googleapis';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import {
    CLASSROOM_SCOPES,
    getClassroomRedirectUri
} from '../config/classroomConfig.js';
import { GOOGLE_SUITE_SCOPES } from '../config/googleSuiteOAuthScopes.js';
import { ClassroomSyncError } from './classroomErrors.js';

const TOKEN_SELECT = [
    '+googleClassroomTokens.accessToken',
    '+googleClassroomTokens.refreshToken',
    '+googleFormsTokens.accessToken',
    '+googleFormsTokens.refreshToken',
    '+googleFormsTokens.oauthClientId'
].join(' ');

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
            scope: GOOGLE_SUITE_SCOPES,
            include_granted_scopes: true,
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
        const missing = GOOGLE_SUITE_SCOPES.filter((scope) => !grantedScopes.includes(scope));
        if (missing.length > 0) {
            throw new ClassroomSyncError(
                'MISSING_SCOPES',
                'Google Classroom, Google Forms, and Gmail permissions were not fully granted. Reconnect and allow all requested access.'
            );
        }

        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user) throw new ClassroomSyncError('USER_NOT_FOUND', 'User not found');
        if (user.hasGoogleFormsConnected()
            && user.googleFormsTokens.oauthClientId !== process.env.GOOGLE_CLIENT_ID
            && !tokens.refresh_token) {
            throw new ClassroomSyncError(
                'MISSING_REFRESH_TOKEN',
                'Google did not return a refresh token for the shared services connection. Disconnect the old Google Forms account and reconnect.'
            );
        }

        const client = createOAuthClient();
        client.setCredentials({ access_token: tokens.access_token });
        const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();

        await user.updateGoogleClassroomTokens(tokens, data?.email, grantedScopes);
        await user.updateGoogleFormsTokens(tokens, data?.email, grantedScopes, process.env.GOOGLE_CLIENT_ID);
        await user.updateGmailTokens(tokens, data?.email);
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
                    await user.clearGoogleSuiteTokens({ requireGmailReauth: true });
                    throw new ClassroomSyncError(
                        'AUTH_REVOKED',
                        'Google service access was revoked or expired. Please reconnect your account.'
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
        if (!user || !(
            user.hasGoogleClassroomConnected()
            || user.hasGoogleFormsConnected()
            || user.hasGmailConnected()
        )) return;

        try {
            const client = createOAuthClient();
            client.setCredentials({
                access_token: user.googleClassroomTokens?.accessToken
                    || user.googleFormsTokens?.accessToken
                    || user.gmailTokens?.accessToken
            });
            await client.revokeCredentials();
        } catch (error) {
            logger.warn('Could not revoke Google services token with Google', { message: error?.message });
        }
        await user.clearGoogleSuiteTokens();
    }
}

export default new GoogleClassroomOAuthService();
