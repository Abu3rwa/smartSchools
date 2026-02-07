import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext, superAdminOnly } from '../middleware/tenantIsolation.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @desc    Get current school info (for school admin)
 * @route   GET /api/schools/me
 * @access  Private (Admin)
 */
router.get('/me', requireSchoolContext, asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const studentCount = await Student.countDocuments({ school: req.schoolId, status: 'active' });

    res.json({
        success: true,
        data: { school, studentCount }
    });
}));

/**
 * @desc    Update current school settings
 * @route   PUT /api/schools/me
 * @access  Private (Admin)
 */
router.put('/me', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const { name, contact, settings } = req.body;

    const school = await School.findByIdAndUpdate(
        req.schoolId,
        { name, contact, settings },
        { new: true, runValidators: true }
    );

    res.json({
        success: true,
        message: 'School updated successfully',
        data: { school }
    });
}));

// ─── Super Admin Routes ───

/**
 * @desc    Create a new school with its admin user (super admin)
 * @route   POST /api/schools
 * @access  Private (Super Admin)
 */
router.post('/', superAdminOnly, asyncHandler(async (req, res) => {
    const { schoolName, adminName, adminEmail, adminPassword, plan, maxStudents } = req.body;

    if (!schoolName || !adminName || !adminEmail || !adminPassword) {
        return res.status(400).json({
            success: false,
            message: 'schoolName, adminName, adminEmail, and adminPassword are required'
        });
    }

    // Check duplicates
    const existingSchool = await School.findOne({ name: schoolName });
    if (existingSchool) {
        return res.status(400).json({ success: false, message: 'School name already exists' });
    }

    const existingUser = await User.findOne({ email: adminEmail }).setOptions({ skipTenantFilter: true });
    if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    // Create school
    const school = await School.create({
        name: schoolName,
        contact: { adminName, adminEmail },
        subscription: {
            status: 'active',
            plan: plan || 'starter'
        },
        settings: { maxStudents: maxStudents || 50 }
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
        message: 'School created successfully',
        data: {
            school,
            adminUser: {
                id: adminUser._id,
                email: adminUser.email,
                firstName: adminUser.firstName,
                lastName: adminUser.lastName,
                role: adminUser.role
            }
        }
    });
}));

/**
 * @desc    Get all schools (super admin)
 * @route   GET /api/schools
 * @access  Private (Super Admin)
 */
router.get('/', superAdminOnly, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;

    const query = {};
    if (status) query['subscription.status'] = status;

    const schools = await School.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await School.countDocuments(query);

    // Get student counts for each school
    const schoolsWithStats = await Promise.all(
        schools.map(async (school) => {
            const studentCount = await Student.countDocuments({ school: school._id, status: 'active' });
            const userCount = await User.countDocuments({ school: school._id });
            return { ...school.toObject(), studentCount, userCount };
        })
    );

    res.json({
        success: true,
        data: {
            schools: schoolsWithStats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
}));

/**
 * @desc    Get single school (super admin)
 * @route   GET /api/schools/:id
 * @access  Private (Super Admin)
 */
router.get('/:id', superAdminOnly, asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Get real user counts for this school
    const [adminCount, teacherCount, studentCount, classCount] = await Promise.all([
        User.countDocuments({ school: req.params.id, role: 'admin' }),
        User.countDocuments({ school: req.params.id, role: 'teacher' }),
        Student.countDocuments({ school: req.params.id, status: 'active' }),
        Class.countDocuments({ school: req.params.id })
    ]);

    // Add counts to school object
    const schoolData = school.toObject();
    schoolData.adminCount = adminCount;
    schoolData.teacherCount = teacherCount;
    schoolData.studentCount = studentCount;
    schoolData.classCount = classCount;
    schoolData.userCount = adminCount + teacherCount;

    res.json({ success: true, data: { school: schoolData } });
}));

/**
 * @desc    Update school (super admin)
 * @route   PUT /api/schools/:id
 * @access  Private (Super Admin)
 */
router.put('/:id', superAdminOnly, asyncHandler(async (req, res) => {
    // Whitelist allowed fields to prevent privilege escalation
    const allowed = ['name', 'contact', 'settings'];
    const updates = {};
    allowed.forEach(key => {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const school = await School.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true
    });

    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        message: 'School updated successfully',
        data: { school }
    });
}));

/**
 * @desc    Deactivate school (super admin)
 * @route   DELETE /api/schools/:id
 * @access  Private (Super Admin)
 */
router.delete('/:id', superAdminOnly, asyncHandler(async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    school.isActive = false;
    school.subscription.status = 'cancelled';
    await school.save();

    res.json({
        success: true,
        message: 'School deactivated successfully'
    });
}));

export default router;
