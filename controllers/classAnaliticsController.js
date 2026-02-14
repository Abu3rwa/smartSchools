import { asyncHandler } from '../middleware/errorHandler.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Grade from '../models/Grade.js';
import Attendance from '../models/Attendance.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import { resolveTeacherProfile, getTeacherClassIds } from '../helpers/teacherScoping.js';
import * as classAnalyticsService from '../services/classAnalyticsService.js';
import * as classAnalyticsAIService from '../services/classAnalyticsAIService.js';

/**
 * Ensure the class exists and belongs to the school; for teachers, ensure they have access.
 */
async function ensureClassAccess(req, classId) {
    const classDoc = await Class.findById(classId).select('school').lean();
    if (!classDoc) return { allowed: false, status: 404, message: 'Class not found' };
    if (classDoc.school.toString() !== req.schoolId.toString()) {
        return { allowed: false, status: 403, message: 'Access denied to this class' };
    }
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return { allowed: false, status: 403, message: 'Teacher profile not found' };
        const allowedClassIds = await getTeacherClassIds(teacher._id);
        if (!allowedClassIds.some((id) => id.toString() === classId)) {
            return { allowed: false, status: 403, message: 'You are not authorized to view this class' };
        }
    }
    return { allowed: true };
}

/**
 * @desc    Get class analytics (grades by subject, attendance, at-risk students)
 * @route   GET /api/classes/:id/analytics
 * @access  Private (Admin, Teacher)
 */
export const getClassAnalytics = asyncHandler(async (req, res) => {
    const classId = req.params.id;
    const access = await ensureClassAccess(req, classId);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const { academicYear, startDate, endDate } = req.query;
    const payload = await classAnalyticsService.getAnalytics(classId, req.schoolId, {
        academicYear,
        startDate,
        endDate
    });

    if (!payload) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }

    res.status(200).json({ success: true, data: payload });
});

/**
 * @desc    Get AI-generated insights for a class
 * @route   GET /api/classes/:id/insights
 * @access  Private (Admin, Teacher)
 */
export const getClassInsights = asyncHandler(async (req, res) => {
    const classId = req.params.id;
    const access = await ensureClassAccess(req, classId);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const { academicYear, startDate, endDate, includeAnalytics } = req.query;
    const options = { academicYear, startDate, endDate };
    const analyticsPayload = await classAnalyticsService.getAnalytics(classId, req.schoolId, options);

    if (!analyticsPayload) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const { text, tokenUsage } = await classAnalyticsAIService.generateInsights(analyticsPayload, {
        classId
    });

    await AITokenUsage.create({
        model: 'gemini-2.5-flash-lite',
        feature: 'class_analytics_insights',
        school: req.schoolId,
        user: req.user._id,
        entityType: 'Class',
        entityId: classId,
        inputTokens: tokenUsage.input,
        outputTokens: tokenUsage.output,
        totalTokens: tokenUsage.total,
        schoolId: req.schoolId.toString(),
        metadata: { classId, academicYear: options.academicYear }
    });

    const data = { insights: text };
    if (includeAnalytics === 'true') data.analytics = analyticsPayload;

    res.status(200).json({ success: true, data });
});
