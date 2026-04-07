import Worksheet from '../../models/Worksheet.js';
import WorksheetSubmission from '../../models/WorksheetSubmission.js';
import WorksheetConfig from '../../models/WorksheetConfig.js';
import { uploadFile } from '../firebaseStorageService.js';
import worksheetOcrService from './worksheetOcrService.js';
import { resolveConfig } from './worksheetConfigService.js';
import logger from '../../utils/logger.js';

/**
 * Create a new worksheet and optionally extract answer key.
 */
export async function createWorksheet(data, teacherUser) {
    const worksheet = new Worksheet({
        school: teacherUser.school,
        teacher: teacherUser._id,
        class: data.classId,
        subject: data.subjectId,
        academicYear: data.academicYear,
        title: data.title,
        description: data.description,
        language: data.language || 'en',
        markingMode: data.markingMode || 'hybrid',
        totalQuestions: data.totalQuestions || null,
        maxScore: data.maxScore || null,
        gradeLevel: data.gradeLevel || null,
        status: 'draft'
    });

    // Upload template image
    if (data.templateImageBuffer) {
        const destPath = `schools/${teacherUser.school}/worksheets/${worksheet._id}/template.${data.templateImageExt || 'jpg'}`;
        worksheet.templateImage = await uploadFile(data.templateImageBuffer, data.templateImageMime || 'image/jpeg', destPath);
    }

    // Upload answer key image
    if (data.answerKeyImageBuffer) {
        const destPath = `schools/${teacherUser.school}/worksheets/${worksheet._id}/answer-key.${data.answerKeyImageExt || 'jpg'}`;
        worksheet.answerKeyImage = await uploadFile(data.answerKeyImageBuffer, data.answerKeyImageMime || 'image/jpeg', destPath);
    }

    // Model answers (typed in directly)
    if (data.modelAnswers?.length) {
        worksheet.modelAnswers = data.modelAnswers;
    }

    await worksheet.save();
    return worksheet;
}

/**
 * Extract answer key from uploaded image using OCR.
 */
export async function extractAnswerKey(worksheetId) {
    const worksheet = await Worksheet.findById(worksheetId);
    if (!worksheet) throw new Error('Worksheet not found');
    if (!worksheet.answerKeyImage) throw new Error('No answer key image uploaded');

    const extracted = await worksheetOcrService.extractAnswerKey(
        worksheet.answerKeyImage,
        worksheet.language,
        worksheet.school
    );

    worksheet.modelAnswers = extracted.answers.map(a => ({
        questionNumber: a.questionNumber,
        answer: a.answer,
        acceptableAlternatives: a.alternatives || [],
        pointsTotal: a.points || 1
    }));

    if (extracted.totalDetected && !worksheet.totalQuestions) {
        worksheet.totalQuestions = extracted.totalDetected;
    }

    await worksheet.save();
    return worksheet;
}

/**
 * Upload a student submission image.
 */
export async function addSubmission(worksheetId, studentId, imageBuffer, imageMime, teacherUser) {
    const worksheet = await Worksheet.findById(worksheetId);
    if (!worksheet) throw new Error('Worksheet not found');

    const destPath = `schools/${teacherUser.school}/worksheets/${worksheetId}/submissions/${studentId}-${Date.now()}.jpg`;
    const imageUrl = await uploadFile(imageBuffer, imageMime || 'image/jpeg', destPath);

    const submission = new WorksheetSubmission({
        school: teacherUser.school,
        worksheet: worksheetId,
        student: studentId,
        originalImage: imageUrl,
        status: 'pending'
    });

    await submission.save();

    // Update worksheet submission count
    worksheet.submissionCount = await WorksheetSubmission.countDocuments({ worksheet: worksheetId });
    await worksheet.save();

    return submission;
}

/**
 * Upload batch submissions (multiple images at once).
 */
export async function addBatchSubmissions(worksheetId, files, teacherUser) {
    const worksheet = await Worksheet.findById(worksheetId);
    if (!worksheet) throw new Error('Worksheet not found');

    const submissions = [];
    for (const file of files) {
        const destPath = `schools/${teacherUser.school}/worksheets/${worksheetId}/submissions/batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const imageUrl = await uploadFile(file.buffer, file.mimetype || 'image/jpeg', destPath);

        const submission = new WorksheetSubmission({
            school: teacherUser.school,
            worksheet: worksheetId,
            student: null, // To be identified by AI or teacher
            originalImage: imageUrl,
            status: 'pending',
            identificationMethod: 'pending'
        });
        await submission.save();
        submissions.push(submission);
    }

    worksheet.submissionCount = await WorksheetSubmission.countDocuments({ worksheet: worksheetId });
    await worksheet.save();

    return submissions;
}

/**
 * Get worksheet by ID with submissions.
 */
export async function getWorksheetById(worksheetId, schoolId) {
    const worksheet = await Worksheet.findOne({ _id: worksheetId, school: schoolId })
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName');

    if (!worksheet) return null;
    return worksheet;
}

/**
 * List worksheets for a teacher or class.
 */
export async function listWorksheets(filters, schoolId) {
    const query = { school: schoolId };
    if (filters.teacher) query.teacher = filters.teacher;
    if (filters.classId) query.class = filters.classId;
    if (filters.subject) query.subject = filters.subject;
    if (filters.status) query.status = filters.status;
    if (filters.academicYear) query.academicYear = filters.academicYear;

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const [worksheets, total] = await Promise.all([
        Worksheet.find(query)
            .populate('class', 'name')
            .populate('subject', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Worksheet.countDocuments(query)
    ]);

    return { worksheets, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Get submissions for a worksheet.
 */
export async function getSubmissions(worksheetId, schoolId) {
    return WorksheetSubmission.find({ worksheet: worksheetId, school: schoolId })
        .populate('student', 'firstName lastName studentId')
        .sort({ createdAt: -1 })
        .lean();
}

/**
 * Apply teacher override to a submission.
 */
export async function applyOverride(submissionId, overrides, teacherId) {
    const submission = await WorksheetSubmission.findById(submissionId);
    if (!submission) throw new Error('Submission not found');

    for (const override of overrides) {
        const qr = submission.questionResults.find(r => r.questionNumber === override.questionNumber);
        if (!qr) continue;

        qr.override = {
            previousPointsEarned: qr.pointsEarned,
            previousIsCorrect: qr.isCorrect,
            overriddenBy: teacherId,
            overriddenAt: new Date(),
            reason: override.reason || ''
        };

        if (override.pointsEarned !== undefined) qr.pointsEarned = override.pointsEarned;
        if (override.isCorrect !== undefined) qr.isCorrect = override.isCorrect;
        if (override.feedback) qr.feedback = override.feedback;
    }

    // Recalculate totals
    const earned = submission.questionResults.reduce((sum, r) => sum + (r.pointsEarned || 0), 0);
    const total = submission.questionResults.reduce((sum, r) => sum + (r.pointsTotal || 1), 0);
    submission.totalScore = earned;
    submission.maxScore = total;
    submission.percentage = total > 0 ? Math.round((earned / total) * 100) : 0;

    submission.status = 'reviewed';
    await submission.save();
    return submission;
}

/**
 * Update worksheet status.
 */
export async function updateWorksheetStatus(worksheetId, status) {
    const worksheet = await Worksheet.findById(worksheetId);
    if (!worksheet) throw new Error('Worksheet not found');
    worksheet.status = status;
    await worksheet.save();
    return worksheet;
}

/**
 * Delete a worksheet (soft delete via status).
 */
export async function archiveWorksheet(worksheetId) {
    return updateWorksheetStatus(worksheetId, 'archived');
}

export default {
    createWorksheet,
    extractAnswerKey,
    addSubmission,
    addBatchSubmissions,
    getWorksheetById,
    listWorksheets,
    getSubmissions,
    applyOverride,
    updateWorksheetStatus,
    archiveWorksheet
};
