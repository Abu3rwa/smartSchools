import mongoose from "mongoose";
import { asyncHandler } from "../middleware/errorHandler.js";
import Student from "../models/Student.js";
import gradeService from "../services/gradeService.js";
import aiService from "../services/aiservice.js";
import emailService from "../services/emailService.js";
import { ReportTemplate } from "../models/ReportTemplate.js";
import { ReportProfile } from "../models/ReportProfile.js";
import { ReportDraft } from "../models/ReportDraft.js";
import { AITokenUsage } from "../models/AITokenUsage.js";
import { EmailReport } from "../models/EmailReport.js";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import {
  normalizeLanguageCode,
  resolveRequestedLanguages,
  toLegacyLanguageValue,
} from "../utils/aiLanguageUtils.js";
import { buildEvidencePack } from "../services/reportEvidence/index.js";

// req.user.school is populated by auth middleware, so compare by _id.
const userSchoolId = (user) => (user.school?._id || user.school)?.toString();

const ADMIN_ROLES = ["admin", "super_admin"];
const userIsAdmin = (user) =>
  ADMIN_ROLES.includes(user.role) ||
  (Array.isArray(user.roles) &&
    user.roles.some((r) => ADMIN_ROLES.includes(r)));

const TEACHER_REMARK_MAX = 1200;
const normalizeTeacherRemark = (value) =>
  String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, TEACHER_REMARK_MAX);

// Only measured numbers survive into the snapshot — no free-form facts, no
// per-subject arrays. The parent email renders exactly these and nothing else.
const SNAPSHOT_METRICS = {
  grades: ["average", "totalMarks", "totalMax"],
  attendance: ["attendanceRate", "totalDays", "absent"],
  spelling: ["accuracy", "totalSessions", "uniqueMissedWords"],
  homework: ["completionRate", "totalAssignments", "overdue"],
  standards: ["overallPct", "masteredCount", "totalStandards"],
  behavior: ["totalIncidents"],
  liveLessons: ["participationRate", "sessionsAttended", "sessionsAvailable"],
};

const compactMetrics = (source, metrics = {}) =>
  Object.fromEntries(
    (SNAPSHOT_METRICS[source] || [])
      .filter((key) => typeof metrics[key] === "number")
      .map((key) => [key, metrics[key]]),
  );

// "no records this period" and "could not read this source" are different
// facts; a teacher must never mistake the second for the first.
const summarizeEvidence = (evidencePack) => ({
  availableSources: evidencePack.availableSources,
  noDataSources: evidencePack.noDataSources,
  failedSources: evidencePack.failedSources,
  totalRecordCount: evidencePack.totalRecordCount,
  sources: Object.fromEntries(
    Object.entries(evidencePack.results).map(([key, val]) => [
      key,
      {
        available: val.available,
        status: val.status,
        recordCount: val.recordCount,
        trend: val.trend,
        metrics: compactMetrics(key, val.metrics),
        // Kept so the teacher can see why a source failed instead of a bare
        // "Could not be read" with no way to tell what happened.
        error: val.status === "failed" ? val.error || "Unknown error" : null,
      },
    ]),
  ),
});

/**
 * @desc    Generate advanced AI report with multi-language and email support
 * @route   POST /api/reports/generate-advanced
 * @access  Private (Teacher/Admin)
 */
export const generateAdvancedReport = asyncHandler(async (req, res) => {
  const {
    studentId,
    classId: submittedClassId,
    reportType = "monthly",
    language = "english",
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    dateRange,
    customPrompt,
    teacherRemark,
    sendEmail = false,
    sources,
    sections: submittedSections,
    profileId,
    subjectId,
    recipients = {
      student: true,
      mother: true,
      father: true,
      guardian: true,
      teacher: false,
    },
  } = req.body;

  // 1. Fetch Student
  const student = await Student.findById(studentId)
    .populate("school")
    .populate("currentClass")
    .populate("user", "email");
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found" });
  }

  // 1a. Authorize: student must belong to the requesting user's school
  const studentSchoolId = (student.school?._id || student.school)?.toString();
  if (studentSchoolId !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized to access this student." });
  }

  // 2. Calculate date range
  const { startDate, endDate, period } = calculateDateRange(
    reportType,
    dateRange,
  );

  // 3. Resolve effective profile — explicit selection beats auto-resolution
  const effectiveClassId = student.currentClass?._id || submittedClassId;
  let effectiveProfile;
  if (profileId) {
    effectiveProfile = await ReportProfile.findById(profileId);
    if (!effectiveProfile || !effectiveProfile.isActive) {
      return res.status(400).json({ success: false, message: "Selected profile not found or inactive." });
    }
    if (effectiveProfile.school.toString() !== userSchoolId(req.user)) {
      return res.status(403).json({ success: false, message: "Not authorized to use this profile." });
    }
  } else {
    effectiveProfile = await ReportProfile.resolveEffective({
      schoolId: student.school._id,
      teacherId: req.user._id,
      classId: effectiveClassId,
    });
  }

  // Sources: undefined means "use profile default", empty array means "intentionally no sources"
  const resolvedSources =
    sources !== undefined
      ? sources
      : effectiveProfile?.sources || undefined;

  // Sections: submitted overrides take precedence over profile sections
  const resolvedSections = submittedSections
    ? submittedSections.filter((s) => s.enabled)
    : effectiveProfile?.sections?.filter((s) => s.enabled) || null;

  // 4. Build evidence pack from all configured sources
  const evidencePack = await buildEvidencePack({
    schoolId: student.school._id,
    studentId,
    startDate,
    endDate,
    classId: effectiveClassId,
    subjectId: subjectId || undefined,
    sources: resolvedSources,
  });

  if (evidencePack.availableSources.length === 0) {
    const detail =
      evidencePack.failedSources.length > 0
        ? ` Could not read: ${evidencePack.failedSources.join(", ")}.`
        : "";
    return res.status(400).json({
      success: false,
      message: `No data found for this student in the specified period across any selected source.${detail}`,
    });
  }

  // 5. Generate AI Report
  const normalizedRequestedLanguages = resolveRequestedLanguages({
    requestedLanguages,
    primaryLanguage,
    secondaryLanguage,
    language,
    max: 2,
  });
  const normalizedLegacyLanguage = toLegacyLanguageValue(
    normalizedRequestedLanguages,
  );

  const reportResult = await aiService.generateAdvancedReport({
    studentData: student,
    grades: evidencePack.results.grades?.available
      ? await gradeService.getStudentGradesByDateRange(studentId, {
          startDate,
          endDate,
        }).then((rows) =>
          subjectId
            ? rows.filter(
                (g) =>
                  String(g.subject?._id || g.subject || "") ===
                  String(subjectId),
              )
            : rows,
        )
      : [],
    period,
    teacher: req.user,
    language: normalizedLegacyLanguage,
    requestedLanguages: normalizedRequestedLanguages,
    reportType,
    dateRange: { startDate, endDate },
    customPrompt,
    evidencePack,
    profile: effectiveProfile,
    sections: resolvedSections,
    userId: req.user._id,
    schoolId: student.school._id,
  });

  // 6. Save as draft (never send immediately — teacher reviews first)
  const draft = await ReportDraft.create({
    school: student.school._id,
    student: studentId,
    teacher: req.user._id,
    status: "draft",
    reportType,
    period,
    dateRange: { startDate, endDate },
    language: reportResult.language || normalizedLegacyLanguage,
    requestedLanguages:
      reportResult.requestedLanguages || normalizedRequestedLanguages,
    content: reportResult.text,
    // Verbatim from the teacher: not part of the AI prompt, never rewritten.
    teacherRemark: normalizeTeacherRemark(teacherRemark),
    evidenceSnapshot: summarizeEvidence(evidencePack),
    profileId: effectiveProfile?._id || null,
    recipients,
    tokenUsage: {
      inputTokens: reportResult.tokenUsage?.inputTokens || 0,
      outputTokens: reportResult.tokenUsage?.outputTokens || 0,
      totalTokens: reportResult.tokenUsage?.totalTokens || 0,
    },
  });

  res.json({
    success: true,
    data: {
      draft: {
        _id: draft._id,
        status: draft.status,
        createdAt: draft.createdAt,
      },
      report: reportResult.text,
      studentId,
      reportType,
      language: reportResult.language || normalizedLegacyLanguage,
      requestedLanguages:
        reportResult.requestedLanguages || normalizedRequestedLanguages,
      period,
      dateRange: { startDate, endDate },
      tokenUsage: reportResult.tokenUsage,
      evidence: summarizeEvidence(evidencePack),
    },
  });
});

/**
 * @desc    Get report templates for a school
 * @route   GET /api/reports/templates
 * @access  Private (Teacher/Admin)
 */
export const getReportTemplates = asyncHandler(async (req, res) => {
  const { type, language } = req.query;
  const schoolId = req.user.school;

  const query = { schoolId, isActive: true };
  if (type) query.type = type;
  if (language) {
    const normalized = normalizeLanguageCode(language);
    if (normalized === "en") query.language = { $in: ["en", "english"] };
    else if (normalized === "ar") query.language = { $in: ["ar", "arabic"] };
    else if (normalized) query.language = normalized;
    else
      query.language = String(language || "")
        .trim()
        .toLowerCase();
  }

  const templates = await ReportTemplate.find(query)
    .populate("createdBy", "firstName lastName")
    .sort({ isDefault: -1, createdAt: -1 });

  res.json({
    success: true,
    data: templates,
  });
});

/**
 * @desc    Create a new report template
 * @route   POST /api/reports/templates
 * @access  Private (Teacher/Admin)
 */
export const createReportTemplate = asyncHandler(async (req, res) => {
  const { name, type, language, customPrompt, variables = [] } = req.body;

  const template = new ReportTemplate({
    schoolId: req.user.school,
    name,
    type,
    language:
      normalizeLanguageCode(language) ||
      String(language || "en")
        .trim()
        .toLowerCase(),
    customPrompt,
    variables,
    createdBy: req.user._id,
  });

  await template.save();

  res.status(201).json({
    success: true,
    data: template,
  });
});

/**
 * @desc    Get token usage analytics for a user
 * @route   GET /api/reports/token-usage/:userId
 * @access  Private (Teacher/Admin)
 */
export const getTokenUsage = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { period = "monthly", year } = req.query;

  // IDOR prevention: only admins can view other users' token usage
  const targetUserId = userId || req.user._id;
  if (
    targetUserId.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  const schoolId = req.schoolId;

  // Calculate date range for the period
  const now = new Date();
  const targetYear = year || now.getFullYear();
  let startDate, endDate;

  switch (period) {
    case "weekly":
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
      break;
    case "monthly":
      startDate = startOfMonth(new Date(targetYear, now.getMonth()));
      endDate = endOfMonth(new Date(targetYear, now.getMonth()));
      break;
    case "yearly":
      startDate = startOfYear(new Date(targetYear, 0));
      endDate = endOfYear(new Date(targetYear, 11));
      break;
    default:
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
  }

  const usage = await AITokenUsage.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(targetUserId),
        school: new mongoose.Types.ObjectId(schoolId),
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          reportType: "$reportType",
          language: "$language",
        },
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$estimatedCost" },
        reportCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.reportType",
        languages: {
          $push: {
            language: "$_id.language",
            totalTokens: "$totalTokens",
            totalCost: "$totalCost",
            reportCount: "$reportCount",
          },
        },
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$totalCost" },
        totalReports: { $sum: "$reportCount" },
      },
    },
    {
      $sort: { totalTokens: -1 },
    },
  ]);

  const summary = await AITokenUsage.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(targetUserId),
        school: new mongoose.Types.ObjectId(schoolId),
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$estimatedCost" },
        reportCount: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      period,
      dateRange: { startDate, endDate },
      usage,
      summary: summary[0] || { totalTokens: 0, totalCost: 0, reportCount: 0 },
    },
  });
});

/**
 * @desc    Get token usage analytics for a school
 * @route   GET /api/reports/token-usage/school/:schoolId
 * @access  Private (Admin)
 */
export const getSchoolTokenUsage = asyncHandler(async (req, res) => {
  // Always use authenticated user's school — ignore URL-provided schoolId
  const schoolId = req.schoolId;
  const { period = "monthly", year } = req.query;

  // Calculate date range
  const now = new Date();
  const targetYear = year || now.getFullYear();
  let startDate, endDate;

  switch (period) {
    case "weekly":
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
      break;
    case "monthly":
      startDate = startOfMonth(new Date(targetYear, now.getMonth()));
      endDate = endOfMonth(new Date(targetYear, now.getMonth()));
      break;
    case "yearly":
      startDate = startOfYear(new Date(targetYear, 0));
      endDate = endOfYear(new Date(targetYear, 11));
      break;
    default:
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
  }

  const usage = await AITokenUsage.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(schoolId),
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    {
      $unwind: {
        path: "$userInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$user",
        userInfo: { $first: "$userInfo" },
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$estimatedCost" },
        reportCount: { $sum: 1 },
      },
    },
    {
      $project: {
        userName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$userInfo.firstName", ""] },
                " ",
                { $ifNull: ["$userInfo.lastName", ""] },
              ],
            },
          },
        },
        email: { $ifNull: ["$userInfo.email", ""] },
        totalTokens: 1,
        totalCost: 1,
        reportCount: 1,
      },
    },
    {
      $sort: { totalTokens: -1 },
    },
  ]);

  const summary = await AITokenUsage.aggregate([
    {
      $match: {
        school: new mongoose.Types.ObjectId(schoolId),
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalTokens: { $sum: "$totalTokens" },
        totalCost: { $sum: "$estimatedCost" },
        reportCount: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      period,
      dateRange: { startDate, endDate },
      usage,
      summary: summary[0] || { totalTokens: 0, totalCost: 0, reportCount: 0 },
    },
  });
});

/**
 * @desc    Get report history
 * @route   GET /api/reports/history
 * @access  Private (Teacher/Admin)
 */
export const getReportHistory = asyncHandler(async (req, res) => {
  const {
    studentId,
    teacherId,
    reportType,
    language,
    page = 1,
    limit = 20,
  } = req.query;

  const query = {};
  if (studentId) query.student = studentId;
  if (teacherId) query.user = teacherId;
  if (reportType) query.reportType = reportType;
  if (language) {
    const normalized = normalizeLanguageCode(language);
    if (normalized === "en") query.language = { $in: ["en", "english"] };
    else if (normalized === "ar") query.language = { $in: ["ar", "arabic"] };
    else if (normalized) query.language = normalized;
    else
      query.language = String(language || "")
        .trim()
        .toLowerCase();
  }

  // Always scope to the requesting user's school
  query.school = req.user.school?._id || req.user.school;

  const reports = await AITokenUsage.find(query)
    .populate("student", "firstName lastName email")
    .populate("user", "firstName lastName email")
    .populate("school", "name")
    .sort({ timestamp: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await AITokenUsage.countDocuments(query);

  res.json({
    success: true,
    data: {
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Get email delivery status for a report
 * @route   GET /api/reports/email-status/:reportId
 * @access  Private (Teacher/Admin)
 */
export const getEmailStatus = asyncHandler(async (req, res) => {
  const { reportId } = req.params;

  // Verify the report belongs to the requesting user's school
  const draft = await ReportDraft.findById(reportId).select("school teacher");
  if (!draft) {
    return res.status(404).json({ success: false, message: "Report not found." });
  }
  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  const status = await emailService.getEmailStatus(reportId);

  res.json({
    success: true,
    data: status,
  });
});

/**
 * @desc    Retry failed emails for a report
 * @route   POST /api/reports/retry-emails/:reportId
 * @access  Private (Teacher/Admin)
 */
export const retryFailedEmails = asyncHandler(async (req, res) => {
  const { reportId } = req.params;

  // Verify the report belongs to the requesting user's school
  const draft = await ReportDraft.findById(reportId).select("school teacher");
  if (!draft) {
    return res.status(404).json({ success: false, message: "Report not found." });
  }
  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }
  if (
    draft.teacher.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  const results = await emailService.retryFailedEmails(reportId);

  res.json({
    success: true,
    data: results,
  });
});

/**
 * @desc    Test email configuration
 * @route   GET /api/reports/test-email
 * @access  Private (Admin)
 */
export const testEmailConfiguration = asyncHandler(async (req, res) => {
  const result = await emailService.testEmailConfiguration(req.user._id);

  res.json({
    success: result.success,
    message: result.message,
    data: result,
  });
});

/**
 * Helper function to calculate date range based on report type
 */
function calculateDateRange(reportType, customRange) {
  const now = new Date();
  let startDate, endDate, period;

  switch (reportType) {
    case "weekly":
      startDate = startOfWeek(now);
      endDate = endOfWeek(now);
      period = `Week of ${startDate.toLocaleDateString()}`;
      break;
    case "monthly":
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      period = now.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      break;
    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = endOfMonth(new Date(now.getFullYear(), quarter * 3 + 2, 1));
      period = `Q${quarter + 1} ${now.getFullYear()}`;
      break;
    case "yearly":
      startDate = startOfYear(now);
      endDate = endOfYear(now);
      period = `Academic Year ${now.getFullYear()}`;
      break;
    case "custom":
      if (customRange && customRange.startDate && customRange.endDate) {
        startDate = new Date(customRange.startDate);
        endDate = new Date(customRange.endDate);
        period = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
      } else {
        throw new Error("Custom date range requires startDate and endDate");
      }
      break;
    default:
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
      period = now.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
  }

  return { startDate, endDate, period };
}

/**
 * @desc    Update a report template
 * @route   PUT /api/reports/templates/:id
 * @access  Private (Teacher/Admin)
 */
export const updateReportTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, type, language, customPrompt, variables, isActive, isDefault } =
    req.body;

  const template = await ReportTemplate.findById(id);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }

  // Verify school ownership
  if (template.schoolId.toString() !== req.user.school.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to update this template",
    });
  }

  // Update fields
  if (name) template.name = name;
  if (type) template.type = type;
  if (language) {
    template.language =
      normalizeLanguageCode(language) ||
      String(language || "")
        .trim()
        .toLowerCase();
  }
  if (customPrompt !== undefined) template.customPrompt = customPrompt;
  if (variables) template.variables = variables;
  if (isActive !== undefined) template.isActive = isActive;
  if (isDefault !== undefined) template.isDefault = isDefault;

  await template.save();

  res.json({
    success: true,
    data: template,
  });
});

/**
 * @desc    Delete a report template
 * @route   DELETE /api/reports/templates/:id
 * @access  Private (Teacher/Admin)
 */
export const deleteReportTemplate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const template = await ReportTemplate.findById(id);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }

  // Verify school ownership
  if (template.schoolId.toString() !== req.user.school.toString()) {
    return res.status(403).json({
      success: false,
      message: "Not authorized to delete this template",
    });
  }

  await template.deleteOne();

  res.json({
    success: true,
    message: "Template deleted successfully",
  });
});

// ─── Report Profile CRUD ────────────────────────────────────────────

/**
 * @desc    Get report profiles for the current teacher/school
 * @route   GET /api/reports/profiles
 * @access  Private (Teacher/Admin)
 */
export const getReportProfiles = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  const schoolId = req.user.school;
  const teacherId = req.user._id;

  const query = { school: schoolId, isActive: true };

  if (classId) {
    query.$or = [
      { scope: "class", classId },
      { scope: "teacher", teacher: teacherId },
      { scope: "school" },
    ];
  } else {
    query.$or = [{ scope: "teacher", teacher: teacherId }, { scope: "school" }];
  }

  const profiles = await ReportProfile.find(query)
    .populate("createdBy", "firstName lastName")
    .populate("classId", "name grade section")
    .sort({ isDefault: -1, createdAt: -1 });

  res.json({ success: true, data: profiles });
});

/**
 * @desc    Resolve the effective profile for a teacher + class
 * @route   GET /api/reports/profiles/effective
 * @access  Private (Teacher/Admin)
 */
export const getEffectiveProfile = asyncHandler(async (req, res) => {
  const { classId } = req.query;
  const schoolId = req.user.school;
  const teacherId = req.user._id;

  const profile = await ReportProfile.resolveEffective({
    schoolId,
    teacherId,
    classId,
  });

  res.json({
    success: true,
    data: profile,
    meta: { resolved: !!profile },
  });
});

/**
 * @desc    Create a report profile
 * @route   POST /api/reports/profiles
 * @access  Private (Teacher/Admin)
 */
export const createReportProfile = asyncHandler(async (req, res) => {
  const {
    name,
    scope = "teacher",
    description,
    sources,
    sections,
    templatePrompt,
    defaultLanguage,
    secondaryLanguage,
    classId,
    isDefault,
  } = req.body;

  if (!name || !name.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Profile name is required." });
  }

  const validScopes = ["school", "teacher", "class"];
  if (!validScopes.includes(scope)) {
    return res.status(400).json({
      success: false,
      message: `Scope must be one of: ${validScopes.join(", ")}`,
    });
  }

  if (scope === "class" && !classId) {
    return res.status(400).json({
      success: false,
      message: "classId is required for class-scoped profiles.",
    });
  }

  if (scope === "school" && !userIsAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Only admins can create school-scoped profiles.",
    });
  }

  const profile = new ReportProfile({
    school: req.user.school,
    scope,
    teacher: scope === "teacher" ? req.user._id : null,
    classId: scope === "class" ? classId : null,
    name: name.trim(),
    description: description?.trim() || "",
    sources: sources || ["grades", "spelling", "attendance", "homework"],
    sections: sections || undefined,
    templatePrompt: templatePrompt?.trim() || "",
    defaultLanguage: defaultLanguage || "en",
    secondaryLanguage: secondaryLanguage || null,
    isDefault: isDefault || false,
    createdBy: req.user._id,
  });

  await profile.save();

  res.status(201).json({ success: true, data: profile });
});

/**
 * @desc    Update a report profile
 * @route   PUT /api/reports/profiles/:id
 * @access  Private (Teacher/Admin)
 */
export const updateReportProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profile = await ReportProfile.findById(id);

  if (!profile) {
    return res
      .status(404)
      .json({ success: false, message: "Profile not found." });
  }

  if (profile.school.toString() !== (req.user.school?._id || req.user.school)?.toString()) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    profile.createdBy.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  const allowed = [
    "name",
    "description",
    "sources",
    "sections",
    "templatePrompt",
    "defaultLanguage",
    "secondaryLanguage",
    "isActive",
    "isDefault",
  ];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      profile[field] = req.body[field];
    }
  }

  await profile.save();

  res.json({ success: true, data: profile });
});

/**
 * @desc    Delete a report profile
 * @route   DELETE /api/reports/profiles/:id
 * @access  Private (Teacher/Admin)
 */
export const deleteReportProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const profile = await ReportProfile.findById(id);

  if (!profile) {
    return res
      .status(404)
      .json({ success: false, message: "Profile not found." });
  }

  if (profile.school.toString() !== (req.user.school?._id || req.user.school)?.toString()) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    profile.createdBy.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  await profile.deleteOne();

  res.json({ success: true, message: "Profile deleted." });
});

// ─── Report Draft Workflow ──────────────────────────────────────────

/**
 * @desc    List drafts for the current teacher
 * @route   GET /api/reports/drafts
 * @access  Private (Teacher/Admin)
 */
export const getReportDrafts = asyncHandler(async (req, res) => {
  const { status, studentId, page = 1, limit = 20 } = req.query;
  const schoolId = req.user.school;
  const teacherId = req.user._id;

  const query = { school: schoolId };

  if (!userIsAdmin(req.user)) {
    query.teacher = teacherId;
  }
  if (status) query.status = status;
  if (studentId) query.student = studentId;

  const drafts = await ReportDraft.find(query)
    .populate("student", "firstName lastName studentId")
    .populate("teacher", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await ReportDraft.countDocuments(query);

  res.json({
    success: true,
    data: {
      drafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Get a single draft by ID
 * @route   GET /api/reports/drafts/:id
 * @access  Private (Teacher/Admin)
 */
export const getReportDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const draft = await ReportDraft.findById(id)
    .populate("student", "firstName lastName studentId email")
    .populate("teacher", "firstName lastName email");

  if (!draft) {
    return res
      .status(404)
      .json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    draft.teacher._id.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  res.json({ success: true, data: draft });
});

/**
 * @desc    Update draft content (teacher edits the generated report)
 * @route   PATCH /api/reports/drafts/:id
 * @access  Private (Teacher/Admin)
 */
export const updateReportDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content, recipients, teacherRemark } = req.body;

  const draft = await ReportDraft.findById(id);
  if (!draft) {
    return res
      .status(404)
      .json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    draft.teacher.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (draft.status !== "draft") {
    return res.status(400).json({
      success: false,
      message: `Cannot edit a ${draft.status} draft. Only drafts in "draft" status can be edited.`,
    });
  }

  if (content !== undefined) draft.content = content;
  if (recipients !== undefined) draft.recipients = recipients;
  if (teacherRemark !== undefined) draft.teacherRemark = normalizeTeacherRemark(teacherRemark);

  await draft.save();

  res.json({ success: true, data: draft });
});

/**
 * @desc    Approve a draft (freezes content and recipients for sending)
 * @route   POST /api/reports/drafts/:id/approve
 * @access  Private (Teacher/Admin)
 */
export const approveReportDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { recipients } = req.body;

  const draft = await ReportDraft.findById(id);
  if (!draft) {
    return res
      .status(404)
      .json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    draft.teacher.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (draft.status !== "draft") {
    return res.status(400).json({
      success: false,
      message: `Cannot approve a ${draft.status} draft.`,
    });
  }

  draft.status = "approved";
  draft.approvedAt = new Date();
  draft.approvedBy = req.user._id;
  if (recipients !== undefined) draft.recipients = recipients;

  await draft.save();

  res.json({ success: true, data: draft });
});

/**
 * Load a draft with everything the delivery path needs: no projection on
 * student (the recipient list reads parentInfo) plus the school and class
 * names the email template renders.
 */
const loadSendableDraft = (id) =>
  ReportDraft.findById(id)
    .populate({
      path: "student",
      populate: [
        { path: "school", select: "name" },
        { path: "currentClass", select: "name grade section" },
      ],
    })
    .populate("teacher", "firstName lastName email");

/**
 * @desc    Render the exact subject + body a send would deliver, without sending
 * @route   GET /api/reports/drafts/:id/email-preview
 * @access  Private (Teacher/Admin)
 */
export const getDraftEmailPreview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const draft = await loadSendableDraft(id);
  if (!draft) {
    return res.status(404).json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (!draft.student) {
    return res
      .status(410)
      .json({ success: false, message: "The student on this draft no longer exists." });
  }

  const schoolName = await emailService.resolveSchoolName(draft.student?.school);
  const rendered = emailService.renderReportEmail({
    reportContent: draft.content,
    language: draft.language,
    requestedLanguages: draft.requestedLanguages,
    studentData: draft.student,
    schoolName,
    teacher: draft.teacher,
    teacherRemark: draft.teacherRemark,
    period: draft.period,
    dateRange: draft.dateRange,
    evidenceSnapshot: draft.evidenceSnapshot,
  });

  const recipients = emailService.prepareRecipientList({
    studentData: draft.student,
    recipients: draft.recipients,
    teacher: draft.teacher,
  });

  res.json({
    success: true,
    data: {
      subject: rendered.subject,
      html: rendered.html,
      language: rendered.language,
      requestedLanguages: rendered.requestedLanguages,
      recipients: recipients.map((r) => ({ email: r.email, name: r.name, type: r.type })),
      status: draft.status,
    },
  });
});

/**
 * @desc    Send an approved draft via email (does NOT regenerate)
 * @route   POST /api/reports/drafts/:id/send
 * @access  Private (Teacher/Admin)
 */
export const sendReportDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const draft = await loadSendableDraft(id);

  if (!draft) {
    return res
      .status(404)
      .json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    draft.teacher._id.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  // "failed" is re-sendable: the content was already approved and the usual
  // cause (Gmail not connected, provider hiccup) is fixable in place.
  if (!["approved", "failed"].includes(draft.status)) {
    return res.status(400).json({
      success: false,
      message:
        draft.status === "sending"
          ? "This draft is already being sent."
          : `Cannot send a ${draft.status} draft. It must be approved first.`,
    });
  }

  if (!draft.student) {
    return res
      .status(410)
      .json({ success: false, message: "The student on this draft no longer exists." });
  }

  // Claim the send atomically so a double-click or a replayed request cannot
  // deliver a second copy to the same family.
  const claimed = await ReportDraft.findOneAndUpdate(
    { _id: id, status: { $in: ["approved", "failed"] } },
    { $set: { status: "sending", sendAttempts: (draft.sendAttempts || 0) + 1 } },
    { new: true }
  );

  if (!claimed) {
    return res.status(409).json({
      success: false,
      message: "This draft is already being sent or has already been sent.",
    });
  }

  draft.status = "sending";
  draft.sendAttempts = claimed.sendAttempts;

  let emailResults;
  try {
    emailResults = await emailService.sendReportEmails({
      reportId: draft._id,
      studentData: draft.student,
      reportContent: draft.content,
      language: draft.language,
      requestedLanguages: draft.requestedLanguages,
      recipients: draft.recipients,
      teacher: draft.teacher,
      teacherRemark: draft.teacherRemark,
      period: draft.period,
      dateRange: draft.dateRange,
      evidenceSnapshot: draft.evidenceSnapshot,
    });
  } catch (sendErr) {
    // Never leave a draft stranded in "sending" — the teacher must be able to retry.
    emailResults = { success: false, message: sendErr.message };
  }

  if (!emailResults.success) {
    draft.status = "failed";
    draft.sendError = emailResults.message || emailResults.error || "Send failed";
    await draft.save();
    return res.status(502).json({
      success: false,
      message: emailResults.message || "Email delivery failed.",
      data: { draft, emailResults },
    });
  }

  draft.status = "sent";
  draft.sentAt = new Date();
  draft.sendError = null;
  await draft.save();

  res.json({
    success: true,
    data: {
      draft,
      emailResults,
    },
  });
});

/**
 * @desc    Cancel/delete a draft
 * @route   DELETE /api/reports/drafts/:id
 * @access  Private (Teacher/Admin)
 */
export const cancelReportDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const draft = await ReportDraft.findById(id);
  if (!draft) {
    return res
      .status(404)
      .json({ success: false, message: "Draft not found." });
  }

  if (draft.school.toString() !== userSchoolId(req.user)) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (
    draft.teacher.toString() !== req.user._id.toString() &&
    !userIsAdmin(req.user)
  ) {
    return res.status(403).json({ success: false, message: "Not authorized." });
  }

  if (draft.status === "sent") {
    return res.status(400).json({
      success: false,
      message: "Cannot cancel a sent draft.",
    });
  }

  if (draft.status === "sending") {
    return res.status(409).json({
      success: false,
      message: "This draft is being sent right now. Refresh and try again.",
    });
  }

  draft.status = "cancelled";
  await draft.save();

  res.json({ success: true, message: "Draft cancelled." });
});
