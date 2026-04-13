import { asyncHandler } from '../middleware/errorHandler.js';
import worksheetService from '../services/worksheet/worksheetService.js';
import { processSubmission, processAllPending } from '../services/worksheet/worksheetProcessingService.js';
import worksheetGradebookService from '../services/worksheet/worksheetGradebookService.js';
import worksheetNotificationService from '../services/worksheet/worksheetNotificationService.js';
import { getConfig, updateConfig } from '../services/worksheet/worksheetConfigService.js';
import WorksheetSubmission from '../models/WorksheetSubmission.js';
import Worksheet from '../models/Worksheet.js';
import {
    createWorksheetSchema,
    updateWorksheetSchema,
    addSubmissionSchema,
    overrideSchema,
    updateStatusSchema,
    configUpdateSchema,
    gradebookSyncSchema,
    listQuerySchema,
    assignStudentSchema
} from '../schemas/worksheetSchemas.js';
import logger from '../utils/logger.js';

// ─── Worksheet CRUD ───────────────────────────────────────────────────────────

export const createWorksheet = asyncHandler(async (req, res) => {
    const parsed = createWorksheetSchema.parse(req.body);

    const data = { ...parsed };

    // Handle uploaded files
    if (req.files) {
        const templateFile = Array.isArray(req.files.templateImage) ? req.files.templateImage[0] : req.files.templateImage;
        const answerKeyFile = Array.isArray(req.files.answerKeyImage) ? req.files.answerKeyImage[0] : req.files.answerKeyImage;

        if (templateFile) {
            data.templateImageBuffer = templateFile.buffer;
            data.templateImageMime = templateFile.mimetype;
            data.templateImageExt = templateFile.originalname?.split('.').pop() || 'jpg';
        }
        if (answerKeyFile) {
            data.answerKeyImageBuffer = answerKeyFile.buffer;
            data.answerKeyImageMime = answerKeyFile.mimetype;
            data.answerKeyImageExt = answerKeyFile.originalname?.split('.').pop() || 'jpg';
        }
    }

    const worksheet = await worksheetService.createWorksheet(data, req.user);
    res.status(201).json({ success: true, data: worksheet });
});

export const getWorksheet = asyncHandler(async (req, res) => {
    const worksheet = await worksheetService.getWorksheetById(req.params.id, req.user.school);
    if (!worksheet) {
        return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }
    res.json({ success: true, data: worksheet });
});

export const listWorksheets = asyncHandler(async (req, res) => {
    const filters = listQuerySchema.parse(req.query);
    // Scope by teacher for non-admin roles
    if (req.user.role === 'teacher') {
        filters.teacher = req.user._id;
    }
    const result = await worksheetService.listWorksheets(filters, req.user.school);
    res.json({ success: true, ...result });
});

export const updateWorksheet = asyncHandler(async (req, res) => {
    const parsed = updateWorksheetSchema.parse(req.body);
    const worksheet = await Worksheet.findOne({ _id: req.params.id, school: req.user.school });
    if (!worksheet) {
        return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    Object.assign(worksheet, parsed);
    await worksheet.save();
    res.json({ success: true, data: worksheet });
});

export const deleteWorksheet = asyncHandler(async (req, res) => {
    const worksheet = await worksheetService.archiveWorksheet(req.params.id);
    res.json({ success: true, data: worksheet });
});

// ─── Answer Key Extraction ────────────────────────────────────────────────────

export const extractAnswerKey = asyncHandler(async (req, res) => {
    const worksheet = await worksheetService.extractAnswerKey(req.params.id);
    res.json({ success: true, data: { modelAnswers: worksheet.modelAnswers, totalQuestions: worksheet.totalQuestions } });
});

// ─── Submissions ──────────────────────────────────────────────────────────────

export const addSubmission = asyncHandler(async (req, res) => {
    const { studentId } = addSubmissionSchema.parse(req.body);

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Student worksheet image is required' });
    }

    const submission = await worksheetService.addSubmission(
        req.params.id,
        studentId,
        req.file.buffer,
        req.file.mimetype,
        req.user
    );
    res.status(201).json({ success: true, data: submission });
});

export const addBatchSubmissions = asyncHandler(async (req, res) => {
    if (!req.files?.length) {
        return res.status(400).json({ success: false, message: 'At least one worksheet image is required' });
    }

    const submissions = await worksheetService.addBatchSubmissions(
        req.params.id,
        req.files,
        req.user
    );
    res.status(201).json({ success: true, data: submissions, count: submissions.length });
});

export const getSubmissions = asyncHandler(async (req, res) => {
    const submissions = await worksheetService.getSubmissions(req.params.id, req.user.school);
    res.json({ success: true, data: submissions });
});

export const assignStudent = asyncHandler(async (req, res) => {
    const { studentId } = assignStudentSchema.parse(req.body);
    const submission = await WorksheetSubmission.findOne({
        _id: req.params.submissionId,
        school: req.user.school
    });
    if (!submission) {
        return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    submission.student = studentId;
    submission.identificationMethod = 'manual';
    await submission.save();
    res.json({ success: true, data: submission });
});

// ─── Processing ───────────────────────────────────────────────────────────────

export const processOneSubmission = asyncHandler(async (req, res) => {
    const result = await processSubmission(req.params.id, req.params.submissionId);
    res.json({ success: true, data: result });
});

export const processAll = asyncHandler(async (req, res) => {
    const results = await processAllPending(req.params.id);
    res.json({ success: true, data: results });
});

// ─── Teacher Override ─────────────────────────────────────────────────────────

export const applyOverride = asyncHandler(async (req, res) => {
    const { overrides } = overrideSchema.parse(req.body);
    const submission = await worksheetService.applyOverride(req.params.submissionId, overrides, req.user._id);
    res.json({ success: true, data: submission });
});

// ─── Status ───────────────────────────────────────────────────────────────────
export const deleteSubmission = asyncHandler(async (req, res) => {
    const result = await worksheetService.deleteSubmission(req.params.id, req.params.submissionId, req.user.school);
    res.json({ success: true, data: result });
});

export const replaceSubmission = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Replacement worksheet image is required' });
    }
    const submission = await worksheetService.replaceSubmissionImage(
        req.params.id,
        req.params.submissionId,
        req.file.buffer,
        req.file.mimetype,
        req.user.school
    );
    res.json({ success: true, data: submission });
});
export const updateStatus = asyncHandler(async (req, res) => {
    const { status } = updateStatusSchema.parse(req.body);
    const worksheet = await worksheetService.updateWorksheetStatus(req.params.id, status);
    res.json({ success: true, data: worksheet });
});

export const publishResults = asyncHandler(async (req, res) => {
    const worksheet = await Worksheet.findOne({ _id: req.params.id, school: req.user.school });
    if (!worksheet) {
        return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    worksheet.status = 'published';
    await worksheet.save();

    const submissions = await WorksheetSubmission.find({
        worksheet: req.params.id,
        status: { $in: ['marked', 'reviewed'] }
    });

    // Update all submissions to published
    await WorksheetSubmission.updateMany(
        { worksheet: req.params.id, status: { $in: ['marked', 'reviewed'] } },
        { $set: { status: 'published' } }
    );

    // Send notifications
    await worksheetNotificationService.notifyResults(worksheet, submissions);

    res.json({ success: true, data: worksheet, submissionsPublished: submissions.length });
});

// ─── Gradebook Sync ───────────────────────────────────────────────────────────

export const syncToGradebook = asyncHandler(async (req, res) => {
    const { submissionIds } = gradebookSyncSchema.parse(req.body);
    const worksheet = await Worksheet.findOne({ _id: req.params.id, school: req.user.school });
    if (!worksheet) {
        return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    let submissions;
    if (submissionIds?.length) {
        submissions = await WorksheetSubmission.find({
            _id: { $in: submissionIds },
            worksheet: req.params.id
        });
    } else {
        submissions = await WorksheetSubmission.find({
            worksheet: req.params.id,
            status: { $in: ['marked', 'reviewed', 'published'] }
        });
    }

    const result = await worksheetGradebookService.recordToGradebook(worksheet, submissions, req.user._id);
    res.json({ success: true, ...result });
});

export const unlinkGradebook = asyncHandler(async (req, res) => {
    const worksheet = await Worksheet.findOne({ _id: req.params.id, school: req.user.school });
    if (!worksheet) {
        return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    const submissions = await WorksheetSubmission.find({
        worksheet: req.params.id,
        gradeRef: { $ne: null }
    });

    await worksheetGradebookService.unlinkFromGradebook(worksheet, submissions);
    res.json({ success: true, message: 'Gradebook entries unlinked' });
});

// ─── Configuration ────────────────────────────────────────────────────────────

export const getConfiguration = asyncHandler(async (req, res) => {
    const { scopeType, scopeId } = req.query;
    const config = await getConfig(req.user.school, scopeType, scopeId);
    res.json({ success: true, data: config });
});

export const updateConfiguration = asyncHandler(async (req, res) => {
    const parsed = configUpdateSchema.parse(req.body);
    const { scopeType, scopeId, ...updates } = parsed;
    const config = await updateConfig(req.user.school, scopeType, scopeId, updates, req.user._id);
    res.json({ success: true, data: config });
});
