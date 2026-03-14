import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import Student from '../models/Student.js';
import Notification from '../models/Notification.js';
import { resolveRequestedAcademicYear } from '../utils/academicYear.js';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildRecipientEmailExactMatcher = (email = '') => {
    const escaped = escapeRegex(String(email || '').trim().toLowerCase());
    if (!escaped) return null;
    return new RegExp(`(^|\\s*,\\s*)${escaped}(\\s*,\\s*|$)`, 'i');
};

const matchesRecipientEmail = (recipientEmail, userEmail) => {
    const matcher = buildRecipientEmailExactMatcher(userEmail);
    if (!matcher) return false;
    return matcher.test(String(recipientEmail || '').toLowerCase());
};

/**
 * Verify teacher has access to a student (student is in one of teacher's assigned classes)
 */
const verifyTeacherStudentAccess = async (req, studentId) => {
    if (req.user.role !== 'teacher') return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;
    const classIds = await getTeacherClassIds(teacher._id);
    const student = await Student.findById(studentId);
    if (!student) return false;
    return classIds.some(id => id.toString() === student.currentClass?.toString());
};

/**
 * @desc    Send grade update notification
 * @route   POST /api/notifications/grade-update
 * @access  Private (Teacher)
 */
export const sendGradeUpdateNotification = asyncHandler(async (req, res) => {
    const { studentId, gradeData } = req.body;

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    const notification = await notificationService.sendGradeUpdateNotification(
        studentId,
        gradeData,
        req.user._id
    );

    if (!notification) {
        return res.status(400).json({
            success: false,
            message: 'Could not send notification. No parent or student email found.'
        });
    }

    res.json({
        success: true,
        message: 'Notification sent successfully',
        data: { notification }
    });
});

/**
 * @desc    Send daily report for a student
 * @route   POST /api/notifications/daily-report/:studentId
 * @access  Private (Teacher)
 */
export const sendDailyReport = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const date = req.body.date ? new Date(req.body.date) : new Date();

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    const notification = await notificationService.sendDailyReport(
        studentId,
        date,
        req.user._id
    );

    if (!notification) {
        return res.status(400).json({
            success: false,
            message: 'Could not send daily report. No grades found or no student-related contact email.'
        });
    }

    res.json({
        success: true,
        message: 'Daily report sent successfully',
        data: { notification }
    });
});

/**
 * @desc    Send monthly report for a student
 * @route   POST /api/notifications/monthly-report/:studentId
 * @access  Private (Teacher)
 */
export const sendMonthlyReport = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { month, academicYear } = req.body;
    const effectiveAcademicYear = resolveRequestedAcademicYear(academicYear, req.school);

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    const notification = await notificationService.sendMonthlyReport(
        studentId,
        month || new Date().getMonth() + 1,
        effectiveAcademicYear,
        req.user._id
    );

    if (!notification) {
        return res.status(400).json({
            success: false,
            message: 'Could not send monthly report. No student-related contact email found.'
        });
    }

    res.json({
        success: true,
        message: 'Monthly report sent successfully',
        data: { notification }
    });
});

/**
 * @desc    Send daily classwork update for a student (cumulative monthly classwork)
 * @route   POST /api/notifications/daily-classwork/:studentId
 * @access  Private (Teacher)
 */
export const sendDailyClassworkUpdate = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const date = req.body.date ? new Date(req.body.date) : new Date();
    const { subject, category } = req.body;

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    const notification = await notificationService.sendDailyClassworkUpdate(
        studentId,
        date,
        req.user._id,
        { subject, category }
    );

    if (!notification) {
        const periodLabel = date.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        const categoryLabel = String(category || '').trim();
        const categoryHint = categoryLabel && categoryLabel.toLowerCase() !== 'all'
            ? ` for category "${categoryLabel}"`
            : '';
        return res.status(400).json({
            success: false,
            message: `No classwork grades found${categoryHint} for ${periodLabel}. Add grades for this month or choose a different date range.`
        });
    }

    res.json({
        success: true,
        message: 'Daily classwork update sent successfully',
        data: { notification }
    });
});



/**
 * @desc    Get notification history
 * @route   GET /api/notifications
 * @access  Private
 */
export const getNotificationHistory = asyncHandler(async (req, res) => {
    const { student, type, status, page = 1, limit = 20 } = req.query;

    const filters = { student, type, status };
    if (req.user.role === 'teacher') {
        filters.createdBy = req.user._id;
    } else if (req.user.role === 'parent' || req.user.role === 'student') {
        const orConditions = [{ recipient: req.user._id }];
        const normalizedEmail = String(req.user.email || '').trim();
        if (normalizedEmail) {
            const exactEmailMatcher = buildRecipientEmailExactMatcher(normalizedEmail);
            if (exactEmailMatcher) {
                orConditions.push({ recipientEmail: exactEmailMatcher });
            }
        }
        filters.or = orConditions;
    }

    const result = await notificationService.getNotificationHistory(
        filters,
        parseInt(page),
        parseInt(limit)
    );

    res.json({
        success: true,
        data: result
    });
});

/**
 * @desc    Get notification by ID
 * @route   GET /api/notifications/:id
 * @access  Private
 */
export const getNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id)
        .populate('student', 'firstName lastName studentId')
        .populate('createdBy', 'firstName lastName');

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found'
        });
    }

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = notification.recipient?.toString() === req.user._id.toString();
    const isRecipientEmail = matchesRecipientEmail(notification.recipientEmail, req.user.email);
    const isTeacherOwner = req.user.role === 'teacher' && notification.createdBy?._id?.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner && !isRecipientEmail && !isTeacherOwner) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to view this notification'
        });
    }

    res.json({
        success: true,
        data: { notification }
    });
});

/**
 * @desc    Send AI-generated report to parent
 * @route   POST /api/notifications/send-ai-report/:studentId
 * @access  Private (Teacher)
 */
export const sendAIReport = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { reportContent, period } = req.body;

    if (!reportContent || !period) {
        return res.status(400).json({
            success: false,
            message: 'Report content and period are required'
        });
    }

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    try {
        const notification = await notificationService.sendAIReportToParent(
            studentId,
            reportContent,
            period,
            req.user._id
        );

        res.json({
            success: true,
            message: 'AI report sent successfully',
            data: { notification }
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Could not send AI report'
        });
    }
});
export const resendNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found'
        });
    }

    // Reset status
    notification.status = 'pending';
    await notification.save();

    // Resend
    await notificationService.sendEmail(notification);

    res.json({
        success: true,
        message: 'Notification resent',
        data: { notification }
    });
});

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found'
        });
    }

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = notification.recipient?.toString() === req.user._id.toString();
    const isRecipientEmail = matchesRecipientEmail(notification.recipientEmail, req.user.email);
    if (!isAdmin && !isOwner && !isRecipientEmail) {
        return res.status(403).json({
            success: false,
            message: 'Not authorized to update this notification'
        });
    }

    notification.readAt = new Date();
    notification.status = 'read';
    await notification.save();

    res.json({
        success: true,
        message: 'Notification marked as read',
        data: { notification }
    });
});
