import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate } from '../middleware/validator.js';
import {
    getCandidatesHandler,
    createRequestHandler,
    createAbsenceHandler,
    listRequestsHandler,
    getRequestHandler,
    cancelRequestHandler,
    respondHandler,
    respondAuthHandler
} from '../controllers/substitutionRequestController.js';
import {
    getCandidatesRules,
    createRequestRules,
    createAbsenceRules,
    listRequestsRules,
    respondRules,
    respondAuthRules,
    cancelRules,
    mongoIdParam
} from '../validators/substitutionValidators.js';

const router = express.Router();

// Stricter rate limit for token-based respond endpoint (security)
const respondLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many attempts. Please try again later.' }
});

// Token-based response (no auth required, but rate-limited)
// POST: body { token, action, note? }
// GET: query ?token=... (redirects to frontend response page for explicit confirmation)
router.post(
    '/respond',
    respondLimiter,
    respondRules,
    validate,
    respondHandler
);
router.get(
    '/respond',
    respondLimiter,
    (req, res) => {
        const token = String(req.query.token || '').trim();
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'token query parameter is required'
            });
        }

        const clientBase = String(process.env.CLIENT_URL || '').trim()
            || `${req.protocol}://${req.get('host')}`;
        const normalizedBase = clientBase.replace(/\/+$/, '');
        const redirectUrl = `${normalizedBase}/substitutions/respond?token=${encodeURIComponent(token)}`;
        return res.redirect(302, redirectUrl);
    }
);

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

// Candidates: department_principal, admin
router.post(
    '/candidates',
    authorize('department_principal', 'admin'),
    getCandidatesRules,
    validate,
    getCandidatesHandler
);

// Register absence: department_principal, admin
router.post(
    '/absences',
    authorize('department_principal', 'admin'),
    createAbsenceRules,
    validate,
    createAbsenceHandler
);

// Create: department_principal, admin
router.post(
    '/',
    authorize('department_principal', 'admin'),
    createRequestRules,
    validate,
    createRequestHandler
);

// List: department_principal, admin, teacher (each sees their scope)
router.get(
    '/',
    authorize('department_principal', 'admin', 'teacher'),
    listRequestsRules,
    validate,
    listRequestsHandler
);

// Get one: department_principal, admin, teacher
router.get(
    '/:id',
    authorize('department_principal', 'admin', 'teacher'),
    mongoIdParam,
    validate,
    getRequestHandler
);

// Respond in portal: teacher
router.post(
    '/:id/respond-auth',
    authorize('teacher'),
    mongoIdParam,
    respondAuthRules,
    validate,
    respondAuthHandler
);

// Cancel: department_principal, admin
router.post(
    '/:id/cancel',
    authorize('department_principal', 'admin'),
    mongoIdParam,
    cancelRules,
    validate,
    cancelRequestHandler
);

export default router;
