import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// trust proxy is set in server.js so req.ip already resolves the real client IP;
// ipKeyGenerator handles IPv6 normalisation required by express-rate-limit v7+.
const userKeyGenerator = (req, res) => {
    if (req.user?._id) return `user:${req.user._id}`;
    return ipKeyGenerator(req, res);
};

/**
 * Rate limiter for AI-powered endpoints (lesson plan AI, presentation AI, reading AI, etc.)
 * 20 requests per 15 minutes per user.
 */
export const aiFeatureRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyGenerator: userKeyGenerator,
    message: {
        success: false,
        message: 'Too many AI requests. Please try again in a few minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Rate limiter for email sending endpoints.
 * 100 sends per hour per user.
 */
export const emailSendRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    keyGenerator: userKeyGenerator,
    message: {
        success: false,
        message: 'Too many email requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
