import { google } from 'googleapis';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { getGoogleFormsRedirectUri, GOOGLE_FORMS_SCOPES } from '../config/googleFormsConfig.js';

const TOKEN_SELECT = '+googleFormsTokens.accessToken +googleFormsTokens.refreshToken +googleFormsTokens.oauthClientId';

const createOAuthClient = (
    requestedClientId = process.env.GOOGLE_FORMS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
) => {
    const useSharedClient = requestedClientId
        && requestedClientId === process.env.GOOGLE_CLIENT_ID
        && process.env.GOOGLE_CLIENT_SECRET;
    const clientId = useSharedClient ? process.env.GOOGLE_CLIENT_ID : process.env.GOOGLE_FORMS_CLIENT_ID;
    const clientSecret = useSharedClient ? process.env.GOOGLE_CLIENT_SECRET : process.env.GOOGLE_FORMS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        const error = new Error('Google OAuth is not configured on the server');
        error.code = 'NOT_CONFIGURED';
        throw error;
    }
    if (!process.env.APP_SECRET_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
        const error = new Error('Google Forms credential encryption is not configured');
        error.code = 'NOT_CONFIGURED';
        throw error;
    }
    return new google.auth.OAuth2(clientId, clientSecret, getGoogleFormsRedirectUri());
};

const parseScopes = (scopes) => String(scopes || '').split(/\s+/).filter(Boolean);
const missingScopes = (scopes) => GOOGLE_FORMS_SCOPES.filter((scope) => !scopes.includes(scope));

class GoogleFormsOAuthService {
    getAuthUrl(state) {
        return createOAuthClient().generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: GOOGLE_FORMS_SCOPES,
            state
        });
    }

    async exchangeCodeForTokens(code) {
        const { tokens } = await createOAuthClient().getToken(code);
        return tokens;
    }

    async storeTokens(userId, tokens) {
        const scopes = parseScopes(tokens.scope);
        if (missingScopes(scopes).length) {
            const error = new Error('Google Forms permissions were not fully granted. Reconnect and allow all requested permissions.');
            error.code = 'MISSING_SCOPES';
            throw error;
        }

        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user) {
            const error = new Error('User not found');
            error.code = 'USER_NOT_FOUND';
            throw error;
        }
        const oauthClientId = process.env.GOOGLE_FORMS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
        if (user.hasGoogleFormsConnected()
            && user.googleFormsTokens.oauthClientId !== oauthClientId
            && !tokens.refresh_token) {
            const error = new Error('Google did not return a refresh token for the new Forms connection. Disconnect the previous account and reconnect.');
            error.code = 'MISSING_REFRESH_TOKEN';
            throw error;
        }

        const client = createOAuthClient();
        client.setCredentials({ access_token: tokens.access_token });
        const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
        await user.updateGoogleFormsTokens(
            tokens,
            data?.email,
            scopes,
            oauthClientId
        );
        return user;
    }

    async loadConnectedUser(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user || !user.hasGoogleFormsConnected()) {
            const error = new Error('Google Forms is not connected. Connect your Google account first.');
            error.code = 'NOT_CONNECTED';
            throw error;
        }
        if (missingScopes(user.googleFormsTokens.scopes || []).length) {
            const error = new Error('Google Forms permissions are incomplete. Reconnect your Google account.');
            error.code = 'MISSING_SCOPES';
            throw error;
        }
        return user;
    }

    async getAuthorizedClient(userId) {
        let user = await this.loadConnectedUser(userId);
        if (user.googleFormsTokenNeedsRefresh()) {
            try {
                const client = createOAuthClient(user.googleFormsTokens.oauthClientId);
                client.setCredentials({ refresh_token: user.googleFormsTokens.refreshToken });
                const { credentials } = await client.refreshAccessToken();
                await user.updateGoogleFormsTokens(
                    credentials,
                    user.googleFormsTokens.email,
                    undefined,
                    user.googleFormsTokens.oauthClientId
                );
            } catch (error) {
                const reason = error?.response?.data?.error || error?.message || '';
                if (/invalid_grant/i.test(reason)) {
                    if (user.googleFormsTokens.oauthClientId === process.env.GOOGLE_CLIENT_ID) {
                        await user.clearGoogleSuiteTokens({ requireGmailReauth: true });
                    } else {
                        await user.clearGoogleFormsTokens();
                    }
                    const revoked = new Error('Google Forms access was revoked or expired. Reconnect your account.');
                    revoked.code = 'AUTH_REVOKED';
                    throw revoked;
                }
                logger.error('Google Forms token refresh failed', {
                    userId: String(userId),
                    message: error?.message
                });
                const refreshError = new Error('Could not refresh Google Forms access. Please reconnect or try again.');
                refreshError.code = 'AUTH_REFRESH_FAILED';
                throw refreshError;
            }
            user = await this.loadConnectedUser(userId);
        }

        const auth = createOAuthClient(user.googleFormsTokens.oauthClientId);
        auth.setCredentials({
            access_token: user.googleFormsTokens.accessToken,
            refresh_token: user.googleFormsTokens.refreshToken
        });
        return { user, auth };
    }

    async getStatus(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        return {
            connected: Boolean(user?.hasGoogleFormsConnected()),
            email: user?.hasGoogleFormsConnected() ? user.googleFormsTokens.email || null : null
        };
    }

    async revokeTokens(userId) {
        const user = await User.findById(userId).select(TOKEN_SELECT);
        if (!user?.hasGoogleFormsConnected()) return;
        const sharedGrant = user.googleFormsTokens.oauthClientId === process.env.GOOGLE_CLIENT_ID;
        try {
            const client = createOAuthClient(user.googleFormsTokens.oauthClientId);
            client.setCredentials({ access_token: user.googleFormsTokens.accessToken });
            await client.revokeCredentials();
        } finally {
            if (sharedGrant) await user.clearGoogleSuiteTokens();
            else await user.clearGoogleFormsTokens();
        }
    }
}

export default new GoogleFormsOAuthService();
