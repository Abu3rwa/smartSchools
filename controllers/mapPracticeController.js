import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticePlanSkill from '../models/MapPracticePlanSkill.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeSettings from '../models/MapPracticeSettings.js';
import Student from '../models/Student.js';
import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';

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
        feedbackMode: req.body.feedbackMode || 'after_submit',
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
  const [sets, skills, assignments, attempts] = await Promise.all([
    MapPracticeSet.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).sort({ order: 1 }).lean(),
    MapPracticePlanSkill.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).populate('skill', 'code name').lean(),
    MapPracticeAssignment.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).populate('set', 'title questionCount').sort({ dueDate: 1, createdAt: -1 }).lean(),
    MapPracticeAttempt.find({ school: req.schoolId, student: student._id, plan: { $in: planIds } }).select('plan set status submittedAt score maxScore reviewStatus savedAt').sort({ submittedAt: -1, savedAt: -1 }).limit(20).lean()
  ]);
  res.json({ success: true, data: { student, plans, sets, skills, assignments, attempts } });
});

export const getMyMapPracticeHome = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id firstName lastName currentClass').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found.' });
  }

  const settings = await MapPracticeSettings.findOne({ school: req.schoolId }).lean();
  const plans = await MapPracticePlan.find({ school: req.schoolId, student: student._id }).sort({ updatedAt: -1 }).lean();
  const assignedSets = await MapPracticeAssignment.find({ school: req.schoolId, student: student._id, status: { $in: ['assigned', 'active'] } }).populate('set').lean();
  const attempts = await MapPracticeAttempt.find({ school: req.schoolId, student: student._id }).lean();

  res.json({ success: true, data: { student, settings, plans, assignedSets, attempts } });
});

export const createMapPracticeAssignment = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const { studentId, setId, planId, dueDate, feedbackMode } = req.body || {};
  if (!studentId || !setId) {
    return res.status(400).json({ success: false, message: 'studentId and setId are required.' });
  }

  const student = await Student.findOne({ _id: studentId, school: req.schoolId }).select('_id currentClass enrolledClasses').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found.' });
  }
  if (req.user.role === 'teacher' && !(await ensureTeacherCanAccessStudent({ req, studentId: student._id }))) {
    return res.status(403).json({ success: false, message: 'You are not authorized to assign practice to this student.' });
  }

  const set = await MapPracticeSet.findOne({ _id: setId, school: req.schoolId, student: student._id }).lean();
  if (!set) {
    return res.status(404).json({ success: false, message: 'Set not found for this student.' });
  }
  const selectedPlan = await MapPracticePlan.findOne({ _id: planId || set.plan, school: req.schoolId, student: student._id }).select('_id').lean();
  if (!selectedPlan || String(selectedPlan._id) !== String(set.plan)) {
    return res.status(404).json({ success: false, message: 'Practice plan not found for this set and student.' });
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
        dueDate: dueDate ? new Date(dueDate) : null,
        status: 'assigned',
        feedbackMode: feedbackMode || 'after_submit',
        selfPractice: true,
        showTimer: false,
        timeLimitSeconds: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ success: true, data: { assignment } });
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
  res.json({ success: true, data: { assignment, questions } });
});
