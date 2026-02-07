import express from 'express';
import bcrypt from 'bcryptjs';
import School from '../models/School.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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

export default router;
