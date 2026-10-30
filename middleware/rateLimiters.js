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
 * Practice generates questions from published pools or local templates, not the AI service.
 * Keep a separate, higher ceiling so normal student practice does not consume the AI budget.
 */
export const practiceQuestionRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    keyGenerator: userKeyGenerator,
    message: {
        success: false,
        message: 'Practice is temporarily limited. Please wait a few minutes before continuing.'
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

/**
 * Code entry is the one public door into support surveys. Ten tries per
 * quarter-hour per IP keeps guessing impractical without punishing a typo.
 */
export const supportCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req, res) => ipKeyGenerator(req, res),
    message: {
        success: false,
        message: 'Too many code attempts. Please wait a few minutes and try again.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Once a code is accepted the respondent gets a short session. This ceiling is
 * generous enough for saving answers question by question.
 */
export const supportAccessLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 240,
    keyGenerator: (req, res) => ipKeyGenerator(req, res),
    message: {
        success: false,
        message: 'Too many requests. Please wait a moment and try again.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Rate limiter for document export / CSV import endpoints.
 * 60 requests per 15 minutes per user.
 */
export const importRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyGenerator: userKeyGenerator,
    message: {
        success: false,
        message: 'Too many export/import requests. Please try again in a few minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});
