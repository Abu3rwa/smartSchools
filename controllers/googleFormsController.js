import Assignment from '../models/Assignment.js';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import googleFormsOAuthService from '../services/googleFormsOAuthService.js';
import googleClassroomOAuthService from '../services/googleClassroomOAuthService.js';
import {
    listGoogleQuizSubmissions,
    syncGoogleQuizResponses
} from '../services/googleFormsAssignmentService.js';
import {
    getGoogleFormsConfigurationStatus,
    isGoogleFormsEnabledForSchool
} from '../config/googleFormsConfig.js';
import { parseGoogleFormsOAuthState } from '../utils/googleFormsOAuthState.js';
import { buildSignedState } from '../utils/classroomOAuthState.js';
import { getClientUrl } from '../helpers/portalUrl.js';
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject } from '../helpers/teacherScoping.js';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const REDIRECT_PATH = '/portal/assignments';
const redirectWith = (res, query) => res.redirect(`${getClientUrl()}${REDIRECT_PATH}?${query}`);
const MANAGER_ROLES = new Set(['teacher', 'admin', 'department_principal']);

const canManage = (req) => MANAGER_ROLES.has(req.user?.role);

export const getGoogleFormsStatus = asyncHandler(async (req, res) => {
    const enabled = isGoogleFormsEnabledForSchool(req.schoolId);
    const configuration = getGoogleFormsConfigurationStatus();
    const connection = enabled && configuration.configured
        ? await googleFormsOAuthService.getStatus(req.user._id)
        : { connected: false, email: null };
    res.json({
        success: true,
        data: {
            enabled,
            configured: configuration.configured,
            redirectUri: configuration.redirectUri,
            ...connection
        }
    });
});

export const getGoogleFormsAuthUrl = asyncHandler(async (req, res) => {
    if (!canManage(req) || !isGoogleFormsEnabledForSchool(req.schoolId)) {
        return res.status(403).json({ success: false, message: 'Google Forms is not available for this account.' });
    }
    if (!getGoogleFormsConfigurationStatus().configured) {
        return res.status(503).json({ success: false, message: 'Google Forms credentials and encryption are not configured.' });
    }
    try {
        const state = buildSignedState(req.user._id, 'assignments');
        return res.json({ success: true, data: { url: googleClassroomOAuthService.getAuthUrl(state) } });
    } catch (error) {
        logger.error('Could not start Google Forms OAuth', { message: error?.message });
        return res.status(503).json({ success: false, message: 'Google Forms OAuth is not configured.' });
    }
});

export const disconnectGoogleForms = asyncHandler(async (req, res) => {
    if (!canManage(req)) return res.status(403).json({ success: false, message: 'Not authorized.' });
    await googleFormsOAuthService.revokeTokens(req.user._id);
    return res.json({ success: true });
});

export const googleFormsOAuthCallback = async (req, res) => {
    try {
        if (req.query.error) return redirectWith(res, 'google_forms_error=consent_denied');
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        if (!code || !state) return redirectWith(res, 'google_forms_error=missing_parameters');
        const parsed = parseGoogleFormsOAuthState(state);
        if (!parsed?.userId) return redirectWith(res, 'google_forms_error=invalid_state');

        const user = await User.findById(parsed.userId).select('role school');
        const profile = user?.role === 'teacher'
            ? await Teacher.findOne({ user: user._id, school: user.school }).select('_id').lean()
            : null;
        if (!user || !canManage({ user }) || (user.role === 'teacher' && !profile)
            || !isGoogleFormsEnabledForSchool(user.school)) {
            return redirectWith(res, 'google_forms_error=not_available');
        }
        const tokens = await googleFormsOAuthService.exchangeCodeForTokens(code);
        await googleFormsOAuthService.storeTokens(user._id, tokens);
        return redirectWith(res, 'google_forms_connected=true');
    } catch (error) {
        logger.error('Google Forms OAuth callback failed', { code: error?.code, message: error?.message });
        const failure = error?.code === 'MISSING_SCOPES' ? 'missing_scopes' : 'oauth_failed';
        return redirectWith(res, `google_forms_error=${failure}`);
    }
};

const findAccessibleAssignment = async (req, assignmentId) => {
    const assignment = await Assignment.findOne({
        _id: assignmentId,
        school: req.schoolId,
        assignmentTypeKey: 'google_form'
    });
    if (!assignment) return { error: { status: 404, message: 'Google Form assignment not found.' } };
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher || !(await isTeacherAuthorizedForClassSubject(teacher._id, assignment.class, assignment.subject))) {
            return { error: { status: 403, message: 'Not authorized to access this Google Form assignment.' } };
        }
    } else if (!canManage(req)) {
        return { error: { status: 403, message: 'Not authorized.' } };
    }
    return { assignment };
};

export const getGoogleFormResponses = asyncHandler(async (req, res) => {
    const result = await findAccessibleAssignment(req, req.params.id);
    if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
    const rows = await listGoogleQuizSubmissions({
        assignmentId: result.assignment._id,
        schoolId: req.schoolId
    });
    return res.json({ success: true, data: { items: rows } });
});

export const syncGoogleFormResponses = asyncHandler(async (req, res) => {
    const result = await findAccessibleAssignment(req, req.params.id);
    if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
    if (!isGoogleFormsEnabledForSchool(req.schoolId)) {
        return res.status(403).json({ success: false, message: 'Google Forms is not enabled for this school.' });
    }
    let summary;
    try {
        summary = await syncGoogleQuizResponses({
            assignment: result.assignment,
            actorId: req.user._id,
            schoolId: req.schoolId
        });
    } catch (error) {
        if (error?.code === 'EMAIL_VERIFICATION_REQUIRED') {
            return res.status(409).json({ success: false, message: error.message, code: error.code });
        }
        throw error;
    }
    logger.info('Google Forms responses synchronized', {
        assignmentId: String(result.assignment._id),
        imported: summary.imported,
        unmatched: summary.unmatched,
        updatedGrades: summary.updatedGrades
    });
    return res.json({ success: true, data: summary });
});
