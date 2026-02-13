import notificationService from '../services/notificationService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import Student from '../models/Student.js';

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
            message: 'Could not send daily report. No grades found or no parent or student email.'
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

    if (!(await verifyTeacherStudentAccess(req, studentId))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }

    const notification = await notificationService.sendMonthlyReport(
        studentId,
        month || new Date().getMonth() + 1,
        academicYear || '2025-2026',
        req.user._id
    );

    if (!notification) {
        return res.status(400).json({
            success: false,
            message: 'Could not send monthly report. No parent or student email found.'
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
        return res.status(400).json({
            success: false,
            message: 'Could not send daily classwork update. No grades found or no parent or student email.'
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
    const Notification = (await import('../models/Notification.js')).default;

    const notification = await Notification.findById(req.params.id)
        .populate('student', 'firstName lastName studentId')
        .populate('createdBy', 'firstName lastName');

    if (!notification) {
        return res.status(404).json({
            success: false,
            message: 'Notification not found'
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
    const Notification = (await import('../models/Notification.js')).default;

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
