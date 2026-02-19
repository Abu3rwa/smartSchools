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

const router = express.Router();

/**
 * @desc    Get dynamic landing page content
 * @route   GET /api/landing/content
 * @access  Public
 */
router.get('/content', asyncHandler(async (req, res) => {
    const existingContent = await LandingPageContent.findOne({ key: LANDING_CONTENT_KEY })
        .select('content updatedAt')
        .setOptions({ skipTenantFilter: true });

    const content = normalizeLandingContent(existingContent?.content || getLandingContentDefaults());

    res.json({
        success: true,
        data: {
            content,
            updatedAt: existingContent?.updatedAt || null,
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
