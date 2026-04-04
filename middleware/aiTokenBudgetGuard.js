import { AITokenUsage } from '../models/AITokenUsage.js';
import logger from '../utils/logger.js';

/**
 * BE-014: AI token budget guard middleware.
 * Checks monthly AI token usage per school against plan-based limits
 * before allowing AI-powered requests to proceed.
 */

// Monthly token limits per plan (in total tokens)
const MONTHLY_TOKEN_LIMITS = {
    starter: 500_000,
    professional: 2_000_000,
    enterprise: 10_000_000,
};

// Cache to avoid hitting DB on every AI request (TTL: 60 seconds)
const usageCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function getMonthlyUsage(schoolId) {
    const cacheKey = schoolId.toString();
    const cached = usageCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.total;
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await AITokenUsage.aggregate([
        { $match: { school: schoolId, timestamp: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$totalTokens' } } },
    ]);

    const total = result[0]?.total || 0;
    usageCache.set(cacheKey, { total, ts: Date.now() });
    return total;
}

export const aiTokenBudgetGuard = async (req, res, next) => {
    try {
        const schoolId = req.schoolId;
        if (!schoolId) return next();

        const plan = req.school?.plan || 'professional';
        const limit = MONTHLY_TOKEN_LIMITS[plan] || MONTHLY_TOKEN_LIMITS.professional;

        const used = await getMonthlyUsage(schoolId);
        if (used >= limit) {
            logger.warn('AI token budget exceeded', { schoolId, plan, used, limit });
            return res.status(429).json({
                success: false,
                message: `Monthly AI usage limit reached for your ${plan} plan. Please upgrade or wait until next month.`,
                data: { used, limit, plan },
            });
        }

        // Attach budget info for downstream use
        req.aiTokenBudget = { used, limit, remaining: limit - used };
        next();
    } catch (err) {
        // Don't block requests if budget check fails
        logger.error('AI token budget guard error', { error: err.message });
        next();
    }
};

export default aiTokenBudgetGuard;
