import { asyncHandler } from "../middleware/errorHandler.js";
import { authorize } from "../middleware/auth.js";
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject, getTeacherClassIds } from "../helpers/teacherScoping.js";
import NewsletterIssue from "../models/NewsletterIssue.js";
import NewsletterSection from "../models/NewsletterSection.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import LessonPlan from "../models/LessonPlan.js";
import { getWeekRange } from "../utils/newsletterWeek.js";
import { generateNewsletterSection } from "../services/newsletterAiService.js";
import {
  computeIssueReadiness,
  getExpectedSubjectIdsForClass,
  getExpectedSubjectsForClass,
  getSectionsForIssue,
} from "../services/newsletterIssueService.js";
import { sendNewsletterIssueToParents } from "../services/newsletterEmailService.js";

function parseDateOrNull(value) {
  if (!value) return null;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

async function ensureIssue({ schoolId, classId, academicYear, weekStart, weekEnd, createdBy }) {
  return NewsletterIssue.findOneAndUpdate(
    { school: schoolId, class: classId, academicYear, weekStart },
    {
      $setOnInsert: {
        school: schoolId,
        class: classId,
        academicYear,
        weekStart,
        status: "draft",
        createdBy,
      },
      $set: {
        weekEnd,
      },
    },
    { new: true, upsert: true }
  );
}

function redactSectionForTeacher(section, viewerUserId) {
  if (!section) return section;
  // teacherUser may be an ObjectId OR a populated object; handle both.
  const sectionTeacherUserId =
    typeof section.teacherUser === "object" && section.teacherUser !== null
      ? section.teacherUser._id
      : section.teacherUser;
  if (sectionTeacherUserId?.toString?.() === viewerUserId.toString()) return section;
  // Show status metadata, hide content of other teachers.
  return {
    ...section,
    content: "",
    keyTopics: [],
    homeworkMentioned: false,
    wordCount: 0,
    aiMeta: { model: "", inputTokens: 0, outputTokens: 0, totalTokens: 0, promptVersion: "v1" },
  };
}

/**
 * TEACHER/ADMIN: Ensure current-week issue exists for a class.
 * POST /api/newsletters/issues/ensure
 */
export const ensureNewsletterIssue = asyncHandler(async (req, res) => {
  const { classId, academicYear, weekStart: requestedWeekStart } = req.body;
  if (!classId) {
    return res.status(400).json({ success: false, message: "classId is required" });
  }

  if (req.user.role === "teacher") {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) {
      return res.status(403).json({ success: false, message: "Teacher profile not found" });
    }
    const classIds = await getTeacherClassIds(teacher._id);
    if (!classIds.some((id) => id.toString() === classId.toString())) {
      return res.status(403).json({ success: false, message: "Not authorized for this class" });
    }
  }

  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue =
    academicYear || new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

  const issue = await ensureIssue({
    schoolId: req.schoolId,
    classId,
    academicYear: academicYearValue,
    weekStart,
    weekEnd,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: { issue } });
});

/**
 * TEACHER/ADMIN: Get issue + sections for a class/week.
 * GET /api/newsletters/issues?classId=&weekStart=
 */
export const getNewsletterIssue = asyncHandler(async (req, res) => {
  const { classId, academicYear, weekStart: requestedWeekStart } = req.query;
  if (!classId) {
    return res.status(400).json({ success: false, message: "classId is required" });
  }

  if (req.user.role === "teacher") {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) {
      return res.status(403).json({ success: false, message: "Teacher profile not found" });
    }
    const classIds = await getTeacherClassIds(teacher._id);
    if (!classIds.some((id) => id.toString() === classId.toString())) {
      return res.status(403).json({ success: false, message: "Not authorized for this class" });
    }
  }

  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue =
    academicYear || new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

  const issue = await ensureIssue({
    schoolId: req.schoolId,
    classId,
    academicYear: academicYearValue,
    weekStart,
    weekEnd,
    createdBy: req.user._id,
  });

  const sections = await NewsletterSection.find({ issue: issue._id })
    .populate("subject", "name code")
    .populate("teacherUser", "firstName lastName email")
    .sort({ updatedAt: -1 })
    .lean();

  const safeSections =
    req.user.role === "teacher"
      ? sections.map((s) => redactSectionForTeacher(s, req.user._id))
      : sections;

  res.json({ success: true, data: { issue, sections: safeSections } });
});

/**
 * TEACHER: Generate (and save) a draft section for class+subject+week.
 * POST /api/newsletters/sections/generate
 */
export const generateNewsletterSectionDraft = asyncHandler(async (req, res) => {
  const {
    classId,
    subjectId,
    academicYear,
    weekStart: requestedWeekStart,
    language = "english",
    selectedLessonPlanIds = [],
  } = req.body;

  if (!classId || !subjectId) {
    return res.status(400).json({ success: false, message: "classId and subjectId are required" });
  }

  const teacherProfile = await resolveTeacherProfile(req);
  if (req.user.role !== "teacher" || !teacherProfile) {
    return res.status(403).json({ success: false, message: "Teacher access required" });
  }

  const isTeacherAssignedToClassSubject = await isTeacherAuthorizedForClassSubject(
    teacherProfile._id,
    classId.toString(),
    subjectId.toString()
  );
  if (!isTeacherAssignedToClassSubject) {
    return res.status(403).json({ success: false, message: "Not authorized for this class/subject" });
  }

  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue =
    academicYear || new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

  const [classDoc, subjectDoc] = await Promise.all([
    Class.findById(classId).lean(),
    Subject.findById(subjectId).lean(),
  ]);
  if (!classDoc) return res.status(404).json({ success: false, message: "Class not found" });
  if (!subjectDoc) return res.status(404).json({ success: false, message: "Subject not found" });

  const issue = await ensureIssue({
    schoolId: req.schoolId,
    classId,
    academicYear: academicYearValue,
    weekStart,
    weekEnd,
    createdBy: req.user._id,
  });

  const weekLessonPlans = Array.isArray(selectedLessonPlanIds) && selectedLessonPlanIds.length
    ? await LessonPlan.find({
        _id: { $in: selectedLessonPlanIds },
        class: classId,
        subject: subjectId,
        date: { $gte: weekStart, $lte: weekEnd },
      })
        .sort({ date: 1 })
        .lean()
    : await LessonPlan.find({
        class: classId,
        subject: subjectId,
        date: { $gte: weekStart, $lte: weekEnd },
      })
        .sort({ date: 1 })
        .lean();

  const generated = await generateNewsletterSection({
    classDoc,
    subjectDoc,
    weekStart,
    weekEnd,
    lessonPlans: weekLessonPlans,
    language,
    schoolId: req.schoolId,
    userId: req.user._id,
  });

  const section = await NewsletterSection.findOneAndUpdate(
    { school: req.schoolId, issue: issue._id, class: classId, subject: subjectId },
    {
      $set: {
        teacherUser: req.user._id,
        teacherProfile: teacherProfile._id,
        language,
        selectedLessonPlanIds: weekLessonPlans.map((lp) => lp._id),
        content: generated.content,
        wordCount: generated.wordCount,
        keyTopics: generated.keyTopics,
        homeworkMentioned: generated.homeworkMentioned,
        aiTokenUsage: generated.aiTokenUsageId,
        status: "draft",
      },
    },
    { new: true, upsert: true }
  )
    .populate("subject", "name code")
    .lean();

  res.json({ success: true, data: { issue, section } });
});

/**
 * TEACHER: Submit a draft section for admin review.
 * POST /api/newsletters/sections/:id/submit
 */
export const submitNewsletterSection = asyncHandler(async (req, res) => {
  const section = await NewsletterSection.findById(req.params.id);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });

  if (req.user.role !== "teacher" || section.teacherUser.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  section.status = "submitted";
  section.submittedAt = new Date();
  await section.save();

  res.json({ success: true, data: { section } });
});

/**
 * ADMIN: Approve a submitted section.
 * POST /api/newsletters/admin/sections/:id/approve
 */
export const approveNewsletterSection = asyncHandler(async (req, res) => {
  const section = await NewsletterSection.findById(req.params.id);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });

  section.status = "approved";
  section.adminReview = {
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    notes: (req.body?.notes || "").toString(),
  };
  await section.save();

  res.json({ success: true, data: { section } });
});

/**
 * ADMIN: Reject a submitted section (with notes).
 * POST /api/newsletters/admin/sections/:id/reject
 */
export const rejectNewsletterSection = asyncHandler(async (req, res) => {
  const section = await NewsletterSection.findById(req.params.id);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });

  section.status = "rejected";
  section.adminReview = {
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    notes: (req.body?.notes || "").toString(),
  };
  await section.save();

  res.json({ success: true, data: { section } });
});

/**
 * ADMIN: Update issue subject exclusions.
 * PATCH /api/newsletters/admin/issues/:id/exclusions
 * Body: { excludedSubjectIds: string[] }
 */
export const updateIssueExclusions = asyncHandler(async (req, res) => {
  const issue = await NewsletterIssue.findById(req.params.id);
  if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });

  const excludedSubjectIds = Array.isArray(req.body?.excludedSubjectIds)
    ? req.body.excludedSubjectIds
    : [];
  issue.excludedSubjectIds = excludedSubjectIds;
  await issue.save();

  res.json({ success: true, data: { issue } });
});

/**
 * ADMIN: List issues (optionally filtered).
 * GET /api/newsletters/admin/issues?classId=&weekStart=
 */
export const listAdminIssues = asyncHandler(async (req, res) => {
  const { classId, academicYear, weekStart: requestedWeekStart } = req.query;
  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue =
    academicYear || new Date().getFullYear() + "-" + (new Date().getFullYear() + 1);

  const query = { academicYear: academicYearValue, weekStart };
  if (classId) query.class = classId;

  // Ensure at least one issue exists when classId provided (lazy creation).
  if (classId) {
    await ensureIssue({
      schoolId: req.schoolId,
      classId,
      academicYear: academicYearValue,
      weekStart,
      weekEnd,
      createdBy: req.user._id,
    });
  }

  const issues = await NewsletterIssue.find(query)
    .populate("class", "name grade section")
    .sort({ class: 1 })
    .lean();

  res.json({ success: true, data: { issues, weekStart, weekEnd } });
});

/**
 * ADMIN: Get one issue with all sections + readiness info.
 * GET /api/newsletters/admin/issues/:id
 */
export const getAdminIssueDetails = asyncHandler(async (req, res) => {
  const issue = await NewsletterIssue.findById(req.params.id)
    .populate("class", "name grade section")
    .lean();
  if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });

  const issueClassId = issue.class?._id || issue.class;
  const [expectedSubjectIds, expectedSubjects, issueSections] = await Promise.all([
    getExpectedSubjectIdsForClass(issueClassId),
    getExpectedSubjectsForClass(issueClassId),
    getSectionsForIssue(issue._id),
  ]);

  const readiness = computeIssueReadiness({
    expectedSubjectIds,
    sections: issueSections,
    excludedSubjectIds: issue.excludedSubjectIds || [],
  });

  res.json({
    success: true,
    data: { issue, sections: issueSections, readiness, expectedSubjects },
  });
});

/**
 * ADMIN: Send a newsletter issue to parents.
 * POST /api/newsletters/admin/issues/:id/send
 *
 * NOTE: Email sending is implemented in a dedicated service (next todo).
 */
export const sendIssueToParents = asyncHandler(async (req, res) => {
  const result = await sendNewsletterIssueToParents({
    issueId: req.params.id,
    adminUserId: req.user._id,
  });

  res.json({ success: true, data: result });
});

/**
 * Route-level role checks (kept here for readability).
 * Use in routes where needed.
 */
export const requireAdmin = authorize("admin", "super_admin");

