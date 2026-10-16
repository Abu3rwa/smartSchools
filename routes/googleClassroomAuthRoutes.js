import express from 'express';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import googleClassroomOAuthService from '../services/googleClassroomOAuthService.js';
import { parseSignedState } from '../utils/classroomOAuthState.js';
import { isClassroomEnabledForSchool } from '../config/classroomConfig.js';
import { isGoogleFormsEnabledForSchool } from '../config/googleFormsConfig.js';
import { getClientUrl } from '../helpers/portalUrl.js';
import logger from '../utils/logger.js';

const router = express.Router();

const redirectWith = (res, returnTo, query) => {
    const path = returnTo === 'notifications' ? '/portal/notifications' : '/portal/assignments';
    const suffix = returnTo === 'notifications' ? 'tab=gmail-cleanup&' : '';
    return res.redirect(`${getClientUrl()}${path}?${suffix}${query}`);
};

// Public by necessity (Google redirects the browser here); the signed, expiring state identifies the user.
router.get('/callback', async (req, res) => {
    let returnTo = 'assignments';
    try {
        const { code, state, error } = req.query;
        const parsedState = parseSignedState(state);
        if (parsedState?.returnTo === 'notifications') returnTo = 'notifications';
        if (error) {
            const key = returnTo === 'notifications' ? 'gmail_cleanup_error' : 'classroom_error';
            return redirectWith(res, returnTo, `${key}=${encodeURIComponent(String(error))}`);
        }
        if (!code || !state) {
            const key = returnTo === 'notifications' ? 'gmail_cleanup_error' : 'classroom_error';
            return redirectWith(res, returnTo, `${key}=missing_parameters`);
        }
        if (!parsedState?.userId) {
            const key = returnTo === 'notifications' ? 'gmail_cleanup_error' : 'classroom_error';
            return redirectWith(res, returnTo, `${key}=invalid_state`);
        }

        const user = await User.findById(parsedState.userId).select('role school');
        const allowedRole = ['teacher', 'admin', 'department_principal'].includes(user?.role);
        const servicesEnabled = isClassroomEnabledForSchool(user?.school)
            || isGoogleFormsEnabledForSchool(user?.school)
            || returnTo === 'notifications';
        const teacherProfile = user && allowedRole
            ? await Teacher.findOne({ user: user._id, school: user.school }).select('_id').lean()
            : null;
        if (!user || !allowedRole || !servicesEnabled || (user.role === 'teacher' && !teacherProfile)) {
            const key = returnTo === 'notifications' ? 'gmail_cleanup_error' : 'classroom_error';
            return redirectWith(res, returnTo, `${key}=not_available`);
        }

        const tokens = await googleClassroomOAuthService.exchangeCodeForTokens(String(code));
        await googleClassroomOAuthService.storeTokens(parsedState.userId, tokens);
        if (returnTo === 'notifications') {
            return redirectWith(res, returnTo, 'gmail_cleanup_connected=true');
        }
        return redirectWith(res, returnTo, 'classroom_connected=true');
    } catch (err) {
        logger.error('Google Classroom OAuth callback error', { message: err?.message, code: err?.code });
        const code = err?.code === 'MISSING_SCOPES' ? 'missing_scopes' : 'oauth_failed';
        const key = returnTo === 'notifications' ? 'gmail_cleanup_error' : 'classroom_error';
        return redirectWith(res, returnTo, `${key}=${code}`);
    }
});

export default router;
