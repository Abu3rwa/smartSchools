import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
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
  res.json({ success: true, data: { plans } });
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

  const student = await Student.findOne({ _id: studentId, school: req.schoolId }).select('_id').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found.' });
  }

  const set = await MapPracticeSet.findOne({ _id: setId, school: req.schoolId, student: student._id }).lean();
  if (!set) {
    return res.status(404).json({ success: false, message: 'Set not found for this student.' });
  }

  const assignment = await MapPracticeAssignment.findOneAndUpdate(
    { school: req.schoolId, student: student._id, set: set._id },
    {
      $set: {
        school: req.schoolId,
        student: student._id,
        plan: planId || set.plan,
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
