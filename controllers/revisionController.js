import { asyncHandler } from '../middleware/errorHandler.js';
import * as revisionPlanService from '../services/revisionPlanService.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';

/**
 * @desc    Generate a revision plan for a student
 * @route   POST /api/revision/generate-plan
 * @access  Private (Student, Teacher, Admin)
 */
export const generatePlan = asyncHandler(async (req, res) => {
  const { studentId, subjectId, examDate, examLabel, syllabusStandardIds } = req.body;

  if (!subjectId || !examDate) {
    return res.status(400).json({
      success: false,
      message: 'subjectId and examDate are required'
    });
  }

  let targetStudentId = studentId;

  // If student is making request, use their own ID
  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    targetStudentId = student._id;
  } else if (req.user.role === 'teacher') {
    // Teacher must provide studentId and verify they teach this student
    if (!targetStudentId) {
      return res.status(400).json({
        success: false,
        message: 'studentId is required when creating plan for a student'
      });
    }

    // Verify teacher teaches this student
    const teacher = await Teacher.findOne({
      school: req.schoolId,
      user: req.user._id
    }).populate('assignedClasses.class');

    const student = await Student.findById(targetStudentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const teachesStudent = teacher?.assignedClasses.some(ac => 
      ac.class._id.toString() === student.currentClass?.toString()
    );

    if (!teachesStudent) {
      return res.status(403).json({
        success: false,
        message: 'You can only create plans for students in your classes'
      });
    }
  }

  try {
    const plan = await revisionPlanService.generatePlan(
      targetStudentId,
      subjectId,
      examDate,
      { examLabel, syllabusStandardIds },
      req.schoolId,
      req.user._id
    );

    res.status(201).json({
      success: true,
      message: 'Revision plan generated successfully',
      data: plan
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate revision plan'
    });
  }
});

/**
 * @desc    Get all plans for current student
 * @route   GET /api/revision/plans
 * @access  Private (Student)
 */
export const myPlans = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id, school: req.schoolId });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const { status } = req.query;
  const plans = await revisionPlanService.getStudentPlans(student._id, req.schoolId, status);

  res.status(200).json({
    success: true,
    data: plans
  });
});

/**
 * @desc    Get all plans for students in teacher's classes
 * @route   GET /api/revision/teacher/plans
 * @access  Private (Teacher, Admin)
 */
export const getTeacherPlans = asyncHandler(async (req, res) => {
  const { classId, subjectId, status } = req.query;

  const plans = await revisionPlanService.getTeacherStudentPlans(
    req.user._id,
    req.schoolId,
    { classId, subjectId, status }
  );

  res.status(200).json({
    success: true,
    data: plans
  });
});

/**
 * @desc    Get plan by id
 * @route   GET /api/revision/plan/:planId
 * @access  Private (Student, Teacher, Admin)
 */
export const getPlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  const plan = await revisionPlanService.getPlan(planId, req.schoolId);

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Revision plan not found'
    });
  }

  // Authorization: student can only see their own plans
  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId });
    if (!student || plan.student._id.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this plan'
      });
    }
  } else if (req.user.role === 'teacher') {
    // Teacher can see plans for students they teach
    const teacher = await Teacher.findOne({
      school: req.schoolId,
      user: req.user._id
    }).populate('assignedClasses.class');

    const teachesStudent = teacher?.assignedClasses.some(ac => 
      ac.class._id.toString() === plan.student.currentClass?.toString()
    );

    if (!teachesStudent) {
      return res.status(403).json({
        success: false,
        message: 'You can only view plans for students in your classes'
      });
    }
  }

  res.status(200).json({
    success: true,
    data: plan
  });
});

/**
 * @desc    Update plan progress
 * @route   PATCH /api/revision/plan/:planId/progress
 * @access  Private (Student)
 */
export const updateProgress = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const { topicIndex, date, standardId, completed } = req.body;

  if (topicIndex === undefined && (!date || !standardId)) {
    return res.status(400).json({
      success: false,
      message: 'Either topicIndex or (date and standardId) is required'
    });
  }

  // Verify student owns this plan
  const plan = await revisionPlanService.getPlan(planId, req.schoolId);
  if (!plan) {
    return res.status(404).json({
      success: false,
      message: 'Revision plan not found'
    });
  }

  const student = await Student.findOne({ user: req.user._id, school: req.schoolId });
  if (!student || plan.student._id.toString() !== student._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this plan'
    });
  }

  const updatedPlan = await revisionPlanService.updateProgress(
    planId,
    { topicIndex, date, standardId, completed },
    req.schoolId
  );

  res.status(200).json({
    success: true,
    message: 'Progress updated successfully',
    data: updatedPlan
  });
});

/**
 * @desc    Get resource recommendations for a concept
 * @route   GET /api/revision/recommendations/:studentId/:conceptId
 * @access  Private (Student, Teacher, Admin)
 */
export const getRecommendations = asyncHandler(async (req, res) => {
  const { studentId, conceptId } = req.params;

  // Authorization check
  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId });
    if (!student || student._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
  } else if (req.user.role === 'teacher') {
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const teacher = await Teacher.findOne({
      school: req.schoolId,
      user: req.user._id
    }).populate('assignedClasses.class');

    const teachesStudent = teacher?.assignedClasses.some(ac => 
      ac.class._id.toString() === student.currentClass?.toString()
    );

    if (!teachesStudent) {
      return res.status(403).json({
        success: false,
        message: 'You can only view recommendations for students in your classes'
      });
    }
  }

  const recommendations = await revisionPlanService.getRecommendations(
    studentId,
    conceptId,
    req.schoolId
  );

  res.status(200).json({
    success: true,
    data: recommendations
  });
});

/**
 * @desc    Compute/update student learning profile
 * @route   POST /api/revision/compute-profile/:studentId
 * @access  Private (Teacher, Admin)
 */
export const computeProfile = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  // Teacher authorization
  if (req.user.role === 'teacher') {
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const teacher = await Teacher.findOne({
      school: req.schoolId,
      user: req.user._id
    }).populate('assignedClasses.class');

    const teachesStudent = teacher?.assignedClasses.some(ac => 
      ac.class._id.toString() === student.currentClass?.toString()
    );

    if (!teachesStudent) {
      return res.status(403).json({
        success: false,
        message: 'You can only compute profiles for students in your classes'
      });
    }
  }

  const profile = await revisionPlanService.computeStudentLearningProfile(
    studentId,
    req.schoolId
  );

  res.status(200).json({
    success: true,
    message: 'Learning profile computed successfully',
    data: profile
  });
});
