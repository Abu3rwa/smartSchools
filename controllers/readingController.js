import { asyncHandler } from "../middleware/errorHandler.js";
import * as readingAssistantService from "../services/readingAssistantService.js";
import Student from "../models/Student.js";
import SimplifiedText from "../models/SimplifiedText.js";
import ReadingAssignment from "../models/ReadingAssignment.js";
import ReadingCompletion from "../models/ReadingCompletion.js";
import { resolveAcademicYearForRequest } from "../helpers/academicYearScope.js";

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
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    isShared,
  } = req.body;

  if (!title || !originalText) {
    return res.status(400).json({
      success: false,
      message: "title and originalText are required",
    });
  }

  const text = await readingAssistantService.uploadText(
    req.schoolId,
    { title, originalText, sourceDocument, subjectArea, topicTags, classId, isShared },
    {
      generateVersions: generateVersions !== false,
      targetLevels,
      requestedLanguages,
      primaryLanguage,
      secondaryLanguage,
      language,
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
    userId: req.user._id,
    isAdmin: req.user.role === "admin",
  });
  res.status(200).json({ success: true, data: list });
});

export const importReadingCsv = asyncHandler(async (req, res) => {
  const text = await readingAssistantService.createReadingFromCsv(
    req.schoolId,
    req.user._id,
    req.body
  );
  res.status(201).json({ success: true, message: "Reading imported successfully", data: text });
});

export const updateReadingSharing = asyncHandler(async (req, res) => {
  const text = await readingAssistantService.updateTextSharing(
    req.params.textId,
    req.schoolId,
    req.user._id,
    req.user.role === "admin",
    req.body?.isShared
  );
  res.status(200).json({ success: true, data: text });
});

export const updateReading = asyncHandler(async (req, res) => {
  const text = await readingAssistantService.updateReading(
    req.params.textId,
    req.schoolId,
    req.user._id,
    req.user.role === "admin",
    req.body
  );
  res.status(200).json({ success: true, message: "Reading updated successfully", data: text });
});

export const deleteReading = asyncHandler(async (req, res) => {
  const data = await readingAssistantService.archiveReading(
    req.params.textId,
    req.schoolId,
    req.user._id,
    req.user.role === "admin"
  );
  res.status(200).json({ success: true, message: "Reading deleted from the library", data });
});

/**
 * @desc    Get single text by id (teacher)
 * @route   GET /api/reading/texts/:textId
 * @access  Private (Teacher, Admin)
 */
export const getTextById = asyncHandler(async (req, res) => {
  const { textId } = req.params;
  const text = await readingAssistantService.getTextById(
    textId,
    req.schoolId,
    req.user._id,
    req.user.role === "admin"
  );
  res.status(200).json({ success: true, data: text });
});

/**
 * @desc    Get simplified text for current student
 * @route   GET /api/reading/simplify/:textId
 * @access  Private (Student)
 */
export const getSimplifiedForCurrentStudent = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: `Student not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const result = await readingAssistantService.getSimplifiedForStudent(
    req.params.textId,
    student._id,
    req.schoolId,
    effectiveAcademicYear,
    { requireAssignment: true, assignmentId: req.query.assignmentId || null }
  );
  const completion = await ReadingCompletion.findOne({
    school: req.schoolId,
    student: student._id,
    assignment: result.assignmentId,
  }).select("responses completedAt").lean();
  result.savedAnswers = Object.fromEntries(
    (completion?.responses || []).map(({ questionId, answer }) => [questionId, answer])
  );
  result.completed = Boolean(completion?.completedAt);
  const safeQuestions = (result.text.comprehensionQuestions || []).map((question) => {
    const studentQuestion = { ...question };
    delete studentQuestion.correctIndex;
    return studentQuestion;
  });
  result.text.comprehensionQuestions = safeQuestions;
  result.comprehensionQuestions = safeQuestions;
  res.status(200).json({ success: true, data: result });
});

/**
 * @desc    Get simplified text for a specific student (teacher view)
 * @route   GET /api/reading/simplify/:textId/:studentId
 * @access  Private (Teacher, Admin)
 */
export const getSimplified = asyncHandler(async (req, res) => {
  const { textId, studentId } = req.params;
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    _id: studentId,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
  }).select("_id");
  if (!student) {
    return res.status(404).json({
      success: false,
      message: `Student not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const result = await readingAssistantService.getSimplifiedForStudent(
    textId,
    studentId,
    req.schoolId,
    effectiveAcademicYear
  );
  res.status(200).json({ success: true, data: result });
});

/**
 * @desc    Assess reading level (diagnostic)
 * @route   POST /api/reading/assess-level
 * @access  Private (Student)
 */
export const assessLevel = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: `Student not found for academic year ${effectiveAcademicYear}`,
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);

  if (req.user.role === "student") {
    const student = await Student.findOne({
      user: req.user._id,
      school: req.schoolId,
      academicYear: effectiveAcademicYear,
    });
    if (!student || student._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this student level",
      });
    }
  } else {
    const student = await Student.findOne({
      _id: studentId,
      school: req.schoolId,
      academicYear: effectiveAcademicYear,
    }).select("_id");
    if (!student) {
      return res.status(404).json({
        success: false,
        message: `Student not found for academic year ${effectiveAcademicYear}`,
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: `Student not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const { textId, answers, shortAnswers = {}, assignmentId } = req.body;
  if (!textId || !assignmentId || !answers || typeof answers !== "object" || Array.isArray(answers)
    || !shortAnswers || typeof shortAnswers !== "object" || Array.isArray(shortAnswers)) {
    return res.status(400).json({
      success: false,
      message: "textId, assignmentId, and answer selections are required",
    });
  }

  const text = await SimplifiedText.findOne({ _id: textId, school: req.schoolId })
    .select("comprehensionQuestions criticalThinkingQuestions")
    .lean();
  if (!text) return res.status(404).json({ success: false, message: "Reading not found" });
  const assignment = await ReadingAssignment.findOne({
    _id: assignmentId,
    school: req.schoolId,
    text: textId,
    students: student._id,
    isActive: true,
    ...(effectiveAcademicYear ? { academicYear: effectiveAcademicYear } : {}),
  }).select("_id");
  if (!assignment) {
    return res.status(404).json({ success: false, message: "Active reading assignment not found" });
  }

  const questions = (text.comprehensionQuestions || []).filter((question) =>
    ["multiple_choice", "true_false"].includes(question.type || "multiple_choice")
  );
  const expectedIds = new Set(questions.map((question) => String(question._id)));
  const providedIds = Object.keys(answers);
  if (providedIds.length !== expectedIds.size || providedIds.some((id) => !expectedIds.has(id))) {
    return res.status(400).json({ success: false, message: "Answer every objective question before submitting." });
  }
  let correctCount = 0;
  for (const question of questions) {
    const answer = answers[String(question._id)];
    if (!["number", "string"].includes(typeof answer) || String(answer).trim() === "") {
      return res.status(400).json({ success: false, message: "One or more answer selections are invalid." });
    }
    const selectedIndex = Number(answer);
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) {
      return res.status(400).json({ success: false, message: "One or more answer selections are invalid." });
    }
    if (selectedIndex === question.correctIndex) correctCount += 1;
  }
  const shortQuestions = new Set(
    (text.criticalThinkingQuestions || []).map((question) => String(question._id))
  );
  if (Object.keys(shortAnswers).some((id) => !shortQuestions.has(id))
    || Object.values(shortAnswers).some((answer) => typeof answer !== "string" || answer.length > 10000)) {
    return res.status(400).json({ success: false, message: "One or more short answers are invalid." });
  }

  const profile = await readingAssistantService.updateProgress(
    student._id,
    textId,
    correctCount,
    questions.length,
    req.schoolId,
    assignmentId || null,
    effectiveAcademicYear,
    { ...shortAnswers, ...answers }
  );
  res.status(200).json({
    success: true,
    message: "Progress updated",
    data: {
      ...(typeof profile.toObject === "function" ? profile.toObject() : profile),
      score: { correctCount, totalCount: questions.length },
    },
  });
});

/**
 * @desc    Evaluate student's critical thinking answer and return AI feedback
 * @route   POST /api/reading/evaluate-answer
 * @access  Private (Student)
 */
export const evaluateCriticalThinkingAnswer = asyncHandler(async (req, res) => {
  const {
    textId,
    question,
    studentAnswer,
    textExcerpt,
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language
  } = req.body;
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);

  if (!question || studentAnswer === undefined) {
    return res.status(400).json({
      success: false,
      message: "question and studentAnswer are required",
    });
  }

  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
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
      requestedLanguages,
      primaryLanguage,
      secondaryLanguage,
      language,
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const schoolStartMonth = req.school?.settings?.academicYearStartMonth;

  if (!textId) {
    return res.status(400).json({
      success: false,
      message: "textId is required",
    });
  }

  const assignment = await readingAssistantService.createAssignment(
    req.schoolId,
    { textId, classId, studentIds, dueDate, instructions },
    req.user._id,
    effectiveAcademicYear,
    schoolStartMonth,
    req.user.role === "admin"
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const student = await Student.findOne({
    user: req.user._id,
    school: req.schoolId,
    academicYear: effectiveAcademicYear,
  });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: `Student not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const assignments = await readingAssistantService.getAssignmentsForStudent(
    student._id,
    req.schoolId,
    effectiveAcademicYear
  );
  res.status(200).json({ success: true, data: assignments });
});

/**
 * @desc    List assignments (teacher: filter by class/text)
 * @route   GET /api/reading/assignments/teacher
 * @access  Private (Teacher, Admin)
 */
export const getTeacherAssignments = asyncHandler(async (req, res) => {
  const { classId, textId, academicYear } = req.query;
  const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);
  const list = await readingAssistantService.getAssignmentsForTeacher(
    req.schoolId,
    { classId, textId },
    effectiveAcademicYear
  );
  res.status(200).json({ success: true, data: list, academicYear: effectiveAcademicYear });
});
