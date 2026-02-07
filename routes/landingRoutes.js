import express from 'express';
import School from '../models/School.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

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
    .select('name slug contact.adminEmail settings.maxStudents')
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
    .select('name contact.adminEmail settings');

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
