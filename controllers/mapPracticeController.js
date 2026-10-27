import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeSettings from '../models/MapPracticeSettings.js';
import MapPracticeImportBatch from '../models/MapPracticeImportBatch.js';
import MapTestRecord from '../models/MapTestRecord.js';
import Student from '../models/Student.js';
import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { hideMapPracticeAttemptAnswerKeys, hideMapPracticeQuestionAnswers } from '../services/mapPracticeReviewService.js';
import { withTransaction } from '../utils/withTransaction.js';

const ACTIVE_ATTEMPT_LIMIT = 20;
const FINISHED_ATTEMPT_LIMIT = 5;
const MAX_BULK_ASSIGNMENTS = 100;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const uniqueObjectIds = (values) => [
  ...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => OBJECT_ID_PATTERN.test(value))
  ),
];

const parseOptionalDueDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const findAssignableStudent = async (req) => {
  const student = await Student.findOne({ _id: req.body?.studentId, school: req.schoolId })
    .select('_id currentClass enrolledClasses')
    .lean();
  if (!student) {
    return { error: { status: 404, message: 'Student not found.' }, student: null };
  }
  if (req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: student._id }))) {
    return {
      error: { status: 403, message: 'You are not authorized to assign practice to this student.' },
      student: null,
    };
  }
  return { error: null, student };
};

const getPracticeFeedbackMode = async (schoolId) => {
  const practiceSettings = await MapPracticeSettings.findOne({ school: schoolId }).select('feedbackMode').lean();
  return practiceSettings?.feedbackMode || 'instant';
};

export const getMapPracticeSettings = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const settings = await MapPracticeSettings.findOne({ school: req.schoolId }).lean();
  res.json({ success: true, data: { settings: settings || {} } });
});

export const saveMapPracticeSettings = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const next = await MapPracticeSettings.findOneAndUpdate(
    { school: req.schoolId },
    {
      $set: {
        feedbackMode: req.body.feedbackMode || 'instant',
        selfPracticeEnabled: Boolean(req.body.selfPracticeEnabled),
        showTimer: Boolean(req.body.showTimer),
        lowAccuracyThreshold: Number(req.body.lowAccuracyThreshold ?? 60),
        minAnswersForAccuracy: Number(req.body.minAnswersForAccuracy ?? 3),
        noActivityDays: Number(req.body.noActivityDays ?? 7),
        partialCreditMultiSelect: Boolean(req.body.partialCreditMultiSelect),
        updatedBy: req.user._id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, data: { settings: next } });
});

export const getStudentMapPracticePlans = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId }).select('_id studentId firstName lastName currentClass').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found.' });
  }

  if (req.user.role === 'student') {
    const ownsStudent = await ensureStudentOwnsPracticeData({ req, studentId: student._id });
    if (!ownsStudent) {
      return res.status(403).json({ success: false, message: 'You can only view your own practice data.' });
    }
  } else if (!['admin', 'teacher'].includes(req.user.role) || !(await ensureTeacherCanAccessStudent({ req, studentId: student._id }))) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }

  const plans = await MapPracticePlan.find({ school: req.schoolId, student: student._id }).sort({ updatedAt: -1 }).lean();
  const planIds = plans.map((plan) => plan._id);
  const [sets, skills, assignments, attempts, mapRecords] = await Promise.all([
    MapPracticeSet.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).sort({ order: 1 }).lean(),
    MapPracticePlanSkill.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).populate('skill', 'code name').lean(),
    MapPracticeAssignment.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).populate('set', 'title questionCount').sort({ dueDate: 1, createdAt: -1 }).lean(),
    MapPracticeAttempt.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } })
      .select('plan set status submittedAt score maxScore reviewStatus savedAt answers.question answers.response answers.isCorrect')
      .populate({ path: 'answers.question', select: 'skill', populate: { path: 'skill', select: 'code name' } })
      .sort({ submittedAt: -1, savedAt: -1 })
      .limit(20)
      .lean(),
    MapTestRecord.find({ school: req.schoolId, student: student._id })
      .select('academicYear importedSubject importedGrade mapEvidence testDate testWindow ritScore percentile growthPercentile domainScores skillResults extractionStatus createdAt')
      .sort({ testDate: -1, createdAt: -1 })
      .limit(30)
      .lean()
  ]);
  const responseAttempts = req.user.role === 'student'
    ? attempts.map(hideMapPracticeAttemptAnswerKeys)
    : attempts;
  res.json({ success: true, data: { student, plans, sets, skills, assignments, attempts: responseAttempts, mapRecords } });
});

export const getMyMapPracticeHome = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id firstName lastName currentClass').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found.' });
  }

  const [settings, plans, assignedSets, activeAttempts] = await Promise.all([
    MapPracticeSettings.findOne({ school: req.schoolId }).lean(),
    MapPracticePlan.find({ school: req.schoolId, student: student._id })
      .select('title status skills updatedAt')
      .populate('skills', 'name')
      .sort({ updatedAt: -1 })
      .lean(),
    MapPracticeAssignment.find({
      school: req.schoolId,
      student: student._id,
      status: { $in: ['assigned', 'active'] },
      hidden: { $ne: true },
    })
      .select('plan set status dueDate feedbackMode')
      .populate('set', 'title questionCount estimatedMinutes order')
      .lean(),
    // Only unfinished attempts need their saved answers for the progress bars.
    MapPracticeAttempt.find({ school: req.schoolId, student: student._id, status: 'in_progress' })
      .select('plan set status savedAt answers.question answers.response')
      .populate('set', 'title questionCount')
      .sort({ savedAt: -1 })
      .limit(ACTIVE_ATTEMPT_LIMIT)
      .lean()
  ]);

  const assignedSetIds = assignedSets.map((item) => item.set?._id).filter(Boolean);
  const attemptSummaryFields = 'plan set status submittedAt score maxScore reviewStatus savedAt';
  const [assignedFinishedAttempts, recentFinishedAttempts] = await Promise.all([
    // A set's row needs its own attempt to show Review/Continue, even when that
    // attempt is older than the recent history window.
    assignedSetIds.length
      ? MapPracticeAttempt.find({
        school: req.schoolId,
        student: student._id,
        set: { $in: assignedSetIds },
        status: { $in: ['submitted', 'reviewed'] }
      })
        .select(attemptSummaryFields)
        .populate('set', 'title')
        .lean()
      : [],
    // The Finished list only ever renders this many rows, so the history stays bounded.
    MapPracticeAttempt.find({
      school: req.schoolId,
      student: student._id,
      status: { $in: ['submitted', 'reviewed'] }
    })
      .select(attemptSummaryFields)
      .populate('set', 'title')
      .sort({ submittedAt: -1 })
      .limit(FINISHED_ATTEMPT_LIMIT)
      .lean()
  ]);

  const finishedAttempts = [...new Map(
    [...assignedFinishedAttempts, ...recentFinishedAttempts]
      .map((item) => [String(item._id), item])
  ).values()].sort((left, right) =>
    new Date(right.submittedAt || 0).getTime() - new Date(left.submittedAt || 0).getTime()
  );

  res.json({
    success: true,
    data: {
      student,
      settings,
      plans,
      assignedSets,
      activeAttempts: activeAttempts.map(hideMapPracticeAttemptAnswerKeys),
      attempts: finishedAttempts
    }
  });
});

export const createMapPracticeAssignment = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const { studentId, setId, planId, dueDate, feedbackMode } = req.body || {};
  if (!studentId || !setId) {
    return res.status(400).json({ success: false, message: 'studentId and setId are required.' });
  }

  const { error, student } = await findAssignableStudent(req);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const set = await MapPracticeSet.findOne({ _id: setId, school: req.schoolId, student: student._id }).lean();
  if (!set) {
    return res.status(404).json({ success: false, message: 'Set not found for this student.' });
  }
  const selectedPlan = await MapPracticePlan.findOne({ _id: planId || set.plan, school: req.schoolId, student: student._id }).select('_id').lean();
  if (!selectedPlan || String(selectedPlan._id) !== String(set.plan)) {
    return res.status(404).json({ success: false, message: 'Practice plan not found for this set and student.' });
  }

  const nextDueDate = parseOptionalDueDate(dueDate);
  if (nextDueDate === undefined) {
    return res.status(400).json({ success: false, message: 'Due date is not a valid date.' });
  }

  const assignment = await MapPracticeAssignment.findOneAndUpdate(
    { school: req.schoolId, student: student._id, set: set._id },
    {
      $set: {
        school: req.schoolId,
        student: student._id,
        plan: selectedPlan._id,
        set: set._id,
        assignedBy: req.user._id,
        dueDate: nextDueDate,
        status: 'assigned',
        feedbackMode: feedbackMode || await getPracticeFeedbackMode(req.schoolId),
        selfPractice: true,
        showTimer: false,
        timeLimitSeconds: null,
        hidden: false
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ success: true, data: { assignment } });
});

export const createMapPracticeAssignmentsBulk = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const setIds = uniqueObjectIds(req.body?.setIds);
  if (!req.body?.studentId || !setIds.length) {
    return res.status(400).json({ success: false, message: 'studentId and at least one setId are required.' });
  }
  if (setIds.length > MAX_BULK_ASSIGNMENTS) {
    return res.status(400).json({ success: false, message: `Choose at most ${MAX_BULK_ASSIGNMENTS} sets at once.` });
  }
  const nextDueDate = parseOptionalDueDate(req.body?.dueDate);
  if (nextDueDate === undefined) {
    return res.status(400).json({ success: false, message: 'Due date is not a valid date.' });
  }

  const { error, student } = await findAssignableStudent(req);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const sets = await MapPracticeSet.find({ _id: { $in: setIds }, school: req.schoolId, student: student._id })
    .select('_id plan')
    .lean();
  if (sets.length !== setIds.length) {
    return res.status(400).json({ success: false, message: 'Some selected sets no longer exist for this student.' });
  }

  const planIds = [...new Set(sets.map((set) => String(set.plan)))];
  const plans = await MapPracticePlan.find({ _id: { $in: planIds }, school: req.schoolId, student: student._id })
    .select('_id')
    .lean();
  if (plans.length !== planIds.length) {
    return res.status(400).json({ success: false, message: 'Some selected sets belong to a plan that no longer exists.' });
  }

  const feedbackMode = await getPracticeFeedbackMode(req.schoolId);
  const assignmentDefaults = {
    assignedBy: req.user._id,
    dueDate: nextDueDate,
    status: 'assigned',
    feedbackMode,
    selfPractice: true,
    showTimer: false,
    timeLimitSeconds: null,
    hidden: false,
  };
  await MapPracticeAssignment.bulkWrite(sets.map((set) => ({
    updateOne: {
      filter: { school: req.schoolId, student: student._id, set: set._id },
      update: { $set: { plan: set.plan, ...assignmentDefaults } },
      upsert: true,
    },
  })));

  const assignments = await MapPracticeAssignment.find({
    school: req.schoolId,
    student: student._id,
    set: { $in: setIds },
  })
    .populate('set', 'title questionCount')
    .lean();

  res.status(201).json({ success: true, data: { assignments, assignedCount: assignments.length } });
});

export const updateMapPracticeAssignmentsBulk = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const action = String(req.body?.action || '');
  if (!['unassign', 'hide', 'unhide', 'hide-finished'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be unassign, hide, unhide, or hide-finished.' });
  }
  if (!req.body?.studentId) {
    return res.status(400).json({ success: false, message: 'studentId is required.' });
  }

  const { error, student } = await findAssignableStudent(req);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const requestedSetIds = uniqueObjectIds(req.body?.setIds);
  if (requestedSetIds.length > MAX_BULK_ASSIGNMENTS) {
    return res.status(400).json({ success: false, message: `Choose at most ${MAX_BULK_ASSIGNMENTS} sets at once.` });
  }

  if (action === 'hide-finished') {
    const assigned = await MapPracticeAssignment.find({
      school: req.schoolId,
      student: student._id,
      status: { $in: ['assigned', 'active'] },
      hidden: { $ne: true },
    })
      .select('set')
      .lean();
    const assignedSetIds = assigned.map((item) => String(item.set));
    if (!assignedSetIds.length) {
      return res.json({ success: true, data: { action, setIds: [], count: 0 } });
    }
    const finishedAttempts = await MapPracticeAttempt.find({
      school: req.schoolId,
      student: student._id,
      set: { $in: assignedSetIds },
      status: { $in: ['submitted', 'reviewed'] },
    })
      .select('set')
      .lean();
    const finishedSetIds = [...new Set(finishedAttempts.map((item) => String(item.set)))];
    const result = finishedSetIds.length
      ? await MapPracticeAssignment.updateMany(
        { school: req.schoolId, student: student._id, set: { $in: finishedSetIds } },
        { $set: { hidden: true } }
      )
      : { modifiedCount: 0 };
    return res.json({ success: true, data: { action, setIds: finishedSetIds, count: result.modifiedCount } });
  }

  if (!requestedSetIds.length) {
    return res.status(400).json({ success: false, message: 'setIds are required for this action.' });
  }

  const ownedSets = await MapPracticeSet.find({
    _id: { $in: requestedSetIds },
    school: req.schoolId,
    student: student._id,
  })
    .select('_id')
    .lean();
  if (!ownedSets.length) {
    return res.status(404).json({ success: false, message: 'None of the selected sets belong to this student.' });
  }
  const ownedSetIds = ownedSets.map((set) => String(set._id));

  let count = 0;
  if (action === 'unassign') {
    const result = await MapPracticeAssignment.deleteMany({
      school: req.schoolId,
      student: student._id,
      set: { $in: ownedSetIds },
    });
    count = result.deletedCount || 0;
  } else {
    const result = await MapPracticeAssignment.updateMany(
      { school: req.schoolId, student: student._id, set: { $in: ownedSetIds } },
      { $set: { hidden: action === 'hide' } }
    );
    count = result.modifiedCount || 0;
  }

  res.json({ success: true, data: { action, setIds: ownedSetIds, count } });
});

export const deleteMapPracticeSet = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const set = await MapPracticeSet.findOne({ _id: req.params.setId, school: req.schoolId }).lean();
  if (!set) return res.status(404).json({ success: false, message: 'Practice set not found.' });
  if (req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: set.student }))) {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this practice set.' });
  }

  const questions = await MapPracticeQuestion.find({ school: req.schoolId, set: set._id })
    .select('skill')
    .lean();
  const skillIds = [...new Set(questions.map((question) => String(question.skill)))];
  const removedSkillIds = [];
  let deletedAttempts = 0;

  await withTransaction(async (session) => {
    const attemptDeletion = await MapPracticeAttempt.deleteMany({ school: req.schoolId, set: set._id }, { session });
    deletedAttempts = attemptDeletion.deletedCount || 0;
    await MapPracticeAssignment.deleteMany({ school: req.schoolId, set: set._id }, { session });
    await MapPracticeQuestion.deleteMany({ school: req.schoolId, set: set._id }, { session });
    await MapPracticeSet.deleteOne({ _id: set._id, school: req.schoolId }, { session });
    await MapPracticeImportBatch.updateMany(
      { school: req.schoolId, 'files.firstSetId': set._id },
      { $set: { 'files.$[file].firstSetId': null } },
      { session, arrayFilters: [{ 'file.firstSetId': set._id }] },
    );

    for (const skillId of skillIds) {
      const skillStillUsed = await MapPracticeQuestion.exists({
        school: req.schoolId,
        plan: set.plan,
        skill: skillId,
      }).session(session);
      if (!skillStillUsed) removedSkillIds.push(skillId);
    }

    if (removedSkillIds.length) {
      await MapPracticePlanSkill.deleteMany({
        school: req.schoolId,
        plan: set.plan,
        student: set.student,
        skill: { $in: removedSkillIds },
      }, { session });
      await MapPracticePlan.updateOne(
        { _id: set.plan, school: req.schoolId },
        { $pull: { skills: { $in: removedSkillIds } } },
        { session },
      );
    }
  });

  res.json({
    success: true,
    data: { setId: set._id, deletedAttempts, removedSkillIds },
  });
});

export const deleteEmptyMapPracticePlan = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const plan = await MapPracticePlan.findOne({
    _id: req.params.planId,
    school: req.schoolId
  }).select('_id student').lean();
  if (!plan) {
    return res.status(404).json({ success: false, message: 'Practice plan not found.' });
  }
  if (req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: plan.student }))) {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this practice plan.' });
  }

  let hasPracticeData = false;
  await withTransaction(async (session) => {
    for (const model of [
      MapPracticeSet,
      MapPracticeQuestion,
      MapPracticePlanSkill,
      MapPracticeAssignment,
      MapPracticeAttempt
    ]) {
      if (await model.exists({
        school: req.schoolId,
        plan: plan._id
      }).session(session)) {
        hasPracticeData = true;
        return;
      }
    }
    await MapPracticePlan.deleteOne({
      _id: plan._id,
      school: req.schoolId,
      student: plan.student
    }, { session });
    await MapPracticeImportBatch.updateMany(
      { school: req.schoolId, 'files.planId': plan._id },
      { $set: { 'files.$[file].planId': null } },
      { session, arrayFilters: [{ 'file.planId': plan._id }] }
    );
  });

  if (hasPracticeData) {
    return res.status(409).json({
      success: false,
      message: 'Only empty practice plans can be deleted.'
    });
  }

  res.json({ success: true, data: { planId: plan._id } });
});

export const getMapPracticeAssignmentQuestions = asyncHandler(async (req, res) => {
  const assignment = await MapPracticeAssignment.findOne({ _id: req.params.assignmentId, school: req.schoolId }).lean();
  if (!assignment) {
    return res.status(404).json({ success: false, message: 'Assignment not found.' });
  }

  if (req.user.role === 'student') {
    const ownsStudent = await ensureStudentOwnsPracticeData({ req, studentId: assignment.student });
    if (!ownsStudent) {
      return res.status(403).json({ success: false, message: 'You can only access your own assignment.' });
    }
  } else if (!['admin', 'teacher'].includes(req.user.role) || !(await ensureTeacherCanAccessStudent({ req, studentId: assignment.student }))) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }

  const questions = await MapPracticeQuestion.find({ school: req.schoolId, set: assignment.set, active: true }).sort({ order: 1 }).lean();
  const responseQuestions = req.user.role === 'student'
    ? questions.map(hideMapPracticeQuestionAnswers)
    : questions;
  res.json({ success: true, data: { assignment, questions: responseQuestions } });
});
