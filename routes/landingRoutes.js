import express from 'express';
import School from '../models/School.js';
import LandingPageContent from '../models/LandingPageContent.js';
import DemoRequest from '../models/DemoRequest.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import { demoRequestLimiter } from '../middleware/rateLimiters.js';
import {
    notifyDemoRequest,
    validateDemoRequestPayload
} from '../services/demoRequestService.js';
import { LANDING_CONTENT_KEY } from '../config/landingPageDefaults.js';
import { FEATURES } from '../constants/features.js';
import {
    getLandingContentDefaults,
    mergeLandingContent,
    normalizeLandingContent,
} from '../utils/landingContent.js';
import {
    normalizeLandingLanguage,
    resolveLandingDynamicBlocks
} from '../utils/landingLocalization.js';

const router = express.Router();

const LANDING_SECTION_KEYS = new Set([
    'seo',
    'brand',
    'header',
    'navigation',
    'hero',
    'trustStrip',
    'howItWorks',
    'features',
    'pricing',
    'testimonials',
    'faq',
    'finalCta',
    'findSchool',
    'dynamicFallback',
    'footer'
]);

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const resolveLocalizedLandingContent = (rawContent, requestedLanguage = 'en') => {
    const normalizedLanguage = normalizeLandingLanguage(requestedLanguage);
    if (!isObject(rawContent)) {
        return { resolvedLanguage: normalizedLanguage, content: rawContent };
    }

    if (isObject(rawContent.locales)) {
        const defaultContent = isObject(rawContent.default) ? rawContent.default : {};
        const englishContent = isObject(rawContent.locales.en) ? rawContent.locales.en : {};
        const languageContent = isObject(rawContent.locales[normalizedLanguage])
            ? rawContent.locales[normalizedLanguage]
            : {};
        const resolved = mergeLandingContent(
            mergeLandingContent(defaultContent, englishContent),
            languageContent
        );
        return { resolvedLanguage: normalizedLanguage, content: resolved };
    }

    const hasSectionKeys = Array.from(LANDING_SECTION_KEYS).some((key) =>
        Object.prototype.hasOwnProperty.call(rawContent, key)
    );
    const hasLanguageRoots = ['en', 'ar'].some((key) => isObject(rawContent[key]));
    if (!hasSectionKeys && hasLanguageRoots) {
        const englishContent = isObject(rawContent.en) ? rawContent.en : {};
        const languageContent = isObject(rawContent[normalizedLanguage])
            ? rawContent[normalizedLanguage]
            : {};
        const resolved = mergeLandingContent(englishContent, languageContent);
        return { resolvedLanguage: normalizedLanguage, content: resolved };
    }

    return { resolvedLanguage: normalizedLanguage, content: rawContent };
};

/**
 * @desc    Get dynamic landing page content
 * @route   GET /api/landing/content
 * @access  Public
 */
router.get('/content', asyncHandler(async (req, res) => {
    const requestedLanguage = req.query?.lang || req.headers['accept-language'] || 'en';
    const existingContent = await LandingPageContent.findOne({ key: LANDING_CONTENT_KEY })
        .select('content updatedAt')
        .setOptions({ skipTenantFilter: true });

    const localizedContent = resolveLocalizedLandingContent(
        existingContent?.content || getLandingContentDefaults(),
        requestedLanguage
    );
    const content = normalizeLandingContent(localizedContent.content || getLandingContentDefaults());

    res.json({
        success: true,
        data: {
            resolvedLanguage: localizedContent.resolvedLanguage,
            content,
            updatedAt: existingContent?.updatedAt || null,
        },
    });
}));

/**
 * @desc    Get locale-resolved dynamic landing blocks
 * @route   GET /api/landing/dynamic-blocks
 * @access  Public
 */
router.get('/dynamic-blocks', asyncHandler(async (req, res) => {
    const requestedLanguage = req.query?.lang || req.headers['accept-language'] || 'en';
    const dynamicBlocks = resolveLandingDynamicBlocks(requestedLanguage);

    res.set('Cache-Control', 'public, max-age=0, s-maxage=180, stale-while-revalidate=60');
    res.set('Vary', 'Accept-Encoding, Accept-Language');

    res.json({
        success: true,
        data: {
            resolvedLanguage: dynamicBlocks.resolvedLanguage,
            fallbackUsed: dynamicBlocks.fallbackUsed,
            blocks: dynamicBlocks.blocks,
        },
    });
}));

/**
 * @desc    Get landing page content for super admin editor
 * @route   GET /api/landing/content/admin
 * @access  Super Admin
 */
router.get('/content/admin', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const existingContent = await LandingPageContent.findOne({ key: LANDING_CONTENT_KEY })
        .select('content updatedAt updatedBy')
        .populate('updatedBy', 'firstName lastName email')
        .setOptions({ skipTenantFilter: true });

    const content = normalizeLandingContent(existingContent?.content || getLandingContentDefaults());

    res.json({
        success: true,
        data: {
            content,
            updatedAt: existingContent?.updatedAt || null,
            updatedBy: existingContent?.updatedBy || null,
        },
    });
}));

/**
 * @desc    Update landing page content
 * @route   PUT /api/landing/content
 * @access  Super Admin
 */
router.put('/content', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const payload = req.body?.content ?? req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({
            success: false,
            message: 'Landing content payload must be an object',
        });
    }

    const existingContent = await LandingPageContent.findOne({ key: LANDING_CONTENT_KEY })
        .select('content')
        .setOptions({ skipTenantFilter: true });
    const baseline = normalizeLandingContent(existingContent?.content || getLandingContentDefaults());
    const merged = mergeLandingContent(baseline, payload);
    const content = normalizeLandingContent(merged);

    const saved = await LandingPageContent.findOneAndUpdate(
        { key: LANDING_CONTENT_KEY },
        {
            $set: {
                content,
                updatedBy: req.user._id,
            },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
        .populate('updatedBy', 'firstName lastName email')
        .setOptions({ skipTenantFilter: true });

    res.json({
        success: true,
        message: 'Landing page updated successfully',
        data: {
            content,
            updatedAt: saved.updatedAt,
            updatedBy: saved.updatedBy,
        },
    });
}));

/**
 * @desc    Reset landing page content to defaults
 * @route   POST /api/landing/content/reset
 * @access  Super Admin
 */
router.post('/content/reset', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const content = getLandingContentDefaults();
    const saved = await LandingPageContent.findOneAndUpdate(
        { key: LANDING_CONTENT_KEY },
        {
            $set: {
                content,
                updatedBy: req.user._id,
            },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
        .populate('updatedBy', 'firstName lastName email')
        .setOptions({ skipTenantFilter: true });

    res.json({
        success: true,
        message: 'Landing page reset to defaults',
        data: {
            content,
            updatedAt: saved.updatedAt,
            updatedBy: saved.updatedBy,
        },
    });
}));

/**
 * @desc    Get all active schools for public landing page
 * @route   GET /api/landing/schools
 * @access  Public
 */
router.get('/schools', asyncHandler(async (req, res) => {
    const schools = await School.find({ 
        isActive: true,
        'subscription.status': { $in: ['active', 'trial'] }
    })
    .select('name slug settings.maxStudents')
    .sort({ name: 1 });

    res.json({
        success: true,
        data: { schools }
    });
}));

/**
 * @desc    Get school info by slug for login page
 * @route   GET /api/landing/school/:slug
 * @access  Public
 */
router.get('/school/:slug', asyncHandler(async (req, res) => {
    const school = await School.findOne({ 
        slug: req.params.slug,
        isActive: true 
    })
    .select('name settings');

    if (!school) {
        return res.status(404).json({
            success: false,
            message: 'School not found'
        });
    }

    res.json({
        success: true,
        data: { school }
    });
}));

/**
 * @desc    Active subscription plans for the public pricing section
 * @route   GET /api/landing/plans
 * @access  Public
 */
router.get('/plans', asyncHandler(async (req, res) => {
    const plans = await SubscriptionPlan.find({ isActive: true })
        .select('key name description limits features billing sortOrder')
        .sort({ sortOrder: 1, createdAt: 1 })
        .lean();

    const data = plans.map((plan) => ({
        ...plan,
        featureHighlights: Object.entries(plan.features || {})
            .filter(([key, enabled]) => enabled === true && !LANDING_HIDDEN_FEATURES.has(key))
            .map(([key]) => FEATURES[key]?.label || key)
            .slice(0, 8),
        featured: plan.key === 'professional'
    }));

    res.json({
        success: true,
        data: { plans: data }
    });
}));

const DEMO_STATUSES = ['new', 'contacted', 'scheduled', 'closed'];

// The landing page only advertises features that are live for schools today.
const LANDING_HIDDEN_FEATURES = new Set(['parentPortal']);

/**
 * @desc    Book a demo from the landing page
 * @route   POST /api/landing/demo-requests
 * @access  Public
 */
router.post('/demo-requests', demoRequestLimiter, asyncHandler(async (req, res) => {
    const { valid, errors, value } = validateDemoRequestPayload(req.body);
    if (!valid) {
        return res.status(400).json({
            success: false,
            message: 'Please check the highlighted fields.',
            errors
        });
    }

    const demoRequest = await DemoRequest.create({
        ...value,
        locale: normalizeLandingLanguage(req.body?.locale || req.headers['accept-language'] || 'en')
    });

    await notifyDemoRequest(demoRequest);

    res.status(201).json({
        success: true,
        data: { id: demoRequest._id }
    });
}));

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    List demo requests for the super admin
 * @route   GET /api/landing/demo-requests
 * @access  Super Admin
 */
router.get('/demo-requests', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const status = String(req.query?.status || '').trim();
    const search = String(req.query?.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query?.limit) || 25, 1), 100);
    const page = Math.max(Number(req.query?.page) || 1, 1);

    const filter = {};
    if (DEMO_STATUSES.includes(status)) filter.status = status;
    if (search) {
        const pattern = new RegExp(escapeRegex(search), 'i');
        filter.$or = [{ name: pattern }, { schoolName: pattern }, { email: pattern }];
    }

    const [items, total] = await Promise.all([
        DemoRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        DemoRequest.countDocuments(filter)
    ]);

    res.json({
        success: true,
        data: { items, total, page, limit }
    });
}));

/**
 * @desc    Status counts for the super admin dashboard and badge
 * @route   GET /api/landing/demo-requests/summary
 * @access  Super Admin
 */
router.get('/demo-requests/summary', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const grouped = await DemoRequest.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const counts = DEMO_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {});
    let total = 0;
    for (const row of grouped) {
        if (counts[row._id] !== undefined) counts[row._id] = row.count;
        total += row.count;
    }

    res.json({
        success: true,
        data: { counts, total }
    });
}));

/**
 * @desc    Move a demo request along or record a note
 * @route   PATCH /api/landing/demo-requests/:id
 * @access  Super Admin
 */
router.patch('/demo-requests/:id', protect, superAdminOnly, asyncHandler(async (req, res) => {
    const status = req.body?.status;
    const notes = req.body?.notes;

    if (status !== undefined && !DEMO_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Unknown demo request status.' });
    }
    if (notes !== undefined && String(notes).length > 2000) {
        return res.status(400).json({ success: false, message: 'The note is too long.' });
    }

    const update = {};
    if (status !== undefined) {
        update.status = status;
        update.handledBy = req.user?._id;
        update.handledAt = new Date();
    }
    if (notes !== undefined) update.notes = String(notes).trim();

    const demoRequest = await DemoRequest.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true
    }).lean();

    if (!demoRequest) {
        return res.status(404).json({ success: false, message: 'Demo request not found.' });
    }

    res.json({ success: true, data: { demoRequest } });
}));

export default router;
