import StandardQuestionPool from '../models/StandardQuestionPool.js';
import StandardAssignment from '../models/StandardAssignment.js';
import Standard from '../models/Standard.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import { computeStandardsFingerprint } from '../utils/standardsFingerprint.js';
import { writeAuditLog } from './assessmentAuditService.js';
import { getSettings } from './assessmentSettingsService.js';
import logger from '../utils/logger.js';

/**
 * Browse the question pool library with filters and pagination.
 */
export async function browsePool({
  schoolId,
  userId,
  subjectId,
  gradeLevel,
  standardIds,
  questionType,
  difficulty,
  language,
  search,
  page = 1,
  limit = 25,
}) {
  const settings = await getSettings(schoolId);
  const query = {
    school: schoolId,
    status: 'published',
    isActive: true,
  };

  if (subjectId) query.subject = subjectId;
  if (gradeLevel) query['standard'] = { $exists: true };
  if (standardIds && standardIds.length > 0) {
    query.standard = { $in: standardIds };
  }

  // Visibility scope enforcement
  if (settings.pool?.visibilityScope === 'teacher') {
    const teacherAssignments = await StandardAssignment.find({
      school: schoolId,
      teacher: userId,
      isActive: true,
    }).select('_id').lean();
    query.assignment = { $in: teacherAssignments.map((a) => a._id) };
  }

  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  // Build the aggregation to filter at the question level
  const pipeline = [
    { $match: query },
    { $unwind: '$questions' },
  ];

  // Question-level filters
  const questionMatch = {};
  if (questionType) questionMatch['questions.questionType'] = questionType;
  if (difficulty) questionMatch['questions.difficulty'] = difficulty;
  if (search) {
    questionMatch.$or = [
      { 'questions.questionText': { $regex: search, $options: 'i' } },
    ];
  }
  if (Object.keys(questionMatch).length > 0) {
    pipeline.push({ $match: questionMatch });
  }

  // Grade-level join
  if (gradeLevel) {
    pipeline.push(
      {
        $lookup: {
          from: 'standards',
          localField: 'standard',
          foreignField: '_id',
          as: '_standardDoc',
        },
      },
      { $unwind: '$_standardDoc' },
      { $match: { '_standardDoc.gradeLevel': parseInt(gradeLevel) } }
    );
  }

  // Count total before pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await StandardQuestionPool.aggregate(countPipeline);
  const total = countResult[0]?.total || 0;

  // Paginate and project
  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: parseInt(limit) },
    {
      $project: {
        _id: '$questions._id',
        poolId: '$_id',
        assignmentId: '$assignment',
        standardId: '$standard',
        subjectId: '$subject',
        questionText: '$questions.questionText',
        questionType: '$questions.questionType',
        difficulty: '$questions.difficulty',
        options: '$questions.options',
        explanation: '$questions.explanation',
        skill: '$questions.skill',
        createdAt: 1,
      },
    }
  );

  const questions = await StandardQuestionPool.aggregate(pipeline);

  return {
    questions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  };
}

/**
 * Get a single pool question by pool ID and question ID.
 */
export async function getPoolQuestion(schoolId, poolId, questionId) {
  const pool = await StandardQuestionPool.findOne({
    _id: poolId,
    school: schoolId,
    isActive: true,
  }).lean();

  if (!pool) return null;

  const question = pool.questions.find(
    (q) => String(q._id) === String(questionId)
  );
  if (!question) return null;

  return {
    ...question,
    poolId: pool._id,
    standardId: pool.standard,
    subjectId: pool.subject,
    assignmentId: pool.assignment,
  };
}

/**
 * Create a new assessment draft from selected pool questions.
 * Validates subject + grade + standards compatibility.
 */
export async function createAssessmentFromPool({
  schoolId,
  userId,
  selectedPoolQuestionIds,
  subjectId,
  gradeLevel,
  classId,
  title,
  dueDate,
  instructions,
  ipAddress,
}) {
  const settings = await getSettings(schoolId);

  // Rate limiting: drafts per teacher per day
  const maxDrafts = settings.pool?.maxDraftsPerTeacherPerDay || 20;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayDraftCount = await StandardAssignment.countDocuments({
    school: schoolId,
    teacher: userId,
    'poolSource.isFromPool': true,
    createdAt: { $gte: todayStart },
  });
  if (todayDraftCount >= maxDrafts) {
    const err = new Error(`Daily pool draft limit reached (${maxDrafts}). Try again tomorrow.`);
    err.statusCode = 429;
    throw err;
  }

  // Validate question count limits
  const minQ = settings.pool?.minQuestionsPerAssessment || 1;
  const maxQ = settings.pool?.maxQuestionsPerAssessment || 50;
  if (selectedPoolQuestionIds.length < minQ) {
    const err = new Error(`Select at least ${minQ} question(s).`);
    err.statusCode = 400;
    throw err;
  }
  if (selectedPoolQuestionIds.length > maxQ) {
    const err = new Error(`Cannot select more than ${maxQ} questions.`);
    err.statusCode = 400;
    throw err;
  }

  // Fetch the pool documents hosting the selected questions
  const pools = await StandardQuestionPool.find({
    school: schoolId,
    'questions._id': { $in: selectedPoolQuestionIds },
    status: 'published',
    isActive: true,
  }).lean();

  if (!pools.length) {
    const err = new Error('No published pool questions found for the given IDs.');
    err.statusCode = 404;
    throw err;
  }

  // Extract selected questions and validate compatibility
  const selectedQuestions = [];
  const standardIdSet = new Set();
  const subjectIdSet = new Set();

  for (const pool of pools) {
    subjectIdSet.add(String(pool.subject));
    standardIdSet.add(String(pool.standard));
    for (const q of pool.questions) {
      if (selectedPoolQuestionIds.map(String).includes(String(q._id))) {
        selectedQuestions.push({
          ...q,
          sourcePoolQuestionId: q._id,
          sourcePoolId: pool._id,
        });
      }
    }
  }

  // Compatibility checks
  if (subjectIdSet.size > 1) {
    const err = new Error('All selected questions must be from the same subject.');
    err.statusCode = 400;
    throw err;
  }
  const poolSubject = [...subjectIdSet][0];
  if (subjectId && String(poolSubject) !== String(subjectId)) {
    const err = new Error('Pool questions do not match the requested subject.');
    err.statusCode = 400;
    throw err;
  }

  // Validate grade level
  const standardDocs = await Standard.find({
    _id: { $in: [...standardIdSet] },
    school: schoolId,
  }).lean();
  const gradeLevels = new Set(standardDocs.map((s) => s.gradeLevel));
  if (gradeLevels.size > 1) {
    const err = new Error('All selected questions must be from the same grade level.');
    err.statusCode = 400;
    throw err;
  }
  if (gradeLevel && !gradeLevels.has(parseInt(gradeLevel))) {
    const err = new Error('Pool questions do not match the requested grade level.');
    err.statusCode = 400;
    throw err;
  }

  // Check duplicates
  if (!settings.pool?.allowDuplicateQuestionsInAssessment) {
    const textSet = new Set();
    for (const q of selectedQuestions) {
      if (textSet.has(q.questionText)) {
        const err = new Error('Duplicate questions are not allowed in a single assessment.');
        err.statusCode = 400;
        throw err;
      }
      textSet.add(q.questionText);
    }
  }

  const fingerprint = computeStandardsFingerprint([...standardIdSet]);

  // Pick the first standard for assignment (if single standard, or use first)
  const primaryStandardId = [...standardIdSet][0];

  // Create the assignment
  const assignment = await StandardAssignment.create({
    school: schoolId,
    standard: primaryStandardId,
    teacher: userId,
    class: classId,
    subject: poolSubject,
    title: title || `Pool Assessment - ${standardDocs[0]?.code || 'Draft'}`,
    dueDate: dueDate || null,
    instructions: instructions || '',
    standardsFingerprint: fingerprint,
    poolSource: {
      isFromPool: true,
      sourcePoolQuestionIds: selectedPoolQuestionIds,
    },
    practiceConfig: {
      sessionType: 'assessment',
      questionLimit: selectedQuestions.length,
    },
    questionWorkflow: {
      status: settings.pool?.requireAdminApprovalForPoolDraft ? 'draft' : 'approved',
      preGeneratedQuestionCount: selectedQuestions.length,
    },
  });

  // Create the question pool with selected questions
  const poolDoc = await StandardQuestionPool.create({
    school: schoolId,
    assignment: assignment._id,
    standard: primaryStandardId,
    class: classId,
    subject: poolSubject,
    generatedQuestionCount: selectedQuestions.length,
    generationLanguages: ['en'],
    status: settings.pool?.requireAdminApprovalForPoolDraft ? 'draft' : 'approved',
    questions: selectedQuestions.map((q) => ({
      instruction: q.instruction || '',
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
      skill: q.skill || '',
      subskill: q.subskill || '',
      gradingMode: q.gradingMode || 'conceptual',
      acceptableAnswers: q.acceptableAnswers || [],
      evaluationCriteria: q.evaluationCriteria || '',
    })),
  });

  // Increment reuse count on source pool questions
  const sourcePoolIds = [...new Set(pools.map((p) => p._id))];
  await StandardQuestionPool.updateMany(
    { _id: { $in: sourcePoolIds } },
    { $inc: { 'questions.$[].reusedCount': 0 } }
  ).catch(() => {});

  await writeAuditLog({
    school: schoolId,
    action: 'pool_draft_created',
    messageType: 'pool',
    performedBy: userId,
    assignment: assignment._id,
    payload: {
      selectedQuestionCount: selectedQuestions.length,
      standardIds: [...standardIdSet],
      fingerprint,
    },
    ipAddress,
  });

  return {
    assignment,
    pool: poolDoc,
    questionCount: selectedQuestions.length,
  };
}

export default { browsePool, getPoolQuestion, createAssessmentFromPool };
