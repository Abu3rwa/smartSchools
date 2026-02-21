import express from 'express';
import { protect, authorize, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext, superAdminOnly } from '../middleware/tenantIsolation.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { PERMISSIONS } from '../config/permissions.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateToken } from '../middleware/auth.js';
import {
    getAcademicYears,
    copyClassesFromYear,
    deactivateYear,
    promoteStudents
} from '../controllers/academicYearRolloverController.js';
import {
    isValidAcademicYear,
    normalizeAcademicYear,
    resolveSchoolAcademicYear
} from '../utils/academicYear.js';

const router = express.Router();
const userManagementAccess = authorizeWithPermission(
    ['admin'],
    [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
);
const validPermissionKeys = new Set(Object.values(PERMISSIONS));

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
 * @desc    Get current school-wide academic year
 * @route   GET /api/schools/me/current-academic-year
 * @access  Private (Any school user)
 */
router.get('/me/current-academic-year', requireSchoolContext, asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select('settings.currentAcademicYear settings.academicYearStartMonth');
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const academicYear = resolveSchoolAcademicYear(school);
    res.json({
        success: true,
        data: { academicYear }
    });
}));

/**
 * @desc    Update school-wide academic year
 * @route   PUT /api/schools/me/current-academic-year
 * @access  Private (Admin)
 */
router.put('/me/current-academic-year', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const inputYear = normalizeAcademicYear(req.body?.academicYear);
    if (!isValidAcademicYear(inputYear)) {
        return res.status(400).json({
            success: false,
            message: 'Academic year must be in YYYY-YYYY format (consecutive years)'
        });
    }

    const school = await School.findByIdAndUpdate(
        req.schoolId,
        { $set: { 'settings.currentAcademicYear': inputYear } },
        { new: true, runValidators: true }
    ).select('settings.currentAcademicYear settings.academicYearStartMonth');

    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        message: `Academic year updated to ${inputYear}`,
        data: { academicYear: school.settings?.currentAcademicYear || inputYear }
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

/**
 * @desc    List users in current school (for role/department management)
 * @route   GET /api/schools/me/users
 * @access  Private (Admin)
 */
router.get('/me/users', requireSchoolContext, userManagementAccess, asyncHandler(async (req, res) => {
    const users = await User.find({ school: req.schoolId })
        .select('firstName lastName email role isActive department permissions permissionScopes createdAt')
        .populate('department', 'name type')
        .sort({ role: 1, 'firstName': 1 });

    res.json({ success: true, data: { users } });
}));

/**
 * @desc    Update a user's role, permissions, and department (school admin only)
 * @route   PATCH /api/schools/me/users/:userId
 * @access  Private (Admin)
 */
router.patch('/me/users/:userId', requireSchoolContext, userManagementAccess, asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role, department, permissions, permissionScopes } = req.body;

    const user = await User.findById(userId).setOptions({ skipTenantFilter: true });
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.school?.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'User does not belong to your school' });
    }
    if (user.role === 'super_admin') {
        return res.status(403).json({ success: false, message: 'Cannot change super admin role' });
    }

    const allowedRoles = [
        'admin', 
        'staff',
        'department_principal', 
        'teacher', 
        'parent', 
        'student',
        // Legacy staff roles (kept for backward compatibility)
        'attendance_manager',
        'lesson_plan_reviewer',
        'report_viewer',
        'event_coordinator',
        'behavior_manager',
        'transportation_coordinator',
        'cafeteria_manager',
        'library_manager',
        'it_support',
        'counselor',
        'nurse'
    ];
    
    if (role !== undefined) {
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ success: false, message: `Role must be one of: ${allowedRoles.join(', ')}` });
        }
        user.role = role;
    }
    
    if (department !== undefined) {
        user.department = department || null;
    }
    
    // Update permissions array
    if (permissions !== undefined) {
        if (!Array.isArray(permissions) && typeof permissions !== 'string') {
            return res.status(400).json({ success: false, message: 'Permissions must be an array or comma-separated string' });
        }

        const normalizedPermissions = Array.from(new Set(
            (Array.isArray(permissions) ? permissions : permissions.split(','))
                .map((permission) => String(permission || '').trim())
                .filter(Boolean)
        ));

        const invalidPermissions = normalizedPermissions.filter((permission) => !validPermissionKeys.has(permission));
        if (invalidPermissions.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid permissions: ${invalidPermissions.join(', ')}`
            });
        }

        user.permissions = normalizedPermissions;
    }
    
    // Update permission scopes (optional)
    if (permissionScopes !== undefined) {
        user.permissionScopes = new Map(Object.entries(permissionScopes || {}));
    }
    
    // Department optional for department_principal: if empty, user is whole-school principal
    await user.save();

    const updated = await User.findById(user._id)
        .select('firstName lastName email role isActive department permissions permissionScopes')
        .populate('department', 'name type')
        .setOptions({ skipTenantFilter: true });

    res.json({
        success: true,
        message: 'User updated successfully',
        data: { user: updated }
    });
}));

/**
 * @desc    List academic years that have classes or students
 * @route   GET /api/schools/me/academic-years
 * @access  Private (Admin)
 */
router.get('/me/academic-years', requireSchoolContext, authorize('admin'), asyncHandler(getAcademicYears));

/**
 * @desc    Create classes for new year from previous year structure
 * @route   POST /api/schools/me/rollover/classes
 * @access  Private (Admin)
 */
router.post('/me/rollover/classes', requireSchoolContext, authorize('admin'), asyncHandler(copyClassesFromYear));

/**
 * @desc    Deactivate all classes for an academic year
 * @route   POST /api/schools/me/rollover/deactivate-year
 * @access  Private (Admin)
 */
router.post('/me/rollover/deactivate-year', requireSchoolContext, authorize('admin'), asyncHandler(deactivateYear));

/**
 * @desc    Promote students to next grade (bulk)
 * @route   POST /api/schools/me/rollover/promote-students
 * @access  Private (Admin)
 */
router.post('/me/rollover/promote-students', requireSchoolContext, authorize('admin'), asyncHandler(promoteStudents));

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
            
            // Find the primary admin for this school to enable impersonation
            const admin = await User.findOne({ school: school._id, role: 'admin' }).select('_id').lean();

            return { 
                ...school.toObject(), 
                studentCount, 
                userCount,
                adminId: admin ? admin._id : null // Pass adminId for the "Login As" button
            };
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
