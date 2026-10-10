import express from 'express';
import User from '../models/User.js';
import Teacher from '../models/Teacher.js';
import googleClassroomOAuthService from '../services/googleClassroomOAuthService.js';
import { parseSignedState } from '../utils/classroomOAuthState.js';
import { isClassroomEnabledForSchool } from '../config/classroomConfig.js';
import { getClientUrl } from '../helpers/portalUrl.js';
import logger from '../utils/logger.js';

const router = express.Router();

const REDIRECT_PATH = '/portal/assignments';

const redirectWith = (res, query) => res.redirect(`${getClientUrl()}${REDIRECT_PATH}?${query}`);

// Public by necessity (Google redirects the browser here); the signed, expiring state identifies the user.
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        if (error) return redirectWith(res, `classroom_error=${encodeURIComponent(String(error))}`);
        if (!code || !state) return redirectWith(res, 'classroom_error=missing_parameters');

        const parsedState = parseSignedState(state);
        if (!parsedState?.userId) return redirectWith(res, 'classroom_error=invalid_state');

        const user = await User.findById(parsedState.userId).select('role school');
        const allowedRole = ['teacher', 'admin', 'department_principal'].includes(user?.role);
        const teacherProfile = user && allowedRole
            ? await Teacher.findOne({ user: user._id, school: user.school }).select('_id').lean()
            : null;
        if (!user || !teacherProfile || !isClassroomEnabledForSchool(user.school)) {
            return redirectWith(res, 'classroom_error=not_available');
        }

        const tokens = await googleClassroomOAuthService.exchangeCodeForTokens(String(code));
        await googleClassroomOAuthService.storeTokens(parsedState.userId, tokens);
        return redirectWith(res, 'classroom_connected=true');
    } catch (err) {
        logger.error('Google Classroom OAuth callback error', { message: err?.message, code: err?.code });
        const code = err?.code === 'MISSING_SCOPES' ? 'missing_scopes' : 'oauth_failed';
        return redirectWith(res, `classroom_error=${code}`);
    }
});

export default router;
