export const CLASSROOM_SCOPES = Object.freeze([
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students'
]);

// Non-sensitive scope used only to show which Google account is connected.
export const CLASSROOM_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

export const DEFAULT_CLASSROOM_REDIRECT_URI = 'http://localhost:5000/api/auth/google-classroom/callback';

export const getClassroomRedirectUri = () =>
    String(process.env.GOOGLE_CLASSROOM_REDIRECT_URI || '').trim() || DEFAULT_CLASSROOM_REDIRECT_URI;

const parseAllowList = () =>
    String(process.env.GOOGLE_CLASSROOM_SCHOOL_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

export const isClassroomEnabled = () =>
    String(process.env.GOOGLE_CLASSROOM_ENABLED || '').trim().toLowerCase() === 'true';

// When GOOGLE_CLASSROOM_SCHOOL_IDS is set, only those schools may use the integration (pilot rollout).
export const isClassroomEnabledForSchool = (schoolId) => {
    if (!isClassroomEnabled()) return false;
    const allowList = parseAllowList();
    if (allowList.length === 0) return true;
    return allowList.includes(String(schoolId || ''));
};

export const requireClassroomEnabled = (req, res, next) => {
    if (!isClassroomEnabledForSchool(req.schoolId || req.user?.school)) {
        return res.status(404).json({
            success: false,
            message: 'Google Classroom integration is not enabled'
        });
    }
    return next();
};
