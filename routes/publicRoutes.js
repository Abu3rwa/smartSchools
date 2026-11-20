import express from 'express';
import bcrypt from 'bcryptjs';
import School from '../models/School.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
    optOutPageFor,
    readOptOutToken,
    recordWritingEmailOptOut,
} from '../services/writingEmailOptOutService.js';

const router = express.Router();

/**
 * @desc    Register a new school (public signup)
 * @route   POST /api/public/register-school
 * @access  Public
 */
router.post('/register-school', asyncHandler(async (req, res) => {
    const { schoolName, adminName, adminEmail, adminPassword, estimatedStudents } = req.body;

    if (!schoolName || !adminName || !adminEmail || !adminPassword) {
        return res.status(400).json({
            success: false,
            message: 'School name, admin name, email, and password are required'
        });
    }

    // Check if school name or email already exists
    const existingSchool = await School.findOne({
        $or: [
            { name: schoolName },
            { 'contact.adminEmail': adminEmail }
        ]
    });

    if (existingSchool) {
        return res.status(400).json({
            success: false,
            message: 'School name or admin email already exists'
        });
    }

    // Check if user email already exists
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
        return res.status(400).json({
            success: false,
            message: 'A user with this email already exists'
        });
    }

    // Create school
    const school = await School.create({
        name: schoolName,
        contact: {
            adminName,
            adminEmail
        },
        settings: {
            maxStudents: Math.min(estimatedStudents || 50, 50)
        },
        subscription: {
            status: 'trial',
            plan: 'starter',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
        }
    });

    // Create admin user for the school
    const nameParts = adminName.split(' ');
    const adminUser = await User.create({
        email: adminEmail,
        password: adminPassword,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ') || 'Admin',
        role: 'admin',
        school: school._id
    });

    res.status(201).json({
        success: true,
        message: 'School registered successfully',
        data: {
            schoolId: school._id,
            schoolName: school.name,
            slug: school.slug,
            trialEndsAt: school.subscription.trialEndsAt
        }
    });
}));

/**
 * @desc    Get pricing information
 * @route   GET /api/public/pricing
 * @access  Public
 */
router.get('/pricing', (req, res) => {
    res.json({
        success: true,
        data: {
            plans: [
                {
                    name: 'Starter',
                    price: 'Free',
                    students: 'Up to 50',
                    features: [
                        'Basic grading system',
                        'Teacher accounts',
                        'Class management'
                    ]
                },
                {
                    name: 'Growth',
                    price: '$2/student/month',
                    students: 'Unlimited',
                    features: [
                        'All Starter features',
                        'Parent portal',
                        'Email notifications',
                        'Advanced analytics'
                    ]
                },
                {
                    name: 'Enterprise',
                    price: 'Custom',
                    students: 'Unlimited',
                    features: [
                        'All Growth features',
                        'Priority support',
                        'Custom integrations',
                        'Dedicated account manager'
                    ]
                }
            ]
        }
    });
});

/**
 * @desc    Writing feedback email opt-out (link in the email footer)
 * @route   GET /api/public/writing-email-opt-out/:token
 * @access  Public — the signed token is the only credential
 */
router.get('/writing-email-opt-out/:token', asyncHandler(async (req, res) => {
    const page = await optOutPageFor({ token: req.params.token });
    res.status(page.statusCode).type('html').send(page.html);
}));

/**
 * @desc    Record the writing feedback email opt-out
 * @route   POST /api/public/writing-email-opt-out/:token
 * @access  Public — only a deliberate button click reaches here
 */
router.post('/writing-email-opt-out/:token', asyncHandler(async (req, res) => {
    const claim = readOptOutToken(req.params.token);
    if (!claim) {
        const page = await optOutPageFor({ token: req.params.token });
        return res.status(page.statusCode).type('html').send(page.html);
    }
    await recordWritingEmailOptOut(claim);
    const page = await optOutPageFor({ token: req.params.token, done: true });
    res.status(page.statusCode).type('html').send(page.html);
}));

export default router;
