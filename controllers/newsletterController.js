import { asyncHandler } from "../middleware/errorHandler.js";
import { authorize } from "../middleware/auth.js";
import { resolveTeacherProfile, isTeacherAuthorizedForClassSubject } from "../helpers/teacherScoping.js";
import NewsletterIssue from "../models/NewsletterIssue.js";
import NewsletterSection from "../models/NewsletterSection.js";
import Class from "../models/Class.js";
import Subject from "../models/Subject.js";
import LessonPlan from "../models/LessonPlan.js";
import Student from "../models/Student.js";
import { getWeekRange } from "../utils/newsletterWeek.js";
import { resolveRequestedAcademicYear } from "../utils/academicYear.js";
import { countWords, generateNewsletterSection } from "../services/newsletterAiService.js";
import {
  computeIssueReadiness,
  getExpectedSubjectIdsForClass,
  getExpectedSubjectsForClass,
  getSectionsForIssue,
} from "../services/newsletterIssueService.js";
import {
  prepareNewsletterIssueEmailContent,
  sendNewsletterIssueToParents,
} from "../services/newsletterEmailService.js";

function parseDateOrNull(value) {
  if (!value) return null;
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normalizeSectionContent(value) {
  return (value || "").toString().trim();
}

function normalizePositiveInt(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function buildIssueClassLabel(issueClass) {
  if (!issueClass) return "Class";
  const grade = issueClass.grade ? `Grade ${issueClass.grade}` : "";
  const section = issueClass.section ? `${issueClass.section}` : "";
  return [issueClass.name, grade, section].filter(Boolean).join(" ");
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

  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);

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

  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);

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
    customPrompt = "",
    regenerateWithFeedback = false,
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
  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);

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

  const existingSection = await NewsletterSection.findOne({
    school: req.schoolId,
    issue: issue._id,
    class: classId,
    subject: subjectId,
  })
    .select("adminReview customPrompt status")
    .lean();

  const adminFeedback =
    regenerateWithFeedback && existingSection?.status === "rejected"
      ? (existingSection?.adminReview?.notes || "").toString().trim()
      : "";

  const normalizedCustomPrompt = (customPrompt || existingSection?.customPrompt || "")
    .toString()
    .trim();

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
    customPrompt: normalizedCustomPrompt,
    adminFeedback,
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
        customPrompt: normalizedCustomPrompt,
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
 * TEACHER/ADMIN: Update section content manually.
 * PATCH /api/newsletters/sections/:id/content
 */
export const updateNewsletterSectionContent = asyncHandler(async (req, res) => {
  const section = await NewsletterSection.findById(req.params.id);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });

  const issue = await NewsletterIssue.findById(section.issue).select("status");
  if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
  if (issue.status === "sent") {
    return res.status(400).json({ success: false, message: "Cannot edit a sent newsletter issue" });
  }

  const isTeacherOwner =
    req.user.role === "teacher" && section.teacherUser?.toString() === req.user._id.toString();
  const isAdminReviewer = ["admin", "super_admin", "department_principal"].includes(req.user.role);

  if (!isTeacherOwner && !isAdminReviewer) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const content = normalizeSectionContent(req.body?.content);
  if (!content) {
    return res.status(400).json({ success: false, message: "content is required" });
  }

  section.content = content;
  section.wordCount = countWords(content);

  if (req.body?.customPrompt !== undefined) {
    section.customPrompt = (req.body.customPrompt || "").toString().trim();
  }

  // Teacher edits invalidate prior review and require re-submit.
  if (isTeacherOwner && section.status !== "draft") {
    section.status = "draft";
    section.submittedAt = undefined;
    section.adminReview = { notes: "" };
  }

  await section.save();

  const hydratedSection = await NewsletterSection.findById(section._id)
    .populate("subject", "name code")
    .populate("teacherUser", "firstName lastName email")
    .lean();

  res.json({ success: true, data: { section: hydratedSection } });
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
  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);

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

  const progress = await Promise.all(
    issues.map(async (issue) => {
      const issueClassId = issue.class?._id || issue.class;
      const [expectedSubjectIds, issueSections] = await Promise.all([
        getExpectedSubjectIdsForClass(issueClassId),
        getSectionsForIssue(issue._id),
      ]);
      const readiness = computeIssueReadiness({
        expectedSubjectIds,
        sections: issueSections,
        excludedSubjectIds: issue.excludedSubjectIds || [],
      });
      return {
        issueId: issue._id.toString(),
        expectedCount: readiness.expectedCount,
        approvedCount: readiness.approvedCount,
        excludedCount: readiness.excludedCount,
        isSendEnabled: readiness.isSendEnabled,
      };
    })
  );

  const summary = progress.reduce(
    (acc, item) => {
      acc.totalIssues += 1;
      acc.readyIssues += item.isSendEnabled ? 1 : 0;
      acc.totalExpectedSections += item.expectedCount;
      acc.approvedSections += item.approvedCount;
      acc.excludedSections += item.excludedCount;
      return acc;
    },
    {
      totalIssues: 0,
      readyIssues: 0,
      totalExpectedSections: 0,
      approvedSections: 0,
      excludedSections: 0,
    }
  );

  res.json({ success: true, data: { issues, weekStart, weekEnd, progress, summary } });
});

/**
 * ADMIN: Sent issue history with pagination.
 * GET /api/newsletters/admin/sent?classId=&academicYear=&page=&limit=
 */
export const listAdminSentIssues = asyncHandler(async (req, res) => {
  const { classId, academicYear } = req.query;
  const page = normalizePositiveInt(req.query.page, 1, 5000);
  const limit = normalizePositiveInt(req.query.limit, 20, 100);

  const query = {
    school: req.schoolId,
    status: "sent",
    sentAt: { $ne: null },
  };
  if (classId) query.class = classId;
  if (academicYear) query.academicYear = resolveRequestedAcademicYear(academicYear, req.school);

  const [issues, total] = await Promise.all([
    NewsletterIssue.find(query)
      .populate("class", "name grade section")
      .populate("sentBy", "firstName lastName email")
      .sort({ sentAt: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NewsletterIssue.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      issues,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
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
 * PARENT: Newsletter archive for linked children.
 * GET /api/newsletters/parent/history?childId=&academicYear=&page=&limit=
 */
export const listParentNewsletterHistory = asyncHandler(async (req, res) => {
  const { childId, academicYear } = req.query;
  const page = normalizePositiveInt(req.query.page, 1, 5000);
  const limit = normalizePositiveInt(req.query.limit, 20, 100);

  const parentEmail = (req.user?.email || "").toString().trim();
  if (!parentEmail) {
    return res.json({
      success: true,
      data: {
        issues: [],
        children: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
    });
  }

  const escapedEmail = parentEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linkedStudentQuery = {
    school: req.schoolId,
    $or: [
      { "parentInfo.fatherEmail": new RegExp(`^${escapedEmail}$`, "i") },
      { "parentInfo.motherEmail": new RegExp(`^${escapedEmail}$`, "i") },
      { "parentInfo.guardianEmail": new RegExp(`^${escapedEmail}$`, "i") },
    ],
  };
  if (academicYear) {
    linkedStudentQuery.academicYear = resolveRequestedAcademicYear(academicYear, req.school);
  }

  const linkedStudents = await Student.find(linkedStudentQuery)
    .select("_id firstName lastName currentClass academicYear")
    .populate("currentClass", "name grade section")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  const scopedStudents = childId
    ? linkedStudents.filter((student) => String(student?._id) === String(childId))
    : linkedStudents;

  if (scopedStudents.length === 0) {
    return res.json({
      success: true,
      data: {
        issues: [],
        children: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      },
    });
  }

  const classIds = Array.from(
    new Set(
      scopedStudents
        .map((student) => student?.currentClass?._id || student?.currentClass)
        .filter(Boolean)
        .map((id) => id.toString())
    )
  );

  const classToChildren = scopedStudents.reduce((acc, student) => {
    const classId = (student?.currentClass?._id || student?.currentClass)?.toString?.();
    if (!classId) return acc;
    if (!acc[classId]) acc[classId] = [];
    const name = `${student?.firstName || ""} ${student?.lastName || ""}`.trim();
    if (name && !acc[classId].includes(name)) acc[classId].push(name);
    return acc;
  }, {});

  const query = {
    school: req.schoolId,
    class: { $in: classIds },
    status: "sent",
    sentAt: { $ne: null },
  };

  const [issues, total] = await Promise.all([
    NewsletterIssue.find(query)
      .populate("class", "name grade section")
      .populate("sentBy", "firstName lastName")
      .sort({ sentAt: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    NewsletterIssue.countDocuments(query),
  ]);

  const issueIds = issues.map((issue) => issue._id);
  const sections = issueIds.length
    ? await NewsletterSection.find({
        school: req.schoolId,
        issue: { $in: issueIds },
        status: "approved",
      })
        .populate("subject", "name code")
        .sort({ updatedAt: -1 })
        .lean()
    : [];

  const sectionsByIssue = sections.reduce((acc, section) => {
    const issueId = section.issue?.toString?.();
    if (!issueId) return acc;
    if (!acc[issueId]) acc[issueId] = [];
    acc[issueId].push(section);
    return acc;
  }, {});

  const items = issues.map((issue) => {
    const issueId = issue._id.toString();
    const excludedSet = new Set((issue.excludedSubjectIds || []).map((id) => id.toString()));
    const selectedSections = (sectionsByIssue[issueId] || [])
      .filter((section) => !excludedSet.has((section.subject?._id || section.subject)?.toString?.()))
      .sort((left, right) => (left.subject?.name || "").localeCompare(right.subject?.name || ""));

    return {
      _id: issue._id,
      class: issue.class,
      classLabel: buildIssueClassLabel(issue.class),
      academicYear: issue.academicYear,
      weekStart: issue.weekStart,
      weekEnd: issue.weekEnd,
      sentAt: issue.sentAt,
      sentBy: issue.sentBy || null,
      emailStats: issue.emailStats || null,
      childNames: classToChildren[(issue.class?._id || issue.class)?.toString?.()] || [],
      sections: selectedSections.map((section) => ({
        _id: section._id,
        subject: section.subject,
        content: section.content || "",
        wordCount: section.wordCount || 0,
      })),
    };
  });

  res.json({
    success: true,
    data: {
      issues: items,
      children: scopedStudents.map((student) => ({
        id: student._id,
        name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
        classId: student?.currentClass?._id || student?.currentClass || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

/**
 * ADMIN: Preview the exact combined newsletter email before send.
 * GET /api/newsletters/admin/issues/:id/preview
 */
export const previewIssueEmail = asyncHandler(async (req, res) => {
  const prepared = await prepareNewsletterIssueEmailContent({ issueId: req.params.id });

  res.json({
    success: true,
    data: {
      issueId: prepared.issue._id,
      classId: prepared.cls._id,
      classLabel: prepared.classLabel,
      weekLabel: prepared.weekLabel,
      subjectLine: prepared.subjectLine,
      sectionsCount: prepared.sections.length,
      readiness: prepared.readiness,
      htmlContent: prepared.htmlContent,
      textContent: prepared.textContent,
    },
  });
});

/**
 * ADMIN: Approve all submitted sections for one issue.
 * POST /api/newsletters/admin/issues/:id/approve-submitted
 */
export const approveAllSubmittedSectionsForIssue = asyncHandler(async (req, res) => {
  const issue = await NewsletterIssue.findById(req.params.id).lean();
  if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });

  const notes = (req.body?.notes || "").toString().trim();

  const result = await NewsletterSection.updateMany(
    { issue: issue._id, status: "submitted" },
    {
      $set: {
        status: "approved",
        adminReview: {
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          notes,
        },
      },
    }
  );

  res.json({
    success: true,
    data: {
      issueId: issue._id,
      approvedCount: result.modifiedCount || 0,
    },
  });
});

/**
 * ADMIN: Approve submitted sections for all issues in selected week.
 * POST /api/newsletters/admin/issues/approve-submitted
 * Body: { academicYear?, weekStart?, classId?, notes? }
 */
export const approveAllSubmittedSectionsForWeek = asyncHandler(async (req, res) => {
  const { classId, academicYear, weekStart: requestedWeekStart } = req.body || {};
  const referenceDate = parseDateOrNull(requestedWeekStart) || new Date();
  const { weekStart } = getWeekRange(referenceDate);
  const academicYearValue = resolveRequestedAcademicYear(academicYear, req.school);
  const notes = (req.body?.notes || "").toString().trim();

  const issueQuery = {
    school: req.schoolId,
    academicYear: academicYearValue,
    weekStart,
  };
  if (classId) issueQuery.class = classId;

  const issues = await NewsletterIssue.find(issueQuery).select("_id").lean();
  const issueIds = issues.map((i) => i._id);

  if (issueIds.length === 0) {
    return res.json({ success: true, data: { issueCount: 0, approvedCount: 0 } });
  }

  const result = await NewsletterSection.updateMany(
    { issue: { $in: issueIds }, status: "submitted" },
    {
      $set: {
        status: "approved",
        adminReview: {
          reviewedBy: req.user._id,
          reviewedAt: new Date(),
          notes,
        },
      },
    }
  );

  res.json({
    success: true,
    data: {
      issueCount: issueIds.length,
      approvedCount: result.modifiedCount || 0,
    },
  });
});

/**
 * Route-level role checks (kept here for readability).
 * Use in routes where needed.
 */
export const requireAdmin = authorize("admin", "super_admin");
