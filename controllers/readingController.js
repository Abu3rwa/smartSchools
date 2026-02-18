import { asyncHandler } from "../middleware/errorHandler.js";
import * as readingAssistantService from "../services/readingAssistantService.js";
import Student from "../models/Student.js";

/**
 * @desc    Upload text and optionally generate simplified versions
 * @route   POST /api/reading/upload-text
 * @access  Private (Teacher, Admin)
 */
export const uploadText = asyncHandler(async (req, res) => {
  const {
    title,
    originalText,
    sourceDocument,
    subjectArea,
    topicTags,
    classId,
    generateVersions,
    targetLevels,
  } = req.body;

  if (!title || !originalText) {
    return res.status(400).json({
      success: false,
      message: "title and originalText are required",
    });
  }

  const text = await readingAssistantService.uploadText(
    req.schoolId,
    { title, originalText, sourceDocument, subjectArea, topicTags, classId },
    {
      generateVersions: generateVersions !== false,
      targetLevels,
      tracking: {
        schoolId: req.schoolId,
        userId: req.user._id,
        entityType: "SimplifiedText",
      },
    }
  );

  res.status(201).json({
    success: true,
    message: "Text uploaded successfully",
    data: text,
  });
});

/**
 * @desc    List all texts (teacher)
 * @route   GET /api/reading/texts
 * @access  Private (Teacher, Admin)
 */
export const getTexts = asyncHandler(async (req, res) => {
  const { subjectArea } = req.query;
  const list = await readingAssistantService.getTexts(req.schoolId, {
    subjectArea,
  });
  res.status(200).json({ success: true, data: list });
});

/**
 * @desc    Get single text by id (teacher)
 * @route   GET /api/reading/texts/:textId
 * @access  Private (Teacher, Admin)
 */
export const getTextById = asyncHandler(async (req, res) => {
  const { textId } = req.params;
  const text = await readingAssistantService.getTextById(textId, req.schoolId);
  res.status(200).json({ success: true, data: text });
});

/**
 * @desc    Get simplified text for current student
 * @route   GET /api/reading/simplify/:textId
 * @access  Private (Student)
 */
export const getSimplifiedForCurrentStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found",
    });
  }

  const result = await readingAssistantService.getSimplifiedForStudent(
    req.params.textId,
    student._id,
    req.schoolId
  );
  res.status(200).json({ success: true, data: result });
});

/**
 * @desc    Get simplified text for a specific student (teacher view)
 * @route   GET /api/reading/simplify/:textId/:studentId
 * @access  Private (Teacher, Admin)
 */
export const getSimplified = asyncHandler(async (req, res) => {
  const { textId, studentId } = req.params;
  const result = await readingAssistantService.getSimplifiedForStudent(
    textId,
    studentId,
    req.schoolId
  );
  res.status(200).json({ success: true, data: result });
});

/**
 * @desc    Assess reading level (diagnostic)
 * @route   POST /api/reading/assess-level
 * @access  Private (Student)
 */
export const assessLevel = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found",
    });
  }

  const profile = await readingAssistantService.assessLevel(
    student._id,
    req.body,
    req.schoolId
  );
  res.status(200).json({
    success: true,
    message: "Level updated",
    data: profile,
  });
});

/**
 * @desc    Get student reading level
 * @route   GET /api/reading/student-level/:studentId
 * @access  Private (Student own, Teacher, Admin)
 */
export const getStudentLevel = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === "student") {
    const student = await Student.findOne({
      user: req.user._id,
      school: req.schoolId,
    });
    if (!student || student._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this student level",
      });
    }
  }

  const profile = await readingAssistantService.getStudentLevel(
    studentId,
    req.schoolId
  );
  res.status(200).json({ success: true, data: profile });
});

/**
 * @desc    Update progress after comprehension quiz
 * @route   PATCH /api/reading/update-progress
 * @access  Private (Student)
 */
export const updateProgress = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found",
    });
  }

  const { textId, correctCount, totalCount, assignmentId } = req.body;
  if (!textId || correctCount === undefined || totalCount === undefined) {
    return res.status(400).json({
      success: false,
      message: "textId, correctCount, and totalCount are required",
    });
  }

  const profile = await readingAssistantService.updateProgress(
    student._id,
    textId,
    Number(correctCount),
    Number(totalCount),
    req.schoolId,
    assignmentId || null
  );
  res.status(200).json({
    success: true,
    message: "Progress updated",
    data: profile,
  });
});

/**
 * @desc    Evaluate student's critical thinking answer and return AI feedback
 * @route   POST /api/reading/evaluate-answer
 * @access  Private (Student)
 */
export const evaluateCriticalThinkingAnswer = asyncHandler(async (req, res) => {
  const { textId, question, studentAnswer, textExcerpt } = req.body;

  if (!question || studentAnswer === undefined) {
    return res.status(400).json({
      success: false,
      message: "question and studentAnswer are required",
    });
  }

  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
  })
    .select("_id")
    .lean();

  const result = await readingAssistantService.evaluateCriticalThinkingAnswer(
    req.schoolId,
    {
      textId,
      question,
      studentAnswer: String(studentAnswer || ""),
      textExcerpt,
      tracking: {
        schoolId: req.schoolId,
        userId: req.user._id,
        studentId: student?._id,
        entityType: "SimplifiedText",
        entityId: textId || undefined,
      },
    }
  );
  res.status(200).json({ success: true, data: result });
});

/**
 * @desc    Create assignment (teacher assigns text to class or students)
 * @route   POST /api/reading/assign
 * @access  Private (Teacher, Admin)
 */
export const createAssignment = asyncHandler(async (req, res) => {
  const { textId, classId, studentIds, dueDate, instructions } = req.body;

  if (!textId) {
    return res.status(400).json({
      success: false,
      message: "textId is required",
    });
  }

  const assignment = await readingAssistantService.createAssignment(
    req.schoolId,
    { textId, classId, studentIds, dueDate, instructions },
    req.user._id
  );
  res.status(201).json({
    success: true,
    message: "Assignment created",
    data: assignment,
  });
});

/**
 * @desc    List assignments for current student
 * @route   GET /api/reading/assignments
 * @access  Private (Student)
 */
export const myAssignments = asyncHandler(async (req, res) => {
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student not found",
    });
  }

  const assignments = await readingAssistantService.getAssignmentsForStudent(
    student._id,
    req.schoolId
  );
  res.status(200).json({ success: true, data: assignments });
});

/**
 * @desc    List assignments (teacher: filter by class/text)
 * @route   GET /api/reading/assignments/teacher
 * @access  Private (Teacher, Admin)
 */
export const getTeacherAssignments = asyncHandler(async (req, res) => {
  const { classId, textId } = req.query;
  const list = await readingAssistantService.getAssignmentsForTeacher(
    req.schoolId,
    { classId, textId }
  );
  res.status(200).json({ success: true, data: list });
});
