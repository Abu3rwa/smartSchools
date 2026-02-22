import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import gradeService from '../services/gradeService.js';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { resolveRequestedAcademicYear } from '../utils/academicYear.js';

/**
 * @desc    Generate AI Report for a student
 * @route   POST /api/reports/generate-ai
 * @access  Private (Teacher/Admin)
 */
export const generateAIReport = asyncHandler(async (req, res) => {
    const { studentId, academicYear, period } = req.body;

    // 1. Fetch Student
    const student = await Student.findById(studentId);
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // 2. Fetch Grades (Context)
    // We'll get all grades for the academic year to give full context
    // You can refine this to specific months if 'period' implies a specific month
    const acYear = resolveRequestedAcademicYear(academicYear, req.school);
    const grades = await gradeService.getStudentGrades(studentId, { academicYear: acYear });

    if (!grades || grades.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No grades found for this student to generate a report.'
        });
    }

    // Determine period if not provided
    const currentPeriod = period || new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    // 3. Generate Report via AI Service (lazy load to ensure env vars are loaded)
    const { default: aiService } = await import('../services/aiservice.js');
    const reportText = await aiService.generateStudentReport(
        student,
        grades,
        currentPeriod,
        req.user
    );

    res.json({
        success: true,
        data: {
            report: reportText,
            studentId,
            generatedAt: new Date()
        }
    });
});

/**
 * @desc    Generate AI Report for a student with custom date range
 * @route   POST /api/reports/generate-ai-range
 * @access  Private (Teacher/Admin)
 */
export const generateAIReportByDateRange = asyncHandler(async (req, res) => {
    const { studentId, startDate, endDate, periodLabel } = req.body;

    // Validate dates
    if (!startDate || !endDate) {
        return res.status(400).json({
            success: false,
            message: 'Start date and end date are required'
        });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid date format'
        });
    }

    if (start > end) {
        return res.status(400).json({
            success: false,
            message: 'Start date must be before end date'
        });
    }

    // 1. Fetch Student
    const student = await Student.findById(studentId);
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // 2. Fetch Grades for the date range
    const grades = await gradeService.getStudentGrades(studentId, {
        date: { $gte: start, $lte: end }
    });

    if (!grades || grades.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No grades found for this student in the selected date range.'
        });
    }

    // 3. Generate Report via AI Service (lazy load to ensure env vars are loaded)
    const { default: aiService } = await import('../services/aiservice.js');
    const reportText = await aiService.generateDateRangeReport(
        student,
        grades,
        start,
        end,
        req.user
    );

    const periodDisplay = periodLabel || aiService.formatDateRange(start, end);

    res.json({
        success: true,
        data: {
            report: reportText,
            studentId,
            startDate: start,
            endDate: end,
            period: periodDisplay,
            generatedAt: new Date()
        }
    });
});

/**
 * @desc    Generate predefined period reports (this week, this month, etc.)
 * @route   POST /api/reports/generate-predefined
 * @access  Private (Teacher/Admin)
 */
export const generatePredefinedReport = asyncHandler(async (req, res) => {
    const { studentId, periodType } = req.body; // periodType: 'this-week', 'this-month', 'last-month', etc.

    const now = new Date();
    let startDate, endDate, periodLabel;

    switch (periodType) {
        case 'this-week':
            startDate = startOfWeek(now, { weekStartsOn: 1 }); // Monday
            endDate = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
            periodLabel = 'This Week';
            break;
        case 'last-week':
            const lastWeek = new Date(now);
            lastWeek.setDate(now.getDate() - 7);
            startDate = startOfWeek(lastWeek, { weekStartsOn: 1 });
            endDate = endOfWeek(lastWeek, { weekStartsOn: 1 });
            periodLabel = 'Last Week';
            break;
        case 'this-month':
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            periodLabel = 'This Month';
            break;
        case 'last-month':
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            startDate = startOfMonth(lastMonth);
            endDate = endOfMonth(lastMonth);
            periodLabel = 'Last Month';
            break;
        default:
            return res.status(400).json({
                success: false,
                message: 'Invalid period type. Use: this-week, last-week, this-month, last-month'
            });
    }

    // Reuse the date range logic
    req.body = {
        studentId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        periodLabel
    };

    return generateAIReportByDateRange(req, res);
});
