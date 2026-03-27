import express from 'express';
import { protect, authorize, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext, superAdminOnly } from '../middleware/tenantIsolation.js';
import School from '../models/School.js';
import Subscription from '../models/Subscription.js';
import UpgradeRequest from '../models/UpgradeRequest.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { PERMISSIONS } from '../config/permissions.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { FEATURE_KEYS, getPlanName, isRecognizedPlan, normalizePlan, toSchoolPlan } from '../constants/features.js';
import { buildFeatureMetadata, resolveSchoolFeatureContext, requireFeature } from '../middleware/featureGate.js';
import {
    getAttendanceReminderSettingsFromSchool,
    validateAttendanceReminderSettingsPayload
} from '../utils/attendanceReminderSettings.js';
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
import {
    createDefaultAdmissionsPromotionSettings,
    normalizeAdmissionsPromotionSettings,
    validateAdmissionsPromotionSettingsPayload
} from '../utils/admissionsPromotionSettings.js';
import {
    normalizeStudentGroupingReportSettings,
    STUDENT_GROUPING_REPORT_SETTING_KEYS
} from '../utils/studentGroupingReportSettings.js';
import upload from '../middleware/upload.js';
import { uploadFile, deleteFile } from '../services/firebaseStorageService.js';
import {
    getSchoolAcademicExcellenceAnalytics,
    getSchoolAcademicExcellenceAtRisk,
    getAcademicExcellenceSettings,
    updateAcademicExcellenceSettings,
    exportAcademicExcellenceReport
} from '../controllers/academicExcellenceAnalyticsController.js';

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
 * @desc    Get current school feature gates and limits
 * @route   GET /api/schools/me/features
 * @access  Private (Any school user)
 */
router.get('/me/features', requireSchoolContext, asyncHandler(async (req, res) => {
    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    if (!featureContext) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const [currentStudents, currentTeachers, currentClasses] = await Promise.all([
        Student.countDocuments({ school: req.schoolId, status: 'active' }),
        User.countDocuments({ school: req.schoolId, role: 'teacher' }),
        Class.countDocuments({ school: req.schoolId })
    ]);

    const fallbackPlanConfig = await Subscription.getPlanConfig(featureContext.plan)
        || await Subscription.getPlanConfig('starter');
    const limits = featureContext.limits || fallbackPlanConfig?.limits || {};
    const usage = {
        currentStudents,
        currentTeachers,
        currentClasses,
        currentStorage: featureContext.subscription?.usage?.currentStorage || 0
    };

    const subscriptionStatus = featureContext.subscription?.status
        || featureContext.school?.subscription?.status
        || 'inactive';

    res.json({
        success: true,
        data: {
            plan: featureContext.plan,
            planName: featureContext.planName,
            subscriptionStatus,
            trialEndsAt: featureContext.subscription?.trialEndsAt || featureContext.school?.subscription?.trialEndsAt || null,
            currentPeriodEnd: featureContext.subscription?.currentPeriodEnd || featureContext.school?.subscription?.currentPeriodEnd || null,
            features: featureContext.features,
            limits,
            usage,
            featureMetadata: buildFeatureMetadata(featureContext.features, featureContext.plan)
        }
    });
}));

/**
 * @desc    Get current school subscription status and usage
 * @route   GET /api/schools/me/subscription
 * @access  Private (Admin)
 */
router.get('/me/subscription', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    if (!featureContext) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const [currentStudents, currentTeachers, currentClasses] = await Promise.all([
        Student.countDocuments({ school: req.schoolId, status: 'active' }),
        User.countDocuments({ school: req.schoolId, role: 'teacher' }),
        Class.countDocuments({ school: req.schoolId })
    ]);

    const subscription = featureContext.subscription;
    const now = new Date();
    const currentPeriodEnd = subscription?.currentPeriodEnd || null;
    const trialEndsAt = subscription?.trialEndsAt || null;
    const targetDate = currentPeriodEnd || trialEndsAt;
    const daysRemaining = targetDate
        ? Math.ceil((new Date(targetDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;

    const fallbackPlanConfig = await Subscription.getPlanConfig(featureContext.plan)
        || await Subscription.getPlanConfig('starter');

    const limits = featureContext.limits || fallbackPlanConfig?.limits || {};
    const usage = {
        currentStudents,
        currentTeachers,
        currentClasses,
        currentStorage: subscription?.usage?.currentStorage || 0
    };

    res.json({
        success: true,
        data: {
            status: subscription?.status || featureContext.school?.subscription?.status || 'inactive',
            plan: featureContext.plan,
            billingInterval: subscription?.billing?.interval === 'year' ? 'annually' : 'monthly',
            currentPeriodStart: subscription?.currentPeriodStart || null,
            currentPeriodEnd,
            daysRemaining,
            trialEndsAt,
            cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
            limits,
            usage,
            features: featureContext.features,
            invoices: subscription?.invoices || []
        }
    });
}));

/**
 * @desc    Get school academic year date range (start/end)
 * @route   GET /api/schools/me/academic-year-dates
 * @access  Private (Admin)
 */
router.get('/me/academic-year-dates', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select(
        'settings.academicYearStartDate settings.academicYearEndDate settings.currentAcademicYear'
    );
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        data: {
            academicYear: school.settings?.currentAcademicYear || null,
            startDate: school.settings?.academicYearStartDate || null,
            endDate: school.settings?.academicYearEndDate || null
        }
    });
}));

/**
 * @desc    Update school academic year date range (start/end)
 * @route   PUT /api/schools/me/academic-year-dates
 * @access  Private (Admin)
 */
router.put('/me/academic-year-dates', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.body || {};
    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            message: 'startDate and endDate are required'
        });
    }

    const parsedStart = new Date(startDate);
    const parsedEnd = new Date(endDate);
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid startDate or endDate'
        });
    }
    if (parsedStart > parsedEnd) {
        return res.status(400).json({
            success: false,
            message: 'End date must be on or after start date'
        });
    }

    const school = await School.findByIdAndUpdate(
        req.schoolId,
        {
            $set: {
                'settings.academicYearStartDate': parsedStart,
                'settings.academicYearEndDate': parsedEnd
            }
        },
        { new: true, runValidators: true }
    ).select('settings.academicYearStartDate settings.academicYearEndDate settings.currentAcademicYear');

    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        message: 'Academic year dates updated',
        data: {
            academicYear: school.settings?.currentAcademicYear || null,
            startDate: school.settings?.academicYearStartDate || null,
            endDate: school.settings?.academicYearEndDate || null
        }
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
 * @desc    Upload school logo
 * @route   PUT /api/schools/me/logo
 * @access  Private (Admin)
 */
router.put('/me/logo', requireSchoolContext, authorize('admin'), upload.single('logo'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please provide a valid image file.' });
    }

    const schoolToUpdate = await School.findById(req.schoolId);

    if (schoolToUpdate.settings?.branding?.logoUrl && schoolToUpdate.settings.branding.logoUrl.includes('storage.googleapis.com')) {
        await deleteFile(schoolToUpdate.settings.branding.logoUrl);
    }

    const destinationPath = `schools/${req.schoolId}/logo-${Date.now()}`;
    const newLogoUrl = await uploadFile(req.file.buffer, req.file.mimetype, destinationPath);

    const school = await School.findByIdAndUpdate(
        req.schoolId,
        { 'settings.branding.logoUrl': newLogoUrl },
        { new: true, runValidators: true }
    );

    res.json({
        success: true,
        message: 'School logo updated successfully',
        data: { logoUrl: newLogoUrl, school }
    });
}));

/**
 * @desc    Get school communication settings (AI draft controls)
 * @route   GET /api/schools/me/communication-settings
 * @access  Private (Admin)
 */
router.get('/me/communication-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const [school, featureContext] = await Promise.all([
        School.findById(req.schoolId).select('settings.communication'),
        resolveSchoolFeatureContext(req.schoolId)
    ]);
    if (!school || !featureContext) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const featureAvailable = Boolean(featureContext.features?.aiEmailDrafts);
    const aiEmailDraftEnabled = school.settings?.communication?.aiEmailDraftEnabled !== false;

    res.json({
        success: true,
        data: {
            aiEmailDraftEnabled,
            featureAvailable
        }
    });
}));

/**
 * @desc    Update school communication settings (AI draft controls)
 * @route   PATCH /api/schools/me/communication-settings
 * @access  Private (Admin)
 */
router.patch('/me/communication-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const nextValue = req.body?.aiEmailDraftEnabled;
    if (typeof nextValue !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: 'aiEmailDraftEnabled must be a boolean'
        });
    }

    const [school, featureContext] = await Promise.all([
        School.findById(req.schoolId),
        resolveSchoolFeatureContext(req.schoolId)
    ]);
    if (!school || !featureContext) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const featureAvailable = Boolean(featureContext.features?.aiEmailDrafts);
    if (nextValue === true && !featureAvailable) {
        return res.status(403).json({
            success: false,
            message: 'AI Email Drafts are not available on the current subscription plan',
            code: 'FEATURE_LOCKED',
            requiredFeature: 'aiEmailDrafts'
        });
    }

    school.settings = school.settings || {};
    school.settings.communication = school.settings.communication || {};
    school.settings.communication.aiEmailDraftEnabled = nextValue;
    await school.save();

    res.json({
        success: true,
        message: 'Communication settings updated',
        data: {
            aiEmailDraftEnabled: school.settings.communication.aiEmailDraftEnabled !== false,
            featureAvailable
        }
    });
}));

/**
 * @desc    Get school attendance reminder settings
 * @route   GET /api/schools/me/attendance-reminder-settings
 * @access  Private (Admin)
 */
router.get('/me/attendance-reminder-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select('settings.attendanceReminders');
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        data: getAttendanceReminderSettingsFromSchool(school)
    });
}));

/**
 * @desc    Update school attendance reminder settings
 * @route   PATCH /api/schools/me/attendance-reminder-settings
 * @access  Private (Admin)
 */
router.patch('/me/attendance-reminder-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const validation = validateAttendanceReminderSettingsPayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            message: validation.errors.join('. ')
        });
    }

    const school = await School.findById(req.schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    school.settings = school.settings || {};
    school.settings.attendanceReminders = validation.data;
    await school.save();

    res.json({
        success: true,
        message: 'Attendance reminder settings updated',
        data: getAttendanceReminderSettingsFromSchool(school)
    });
}));

/**
 * @desc    Get school admissions and promotion settings
 * @route   GET /api/schools/me/admissions-promotion-settings
 * @access  Private (Admin)
 */
router.get('/me/admissions-promotion-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select('settings.admissionsPromotion');
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const settings = normalizeAdmissionsPromotionSettings(
        school.settings?.admissionsPromotion || createDefaultAdmissionsPromotionSettings()
    );

    res.json({
        success: true,
        data: settings
    });
}));

/**
 * @desc    Update school admissions and promotion settings
 * @route   PATCH /api/schools/me/admissions-promotion-settings
 * @access  Private (Admin)
 */
router.patch('/me/admissions-promotion-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const validation = validateAdmissionsPromotionSettingsPayload(req.body);
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            message: validation.message
        });
    }

    const school = await School.findById(req.schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const currentSettings = school.settings?.admissionsPromotion || createDefaultAdmissionsPromotionSettings();
    const mergedSettings = {
        ...currentSettings,
        ...req.body,
        promotionPolicy: {
            ...(currentSettings.promotionPolicy || {}),
            ...(req.body?.promotionPolicy || {}),
            requiredClearanceChecks: {
                ...(currentSettings.promotionPolicy?.requiredClearanceChecks || {}),
                ...(req.body?.promotionPolicy?.requiredClearanceChecks || {})
            }
        },
        approvalWorkflow: {
            ...(currentSettings.approvalWorkflow || {}),
            ...(req.body?.approvalWorkflow || {})
        },
        calendar: {
            ...(currentSettings.calendar || {}),
            ...(req.body?.calendar || {}),
            newAdmissionsLockWindow: {
                ...(currentSettings.calendar?.newAdmissionsLockWindow || {}),
                ...(req.body?.calendar?.newAdmissionsLockWindow || {})
            },
            returningAdmissionsLockWindow: {
                ...(currentSettings.calendar?.returningAdmissionsLockWindow || {}),
                ...(req.body?.calendar?.returningAdmissionsLockWindow || {})
            }
        },
        permissions: {
            ...(currentSettings.permissions || {}),
            ...(req.body?.permissions || {})
        }
    };

    school.settings = school.settings || {};
    school.settings.admissionsPromotion = normalizeAdmissionsPromotionSettings(mergedSettings);
    await school.save();

    res.json({
        success: true,
        message: 'Admissions and promotion settings updated',
        data: school.settings.admissionsPromotion
    });
}));

/**
 * @desc    Get school standards gradebook settings
 * @route   GET /api/schools/me/standards-gradebook-settings
 * @access  Private (Admin)
 */
router.get('/me/standards-gradebook-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select('settings.standardsGradebook');
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }
    res.json({
        success: true,
        data: {
            scoringMode: school.settings?.standardsGradebook?.scoringMode || 'average',
        }
    });
}));

/**
 * @desc    Update school standards gradebook settings
 * @route   PATCH /api/schools/me/standards-gradebook-settings
 * @access  Private (Admin)
 */
router.patch('/me/standards-gradebook-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const { scoringMode } = req.body || {};
    const allowedModes = ['average', 'latest', 'highest'];
    if (!scoringMode || !allowedModes.includes(scoringMode)) {
        return res.status(400).json({
            success: false,
            message: `scoringMode must be one of: ${allowedModes.join(', ')}`
        });
    }

    const school = await School.findById(req.schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    school.settings = school.settings || {};
    school.settings.standardsGradebook = school.settings.standardsGradebook || {};
    school.settings.standardsGradebook.scoringMode = scoringMode;
    await school.save();

    res.json({
        success: true,
        message: 'Standards gradebook settings updated',
        data: {
            scoringMode: school.settings.standardsGradebook.scoringMode,
        }
    });
}));

/**
 * @desc    Get school student grouping report settings
 * @route   GET /api/schools/me/student-grouping-report-settings
 * @access  Private (Admin)
 */
router.get('/me/student-grouping-report-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const school = await School.findById(req.schoolId).select('settings.studentGroupingReports');
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    res.json({
        success: true,
        data: normalizeStudentGroupingReportSettings(school.settings?.studentGroupingReports)
    });
}));

/**
 * @desc    Update school student grouping report settings
 * @route   PATCH /api/schools/me/student-grouping-report-settings
 * @access  Private (Admin)
 */
router.patch('/me/student-grouping-report-settings', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = {};

    for (const key of STUDENT_GROUPING_REPORT_SETTING_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) {
            continue;
        }

        if (typeof payload[key] !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: `${key} must be a boolean`
            });
        }

        patch[key] = payload[key];
    }

    if (Object.keys(patch).length === 0) {
        return res.status(400).json({
            success: false,
            message: `Provide at least one setting key: ${STUDENT_GROUPING_REPORT_SETTING_KEYS.join(', ')}`
        });
    }

    const school = await School.findById(req.schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    school.settings = school.settings || {};
    school.settings.studentGroupingReports = {
        ...normalizeStudentGroupingReportSettings(school.settings.studentGroupingReports),
        ...patch
    };
    await school.save();

    res.json({
        success: true,
        message: 'Student grouping report settings updated',
        data: normalizeStudentGroupingReportSettings(school.settings.studentGroupingReports)
    });
}));

/**
 * @desc    Remove school logo
 * @route   DELETE /api/schools/me/logo
 * @access  Private (Admin)
 */
router.delete('/me/logo', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const schoolToUpdate = await School.findById(req.schoolId);
    if (!schoolToUpdate) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    if (schoolToUpdate.settings?.branding?.logoUrl && schoolToUpdate.settings.branding.logoUrl.includes('storage.googleapis.com')) {
        await deleteFile(schoolToUpdate.settings.branding.logoUrl);
    }

    const school = await School.findByIdAndUpdate(
        req.schoolId,
        { 'settings.branding.logoUrl': null },
        { new: true, runValidators: true }
    );

    res.json({
        success: true,
        message: 'School logo removed successfully',
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

/**
 * @desc    Submit an upgrade request for the current school (school admin)
 * @route   POST /api/schools/me/upgrade-requests
 * @access  Private (Admin)
 */
router.post('/me/upgrade-requests', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const { requestedPlan, requestedFeatures, message } = req.body || {};
    const normalizedRequestedPlan = requestedPlan ? normalizePlan(requestedPlan) : '';

    if (requestedPlan && !isRecognizedPlan(normalizedRequestedPlan)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid requestedPlan'
        });
    }

    const featureSet = new Set(FEATURE_KEYS);
    const normalizedFeatures = Array.isArray(requestedFeatures)
        ? requestedFeatures
            .map((key) => String(key || '').trim())
            .filter((key) => featureSet.has(key))
        : [];

    const trimmedMessage = String(message || '').trim();
    if (!normalizedRequestedPlan && normalizedFeatures.length === 0 && !trimmedMessage) {
        return res.status(400).json({
            success: false,
            message: 'Please include a requested plan, requested features, or a message.'
        });
    }

    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    if (!featureContext) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const request = await UpgradeRequest.create({
        school: req.schoolId,
        requestedBy: req.user._id,
        currentPlan: featureContext.plan,
        requestedPlan: normalizedRequestedPlan,
        requestedFeatures: normalizedFeatures,
        message: trimmedMessage,
        status: 'pending'
    });

    const populated = await UpgradeRequest.findById(request._id)
        .populate('requestedBy', 'firstName lastName email');

    res.status(201).json({
        success: true,
        message: 'Upgrade request submitted',
        data: { request: populated }
    });
}));

/**
 * @desc    Get upgrade requests for the current school (school admin)
 * @route   GET /api/schools/me/upgrade-requests
 * @access  Private (Admin)
 */
router.get('/me/upgrade-requests', requireSchoolContext, authorize('admin'), asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const requests = await UpgradeRequest.find({ school: req.schoolId })
        .populate('requestedBy', 'firstName lastName email')
        .populate('review.handledBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit);

    res.json({
        success: true,
        data: {
            requests
        }
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
    const normalizedPlan = normalizePlan(plan || 'starter');
    const planConfig = await Subscription.getPlanConfig(normalizedPlan);

    if (!schoolName || !adminName || !adminEmail || !adminPassword) {
        return res.status(400).json({
            success: false,
            message: 'schoolName, adminName, adminEmail, and adminPassword are required'
        });
    }

    if (!planConfig) {
        return res.status(400).json({
            success: false,
            message: `Plan "${normalizedPlan}" does not exist`
        });
    }
    if (planConfig.isActive === false) {
        return res.status(400).json({
            success: false,
            message: `Plan "${normalizedPlan}" is inactive and cannot be assigned`
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
            plan: toSchoolPlan(normalizedPlan)
        },
        settings: {
            maxStudents: maxStudents || 50,
            features: planConfig.features || {}
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
 * @desc    List upgrade requests across schools (super admin)
 * @route   GET /api/schools/upgrade-requests
 * @access  Private (Super Admin)
 */
router.get('/upgrade-requests', superAdminOnly, asyncHandler(async (req, res) => {
    const { status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const query = {};
    if (status) {
        query.status = status;
    }

    const [requests, total] = await Promise.all([
        UpgradeRequest.find(query)
            .populate('school', 'name contact.adminName contact.adminEmail subscription.plan')
            .populate('requestedBy', 'firstName lastName email')
            .populate('review.handledBy', 'firstName lastName email')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .setOptions({ skipTenantFilter: true }),
        UpgradeRequest.countDocuments(query).setOptions({ skipTenantFilter: true })
    ]);

    const schoolIds = requests
        .map((request) => request.school?._id)
        .filter(Boolean);

    const subscriptions = schoolIds.length > 0
        ? await Subscription.find({ school: { $in: schoolIds } })
            .select('_id school')
            .setOptions({ skipTenantFilter: true })
            .lean()
        : [];

    const subscriptionIdBySchoolId = new Map(
        subscriptions.map((subscription) => [String(subscription.school), String(subscription._id)])
    );

    const requestsWithSubscription = requests.map((request) => {
        const plainRequest = request.toObject();
        const schoolId = plainRequest.school?._id ? String(plainRequest.school._id) : '';
        return {
            ...plainRequest,
            schoolSubscriptionId: subscriptionIdBySchoolId.get(schoolId) || null
        };
    });

    res.json({
        success: true,
        data: {
            requests: requestsWithSubscription,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
}));

/**
 * @desc    Update upgrade request status (super admin)
 * @route   PATCH /api/schools/upgrade-requests/:id
 * @access  Private (Super Admin)
 */
router.patch('/upgrade-requests/:id', superAdminOnly, asyncHandler(async (req, res) => {
    const allowedStatuses = new Set(['pending', 'in_review', 'approved', 'rejected']);
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const reviewNote = String(req.body?.reviewNote || '').trim();

    if (!allowedStatuses.has(nextStatus)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid status'
        });
    }

    const request = await UpgradeRequest.findById(req.params.id).setOptions({ skipTenantFilter: true });
    if (!request) {
        return res.status(404).json({ success: false, message: 'Upgrade request not found' });
    }

    request.status = nextStatus;
    request.review = {
        handledBy: req.user._id,
        handledAt: new Date(),
        note: reviewNote
    };

    await request.save();

    const populated = await UpgradeRequest.findById(request._id)
        .populate('school', 'name contact.adminName contact.adminEmail subscription.plan')
        .populate('requestedBy', 'firstName lastName email')
        .populate('review.handledBy', 'firstName lastName email')
        .setOptions({ skipTenantFilter: true });

    const schoolSubscription = populated?.school?._id
        ? await Subscription.findOne({ school: populated.school._id })
            .select('_id')
            .setOptions({ skipTenantFilter: true })
            .lean()
        : null;

    res.json({
        success: true,
        message: `Upgrade request marked as ${nextStatus}`,
        data: {
            request: {
                ...populated.toObject(),
                schoolSubscriptionId: schoolSubscription?._id ? String(schoolSubscription._id) : null,
                requestedPlanName: populated.requestedPlan ? getPlanName(populated.requestedPlan) : '',
                currentPlanName: getPlanName(populated.currentPlan)
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

// ─── Academic Excellence (school-level) ─────────────────────────────
router.get('/:schoolId/academic-excellence/analytics', requireSchoolContext, authorize('admin', 'department_principal'), requireFeature('academicIntelligence'), getSchoolAcademicExcellenceAnalytics);
router.get('/:schoolId/academic-excellence/at-risk', requireSchoolContext, authorize('admin', 'department_principal'), requireFeature('academicIntelligence'), getSchoolAcademicExcellenceAtRisk);
router.get('/:schoolId/academic-excellence/settings', requireSchoolContext, authorize('admin', 'department_principal'), requireFeature('academicIntelligence'), getAcademicExcellenceSettings);
router.patch('/:schoolId/academic-excellence/settings', requireSchoolContext, authorize('admin'), requireFeature('academicIntelligence'), updateAcademicExcellenceSettings);
router.get('/:schoolId/academic-excellence/export', requireSchoolContext, authorize('admin', 'department_principal'), requireFeature('academicIntelligence'), exportAcademicExcellenceReport);

export default router;
