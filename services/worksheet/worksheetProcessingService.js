import Worksheet from '../../models/Worksheet.js';
import WorksheetSubmission from '../../models/WorksheetSubmission.js';
import worksheetOcrService from './worksheetOcrService.js';
import worksheetMarkingService from './worksheetMarkingService.js';
import worksheetStandardsService from './worksheetStandardsService.js';
import worksheetNotificationService from './worksheetNotificationService.js';
import { resolveConfig } from './worksheetConfigService.js';
import logger from '../../utils/logger.js';

/**
 * Calculate total score from question results.
 */
function calculateScore(results) {
    const earned = results.reduce((sum, r) => sum + (r.pointsEarned || 0), 0);
    const total = results.reduce((sum, r) => sum + (r.pointsTotal || 1), 0);
    const percentage = total > 0 ? Math.round((earned / total) * 100) : 0;
    return { earned, total, percentage };
}

/**
 * Process a single submission: OCR → mark → save results.
 */
export async function processSubmission(worksheetId, submissionId) {
    const worksheet = await Worksheet.findById(worksheetId);
    if (!worksheet) throw new Error('Worksheet not found');

    const submission = await WorksheetSubmission.findById(submissionId);
    if (!submission) throw new Error('Submission not found');

    const config = await resolveConfig(worksheet);
    const schoolId = worksheet.school;

    try {
        submission.status = 'processing';
        await submission.save();

        // 1. OCR — extract answers from image
        const extracted = await worksheetOcrService.extractAnswers(
            submission.originalImage,
            worksheet.language,
            worksheet.totalQuestions,
            schoolId
        );

        // 2. Standards detection (if enabled and questions have text)
        if (config.autoStandardsDetection && extracted.questions.some(q => q.questionText)) {
            try {
                const detections = await worksheetStandardsService.detectStandards(
                    extracted.questions,
                    worksheet.subject,
                    schoolId
                );
                // Save suggested mappings on the worksheet (teacher confirms later)
                if (detections.length > 0 && !worksheet.questionMappings?.length) {
                    worksheet.questionMappings = detections.map(d => ({
                        questionNumber: d.questionNumber,
                        standardId: d.standardId,
                        standardConfidence: d.confidence,
                        standardConfirmed: false,
                        pointsTotal: 1,
                        answerType: extracted.questions.find(q => q.questionNumber === d.questionNumber)?.answerType || 'short_answer'
                    }));
                    await worksheet.save();
                }
            } catch (err) {
                logger.warn(`Standards detection failed for worksheet ${worksheetId}:`, err.message);
                // Non-fatal — continue processing
            }
        }

        // 3. Mark answers
        const markingConfig = {
            subject: worksheet.subject,
            gradeLevel: worksheet.gradeLevel,
            language: worksheet.language,
            spellingTolerance: config.spellingTolerance,
            partialCreditEnabled: config.partialCreditEnabled,
            feedbackLevel: config.feedbackLevel
        };

        const results = await worksheetMarkingService.markAnswers(
            extracted.questions,
            worksheet.modelAnswers || [],
            worksheet.markingMode,
            markingConfig,
            schoolId
        );

        // 4. Calculate scores
        const score = calculateScore(results);

        // 5. Attach standard IDs from worksheet question mappings
        const mappings = worksheet.questionMappings || [];
        for (const result of results) {
            const mapping = mappings.find(m => m.questionNumber === result.questionNumber);
            if (mapping?.standardId) {
                result.standardId = mapping.standardId;
            }
        }

        // 6. Save results
        submission.questionResults = results;
        submission.totalScore = score.earned;
        submission.maxScore = score.total;
        submission.percentage = score.percentage;
        submission.status = 'marked';
        await submission.save();

        // 7. Update worksheet counters
        worksheet.markedCount = await WorksheetSubmission.countDocuments({
            worksheet: worksheetId,
            status: { $in: ['marked', 'reviewed', 'published'] }
        });
        if (!worksheet.totalQuestions && extracted.totalDetected) {
            worksheet.totalQuestions = extracted.totalDetected;
        }
        if (!worksheet.maxScore && score.total) {
            worksheet.maxScore = score.total;
        }
        await worksheet.save();

        // 8. Notify teacher
        await worksheetNotificationService.notifyTeacherReady(worksheet);

        return submission;

    } catch (error) {
        submission.status = 'failed';
        submission.processingError = error.message;
        await submission.save();
        logger.error(`Worksheet processing failed for submission ${submissionId}:`, error);
        throw error;
    }
}

/**
 * Process all pending submissions for a worksheet.
 */
export async function processAllPending(worksheetId) {
    const pending = await WorksheetSubmission.find({
        worksheet: worksheetId,
        status: 'pending'
    });

    const results = [];
    for (const sub of pending) {
        try {
            const processed = await processSubmission(worksheetId, sub._id);
            results.push({ submissionId: sub._id, status: 'success' });
        } catch (err) {
            results.push({ submissionId: sub._id, status: 'failed', error: err.message });
        }
    }
    return results;
}

export default { processSubmission, processAllPending };
