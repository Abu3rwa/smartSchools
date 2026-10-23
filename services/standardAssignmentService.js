import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import { PRACTICE_QUESTION_TYPES } from '../constants/practiceQuestionTypes.js';
import standardsPracticeAIService from './standardsPracticeAIService.js';
import {
    generateGrammarQuestionPool,
    hasGrammarLevelingEnabled,
    normalizeGrammarLevels
} from './grammarAssessmentService.js';
import logger from '../utils/logger.js';

export const DEFAULT_PREGENERATED_QUESTION_COUNT = 10;
export const MAX_PREGENERATED_QUESTION_COUNT = 50;

export const resolvePreGeneratedQuestionCount = (value, fallbackValue = null) => {
    const candidates = [value, fallbackValue, DEFAULT_PREGENERATED_QUESTION_COUNT];
    for (const candidate of candidates) {
        const parsed = Number(candidate);
        if (!Number.isFinite(parsed)) continue;
        const intValue = Math.trunc(parsed);
        if (intValue >= 1) {
            return Math.min(intValue, MAX_PREGENERATED_QUESTION_COUNT);
        }
    }
    return DEFAULT_PREGENERATED_QUESTION_COUNT;
};

export const MAX_IMPORTED_QUESTION_COUNT = 100;
const IMPORT_MC_LABELS = ['A', 'B', 'C', 'D'];
const IMPORT_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Validates and normalizes teacher-imported questions (multiple choice / true-false / short answer).
 * @returns {{ questions: object[], error: string|null }}
 */
export const sanitizeImportedQuestions = (input) => {
    if (!Array.isArray(input) || input.length === 0) {
        return { questions: [], error: 'importedQuestions must be a non-empty array' };
    }
    if (input.length > MAX_IMPORTED_QUESTION_COUNT) {
        return {
            questions: [],
            error: `importedQuestions cannot exceed ${MAX_IMPORTED_QUESTION_COUNT} questions`,
        };
    }

    const str = (value, max) => String(value ?? '').trim().slice(0, max);
    const questions = [];
    for (let i = 0; i < input.length; i += 1) {
        const item = input[i] || {};
        const label = `Imported question ${i + 1}`;
        const questionText = str(item.questionText, 2000);
        const questionType = item.questionType;
        const explanation = str(item.explanation, 2000);
        const difficulty = IMPORT_DIFFICULTIES.includes(item.difficulty) ? item.difficulty : 'medium';
        if (!questionText) return { questions: [], error: `${label}: question text is required` };

        if (questionType === 'multiple_choice') {
            const options = IMPORT_MC_LABELS.map((optionLabel, index) => {
                const source = Array.isArray(item.options) ? item.options[index] : null;
                return { label: optionLabel, text: str(source?.text, 500) };
            });
            if (options.some((option) => !option.text)) {
                return { questions: [], error: `${label}: all four options are required` };
            }
            if (new Set(options.map((option) => option.text.toLowerCase())).size < 4) {
                return { questions: [], error: `${label}: options must be distinct` };
            }
            const correctAnswer = str(item.correctAnswer, 1).toUpperCase();
            if (!IMPORT_MC_LABELS.includes(correctAnswer)) {
                return { questions: [], error: `${label}: correct answer must be A, B, C or D` };
            }
            questions.push({ questionText, questionType, options, correctAnswer, explanation, difficulty });
        } else if (questionType === 'true_false') {
            const raw = str(item.correctAnswer, 10).toLowerCase();
            if (raw !== 'true' && raw !== 'false') {
                return { questions: [], error: `${label}: correct answer must be True or False` };
            }
            questions.push({
                questionText,
                questionType,
                options: [
                    { label: 'A', text: 'True' },
                    { label: 'B', text: 'False' },
                ],
                correctAnswer: raw === 'true' ? 'True' : 'False',
                explanation,
                difficulty,
            });
        } else if (questionType === 'short_answer') {
            const correctAnswer = str(item.correctAnswer, 500);
            if (!correctAnswer) {
                return { questions: [], error: `${label}: expected answer is required` };
            }
            const acceptableAnswers = (Array.isArray(item.acceptableAnswers) ? item.acceptableAnswers : [])
                .map((answer) => str(answer, 500))
                .filter(Boolean);
            questions.push({
                questionText,
                questionType,
                options: [],
                correctAnswer,
                explanation,
                difficulty,
                gradingMode: acceptableAnswers.length > 0 ? 'normalized_match' : 'conceptual',
                acceptableAnswers,
            });
        } else {
            return { questions: [], error: `${label}: unsupported question type` };
        }
    }
    return { questions, error: null };
};

export const buildDefaultAssignmentTitle = ({ standard, classDoc, sessionType }) => {
    const standardCode = standard?.code ? `${standard.code} ` : '';
    const standardName = standard?.name || 'Standard';
    const classLabel = classDoc?.name || `Grade ${classDoc?.grade || ''}`;
    const typeLabel = sessionType ? ` (${sessionType})` : '';
    return `${standardCode}${standardName} - ${classLabel}${typeLabel}`.trim();
};

export const buildQuestionPool = async ({
    standard,
    subjectName,
    questionCount,
    practiceConfig,
    generationLanguages = ['en'],
}) => {
    const allowedQuestionTypesRaw =
        Array.isArray(practiceConfig?.allowedQuestionTypes) && practiceConfig.allowedQuestionTypes.length > 0
            ? practiceConfig.allowedQuestionTypes
            : ['multiple_choice', 'true_false'];
    const allowedQuestionTypes = allowedQuestionTypesRaw.filter((type) =>
        PRACTICE_QUESTION_TYPES.includes(type)
    );
    const allowedDifficulties =
        Array.isArray(practiceConfig?.allowedDifficulties) && practiceConfig.allowedDifficulties.length > 0
            ? practiceConfig.allowedDifficulties
            : ['easy', 'medium', 'hard'];

    if (hasGrammarLevelingEnabled(practiceConfig)) {
        return {
            questions: generateGrammarQuestionPool({
                questionCount,
                allowedQuestionTypes,
                allowedDifficulties,
                levels: normalizeGrammarLevels(practiceConfig?.grammarLevels, { fallbackAll: true }),
                seedPrefix: `${standard?._id || standard?.code || 'grammar'}|pool`,
            }),
            failures: []
        };
    }

    const questions = [];
    const failures = [];
    for (let i = 0; i < questionCount; i += 1) {
        const questionType = allowedQuestionTypes.length > 0
            ? allowedQuestionTypes[i % allowedQuestionTypes.length]
            : 'multiple_choice';
        const difficulty = allowedDifficulties[i % allowedDifficulties.length];
        try {
            const previousQuestions = questions.map((question) => question.questionText).slice(-20);
            const generated = await standardsPracticeAIService.generateQuestion({
                standard,
                subjectName,
                difficulty,
                questionType,
                preserveFullText: true,
                requestedLanguages: generationLanguages,
                previousQuestions,
                previousQuestionFingerprints: [],
                recentAttempts: [],
                studentFirstName: '',
                contextHints: {
                    recentTopics: [],
                    recentMistakes: [],
                    confidenceHint: 'Focus on the standard objective.',
                },
                attemptNumber: i + 1,
            });
            questions.push({
                instruction: generated.instruction || '',
                questionText: generated.questionText,
                questionType: generated.questionType,
                options: generated.options || [],
                correctAnswer: generated.correctAnswer,
                explanation: generated.explanation || '',
                difficulty: generated.difficulty || difficulty,
                grammarLevel: generated.grammarLevel || null,
                skill: generated.skill || '',
                subskill: generated.subskill || '',
                gradingMode: generated.gradingMode || 'conceptual',
                acceptableAnswers: generated.acceptableAnswers || [],
                evaluationCriteria: generated.evaluationCriteria || '',
            });
        } catch (error) {
            const reason = error?.message || String(error);
            logger.warn('Question generation failed for pool item; slot left empty', {
                standardId: standard?._id?.toString?.() || null,
                standardCode: standard?.code || null,
                questionType,
                difficulty,
                itemIndex: i,
                error: reason,
            });
            failures.push({ slot: i + 1, questionType, difficulty, reason });
        }
    }

    return { questions, failures };
};

export const resolveQuestionPoolQuestions = async ({ importedQuestions, generate }) => {
    if (Array.isArray(importedQuestions) && importedQuestions.length > 0) {
        return { questions: importedQuestions, failures: [] };
    }
    return generate();
};

/**
 * Shared assignment + pre-generated pool creation pipeline.
 *
 * @param {object} opts
 * @returns {Promise<{ assignment: object, pool: object, generationError: string|null }>} 
 */
export async function createStandardAssignmentWithPool(opts = {}) {
    const {
        schoolId,
        actorUserId,
        standard,
        subjectId,
        subjectName,
        teacherId,
        classId,
        students = [],
        dueDate = null,
        instructions = '',
        title,
        academicYear = null,
        semester = null,
        practiceConfig,
        assessmentConfig,
        preGeneratedQuestionCount,
        aiLanguages = ['en'],
        questionWorkflow,
        generationContext,
        failOnGenerationError = false,
        importedQuestions = null,
        notifyParents = true,
        notifyStudents = true,
    } = opts;

    const resolvedPracticeConfig = practiceConfig || {};
    const hasImportedQuestions = Array.isArray(importedQuestions) && importedQuestions.length > 0;
    const generatedCount = hasImportedQuestions
        ? importedQuestions.length
        : resolvePreGeneratedQuestionCount(
            preGeneratedQuestionCount,
            resolvedPracticeConfig?.questionLimit
        );
    const workflowStatus = String(questionWorkflow?.status || 'draft').toLowerCase();
    const shouldAutoPublishPool =
        questionWorkflow?.requireApprovalBeforeStudentAccess === false
        && workflowStatus === 'published';

    const assignment = await StandardAssignment.create({
        school: schoolId,
        standard: standard._id,
        teacher: teacherId,
        class: classId,
        subject: subjectId,
        title,
        academicYear,
        semester,
        students,
        dueDate,
        instructions,
        notifyParents,
        notifyStudents,
        practiceConfig: resolvedPracticeConfig,
        assessmentConfig,
        questionWorkflow: {
            requireApprovalBeforeStudentAccess: questionWorkflow?.requireApprovalBeforeStudentAccess ?? true,
            preGeneratedQuestionCount: generatedCount,
            aiLanguages,
            status: workflowStatus,
            currentPoolVersion: questionWorkflow?.currentPoolVersion || 1,
            generatedAt: new Date(),
        },
    });

    const standardGenerationContext = generationContext?.objectiveName
        ? {
              ...standard.toObject(),
              name: generationContext.objectiveName,
          }
        : standard;

    let generatedQuestions = [];
    let generationFailures = [];
    let generationError = null;
    try {
        const poolResult = await resolveQuestionPoolQuestions({
            importedQuestions,
            generate: () => buildQuestionPool({
                standard: standardGenerationContext,
                subjectName: subjectName || 'General Studies',
                questionCount: generatedCount,
                practiceConfig: resolvedPracticeConfig,
                generationLanguages: aiLanguages,
            }),
        });
        generatedQuestions = poolResult.questions;
        generationFailures = poolResult.failures;
    } catch (error) {
        generationError = error?.message || 'Question generation failed';
        logger.error('standard_assignment_pool_generation_failed', {
            schoolId,
            assignmentId: assignment._id,
            error: generationError,
        });
    }

    if (generationError && failOnGenerationError) {
        const generationFailure = new Error('Question generation failed. The assignment was saved — retry generation from the pool editor.');
        generationFailure.statusCode = 502;
        generationFailure.code = 'AI_GENERATION_FAILED';
        generationFailure.data = { assignmentId: assignment._id };
        throw generationFailure;
    }

    // An empty pool cannot be released, so the assignment must not claim published either
    const canAutoPublish = shouldAutoPublishPool && generatedQuestions.length > 0;
    if (shouldAutoPublishPool && !canAutoPublish) {
        assignment.questionWorkflow.status = 'draft';
        await assignment.save();
    }

    const generationSummaries = [];
    if (generationError) {
        generationSummaries.push(`Auto-generation warning: ${generationError}`);
    }
    if (generationFailures.length > 0) {
        generationSummaries.push(
            `Auto-generation shortfall: ${generatedQuestions.length} of ${generatedCount} questions stored; slots ${generationFailures.map((failure) => failure.slot).join(', ')} left empty`
        );
    }

    const pool = await StandardQuestionPool.findOneAndUpdate(
        { school: schoolId, assignment: assignment._id },
        {
            $set: {
                standard: assignment.standard,
                class: assignment.class,
                subject: assignment.subject,
                generatedQuestionCount: generatedQuestions.length,
                generationLanguages: aiLanguages,
                currentVersion: 1,
                status: canAutoPublish ? 'published' : 'draft',
                questions: generatedQuestions,
                publishedBy: canAutoPublish ? actorUserId : null,
                publishedAt: canAutoPublish ? new Date() : null,
                isActive: true,
            },
            ...(generationSummaries.length > 0
                ? {
                      $push: {
                          editHistory: {
                              $each: generationSummaries.map((changeSummary) => ({
                                  version: 1,
                                  editedBy: actorUserId,
                                  editedAt: new Date(),
                                  changeSummary
                              })),
                          },
                      },
                  }
                : {}),
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
        assignment,
        pool,
        generationError,
        generationFailures,
    };
}
