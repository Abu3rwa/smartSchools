import { asyncHandler } from '../middleware/errorHandler.js';
import * as reportCardService from '../services/reportCardService.js';

/**
 * POST /api/report-cards/generate
 * Generate a report card for a single student.
 */
export const generateReportCard = asyncHandler(async (req, res) => {
    const { studentId, classId, academicYear, periodType, periodLabel, template } = req.body;

    if (!studentId || !classId || !academicYear || !periodType) {
        return res.status(400).json({
            success: false,
            message: 'studentId, classId, academicYear, and periodType are required'
        });
    }

    const reportCard = await reportCardService.generateReportCard({
        schoolId: req.schoolId,
        studentId,
        classId,
        academicYear,
        periodType,
        periodLabel,
        template,
        generatedBy: req.user._id
    });

    res.status(201).json({ success: true, data: reportCard });
});

/**
 * POST /api/report-cards/generate-bulk
 * Generate report cards for all students in a class.
 */
export const generateBulkReportCards = asyncHandler(async (req, res) => {
    const { classId, academicYear, periodType, periodLabel, template } = req.body;

    if (!classId || !academicYear || !periodType) {
        return res.status(400).json({
            success: false,
            message: 'classId, academicYear, and periodType are required'
        });
    }

    const results = await reportCardService.generateBulkReportCards({
        schoolId: req.schoolId,
        classId,
        academicYear,
        periodType,
        periodLabel,
        template,
        generatedBy: req.user._id
    });

    res.json({ success: true, data: results });
});

/**
 * GET /api/report-cards
 * List report cards with filters.
 * Query: classId, studentId, academicYear, periodType, status
 */
export const getReportCards = asyncHandler(async (req, res) => {
    const reportCards = await reportCardService.getReportCards(req.schoolId, req.query);
    res.json({ success: true, data: reportCards });
});

/**
 * GET /api/report-cards/:id
 * Get a single report card.
 */
export const getReportCard = asyncHandler(async (req, res) => {
    const reportCard = await reportCardService.getReportCardById(req.params.id);
    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    res.json({ success: true, data: reportCard });
});

/**
 * PATCH /api/report-cards/:id/publish
 * Publish a report card.
 */
export const publishReportCard = asyncHandler(async (req, res) => {
    const reportCard = await reportCardService.publishReportCard(req.params.id);
    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    res.json({ success: true, data: reportCard });
});

/**
 * PATCH /api/report-cards/:id/comments
 * Update report card comments.
 */
export const updateComments = asyncHandler(async (req, res) => {
    const { principalComment, classTeacherComment, subjectComments } = req.body;
    const reportCard = await reportCardService.updateReportCardComments(req.params.id, {
        principalComment,
        classTeacherComment,
        subjectComments
    });
    if (!reportCard) {
        return res.status(404).json({ success: false, message: 'Report card not found' });
    }
    res.json({ success: true, data: reportCard });
});
