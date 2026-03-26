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
    getAnalyticsHandler,
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
    analyticsRules,
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
        '/respond-bridge',
        respondLimiter,
        (req, res) => {
                const token = String(req.query.token || '').trim();
                const intentRaw = String(req.query.intent || '').trim().toLowerCase();
                const intent = intentRaw === 'decline' ? 'decline' : 'confirm';

                if (!token) {
                        return res.status(400).json({
                                success: false,
                                message: 'token query parameter is required'
                        });
                }

                const clientBase = String(process.env.CLIENT_URL || '').trim()
                        || `${req.protocol}://${req.get('host')}`;
                const normalizedClientBase = clientBase.replace(/\/+$/, '');
                const webUrl = `${normalizedClientBase}/substitutions/respond?token=${encodeURIComponent(token)}&intent=${encodeURIComponent(intent)}`;

                const mobileDeepLinkBase = String(process.env.MOBILE_DEEP_LINK_BASE || '').trim().replace(/\/+$/, '');
                if (!mobileDeepLinkBase) {
                        return res.redirect(302, webUrl);
                }

                const delimiter = mobileDeepLinkBase.includes('?') ? '&' : '?';
                const deepLinkUrl = `${mobileDeepLinkBase}${delimiter}token=${encodeURIComponent(token)}&intent=${encodeURIComponent(intent)}&fallback=${encodeURIComponent(webUrl)}`;

                const html = `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Opening substitution response</title>
    </head>
    <body style="font-family:sans-serif;max-width:560px;margin:2.5rem auto;padding:1rem;color:#0f172a;">
        <h2 style="margin:0 0 10px;">Opening response...</h2>
        <p style="margin:0 0 14px;">If the app does not open automatically, use the button below.</p>
        <p style="margin:0;">
            <a href="${webUrl}" style="background:#0d9488;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Continue in web portal</a>
        </p>
        <script>
            const deepLink = ${JSON.stringify(deepLinkUrl)};
            const fallback = ${JSON.stringify(webUrl)};
            window.location.href = deepLink;
            setTimeout(() => {
                window.location.href = fallback;
            }, 1200);
        </script>
    </body>
</html>`;

                return res.status(200).type('text/html').send(html);
        }
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
    '/analytics',
    authorize('department_principal', 'admin'),
    analyticsRules,
    validate,
    getAnalyticsHandler
);

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
