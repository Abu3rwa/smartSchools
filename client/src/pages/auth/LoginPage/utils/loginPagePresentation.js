export const LOGIN_ROLE_STORAGE_KEY = 'login.role';
export const LOGIN_ROLES = ['student', 'teacher'];

export const getSchoolContextClasses = (isSchoolContext) => {
    return `login-page ${isSchoolContext ? 'login-page-with-school' : ''}`;
};

export const normalizeLoginRole = (value) => (
    LOGIN_ROLES.includes(value) ? value : null
);

export const readStoredLoginRole = () => {
    if (typeof window === 'undefined') return null;
    try {
        return normalizeLoginRole(window.localStorage.getItem(LOGIN_ROLE_STORAGE_KEY));
    } catch {
        return null;
    }
};

export const storeLoginRole = (role) => {
    if (typeof window === 'undefined') return;
    try {
        if (role === null || role === undefined || role === '') {
            window.localStorage.removeItem(LOGIN_ROLE_STORAGE_KEY);
            return;
        }
        // An unsupported value must not erase a choice the user already made.
        const normalized = normalizeLoginRole(role);
        if (normalized) {
            window.localStorage.setItem(LOGIN_ROLE_STORAGE_KEY, normalized);
        }
    } catch {
        // Storage can be blocked (private mode); the choice then lasts one visit.
    }
};

// Every code the Google callback can redirect with, mapped to a sentence the
// login page can show. Unknown codes fall back to login.errors.generic.
export const LOGIN_ERROR_CODES = [
    'account_inactive',
    'not_teacher',
    'school_mismatch',
    'no_account',
    'access_denied',
    'missing_code',
    'google_not_configured'
];

export const normalizeLoginErrorCode = (value) => {
    if (!value) return null;
    const code = String(value).trim();
    if (LOGIN_ERROR_CODES.includes(code)) return code;
    return 'generic';
};
