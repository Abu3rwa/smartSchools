
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import gradeService from '../services/gradeService.js';
import aiService from '../services/aiservice.js';
import emailService from '../services/emailService.js';
import { ReportTemplate } from '../models/ReportTemplate.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import { EmailReport } from '../models/EmailReport.js';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import {
    normalizeLanguageCode,
    resolveRequestedLanguages,
    toLegacyLanguageValue
} from '../utils/aiLanguageUtils.js';

/**
 * @desc    Generate advanced AI report with multi-language and email support
 * @route   POST /api/reports/generate-advanced
 * @access  Private (Teacher/Admin)
 */
export const generateAdvancedReport = asyncHandler(async (req, res) => {
    const {
        studentId,
        reportType = 'monthly',
        language = 'english',
        requestedLanguages,
        primaryLanguage,
        secondaryLanguage,
        dateRange,
        customPrompt,
        sendEmail = false,
        recipients = {
            student: true,
            mother: true,
            father: true,
            guardian: true,
            teacher: false
        }
    } = req.body;

    // 1. Fetch Student
    const student = await Student.findById(studentId)
        .populate('school')
        .populate('currentClass')
        .populate('user', 'email');
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // 2. Calculate date range
    const { startDate, endDate, period } = calculateDateRange(reportType, dateRange);

    // 3. Fetch Grades for the specified period
    const grades = await gradeService.getStudentGradesByDateRange(studentId, {
        startDate,
        endDate
    });

    if (!grades || grades.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No grades found for this student in the specified period.'
        });
    }

    // 4. Generate AI Report
    const normalizedRequestedLanguages = resolveRequestedLanguages({
        requestedLanguages,
        primaryLanguage,
        secondaryLanguage,
        language,
        max: 2
    });
    const normalizedLegacyLanguage = toLegacyLanguageValue(normalizedRequestedLanguages);

    const reportResult = await aiService.generateAdvancedReport({
        studentData: student,
        grades,
        period,
        teacher: req.user,
        language: normalizedLegacyLanguage,
        requestedLanguages: normalizedRequestedLanguages,
        reportType,
        dateRange: { startDate, endDate },
        customPrompt,
        userId: req.user._id,
        schoolId: student.school._id
    });

    // 5. Send emails if requested
    let emailResults = null;
    if (sendEmail) {
        emailResults = await emailService.sendReportEmails({
            reportId: reportResult.tokenUsage._id,
            studentData: student,
            reportContent: reportResult.text,
            language: reportResult.language || normalizedLegacyLanguage,
            requestedLanguages: reportResult.requestedLanguages || normalizedRequestedLanguages,
            recipients,
            teacher: req.user
        });
    }

    res.json({
        success: true,
        data: {
            report: reportResult.text,
            studentId,
            reportType,
            language: reportResult.language || normalizedLegacyLanguage,
            requestedLanguages: reportResult.requestedLanguages || normalizedRequestedLanguages,
            period,
            dateRange: { startDate, endDate },
            tokenUsage: reportResult.tokenUsage,
            emailResults
        }
    });
});

/**
 * @desc    Get report templates for a school
 * @route   GET /api/reports/templates
 * @access  Private (Teacher/Admin)
 */
export const getReportTemplates = asyncHandler(async (req, res) => {
    const { type, language } = req.query;
    const schoolId = req.user.school;

    const query = { schoolId, isActive: true };
    if (type) query.type = type;
    if (language) {
        const normalized = normalizeLanguageCode(language);
        if (normalized === 'en') query.language = { $in: ['en', 'english'] };
        else if (normalized === 'ar') query.language = { $in: ['ar', 'arabic'] };
        else if (normalized) query.language = normalized;
        else query.language = String(language || '').trim().toLowerCase();
    }

    const templates = await ReportTemplate.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ isDefault: -1, createdAt: -1 });

    res.json({
        success: true,
        data: templates
    });
});

/**
 * @desc    Create a new report template
 * @route   POST /api/reports/templates
 * @access  Private (Teacher/Admin)
 */
export const createReportTemplate = asyncHandler(async (req, res) => {
    const {
        name,
        type,
        language,
        customPrompt,
        variables = []
    } = req.body;

    const template = new ReportTemplate({
        schoolId: req.user.school,
        name,
        type,
        language: normalizeLanguageCode(language) || String(language || 'en').trim().toLowerCase(),
        customPrompt,
        variables,
        createdBy: req.user._id
    });

    await template.save();

    res.status(201).json({
        success: true,
        data: template
    });
});

/**
 * @desc    Get token usage analytics for a user
 * @route   GET /api/reports/token-usage/:userId
 * @access  Private (Teacher/Admin)
 */
export const getTokenUsage = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { period = 'monthly', year } = req.query;

    const targetUserId = userId || req.user._id;
    const schoolId = req.user.school;

    // Calculate date range for the period
    const now = new Date();
    const targetYear = year || now.getFullYear();
    let startDate, endDate;

    switch (period) {
        case 'weekly':
            startDate = startOfWeek(now);
            endDate = endOfWeek(now);
            break;
        case 'monthly':
            startDate = startOfMonth(new Date(targetYear, now.getMonth()));
            endDate = endOfMonth(new Date(targetYear, now.getMonth()));
            break;
        case 'yearly':
            startDate = startOfYear(new Date(targetYear, 0));
            endDate = endOfYear(new Date(targetYear, 11));
            break;
        default:
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
    }

    const usage = await AITokenUsage.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(targetUserId),
                school: new mongoose.Types.ObjectId(schoolId),
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    reportType: '$reportType',
                    language: '$language'
                },
                totalTokens: { $sum: '$totalTokens' },
                totalCost: { $sum: '$estimatedCost' },
                reportCount: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: '$_id.reportType',
                languages: {
                    $push: {
                        language: '$_id.language',
                        totalTokens: '$totalTokens',
                        totalCost: '$totalCost',
                        reportCount: '$reportCount'
                    }
                },
                totalTokens: { $sum: '$totalTokens' },
                totalCost: { $sum: '$totalCost' },
                totalReports: { $sum: '$reportCount' }
            }
        },
        {
            $sort: { totalTokens: -1 }
        }
    ]);

    const summary = await AITokenUsage.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(targetUserId),
                school: new mongoose.Types.ObjectId(schoolId),
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                totalTokens: { $sum: '$totalTokens' },
                totalCost: { $sum: '$estimatedCost' },
                reportCount: { $sum: 1 }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            period,
            dateRange: { startDate, endDate },
            usage,
            summary: summary[0] || { totalTokens: 0, totalCost: 0, reportCount: 0 }
        }
    });
});

/**
 * @desc    Get token usage analytics for a school
 * @route   GET /api/reports/token-usage/school/:schoolId
 * @access  Private (Admin)
 */
export const getSchoolTokenUsage = asyncHandler(async (req, res) => {
    const { schoolId } = req.params;
    const { period = 'monthly', year } = req.query;

    // Calculate date range
    const now = new Date();
    const targetYear = year || now.getFullYear();
    let startDate, endDate;

    switch (period) {
        case 'weekly':
            startDate = startOfWeek(now);
            endDate = endOfWeek(now);
            break;
        case 'monthly':
            startDate = startOfMonth(new Date(targetYear, now.getMonth()));
            endDate = endOfMonth(new Date(targetYear, now.getMonth()));
            break;
        case 'yearly':
            startDate = startOfYear(new Date(targetYear, 0));
            endDate = endOfYear(new Date(targetYear, 11));
            break;
        default:
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
    }

    const usage = await AITokenUsage.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(schoolId),
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userInfo'
            }
        },
        {
            $unwind: {
                path: '$userInfo',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: '$user',
                userInfo: { $first: '$userInfo' },
                totalTokens: { $sum: '$totalTokens' },
                totalCost: { $sum: '$estimatedCost' },
                reportCount: { $sum: 1 }
            }
        },
        {
            $project: {
                userName: {
                    $trim: {
                        input: {
                            $concat: [
                                { $ifNull: ['$userInfo.firstName', ''] },
                                ' ',
                                { $ifNull: ['$userInfo.lastName', ''] }
                            ]
                        }
                    }
                },
                email: { $ifNull: ['$userInfo.email', ''] },
                totalTokens: 1,
                totalCost: 1,
                reportCount: 1
            }
        },
        {
            $sort: { totalTokens: -1 }
        }
    ]);

    const summary = await AITokenUsage.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(schoolId),
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                totalTokens: { $sum: '$totalTokens' },
                totalCost: { $sum: '$estimatedCost' },
                reportCount: { $sum: 1 }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            period,
            dateRange: { startDate, endDate },
            usage,
            summary: summary[0] || { totalTokens: 0, totalCost: 0, reportCount: 0 }
        }
    });
});

/**
 * @desc    Get report history
 * @route   GET /api/reports/history
 * @access  Private (Teacher/Admin)
 */
export const getReportHistory = asyncHandler(async (req, res) => {
    const {
        studentId,
        teacherId,
        reportType,
        language,
        page = 1,
        limit = 20
    } = req.query;

    const query = {};
    if (studentId) query.student = studentId;
    if (teacherId) query.user = teacherId;
    if (reportType) query.reportType = reportType;
    if (language) {
        const normalized = normalizeLanguageCode(language);
        if (normalized === 'en') query.language = { $in: ['en', 'english'] };
        else if (normalized === 'ar') query.language = { $in: ['ar', 'arabic'] };
        else if (normalized) query.language = normalized;
        else query.language = String(language || '').trim().toLowerCase();
    }

    // Add school filter for non-admin users
    if (req.user.role !== 'admin') {
        query.school = req.user.school;
    }

    const reports = await AITokenUsage.find(query)
        .populate('student', 'firstName lastName email')
        .populate('user', 'firstName lastName email')
        .populate('school', 'name')
        .sort({ timestamp: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

    const total = await AITokenUsage.countDocuments(query);

    res.json({
        success: true,
        data: {
            reports,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/**
 * @desc    Get email delivery status for a report
 * @route   GET /api/reports/email-status/:reportId
 * @access  Private (Teacher/Admin)
 */
export const getEmailStatus = asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    const status = await emailService.getEmailStatus(reportId);

    res.json({
        success: true,
        data: status
    });
});

/**
 * @desc    Retry failed emails for a report
 * @route   POST /api/reports/retry-emails/:reportId
 * @access  Private (Teacher/Admin)
 */
export const retryFailedEmails = asyncHandler(async (req, res) => {
    const { reportId } = req.params;

    const results = await emailService.retryFailedEmails(reportId);

    res.json({
        success: true,
        data: results
    });
});

/**
 * @desc    Test email configuration
 * @route   GET /api/reports/test-email
 * @access  Private (Admin)
 */
export const testEmailConfiguration = asyncHandler(async (req, res) => {
    const result = await emailService.testEmailConfiguration(req.user._id);

    res.json({
        success: result.success,
        message: result.message,
        data: result
    });
});

/**
 * Helper function to calculate date range based on report type
 */
function calculateDateRange(reportType, customRange) {
    const now = new Date();
    let startDate, endDate, period;

    switch (reportType) {
        case 'weekly':
            startDate = startOfWeek(now);
            endDate = endOfWeek(now);
            period = `Week of ${startDate.toLocaleDateString()}`;
            break;
        case 'monthly':
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            break;
        case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = endOfMonth(new Date(now.getFullYear(), quarter * 3 + 2, 1));
            period = `Q${quarter + 1} ${now.getFullYear()}`;
            break;
        case 'yearly':
            startDate = startOfYear(now);
            endDate = endOfYear(now);
            period = `Academic Year ${now.getFullYear()}`;
            break;
        case 'custom':
            if (customRange && customRange.startDate && customRange.endDate) {
                startDate = new Date(customRange.startDate);
                endDate = new Date(customRange.endDate);
                period = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
            } else {
                throw new Error('Custom date range requires startDate and endDate');
            }
            break;
        default:
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    return { startDate, endDate, period };
}

/**
 * @desc    Update a report template
 * @route   PUT /api/reports/templates/:id
 * @access  Private (Teacher/Admin)
 */
export const updateReportTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        name,
        type,
        language,
        customPrompt,
        variables,
        isActive,
        isDefault
    } = req.body;

    const template = await ReportTemplate.findById(id);
    if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // Verify school ownership
    if (template.schoolId.toString() !== req.user.school.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this template' });
    }

    // Update fields
    if (name) template.name = name;
    if (type) template.type = type;
    if (language) {
        template.language = normalizeLanguageCode(language) || String(language || '').trim().toLowerCase();
    }
    if (customPrompt !== undefined) template.customPrompt = customPrompt;
    if (variables) template.variables = variables;
    if (isActive !== undefined) template.isActive = isActive;
    if (isDefault !== undefined) template.isDefault = isDefault;

    await template.save();

    res.json({
        success: true,
        data: template
    });
});

/**
 * @desc    Delete a report template
 * @route   DELETE /api/reports/templates/:id
 * @access  Private (Teacher/Admin)
 */
export const deleteReportTemplate = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const template = await ReportTemplate.findById(id);
    if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
    }

    // Verify school ownership
    if (template.schoolId.toString() !== req.user.school.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this template' });
    }

    await template.deleteOne();

    res.json({
        success: true,
        message: 'Template deleted successfully'
    });
});
