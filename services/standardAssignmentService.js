import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import {
    AI_GENERATED_QUESTION_TYPES,
    isObjectivePracticeQuestionType,
    PRACTICE_MIN_OPTIONS,
    PRACTICE_PAIR_SEPARATOR,
    resolvePracticeQuestionType
} from '../constants/practiceQuestionTypes.js';
import { readTypeDefinition } from './assessment/answerFormat.js';
import { findAssessmentPassage, resolveAssessmentPassage } from './assessment/passageService.js';
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
const IMPORT_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
const IMPORT_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * An imported option list only exists for the option-backed types; every other type carries
 * its own authored definition instead.
 */
const normalizeImportedOptions = (questionType, rawOptions) => {
    if (questionType !== 'multiple_select') return [];
    const source = Array.isArray(rawOptions) ? rawOptions : [];
    return source.slice(0, IMPORT_OPTION_LABELS.length).map((option, index) => {
        const text = option && typeof option === 'object' ? option.text : option;
        return { label: IMPORT_OPTION_LABELS[index], text: String(text ?? '').trim().slice(0, 500) };
    });
};

/**
 * Imported rows arrive as editor-shaped objects (arrays of pairs, items, blanks) while the
 * grading engines read one authored key. readTypeDefinition is the single place that turns
 * either shape into that key, so an imported question is validated exactly like a CSV row.
 */
const buildObjectiveQuestionFields = ({ questionType, prompt, item, salt }) => readTypeDefinition({
    questionType,
    prompt,
    columns: {
        matching_pairs: item.matching_pairs,
        ordering_items: item.ordering_items,
        blank_answers: item.blank_answers,
        numeric_rule: item.numeric_rule,
        correct_answer: item.correct_answer,
    },
    definition: item,
    salt,
});

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
        // A passage is attached to any question type, so reading it stays outside the type branches.
        const passageText = str(item.passageText ?? item.passage_text, 12000);
        const passageFields = passageText ? {
            passageId: str(item.passageId ?? item.passage_id, 180),
            passageTitle: str(item.passageTitle ?? item.passage_title, 220),
            passageText,
        } : {};
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
            questions.push({ questionText, questionType, options, correctAnswer, explanation, difficulty, ...passageFields });
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
                ...passageFields,
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
                ...passageFields,
            });
        } else if (isObjectivePracticeQuestionType(questionType)) {
            const { questionType: resolvedType, fields, correctAnswer, error } = buildObjectiveQuestionFields({
                questionType,
                prompt: questionText,
                item,
                salt: questionText,
            });
            if (error) return { questions: [], error: `${label}: ${error}` };
            const options = normalizeImportedOptions(resolvedType, item.options);
            if (resolvedType === 'multiple_select') {
                if (options.length < PRACTICE_MIN_OPTIONS) {
                    return { questions: [], error: `${label}: at least ${PRACTICE_MIN_OPTIONS} options are required` };
                }
                if (options.some((option) => !option.text)) {
                    return { questions: [], error: `${label}: every option needs text` };
                }
                if (new Set(options.map((option) => option.text.toLowerCase())).size < options.length) {
                    return { questions: [], error: `${label}: options must be distinct` };
                }
                const labels = new Set(options.map((option) => option.label));
                if (correctAnswer.split(PRACTICE_PAIR_SEPARATOR).some((key) => !labels.has(key))) {
                    return { questions: [], error: `${label}: correct answers must match an option label` };
                }
            }
            questions.push({
                questionText,
                questionType: resolvedType,
                options,
                correctAnswer,
                explanation,
                difficulty,
                gradingMode: 'exact_match',
                ...fields,
                ...passageFields,
            });
        } else {
            return { questions: [], error: `${label}: unsupported question type` };
        }
    }
    return { questions, error: null };
};

/**
 * A pool saved by the editor is read back by the grader as authored definition plus key, so a
 * hand-edited question is checked the same way an imported row is before it can be stored.
 */
export const validateQuestionPoolDefinitions = (questions = []) => {
    const errors = [];
    (Array.isArray(questions) ? questions : []).forEach((item, index) => {
        const label = `Question ${index + 1}`;
        const resolved = resolvePracticeQuestionType(item?.questionType);
        if (!isObjectivePracticeQuestionType(resolved)) return;
        const prompt = String(item?.questionText ?? '').trim();
        if (!prompt) {
            errors.push(`${label}: question text is required`);
            return;
        }
        const { questionType, correctAnswer, error } = buildObjectiveQuestionFields({
            questionType: resolved,
            prompt,
            item,
            salt: prompt,
        });
        if (error) {
            errors.push(`${label}: ${error}`);
            return;
        }
        if (questionType === 'multiple_select') {
            const labels = new Set((Array.isArray(item?.options) ? item.options : [])
                .map((option) => String(option?.label ?? '').trim().toUpperCase()));
            const unknown = correctAnswer.split(PRACTICE_PAIR_SEPARATOR).filter((key) => !labels.has(key));
            if (unknown.length) errors.push(`${label}: correct answers ${unknown.join(', ')} do not match an option label`);
        }
    });
    return errors;
};

/**
 * The authored definition is the truth for these types, so both the definition and the key are
 * rewritten from what the teacher entered on every save. A hand-edited row can never keep a key
 * or an id set that no longer matches the question it belongs to.
 */
export const normalizeQuestionPoolDefinitions = (questions = []) => (
    (Array.isArray(questions) ? questions : []).map((item) => {
        const resolved = resolvePracticeQuestionType(item?.questionType);
        if (!isObjectivePracticeQuestionType(resolved)) return item;
        const prompt = String(item?.questionText ?? '').trim();
        const { fields, correctAnswer } = buildObjectiveQuestionFields({
            questionType: resolved,
            prompt,
            item,
            salt: prompt,
        });
        return { ...item, ...fields, correctAnswer };
    })
);

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
        AI_GENERATED_QUESTION_TYPES.includes(type)
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
 * One passage id means one text inside an assignment. A re-import of the same wording reuses
 * the stored passage; a row that redefines the id is reported instead of silently changing
 * what other students already read.
 */
export const attachImportedPassages = async ({
    schoolId,
    assignmentId,
    questions = [],
    createdBy = null,
}) => {
    if (!questions.some((question) => String(question?.passageText ?? '').trim() || String(question?.passageId ?? '').trim())) {
        return { questions, warnings: [] };
    }

    const warnings = [];
    const keyed = questions.map((question, index) => ({
        question,
        passageKey: String(question?.passageId ?? '').trim()
            || (String(question?.passageText ?? '').trim() ? `passage-${index + 1}` : '')
    }));

    // Store every carried text before linking, so a question that only cites the id finds it
    // whatever order the rows arrive in.
    const passageByKey = new Map();
    for (const entry of keyed) {
        const text = String(entry.question?.passageText ?? '').trim();
        if (!text || passageByKey.has(entry.passageKey)) continue;
        const { passage, conflict, error } = await resolveAssessmentPassage({
            schoolId,
            contextType: 'standards',
            assignment: assignmentId,
            passageKey: entry.passageKey,
            title: entry.question?.passageTitle,
            text,
            createdBy,
        });
        if (conflict) warnings.push(`${conflict.problem} ${conflict.fix}`);
        if (error) warnings.push(`Passage "${entry.passageKey}" could not be stored: ${error}`);
        if (passage) passageByKey.set(entry.passageKey, passage);
    }

    const annotated = [];
    for (const entry of keyed) {
        if (!entry.passageKey) {
            annotated.push(entry.question);
            continue;
        }
        let passage = passageByKey.get(entry.passageKey) || null;
        if (!passage && !String(entry.question?.passageText ?? '').trim()) {
            // The id may belong to a passage an earlier import stored for this assignment.
            passage = await findAssessmentPassage({
                schoolId,
                contextType: 'standards',
                assignment: assignmentId,
                passageKey: entry.passageKey,
            });
        }
        if (!passage) {
            if (!String(entry.question?.passageText ?? '').trim()) {
                warnings.push(`Passage "${entry.passageKey}" is cited without text and no stored passage has that id.`);
            }
            annotated.push(entry.question);
            continue;
        }
        annotated.push({
            ...entry.question,
            passageId: entry.passageKey,
            passage: passage._id || null,
            passageTitle: String(passage.title ?? entry.question?.passageTitle ?? ''),
            passageText: String(passage.text ?? entry.question?.passageText ?? ''),
        });
    }
    return { questions: annotated, warnings };
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

    const passages = await attachImportedPassages({
        schoolId,
        assignmentId: assignment._id,
        questions: generatedQuestions,
        createdBy: actorUserId,
    });
    generatedQuestions = passages.questions;
    generationSummaries.push(...passages.warnings.map((warning) => `Passage warning: ${warning}`));

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
