import express from 'express';
import School from '../models/School.js';
import LandingPageContent from '../models/LandingPageContent.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import { LANDING_CONTENT_KEY } from '../config/landingPageDefaults.js';
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

export default router;
