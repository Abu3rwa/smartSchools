import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
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

export const buildDefaultAssignmentTitle = ({ standard, classDoc, sessionType }) => {
    const standardCode = standard?.code ? `${standard.code} ` : '';
    const standardName = standard?.name || 'Standard';
    const classLabel = classDoc?.name || `Grade ${classDoc?.grade || ''}`;
    const typeLabel = sessionType ? ` (${sessionType})` : '';
    return `${standardCode}${standardName} - ${classLabel}${typeLabel}`.trim();
};

const buildQuestionPool = async ({
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
        ['multiple_choice', 'true_false'].includes(type)
    );
    const allowedDifficulties =
        Array.isArray(practiceConfig?.allowedDifficulties) && practiceConfig.allowedDifficulties.length > 0
            ? practiceConfig.allowedDifficulties
            : ['easy', 'medium', 'hard'];

    if (hasGrammarLevelingEnabled(practiceConfig)) {
        return generateGrammarQuestionPool({
            questionCount,
            allowedQuestionTypes,
            allowedDifficulties,
            levels: normalizeGrammarLevels(practiceConfig?.grammarLevels, { fallbackAll: true }),
            seedPrefix: `${standard?._id || standard?.code || 'grammar'}|pool`,
        });
    }

    const questions = [];
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
            logger.warn('Question generation failed for pool item; using deterministic fallback', {
                standardId: standard?._id?.toString?.() || null,
                standardCode: standard?.code || null,
                questionType,
                difficulty,
                itemIndex: i,
                error: error?.message || String(error),
            });

            const standardName = standard?.name || 'this standard';
            const fallbackType = questionType === 'true_false' ? 'true_false' : 'multiple_choice';
            questions.push({
                instruction: fallbackType === 'true_false'
                    ? 'Read the statement and choose True or False.'
                    : 'Choose the best answer.',
                questionText: fallbackType === 'true_false'
                    ? `${standardName} is a concept students should study in this assignment.`
                    : `Which option best describes ${standardName}?`,
                questionType: fallbackType,
                options: fallbackType === 'true_false'
                    ? [
                        { label: 'A', text: 'True' },
                        { label: 'B', text: 'False' },
                    ]
                    : [
                        { label: 'A', text: `${standardName} is one of this assignment's focus standards.` },
                        { label: 'B', text: 'It is unrelated to this assignment.' },
                        { label: 'C', text: 'It is only used for attendance tracking.' },
                        { label: 'D', text: 'It is only used for timetable generation.' },
                    ],
                correctAnswer: fallbackType === 'true_false' ? 'True' : 'A',
                explanation: 'Review the standard description before answering.',
                difficulty,
                grammarLevel: null,
                skill: '',
                subskill: '',
                gradingMode: 'exact_match',
                acceptableAnswers: [],
                evaluationCriteria: '',
            });
        }
    }

    return questions;
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
        classDoc,
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
        notifyParents = true,
        notifyStudents = true,
    } = opts;

    const resolvedPracticeConfig = practiceConfig || {};
    const generatedCount = resolvePreGeneratedQuestionCount(
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
    let generationError = null;
    try {
        generatedQuestions = await buildQuestionPool({
            standard: standardGenerationContext,
            subjectName: subjectName || 'General Studies',
            questionCount: generatedCount,
            practiceConfig: resolvedPracticeConfig,
            generationLanguages: aiLanguages,
        });
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

    const pool = await StandardQuestionPool.findOneAndUpdate(
        { school: schoolId, assignment: assignment._id },
        {
            $set: {
                standard: assignment.standard,
                class: assignment.class,
                subject: assignment.subject,
                generatedQuestionCount: generatedCount,
                generationLanguages: aiLanguages,
                currentVersion: 1,
                status: shouldAutoPublishPool ? 'published' : 'draft',
                questions: generatedQuestions,
                publishedBy: shouldAutoPublishPool ? actorUserId : null,
                publishedAt: shouldAutoPublishPool ? new Date() : null,
                isActive: true,
            },
            ...(generationError
                ? {
                      $push: {
                          editHistory: {
                              version: 1,
                              editedBy: actorUserId,
                              editedAt: new Date(),
                              changeSummary: `Auto-generation warning: ${generationError}`,
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
    };
}
