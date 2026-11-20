/**
 * F7: publish a batch of clean rounds in one action.
 *
 * The preview runs the same gates a single publish runs — stage, lock, anchors,
 * tokens — and names every row that cannot go out. Publishing then calls the one
 * publish path per row, so a rule can never drift between single and bulk.
 *
 * Email is a courtesy, never a gate: the preview reports who would be written
 * to and the publish still succeeds when mail is off or has no address.
 */
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import Student from "../models/Student.js";
import School from "../models/School.js";

import {
  PUBLISHABLE_FROM,
  canMoveTo,
  stageAfterPublish,
} from "./writingAssistantLogic.js";
import { publishBlockers } from "../client/src/utils/writingPublishCheck.js";
import { marksModeOf } from "../client/src/utils/writingRubric.js";
import {
  buildFeedbackEmail,
  emailChannels,
  publishChannels,
  resolveRecipients,
} from "./writingFeedbackEmailService.js";
import { publishAssessment } from "./writingAssistantAssessmentService.js";

export const MAX_BULK_PUBLISH = 50;

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });

const sameId = (a, b) => String(a || "") === String(b || "");

const objectId = (value) =>
  mongoose.isValidObjectId(String(value || "")) ? String(value) : null;

const normalizeIds = (projectIds) => {
  const seen = new Set();
  const rows = [];
  for (const value of Array.isArray(projectIds) ? projectIds : []) {
    const id = objectId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(id);
  }
  return rows;
};

const normalizeNotify = (notify) => ({
  student: notify?.student !== false,
  parents: notify?.parents !== false,
});

const studentNameOf = (row) =>
  `${row?.firstName || ""} ${row?.lastName || ""}`.trim() ||
  "No longer on the class list";

/** Every row plus the one feedback round that would be published for it. */
const evaluateRows = async ({ schoolId, assignmentId, projectIds }) => {
  const ids = normalizeIds(projectIds);
  if (!ids.length) throw badRequest("Select at least one student to publish.");
  if (ids.length > MAX_BULK_PUBLISH) {
    throw badRequest(
      `Publishing more than ${MAX_BULK_PUBLISH} students at once is not supported.`,
    );
  }

  const projects = await WritingProject.find({
    school: schoolId,
    assignment: assignmentId,
    _id: { $in: ids },
  })
    .populate("student", "firstName lastName")
    .lean();
  const byId = new Map(projects.map((row) => [String(row._id), row]));

  const draftIds = projects
    .map((row) => objectId(row.latestDraft))
    .filter(Boolean);
  const [drafts, assessments] = await Promise.all([
    draftIds.length
      ? WritingDraft.find({ school: schoolId, _id: { $in: draftIds } })
          .select("withdrawn number sections")
          .lean()
      : [],
    draftIds.length
      ? WritingAssessment.find({
          school: schoolId,
          assignment: assignmentId,
          kind: "feedback",
          draft: { $in: draftIds },
        })
          .select("-aiOriginal")
          .sort({ createdAt: -1 })
          .lean()
      : [],
  ]);
  const draftById = new Map(drafts.map((row) => [String(row._id), row]));
  // Newest first: the round the review panel shows is the one being published.
  const feedbackByDraft = new Map();
  for (const row of assessments) {
    if (!feedbackByDraft.has(String(row.draft))) {
      feedbackByDraft.set(String(row.draft), row);
    }
  }

  return ids.map((id) => {
    const project = byId.get(id);
    if (!project) {
      return { projectId: id, studentName: "", reasons: ["not-found"] };
    }
    const draft = draftById.get(String(project.latestDraft || ""));
    const feedback = draft
      ? feedbackByDraft.get(String(draft._id))
      : null;
    const row = {
      projectId: id,
      studentName: studentNameOf(project.student),
      assessmentId: feedback ? String(feedback._id) : "",
      draftNumber: draft?.number || 0,
      project,
      draft,
      feedback,
    };

    const reasons = [];
    if (!draft) reasons.push("draft-missing");
    else if (draft.withdrawn) reasons.push("returned");
    if (!feedback) reasons.push("not-ready");
    else if (feedback.aiStatus !== "done") reasons.push("not-ready");
    else if (feedback.publish?.state === "published") reasons.push("already");
    // Content gates only matter for a round that would otherwise go out;
    // an already-published row must not collect stage or anchor noise.
    if (
      feedback &&
      feedback.aiStatus === "done" &&
      feedback.publish?.state !== "published" &&
      draft &&
      !draft.withdrawn
    ) {
      if (!(PUBLISHABLE_FROM.feedback || []).includes(project.stage)) {
        reasons.push("stage");
      } else if (
        !canMoveTo(
          project,
          stageAfterPublish("feedback", feedback.recommendation?.path),
        )
      ) {
        reasons.push("locked");
      }
      if (
        (feedback.sections || []).some(
          (section) => section.intervention?.needsRewrite,
        )
      ) {
        reasons.push("repeats");
      }
      for (const blocker of publishBlockers({
        assessment: feedback,
        draft,
      })) {
        reasons.push(blocker.kind);
      }
    }
    row.reasons = reasons;
    return row;
  });
};

/** Counts for the confirmation block, one reason per row. */
const summarize = (rows) => {
  const reasonCounts = {};
  for (const row of rows) {
    for (const reason of row.reasons) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }
  const eligible = rows.filter((row) => row.reasons.length === 0);
  return {
    selected: rows.length,
    eligible: eligible.length,
    blocked: rows.length - eligible.length,
    reasons: reasonCounts,
  };
};

const loadEmailFacts = async ({ schoolId, rows, notify }) => {
  const channels = publishChannels(emailChannels(), notify);
  const studentIds = rows
    .map((row) => objectId(row.project?.student?._id || row.project?.student))
    .filter(Boolean);
  const [students, school] = await Promise.all([
    studentIds.length
      ? Student.find({ school: schoolId, _id: { $in: studentIds } })
          .populate("user", "email")
          .exec()
      : [],
    School.findOne({ _id: schoolId })
      .select("name settings.writingFeedback.marksMode")
      .lean(),
  ]);
  const studentById = new Map(students.map((row) => [String(row._id), row]));

  const email = { students: 0, parents: 0 };
  for (const row of rows) {
    if (row.reasons.length) continue;
    const student = studentById.get(
      String(row.project?.student?._id || row.project?.student),
    );
    if (!channels.students && !channels.parents) {
      row.email = { students: 0, parents: 0, note: "off" };
      continue;
    }
    if (!student) {
      row.email = { students: 0, parents: 0, note: "no-addresses" };
      continue;
    }
    const recipients = resolveRecipients({ student, channels });
    const studentsTo = channels.students ? recipients.studentEmails.length : 0;
    const parentsTo = channels.parents ? recipients.parentEmails.length : 0;
    row.email = {
      students: studentsTo,
      parents: parentsTo,
      note: studentsTo || parentsTo ? "" : "no-addresses",
    };
    email.students += studentsTo;
    email.parents += parentsTo;
  }

  return { channels, email, school, studentById };
};

/** One real message built by the real builder, so the dry run shows no mock-up. */
const sampleEmail = ({
  assignment,
  school,
  studentById,
  row,
  language = "en",
}) => {
  const student = studentById.get(
    String(row.project?.student?._id || row.project?.student),
  );
  if (!student || !row.draft || !row.feedback) return null;
  const base = String(
    process.env.CLIENT_URL || process.env.FRONTEND_URL || "",
  ).replace(/\/+$/, "");
  const message = buildFeedbackEmail({
    role: row.email?.parents ? "parent" : "student",
    language,
    schoolName: String(school?.name || "").trim(),
    studentFirstName: student.firstName || "",
    studentName: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
    assignment: assignment || {},
    project: row.project,
    draft: row.draft,
    assessment: row.feedback,
    url:
      base && row.project?._id
        ? `${base}/portal/writing/project/${row.project._id}`
        : "",
    marks: marksModeOf(school?.settings?.writingFeedback?.marksMode),
  });
  if (!message) return null;
  return {
    studentName: row.studentName,
    role: row.email?.parents ? "parents" : "student",
    subject: message.subject,
    html: message.html,
  };
};

/**
 * Dry run: who would be published, who cannot be, why, and a real sample email.
 * Nothing is written and no mail leaves.
 */
export const previewBulkPublish = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  projectIds = [],
  notify,
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("The writing task no longer exists.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("The writing task no longer exists.");
  if (!isAdmin && !sameId(assignment.assignedBy, userId)) {
    throw forbidden(
      "Only the teacher who created this writing task or a school admin can publish its feedback.",
    );
  }

  const rows = await evaluateRows({ schoolId, assignmentId: id, projectIds });
  const { channels, email, school, studentById } = await loadEmailFacts({
    schoolId,
    rows,
    notify: normalizeNotify(notify),
  });
  const first = rows.find(
    (row) =>
      row.reasons.length === 0 &&
      (row.email?.students || 0) + (row.email?.parents || 0) > 0,
  );

  return {
    rows: rows.map((row) => ({
      projectId: row.projectId,
      assessmentId: row.assessmentId,
      studentName: row.studentName,
      draftNumber: row.draftNumber,
      reasons: row.reasons,
      email: row.email || { students: 0, parents: 0, note: "" },
    })),
    summary: summarize(rows),
    channels,
    email,
    sampleEmail: first
      ? sampleEmail({
          assignment,
          school,
          studentById,
          row: first,
          language: first.feedback?.language,
        })
      : null,
  };
};

/**
 * Publish every eligible row, one at a time, through the single publish path.
 * A row that fails is reported with its own message; nothing is silently skipped.
 */
export const bulkPublish = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  projectIds = [],
  notify,
}) => {
  const preview = await previewBulkPublish({
    schoolId,
    assignmentId,
    userId,
    isAdmin,
    projectIds,
    notify,
  });
  const notifyValue = normalizeNotify(notify);

  const rows = [];
  for (const row of preview.rows) {
    const base = {
      projectId: row.projectId,
      assessmentId: row.assessmentId,
      studentName: row.studentName,
      draftNumber: row.draftNumber,
    };
    if (row.reasons.length) {
      rows.push({ ...base, status: "blocked", reasons: row.reasons });
      continue;
    }
    try {
      const result = await publishAssessment({
        schoolId,
        assessmentId: row.assessmentId,
        userId,
        isAdmin,
        payload: { notify: notifyValue },
      });
      rows.push({
        ...base,
        status: result.alreadyPublished ? "already" : "published",
        reasons: [],
      });
    } catch (error) {
      rows.push({
        ...base,
        status: "failed",
        reasons: [],
        message: String(error?.message || "Publishing failed."),
        statusCode: Number(error?.statusCode) || 500,
      });
    }
  }

  const summary = {
    selected: rows.length,
    published: rows.filter((row) => row.status === "published").length,
    already: rows.filter((row) => row.status === "already").length,
    failed: rows.filter((row) => row.status === "failed").length,
    blocked: rows.filter((row) => row.status === "blocked").length,
  };
  return { rows, summary, email: preview.email };
};
