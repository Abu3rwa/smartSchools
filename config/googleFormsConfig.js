import { parseBooleanEnv } from './booleanEnv.js';

const DEFAULT_REDIRECT_URI = 'http://localhost:5000/api/auth/google-forms/callback';
const DEFAULT_SHARED_REDIRECT_URI = 'http://localhost:5000/api/auth/google-classroom/callback';

const parseAllowList = () => String(process.env.GOOGLE_FORMS_SCHOOL_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const GOOGLE_FORMS_SCOPES = Object.freeze([
    'https://www.googleapis.com/auth/forms.body',
    'https://www.googleapis.com/auth/forms.responses.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
]);

export const getGoogleFormsRedirectUri = () =>
    String(process.env.GOOGLE_FORMS_REDIRECT_URI || '').trim() || DEFAULT_REDIRECT_URI;

const getSharedRedirectUri = () =>
    String(process.env.GOOGLE_CLASSROOM_REDIRECT_URI || '').trim() || DEFAULT_SHARED_REDIRECT_URI;

export const isGoogleFormsEnabled = () =>
    parseBooleanEnv(process.env.GOOGLE_FORMS_ENABLED);

export const isGoogleFormsEnabledForSchool = (schoolId) => {
    if (!isGoogleFormsEnabled()) return false;
    const allowList = parseAllowList();
    return allowList.length === 0 || allowList.includes(String(schoolId || ''));
};

export const getGoogleFormsConfigurationStatus = () => ({
    configured: Boolean(
        ((process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
            || (process.env.GOOGLE_FORMS_CLIENT_ID && process.env.GOOGLE_FORMS_CLIENT_SECRET))
        && (process.env.APP_SECRET_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY)
    ),
    redirectUri: process.env.GOOGLE_CLIENT_ID
        ? getSharedRedirectUri()
        : getGoogleFormsRedirectUri()
});
