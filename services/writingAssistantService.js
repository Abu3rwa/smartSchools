/**
 * Writing Assistant — Phase 1 (guided writing and first drafts).
 *
 * Nothing in this file calls the AI. Assessment and comparison arrive in
 * writingAssistantAssessmentService.js, which only teacher routes reach.
 */
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import SpellingAnalysis from "../models/SpellingAnalysis.js";
import Student from "../models/Student.js";
import Class from "../models/Class.js";

import {
  DEFAULT_AI_CONSTRAINTS,
  normalizeWritingType,
  presetRubric,
  presetSections,
} from "../constants/writingPresets.js";
import {
  normalizeWordSupport,
  resolveWritingWordSupport,
} from "./writingWordSupportService.js";
import {
  STAGE_LABELS,
  buildDraftSections,
  buildTracker,
  buildWorkingSections,
  buildWritingProfile,
  canMoveTo,
  canStudentSubmit,
  configSnapshotFor,
  sectionTotalWords,
  stageAfterSubmit,
  studentNextAction,
  summarizeBoard,
  validateSubmission,
  workingSectionsFor,
} from "./writingAssistantLogic.js";
import { fillStudentTokensDeep } from "./aiPromptSafety.js";
import { getTeacherProfile } from "../helpers/teacherScoping.js";
import { rubricRows } from "../client/src/utils/writingRubric.js";
import {
  packSnapshotForAssignment,
  resolveAssignmentPack,
  sourcePacksEnabled,
} from "./writingSourcePackService.js";
import { writingMarksMode } from "./writingMarksPolicy.js";
import { stallSuggestion } from "./writingRevisionIntelligence.js";
import { resolveRecipients } from "./writingFeedbackEmailService.js";
import { optedOutEmails } from "./writingEmailOptOutService.js";

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) =>
  Object.assign(new Error(message), { statusCode: 409 });

const objectId = (value) => {
  if (!mongoose.isValidObjectId(String(value || ""))) return null;
  return String(value);
};

const sameId = (a, b) => String(a || "") === String(b || "");

/* ------------------------------------------------------------------ */
/* Assignment configuration                                            */
/* ------------------------------------------------------------------ */

export const normalizeSectionRows = (input) => {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const cleaned = [];
  for (const row of rows) {
    const key = String(row?.key || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const repeatable = row?.repeatable === true;
    const minCount = Math.max(Number(row?.minCount) || 1, 1);
    const maxCount = Math.max(Number(row?.maxCount) || minCount, minCount);
    cleaned.push({
      key,
      label: String(row?.label || key)
        .trim()
        .slice(0, 120),
      kind: String(row?.kind || "body")
        .trim()
        .slice(0, 40),
      instructions: String(row?.instructions || "")
        .trim()
        .slice(0, 2000),
      required: row?.required !== false,
      repeatable,
      minCount: repeatable ? minCount : 1,
      maxCount: repeatable ? maxCount : 1,
      minWords: Math.max(Number(row?.minWords) || 0, 0),
      criteria: (Array.isArray(row?.criteria) ? row.criteria : [])
        .map((item) =>
          String(item || "")
            .trim()
            .slice(0, 200),
        )
        .filter(Boolean)
        .slice(0, 10),
    });
  }
  return cleaned;
};

export const normalizeRubricRows = (input) => {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const cleaned = [];
  for (const row of rows) {
    const key = String(row?.key || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      key,
      label: String(row?.label || key)
        .trim()
        .slice(0, 120),
      description: String(row?.description || "")
        .trim()
        .slice(0, 1000),
      maxScore: Math.min(Math.max(Number(row?.maxScore) || 0, 0), 100),
      appliesToSections: (Array.isArray(row?.appliesToSections)
        ? row.appliesToSections
        : ["*"]
      )
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 12),
    });
  }
  return cleaned;
};

const normalizeSupports = (input = {}) => ({
  wordBank: (Array.isArray(input.wordBank) ? input.wordBank : [])
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, 60),
    )
    .filter(Boolean)
    .slice(0, 60),
  transitions: (Array.isArray(input.transitions) ? input.transitions : [])
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, 80),
    )
    .filter(Boolean)
    .slice(0, 40),
  sentenceStarters: (Array.isArray(input.sentenceStarters)
    ? input.sentenceStarters
    : []
  )
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, 160),
    )
    .filter(Boolean)
    .slice(0, 30),
  guidingQuestions: (Array.isArray(input.guidingQuestions)
    ? input.guidingQuestions
    : []
  )
    .map((item) =>
      String(item || "")
        .trim()
        .slice(0, 240),
    )
    .filter(Boolean)
    .slice(0, 20),
  modelText: String(input.modelText || "")
    .trim()
    .slice(0, 6000),
  plannerPrompt: String(input.plannerPrompt || "")
    .trim()
    .slice(0, 2000),
  wordSupport: normalizeWordSupport(input.wordSupport),
});

const normalizeWorkflow = (input = {}) => ({
  teacherPublishesFeedback: input.teacherPublishesFeedback !== false,
  requireNotebookCheck: input.requireNotebookCheck !== false,
  autoSuggestNextStep: input.autoSuggestNextStep !== false,
});

const normalizeTaughtFocus = (input) =>
  (Array.isArray(input) ? input : [])
    .map((row) =>
      String(row || "")
        .trim()
        .slice(0, 120),
    )
    .filter(Boolean)
    .slice(0, 8);

/**
 * Teachers pick a writing type and get its structure; sending explicit sections
 * wins, so an edited preset survives a save.
 */
const resolveStructure = (payload) => {
  const writingType = normalizeWritingType(payload.writingType);
  const provided = normalizeSectionRows(payload.sections);
  if (provided.length) {
    return {
      writingType,
      sections: provided,
      rubric: normalizeRubricRows(payload.rubric),
    };
  }
  return {
    writingType,
    sections: normalizeSectionRows(presetSections(writingType)),
    rubric: normalizeRubricRows(
      Array.isArray(payload.rubric) && payload.rubric.length
        ? payload.rubric
        : presetRubric(),
    ),
  };
};

const assertVisibleToTeacher = (assignment, userId, isAdmin) => {
  if (isAdmin || sameId(assignment.assignedBy, userId)) return;
  throw forbidden(
    "Only the teacher who created this writing task or a school admin can view or change it.",
  );
};

/** Project-level reads (history, teacher PDF) carry no assignment, so resolve it first. */
export const assertProjectVisibleToTeacher = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  const project = await WritingProject.findOne({ school: schoolId, _id: id })
    .select("assignment")
    .lean();
  if (!project) throw notFound("Writing project not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  })
    .select("assignedBy")
    .lean();
  if (!assignment) throw notFound("Writing task not found.");
  assertVisibleToTeacher(assignment, userId, isAdmin);
};

const uniqueIds = (values = []) => [
  ...new Set(values.map(objectId).filter(Boolean)),
];

/** A goal may only name a student the task is actually assigned to. */
const assertGoalsInAudience = (goals, students) => {
  const allowed = new Set((students || []).map((id) => String(id)));
  if (goals.some((goal) => !allowed.has(String(goal.student)))) {
    throw badRequest(
      "A learning goal names a student who is not part of this task.",
    );
  }
};

/**
 * One task belongs to one class. "Selected students" is a subset of that class,
 * never a mix of classes; the roster comes from the class, not from the request.
 */
/**
 * A teacher may only set work for a class they teach. Without this, any teacher
 * in the school can assign work — and spend AI credit — in any class.
 */
const assertTeachesClass = async ({ schoolId, classId, userId, isAdmin }) => {
  if (isAdmin) return;
  const teacher = await getTeacherProfile(userId);
  if (!teacher?._id)
    throw forbidden("Only a teacher or an admin can set writing work.");
  const teacherId = String(teacher._id);
  const classDoc = await Class.findOne({ school: schoolId, _id: classId })
    .select("classTeacher subjects.teacher")
    .lean();
  if (!classDoc) throw notFound("Class not found");
  const teaches =
    String(classDoc.classTeacher || "") === teacherId ||
    (classDoc.subjects || []).some(
      (row) => String(row.teacher || "") === teacherId,
    );
  if (!teaches) throw forbidden("You do not teach this class.");
};

const resolveAudience = async ({
  schoolId,
  classId,
  studentIds,
  academicYear,
  userId,
  isAdmin = false,
}) => {
  if (classId) await assertTeachesClass({ schoolId, classId, userId, isAdmin });
  const ids = uniqueIds(studentIds || []);
  if (ids.length) {
    if (!classId) throw badRequest("Choose a class before selecting students.");
    const classQuery = { _id: classId, school: schoolId };
    if (academicYear) classQuery.academicYear = academicYear;
    const classDoc = await Class.findOne(classQuery).select("_id").lean();
    if (!classDoc)
      throw notFound(
        academicYear ? `Class not found in ${academicYear}` : "Class not found",
      );
    const found = await Student.find({
      school: schoolId,
      _id: { $in: ids },
      currentClass: classId,
      status: "active",
      ...(academicYear ? { academicYear } : {}),
    })
      .select("_id")
      .lean();
    if (found.length !== ids.length) {
      throw badRequest("Some selected students are not active in this class.");
    }
    return { classId, students: found.map((row) => row._id) };
  }
  if (classId) {
    const classQuery = { _id: classId, school: schoolId };
    if (academicYear) classQuery.academicYear = academicYear;
    const classDoc = await Class.findOne(classQuery).select("_id").lean();
    if (!classDoc)
      throw notFound(
        academicYear ? `Class not found in ${academicYear}` : "Class not found",
      );
    const inClass = await Student.find({
      school: schoolId,
      currentClass: classId,
      status: "active",
      ...(academicYear ? { academicYear } : {}),
    })
      .select("_id")
      .lean();
    return { classId, students: inClass.map((row) => row._id) };
  }
  throw badRequest("Choose a class or at least one student.");
};

export const audienceModeFor = (payload = {}) =>
  payload.audienceMode === "selected" ||
  (payload.audienceMode === undefined &&
    Array.isArray(payload.studentIds) &&
    payload.studentIds.length)
    ? "selected"
    : "class";

export const createAssignment = async ({
  schoolId,
  academicYear = null,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const title = String(payload.title || "").trim();
  if (!title) throw badRequest("A writing task needs a title.");

  const structure = resolveStructure(payload);
  if (!structure.sections.length)
    throw badRequest("Add at least one section to the writing structure.");

  const audience = await resolveAudience({
    schoolId,
    classId: objectId(payload.classId || payload.class),
    studentIds: payload.studentIds,
    academicYear,
    userId,
    isAdmin,
  });
  if (!audience.students.length)
    throw badRequest("No students matched that class.");

  const goals = (Array.isArray(payload.goals) ? payload.goals : [])
    .map((row) => ({
      student: objectId(row?.student),
      text: String(row?.text || "")
        .trim()
        .slice(0, 500),
    }))
    .filter((row) => row.student && row.text);
  assertGoalsInAudience(goals, audience.students);

  // Lesson facts are an opt-in rollout; with the flag off the id is ignored
  // rather than attached, so a stale form cannot enable the feature silently.
  const sourcePack = sourcePacksEnabled()
    ? await resolveAssignmentPack({
        schoolId,
        sourcePackId: payload.sourcePackId,
      })
    : null;

  const assignment = await WritingAssignment.create({
    school: schoolId,
    academicYear: academicYear || undefined,
    title: title.slice(0, 200),
    instructions: String(payload.instructions || "")
      .trim()
      .slice(0, 6000),
    writingType: structure.writingType,
    topic: String(payload.topic || "")
      .trim()
      .slice(0, 500),
    assignedBy: userId,
    class: audience.classId || undefined,
    students: audience.students,
    audienceMode: audienceModeFor(payload),
    dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
    isActive: payload.isActive !== false,
    isTemplate: payload.isTemplate === true,
    minWords: Math.max(Number(payload.minWords) || 0, 0),
    maxWords: Math.max(Number(payload.maxWords) || 0, 0),
    expectedLevel: String(payload.expectedLevel || "")
      .trim()
      .slice(0, 200),
    goals,
    sections: structure.sections,
    supports: normalizeSupports(payload.supports),
    rubric: structure.rubric,
    workflow: normalizeWorkflow(payload.workflow),
    aiConstraints: String(payload.aiConstraints || DEFAULT_AI_CONSTRAINTS)
      .trim()
      .slice(0, 2000),
    taughtFocus: normalizeTaughtFocus(payload.taughtFocus),
    sourcePack: sourcePack || undefined,
    exemplarText: String(payload.exemplarText || "")
      .trim()
      .slice(0, 6000),
  });

  return assignment.toObject();
};

export const updateAssignment = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  });
  if (!assignment) throw notFound("Writing task not found.");
  assertVisibleToTeacher(assignment, userId, isAdmin);

  const structure =
    payload.sections || payload.writingType
      ? resolveStructure({
          ...payload,
          sections: payload.sections ?? assignment.sections,
          writingType: payload.writingType ?? assignment.writingType,
        })
      : null;

  if (payload.title !== undefined) {
    const title = String(payload.title || "").trim();
    if (!title) throw badRequest("A writing task needs a title.");
    assignment.title = title.slice(0, 200);
  }
  if (payload.instructions !== undefined)
    assignment.instructions = String(payload.instructions || "")
      .trim()
      .slice(0, 6000);
  if (payload.topic !== undefined)
    assignment.topic = String(payload.topic || "")
      .trim()
      .slice(0, 500);
  if (payload.expectedLevel !== undefined)
    assignment.expectedLevel = String(payload.expectedLevel || "")
      .trim()
      .slice(0, 200);
  if (payload.minWords !== undefined)
    assignment.minWords = Math.max(Number(payload.minWords) || 0, 0);
  if (payload.maxWords !== undefined)
    assignment.maxWords = Math.max(Number(payload.maxWords) || 0, 0);
  if (payload.dueDate !== undefined)
    assignment.dueDate = payload.dueDate
      ? new Date(payload.dueDate)
      : undefined;
  if (payload.isActive !== undefined)
    assignment.isActive = payload.isActive !== false;
  if (payload.isTemplate !== undefined)
    assignment.isTemplate = payload.isTemplate === true;
  if (payload.supports !== undefined)
    assignment.supports = normalizeSupports(payload.supports);
  if (payload.workflow !== undefined)
    assignment.workflow = normalizeWorkflow(payload.workflow);
  if (payload.aiConstraints !== undefined)
    assignment.aiConstraints = String(payload.aiConstraints || "")
      .trim()
      .slice(0, 2000);
  if (payload.taughtFocus !== undefined)
    assignment.taughtFocus = normalizeTaughtFocus(payload.taughtFocus);
  if (payload.exemplarText !== undefined)
    assignment.exemplarText = String(payload.exemplarText || "")
      .trim()
      .slice(0, 6000);
  // An empty id detaches the pack; an unknown one is refused, never ignored.
  if (payload.sourcePackId !== undefined && sourcePacksEnabled()) {
    assignment.sourcePack =
      (await resolveAssignmentPack({
        schoolId,
        sourcePackId: payload.sourcePackId,
      })) || undefined;
  }
  if (payload.rubric !== undefined && !structure)
    assignment.rubric = normalizeRubricRows(payload.rubric);
  if (structure) {
    assignment.writingType = structure.writingType;
    assignment.sections = structure.sections;
    assignment.rubric = structure.rubric;
  }
  const wantsAudienceChange =
    payload.studentIds !== undefined ||
    payload.classId !== undefined ||
    payload.class !== undefined ||
    payload.audienceMode !== undefined;
  if (wantsAudienceChange) {
    const mode = audienceModeFor(payload);
    const audience = await resolveAudience({
      schoolId,
      classId:
        objectId(payload.classId || payload.class) ||
        (assignment.class ? String(assignment.class) : null),
      studentIds:
        mode === "selected"
          ? payload.studentIds !== undefined
            ? payload.studentIds
            : assignment.students.map((row) => String(row))
          : [],
      academicYear: assignment.academicYear,
      userId,
      isAdmin,
    });
    if (!audience.students.length)
      throw badRequest("No students matched that class.");
    // Removing a student who has already opened this task would hide their
    // drafts and published feedback from them without deleting anything.
    const keep = new Set(audience.students.map((row) => String(row)));
    const leaving = (assignment.students || [])
      .map((row) => String(row))
      .filter((row) => !keep.has(row));
    if (leaving.length) {
      const started = await WritingProject.find({
        school: schoolId,
        assignment: assignment._id,
        student: { $in: leaving },
      })
        .select("student")
        .lean();
      if (started.length) {
        throw conflict(
          "Some students in this task have already started writing. Keep them in the task, or hide the whole task instead.",
        );
      }
    }
    assignment.class = audience.classId || undefined;
    assignment.students = audience.students;
    assignment.audienceMode = mode;
  }
  if (payload.goals !== undefined) {
    const goals = (Array.isArray(payload.goals) ? payload.goals : [])
      .map((row) => ({
        student: objectId(row?.student),
        text: String(row?.text || "")
          .trim()
          .slice(0, 500),
      }))
      .filter((row) => row.student && row.text);
    assertGoalsInAudience(goals, assignment.students);
    assignment.goals = goals;
  }

  await assignment.save();
  return assignment.toObject();
};

// A list row needs a task's name and counts, never its brief or rubric text.
const LIST_COLUMNS = {
  title: 1,
  writingType: 1,
  class: 1,
  audienceMode: 1,
  academicYear: 1,
  dueDate: 1,
  isActive: 1,
  isTemplate: 1,
  createdAt: 1,
  updatedAt: 1,
  assignedBy: 1,
  rubric: 1,
};
const LIST_LIMIT = 200;

export const listAssignments = async ({
  schoolId,
  userId,
  isAdmin = false,
  classId,
  academicYear,
  search = "",
  includeTemplates = false,
  limit = LIST_LIMIT,
} = {}) => {
  const query = { school: schoolId, isTemplate: includeTemplates === true };
  if (!isAdmin) query.assignedBy = userId;
  if (objectId(classId)) query.class = classId;
  if (academicYear) query.academicYear = academicYear;
  if (search) {
    query.title = {
      $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  // Aggregated so the row carries counts instead of every student id and the
  // full section list; `$limit` bounds what one refresh can transfer.
  const rows = await WritingAssignment.aggregate(
    [
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: Math.min(Math.max(Number(limit) || LIST_LIMIT, 1), 500) },
      {
        $addFields: {
          audienceSize: { $size: { $ifNull: ["$students", []] } },
          sectionCount: { $size: { $ifNull: ["$sections", []] } },
        },
      },
      {
        $project: {
          ...LIST_COLUMNS,
          audienceSize: 1,
          sectionCount: 1,
        },
      },
    ],
    { skipTenantFilter: true },
  );

  const counts = rows.length
    ? await WritingProject.aggregate(
        [
          {
            $match: {
              school: new mongoose.Types.ObjectId(String(schoolId)),
              assignment: { $in: rows.map((row) => row._id) },
            },
          },
          {
            $group: {
              _id: { assignment: "$assignment", stage: "$stage" },
              projects: { $sum: 1 },
              drafts: { $sum: "$draftCount" },
            },
          },
        ],
        { skipTenantFilter: true },
      )
    : [];
  const countById = new Map();
  for (const row of counts) {
    const key = String(row._id.assignment);
    const bucket = countById.get(key) || { projects: 0, drafts: 0, stages: {} };
    bucket.projects += row.projects;
    bucket.drafts += row.drafts;
    bucket.stages[row._id.stage] =
      (bucket.stages[row._id.stage] || 0) + row.projects;
    countById.set(key, bucket);
  }

  return rows.map((row) => ({
    ...row,
    totalPoints: (row.rubric || []).reduce(
      (sum, item) => sum + (Number(item.maxScore) || 0),
      0,
    ),
    audienceSize: row.audienceSize || 0,
    sectionCount: row.sectionCount || 0,
    projectCount: countById.get(String(row._id))?.projects || 0,
    draftCount: countById.get(String(row._id))?.drafts || 0,
    stageCounts: countById.get(String(row._id))?.stages || {},
  }));
};

export const getAssignment = async ({ schoolId, assignmentId }) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");
  return {
    ...assignment,
    totalPoints: (assignment.rubric || []).reduce(
      (sum, item) => sum + (Number(item.maxScore) || 0),
      0,
    ),
  };
};

/** The teacher-facing read: same shape, plus the module's creator-or-admin rule. */
export const getAssignmentForTeacher = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
}) => {
  const assignment = await getAssignment({ schoolId, assignmentId });
  assertVisibleToTeacher(assignment, userId, isAdmin);
  return assignment;
};

/**
 * G8: words the teacher set aside on an earlier round sink in this assignment's
 * support lists. Decisions are evidence on the assessment, never a mark.
 */
const setAsideFor = async ({ schoolId, assignment, studentId }) => {
  const rows = await WritingAssessment.find({
    school: schoolId,
    assignment: assignment._id,
    student: studentId,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("wordUseEvidence")
    .lean();
  const words = new Set();
  for (const row of rows) {
    for (const source of ["spelling", "vocabulary"]) {
      for (const item of row.wordUseEvidence?.[source] || []) {
        if (item?.teacherDecision === "rejected" && item.word) {
          words.add(String(item.word));
        }
      }
    }
  }
  return [...words];
};

/**
 * What one student would see for a word-support config a teacher is still
 * editing. Reads only: nothing is saved and no word record changes.
 */
export const previewWordSupport = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  studentId,
  wordSupport,
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");
  assertVisibleToTeacher(assignment, userId, isAdmin);

  const student = objectId(studentId);
  if (
    !student ||
    !(assignment.students || []).some((row) => sameId(row, student))
  ) {
    throw badRequest("Choose a student from this task's audience.");
  }

  const published = await WritingAssessment.find({
    school: schoolId,
    assignment: assignment._id,
    student,
    aiStatus: "done",
    "publish.state": "published",
    "spellingTargets.0": { $exists: true },
  })
    .sort({ createdAt: -1 })
    .select("spellingTargets")
    .lean();

  return resolveWritingWordSupport({
    schoolId,
    studentId: student,
    assignment: {
      ...assignment,
      supports: {
        ...(assignment.supports || {}),
        wordSupport: normalizeWordSupport(wordSupport),
      },
    },
    priorTargets: published[0]?.spellingTargets || [],
    setAside: await setAsideFor({ schoolId, assignment, studentId: student }),
  });
};

/**
 * Hide the task from students without deleting any writing. Same convention as
 * the reading module: results stay reviewable by the teacher.
 */
export const deactivateAssignment = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  confirmed = false,
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  });
  if (!assignment) throw notFound("Writing task not found.");
  assertVisibleToTeacher(assignment, userId, isAdmin);

  // Hiding the task takes every submitted essay and its published feedback out
  // of the children's reach, so the teacher is told first and has to say yes.
  if (!confirmed) {
    const sentWork = await WritingProject.countDocuments({
      school: schoolId,
      assignment: assignment._id,
      latestDraft: { $ne: null },
    });
    if (sentWork > 0) {
      throw Object.assign(
        new Error(
          `${sentWork} ${sentWork === 1 ? "student has" : "students have"} already sent work. If you hide this task, they will no longer be able to open their essay or read your feedback. Confirm to hide it.`,
        ),
        {
          statusCode: 409,
          code: "CONFIRM_DEACTIVATE",
          data: { sentWork },
        },
      );
    }
  }

  assignment.isActive = false;
  await assignment.save();
  return { _id: assignment._id, isActive: false };
};

export const saveAsTemplate = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
}) => {
  const source = await getAssignment({ schoolId, assignmentId });
  assertVisibleToTeacher({ assignedBy: source.assignedBy }, userId, isAdmin);
  const copy = await WritingAssignment.create({
    school: schoolId,
    title: `${source.title} (template)`.slice(0, 200),
    instructions: source.instructions,
    writingType: source.writingType,
    topic: source.topic,
    assignedBy: userId,
    isActive: true,
    isTemplate: true,
    minWords: source.minWords,
    maxWords: source.maxWords,
    expectedLevel: source.expectedLevel,
    sections: source.sections,
    supports: source.supports,
    rubric: source.rubric,
    workflow: source.workflow,
    aiConstraints: source.aiConstraints,
    taughtFocus: source.taughtFocus,
    sourcePack: source.sourcePack,
    exemplarText: source.exemplarText,
  });
  return copy.toObject();
};

/** A template becomes a live task by copying its configuration and choosing a new audience. */
export const instantiateTemplate = async ({
  schoolId,
  templateId,
  userId,
  isAdmin = false,
  academicYear = null,
  payload = {},
}) => {
  const template = await getAssignment({ schoolId, assignmentId: templateId });
  if (template.isTemplate !== true)
    throw badRequest("That task is not a template.");
  return createAssignment({
    schoolId,
    academicYear,
    userId,
    isAdmin,
    payload: {
      ...template,
      ...payload,
      classId: payload.classId || payload.class,
      sections: template.sections,
      rubric: template.rubric,
      supports: template.supports,
      workflow: template.workflow,
      sourcePackId: payload.sourcePackId || template.sourcePack || undefined,
      goals: payload.goals || [],
      isTemplate: false,
    },
  });
};

/* ------------------------------------------------------------------ */
/* Projects, autosave and submissions                                  */
/* ------------------------------------------------------------------ */

/**
 * The word help a student saw is frozen the first time they open or save the
 * task, so a vocabulary list edited mid-draft cannot change what the submitted
 * essay is measured against.
 */
const resolveWordSupportSnapshot = async ({
  schoolId,
  studentId,
  assignment,
  project,
}) => {
  const prior = await WritingAssessment.findOne({
    school: schoolId,
    project: project._id,
    "publish.state": "published",
    "spellingTargets.0": { $exists: true },
  })
    .sort({ createdAt: -1 })
    .select("spellingTargets")
    .lean();
  const draftText = (project.autosave?.sections || [])
    .map((row) => row.text)
    .join("\n");
  return resolveWritingWordSupport({
    schoolId,
    studentId,
    assignment,
    priorTargets: prior?.spellingTargets || [],
    draftText,
    setAside: await setAsideFor({ schoolId, assignment, studentId }),
  });
};

export const ensureProject = async ({
  schoolId,
  assignment,
  studentId,
  classId,
}) => {
  const existing = await WritingProject.findOne({
    school: schoolId,
    assignment: assignment._id,
    student: studentId,
  });
  if (existing) return existing;

  const seeded = buildWorkingSections(assignment);
  const created = await WritingProject.create({
    school: schoolId,
    assignment: assignment._id,
    student: studentId,
    class: classId || assignment.class,
    academicYear: assignment.academicYear,
    stage: "not_started",
    autosave: { title: "", sections: seeded, updatedAt: null },
  });
  return created;
};

/**
 * The student's working copy. Autosave never produces a draft version, so a
 * teacher can always tell the saved-in-progress text apart from a submission.
 */
export const autosaveProject = async ({
  schoolId,
  projectId,
  studentId,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  const project = await WritingProject.findOne({
    school: schoolId,
    _id: id,
    student: studentId,
  });
  if (!project) throw notFound("Writing project not found.");

  if (
    project.stage === "completed" ||
    project.stage === "awaiting_notebook_check"
  ) {
    throw badRequest("This writing task is closed for editing.");
  }

  const sections = (Array.isArray(payload.sections) ? payload.sections : [])
    .map((row, index) => ({
      key: String(row?.key || "").trim(),
      index: Number.isFinite(Number(row?.index)) ? Number(row.index) : index,
      text: String(row?.text || "").slice(0, 30000),
    }))
    .filter((row) => row.key);

  if (!sections.length) throw badRequest("There is nothing to save.");

  project.autosave = {
    title: String(payload.title || "")
      .trim()
      .slice(0, 200),
    sections,
    updatedAt: new Date(),
  };
  project.wordCount = sectionTotalWords(sections);
  project.lastEditedAt = new Date();
  if (project.stage === "not_started") project.stage = "drafting";
  if (project.stage === "feedback_published") project.stage = "revising";
  // Projects created before the snapshot existed freeze it on first save.
  if (!project.wordSupportSnapshot) {
    const assignment = await WritingAssignment.findOne({
      school: schoolId,
      _id: project.assignment,
    }).lean();
    if (assignment) {
      project.wordSupportSnapshot = await resolveWordSupportSnapshot({
        schoolId,
        studentId,
        assignment,
        project,
      });
      project.wordSupportResolvedAt = new Date();
    }
  }
  await project.save();

  return {
    projectId: String(project._id),
    stage: project.stage,
    wordCount: project.wordCount,
    savedAt: project.autosave.updatedAt,
  };
};

/**
 * A paste the browser blocked. Time and draft number come from the server, so
 * the record cannot be backdated; the text is kept so the teacher can see what
 * the student tried to bring in.
 */
const MAX_PASTE_ATTEMPTS = 100;

export const recordPasteAttempt = async ({
  schoolId,
  projectId,
  studentId,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  const project = await WritingProject.findOne({
    school: schoolId,
    _id: id,
    student: studentId,
  }).select("draftCount stage");
  if (!project) throw notFound("Writing project not found.");

  const text = String(payload.text || "").slice(0, 2000);
  const attempt = {
    at: new Date(),
    draftNumber: (Number(project.draftCount) || 0) + 1,
    key: String(payload.key || "")
      .trim()
      .slice(0, 60),
    index: Number.isFinite(Number(payload.index)) ? Number(payload.index) : 0,
    chars: Math.min(Math.max(Number(payload.chars) || text.length, 0), 1000000),
    text,
  };

  await WritingProject.updateOne(
    { school: schoolId, _id: id, student: studentId },
    {
      $push: {
        pasteAttempts: { $each: [attempt], $slice: -MAX_PASTE_ATTEMPTS },
      },
    },
  );
  return { at: attempt.at, draftNumber: attempt.draftNumber };
};

/**
 * Freeze the working copy as the next draft number. Rejected when the structure
 * or length does not meet the assignment, or when the teacher has locked a stage.
 */
export const submitDraft = async ({
  schoolId,
  projectId,
  studentId,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");

  const project = await WritingProject.findOne({
    school: schoolId,
    _id: id,
    student: studentId,
  });
  if (!project) throw notFound("Writing project not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");

  const gate = canStudentSubmit({ project, assignment });
  if (!gate.allowed) throw badRequest(gate.reason);

  const incoming =
    Array.isArray(payload.sections) && payload.sections.length
      ? payload.sections
      : project.autosave?.sections || [];
  const working = incoming.map((row, index) => ({
    key: String(row?.key || "").trim(),
    index: Number.isFinite(Number(row?.index)) ? Number(row.index) : index,
    text: String(row?.text || ""),
  }));

  const check = validateSubmission({ assignment, sections: working });
  if (!check.ok) {
    throw Object.assign(new Error(check.errors[0].message), {
      statusCode: 400,
      errors: check.errors,
    });
  }

  if (!canMoveTo(project, "submitted")) {
    throw badRequest(
      "Your teacher has set this task to a fixed stage. Ask them to unlock it first.",
    );
  }

  // Freeze the words the rail actually showed this student. Re-resolving here
  // would let a spelling or vocabulary change made while they were writing
  // rewrite what the draft was offered. Projects opened before this snapshot
  // existed fall back to resolving once.
  let wordSupport = project.wordSupportSnapshot || null;
  if (!wordSupport) {
    wordSupport = await resolveWordSupportSnapshot({
      schoolId,
      studentId,
      assignment,
      project,
    });
    project.wordSupportSnapshot = wordSupport;
    project.wordSupportResolvedAt = new Date();
  }

  // The counter alone can be stale after a failed submit; the stored drafts are
  // the truth, and a number already taken would be rejected by the unique index.
  // A withdrawn draft gives its number back, so it is not counted here (F13).
  const highest = await WritingDraft.findOne({
    school: schoolId,
    project: project._id,
    withdrawn: { $ne: true },
  })
    .sort({ number: -1 })
    .select("number")
    .lean();
  const number =
    Math.max(
      Number(project.draftCount) || 0,
      Number(highest?.number) || 0,
    ) + 1;
  const draftSections = buildDraftSections({ assignment, sections: working });
  // The lesson facts are frozen with the draft: editing the pack later must not
  // change how already-submitted writing is judged (B7).
  const packSnapshot = await packSnapshotForAssignment({
    schoolId,
    assignment,
  });
  const draft = await WritingDraft.create({
    school: schoolId,
    project: project._id,
    assignment: assignment._id,
    student: studentId,
    number,
    title: String(payload.title || project.autosave?.title || "")
      .trim()
      .slice(0, 200),
    sections: draftSections,
    totalWords: sectionTotalWords(draftSections),
    submittedAt: new Date(),
    submissionSource: "student",
    pasteAttempts: (project.pasteAttempts || [])
      .filter((row) => Number(row.draftNumber) === number)
      .map(({ at, key, index, chars, text }) => ({
        at,
        key,
        index,
        chars,
        text,
      })),
    configSnapshot: {
      ...configSnapshotFor(assignment),
      wordSupport,
      ...(packSnapshot ? { sourcePack: packSnapshot } : {}),
    },
  });

  project.draftCount = number;
  project.latestDraft = draft._id;
  project.stage = stageAfterSubmit();
  project.status = "in_progress";
  // The next revision must start from exactly what was sent, including edits
  // made inside the submit sheet before the autosave timer fired.
  project.autosave = {
    title: draft.title,
    sections: draftSections.map(({ key, index, text }) => ({
      key,
      index,
      text,
    })),
    updatedAt: new Date(),
  };
  project.wordCount = draft.totalWords;
  project.lastEditedAt = new Date();
  await project.save();

  return {
    draft: draft.toObject(),
    project: {
      id: String(project._id),
      stage: project.stage,
      draftCount: project.draftCount,
      wordCount: draft.totalWords,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

const rosterFor = async (assignment) => {
  const ids = (assignment.students || []).map((row) => String(row));
  if (!ids.length) return [];
  const found = await Student.find({
    school: assignment.school,
    _id: { $in: ids },
  })
    .select("firstName lastName studentId currentClass")
    .lean();
  return found;
};

/**
 * Students open a task by assignment id. The project row is created on first
 * open so the workspace has somewhere to autosave.
 */
export const openProject = async ({
  schoolId,
  studentId,
  assignmentId,
  academicYear = null,
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
    isActive: true,
    isTemplate: false,
  });
  if (!assignment) throw notFound("Writing task not found.");
  if (!(assignment.students || []).some((row) => sameId(row, studentId))) {
    throw forbidden("This writing task is not assigned to you.");
  }
  if (
    academicYear &&
    assignment.academicYear &&
    assignment.academicYear !== academicYear
  ) {
    throw notFound("Writing task not found in this academic year.");
  }

  const student = await Student.findOne({ school: schoolId, _id: studentId })
    .select("currentClass")
    .lean();
  const project = await ensureProject({
    schoolId,
    assignment,
    studentId,
    classId: student?.currentClass,
  });
  // The first open freezes the word help; later opens only read it.
  if (!project.wordSupportSnapshot) {
    project.wordSupportSnapshot = await resolveWordSupportSnapshot({
      schoolId,
      studentId,
      assignment,
      project,
    });
    project.wordSupportResolvedAt = new Date();
  }
  if (!project.firstOpenedAt) project.firstOpenedAt = new Date();
  if (project.isModified()) await project.save();
  return getStudentProject({ schoolId, projectId: project._id, studentId });
};

/** Teacher board: every assigned student, whether or not they have opened the task. */
export const getTeacherBoard = async ({
  schoolId,
  assignmentId,
  classId,
  userId,
  isAdmin = false,
}) => {
  const assignment = await getAssignment({ schoolId, assignmentId });
  assertVisibleToTeacher(assignment, userId, isAdmin);
  const filter = { school: schoolId, assignment: assignment._id };
  if (objectId(classId)) filter.class = classId;

  const [projects, roster] = await Promise.all([
    WritingProject.find(filter)
      // The board renders a date and an id; draft text is fetched when a
      // student is opened, never on every board refresh.
      .populate("latestDraft", "number submittedAt")
      .populate(
        "latestAssessment",
        "kind aiStatus publish recommendation totalScore",
      )
      .sort({ updatedAt: -1 })
      .lean(),
    rosterFor(assignment),
  ]);

  const byStudent = new Map(projects.map((row) => [String(row.student), row]));
  const rowFor = ({ studentId, name, code, classId, project }) => {
    const stage = project?.stage || "not_started";
    return {
      studentId,
      name,
      studentIdCode: code,
      classId,
      hasProject: Boolean(project),
      stage,
      stageLabel: STAGE_LABELS[stage] || stage,
      draftCount: project?.draftCount || 0,
      wordCount: project?.wordCount || 0,
      lastEditedAt:
        project?.lastEditedAt || project?.autosave?.updatedAt || null,
      pasteAttempts: (project?.pasteAttempts || []).length,
      submittedAt: project?.latestDraft?.submittedAt || null,
      latestDraftId: project?.latestDraft?._id
        ? String(project.latestDraft._id)
        : "",
      assessmentId: project?.latestAssessment?._id
        ? String(project.latestAssessment._id)
        : "",
      assessmentStatus: project?.latestAssessment?.aiStatus || "",
      published: project?.latestAssessment?.publish?.state === "published",
      recommendation: project?.latestAssessment?.recommendation?.path || "",
      projectId: project?._id ? String(project._id) : "",
      notebook: project?.notebook?.state || "not_requested",
    };
  };

  const rows = roster.map((student) =>
    rowFor({
      studentId: String(student._id),
      name: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      code: student.studentId || "",
      classId: student.currentClass ? String(student.currentClass) : "",
      project: byStudent.get(String(student._id)),
    }),
  );

  const missing = projects.filter(
    (row) => !roster.some((student) => sameId(student._id, row.student)),
  );
  for (const project of missing) {
    rows.push(
      rowFor({
        studentId: String(project.student),
        name: "No longer on the class list",
        code: "",
        classId: project.class ? String(project.class) : "",
        project,
      }),
    );
  }

  return {
    assignment,
    summary: summarizeBoard(rows),
    rows,
  };
};

export const getClassProgress = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
}) => {
  const board = await getTeacherBoard({
    schoolId,
    assignmentId,
    userId,
    isAdmin,
  });
  const grouped = new Map();
  for (const row of board.rows) {
    const key = row.classId || "unassigned";
    if (!grouped.has(key))
      grouped.set(key, {
        classId: key,
        total: 0,
        submitted: 0,
        completed: 0,
        drafts: 0,
      });
    const bucket = grouped.get(key);
    bucket.total += 1;
    bucket.drafts += row.draftCount;
    if (row.draftCount > 0) bucket.submitted += 1;
    if (row.stage === "completed") bucket.completed += 1;
  }
  const classIds = [...grouped.keys()].filter(objectId);
  const classes = classIds.length
    ? await Class.find({ school: schoolId, _id: { $in: classIds } })
        .select("name")
        .lean()
    : [];
  const nameById = new Map(classes.map((row) => [String(row._id), row.name]));
  return {
    assignment: {
      id: String(board.assignment._id),
      title: board.assignment.title,
    },
    classes: [...grouped.values()].map((row) => ({
      ...row,
      name: nameById.get(row.classId) || "Not in a class",
    })),
    summary: board.summary,
  };
};

const publishedForDraft = (assessments, draftId) =>
  (assessments || []).find((assessment) => sameId(assessment.draft, draftId)) ||
  null;

/** What a child may read of a section note: no marks, no teacher-only analysis. */
export const childSections = (sections) =>
  (sections || []).map((row) => ({
    key: row.key,
    index: row.index,
    label: row.label,
    strengths: row.strengths || [],
    improvements: row.improvements || [],
    evidence: row.evidence || "",
    why: row.why || "",
    nextStep: row.nextStep || "",
    mechanics: (row.mechanics || []).map((item) => ({
      original: item.original,
      correction: item.correction,
      // Typed language corrections carry the verified span and reason; legacy
      // two-field pairs stay exactly as they were stored.
      ...(item.category
        ? {
            category: item.category,
            explanation: item.explanation || "",
            ...(Number.isInteger(item.anchor?.start) &&
            Number.isInteger(item.anchor?.end)
              ? { anchor: { start: item.anchor.start, end: item.anchor.end } }
              : {}),
          }
        : {}),
    })),
    // Only the public check state; teacher-only reason codes never leave here.
    ...(row.mechanicsReview?.status
      ? {
          mechanicsReview: {
            version: Number(row.mechanicsReview.version) || 1,
            status: row.mechanicsReview.status,
          },
        }
      : {}),
    ...(row.scaffold?.text
      ? { scaffold: { kind: row.scaffold.kind, text: row.scaffold.text } }
      : {}),
  }));

/**
 * Everything a student may see for one project. Only the published assessment of
 * the current draft is returned, and no unpublished AI output leaves the server.
 */
export const getStudentProject = async ({ schoolId, projectId, studentId }) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing task not found.");

  const project = await WritingProject.findOne({
    school: schoolId,
    _id: id,
    student: studentId,
  })
    .populate("latestDraft")
    .lean();
  if (!project) throw notFound("Writing task not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  if (!assignment || assignment.isActive === false)
    throw notFound("Writing task not found.");

  // A returned submission is not part of the child's history (F13).
  const drafts = await WritingDraft.find({
    school: schoolId,
    project: project._id,
    withdrawn: { $ne: true },
  })
    .select("number title sections totalWords submittedAt pasteAttempts")
    .sort({ number: 1 })
    .lean();

  const assessments = await WritingAssessment.find({
    school: schoolId,
    project: project._id,
    "publish.state": "published",
  })
    .select(
      "draft previousDraft kind sections overall scores tasks spellingTargets spellingWins comparison recommendation publish publishedAt",
    )
    .sort({ createdAt: -1 })
    .lean();

  const published = assessments;
  const marksMode = await writingMarksMode(schoolId);
  const latestPublished =
    publishedForDraft(published, project.latestDraft?._id) ||
    published[0] ||
    null;
  const goal =
    (assignment.goals || []).find((row) => sameId(row.student, studentId))
      ?.text || "";
  const hasAutosave = Boolean(project.autosave?.sections?.length);
  const working = workingSectionsFor({
    autosave: project.autosave,
    draft: project.latestDraft,
    assignment,
  });
  const workingTitle = hasAutosave
    ? project.autosave?.title || ""
    : project.latestDraft?.title || "";

  // Reading the workspace must never rewrite it: the snapshot is frozen when
  // the student opens or first saves, and a vocabulary edit made mid-draft must
  // not change what the submitted essay is measured against.
  const wordSupport =
    project.wordSupportSnapshot ||
    (await resolveWritingWordSupport({
      schoolId,
      studentId,
      assignment,
      priorTargets:
        assessments.find((row) => row.spellingTargets?.length)
          ?.spellingTargets || [],
      draftText: working.map((row) => row.text || "").join("\n"),
      setAside: await setAsideFor({ schoolId, assignment, studentId }),
    }));

  return {
    project: {
      id: String(project._id),
      stage: project.stage,
      status: project.status,
      draftCount: project.draftCount,
      wordCount: project.wordCount,
      notebook: project.notebook?.state || "not_requested",
      autosave: {
        title: workingTitle,
        sections: working,
        savedAt: project.autosave?.updatedAt || null,
      },
      firstOpenedAt: project.firstOpenedAt,
      canSubmit: canStudentSubmit({ project, assignment }),
    },
    assignment: {
      id: String(assignment._id),
      title: assignment.title,
      instructions: assignment.instructions,
      writingType: assignment.writingType,
      topic: assignment.topic,
      dueDate: assignment.dueDate,
      minWords: assignment.minWords,
      maxWords: assignment.maxWords,
      expectedLevel: assignment.expectedLevel,
      goal,
      sections: assignment.sections,
      supports: assignment.supports,
      wordSupport,
      workflow: assignment.workflow,
    },
    drafts: drafts.map((draft) => ({
      id: String(draft._id),
      number: draft.number,
      title: draft.title,
      totalWords: draft.totalWords,
      submittedAt: draft.submittedAt,
      pasteAttempts: draft.pasteAttempts || [],
      sections: draft.sections,
    })),
    feedback: published.map((assessment) => ({
      id: String(assessment._id),
      draftId: String(assessment.draft),
      previousDraftId: assessment.previousDraft
        ? String(assessment.previousDraft)
        : "",
      kind: assessment.kind,
      publishedAt: assessment.publish?.publishedAt,
      sections: childSections(assessment.sections),
      overall: assessment.overall,
      // Levels, not marks: the child reads a verdict per criterion, the same
      // one the family email and the printed sheet show (R7). A criterion the
      // school did not teach this week is not shown at all (A7).
      scores: rubricRows(
        (assessment.scores || []).filter((row) => !row.focusExcluded),
        { marks: marksMode },
      ),
      tasks: assessment.tasks,
      spellingTargets: assessment.spellingTargets,
      spellingWins: assessment.spellingWins,
      comparison: assessment.comparison,
      recommendation: assessment.recommendation,
    })),
    tracker: buildTracker({
      assignment,
      project,
      hasComparison: assessments.some((row) => row.kind === "comparison"),
    }),
    nextAction: studentNextAction({
      project,
      assignment,
      publishedAssessment: latestPublished,
    }),
    marksMode,
  };
};

/** Student feed: one card per live writing task, with the single next action. */
export const getStudentFeed = async ({
  schoolId,
  studentId,
  academicYear = null,
}) => {
  const query = {
    school: schoolId,
    students: studentId,
    isActive: true,
    isTemplate: false,
  };
  if (academicYear) query.academicYear = academicYear;

  const assignments = await WritingAssignment.find(query)
    .sort({ dueDate: 1, createdAt: -1 })
    .lean();
  if (!assignments.length)
    return {
      assignments: [],
      totals: { open: 0, awaitingTeacher: 0, ready: 0, completed: 0 },
    };

  const projects = await WritingProject.find({
    school: schoolId,
    student: studentId,
    assignment: { $in: assignments.map((row) => row._id) },
  }).lean();
  const projectByAssignment = new Map(
    projects.map((row) => [String(row.assignment), row]),
  );

  // The tracker shows a compare step only once a comparison really exists.
  const compared = projects.length
    ? await WritingAssessment.find({
        school: schoolId,
        project: { $in: projects.map((row) => row._id) },
        kind: "comparison",
        "publish.state": "published",
      })
        .select("project")
        .lean()
    : [];
  const hasComparisonByProject = new Set(
    compared.map((row) => String(row.project)),
  );

  const cards = assignments.map((assignment) => {
    const project = projectByAssignment.get(String(assignment._id)) || {
      stage: "not_started",
      draftCount: 0,
      wordCount: 0,
    };
    const action = studentNextAction({
      project,
      assignment,
      publishedAssessment: null,
    });
    return {
      id: String(assignment._id),
      projectId: project._id ? String(project._id) : "",
      tracker: buildTracker({
        assignment,
        project,
        hasComparison: project._id
          ? hasComparisonByProject.has(String(project._id))
          : false,
      }),
      title: assignment.title,
      writingType: assignment.writingType,
      topic: assignment.topic,
      dueDate: assignment.dueDate,
      stage: project.stage,
      status: project.status || "in_progress",
      draftCount: project.draftCount || 0,
      wordCount: project.wordCount || 0,
      minWords: assignment.minWords,
      maxWords: assignment.maxWords,
      nextAction: action,
      notebook: project.notebook?.state || "not_requested",
      lastEditedAt: project.lastEditedAt || null,
      sectionCount: (assignment.sections || []).length,
      totalPoints: (assignment.rubric || []).reduce(
        (sum, item) => sum + (Number(item.maxScore) || 0),
        0,
      ),
    };
  });

  const totals = cards.reduce(
    (acc, card) => {
      if (card.stage === "completed") acc.completed += 1;
      else if (card.stage === "submitted" || card.stage === "feedback_ready")
        acc.awaitingTeacher += 1;
      else if (
        card.stage === "ready_for_notebook" ||
        card.stage === "awaiting_notebook_check"
      )
        acc.ready += 1;
      else acc.open += 1;
      return acc;
    },
    { open: 0, awaitingTeacher: 0, ready: 0, completed: 0 },
  );

  return { assignments: cards, totals };
};

/**
 * The student says the handwritten final copy is in the notebook. This is the
 * only way into the check stage; the teacher still decides when it is complete.
 */
export const markNotebookWritten = async ({
  schoolId,
  projectId,
  studentId,
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  const project = await WritingProject.findOne({
    school: schoolId,
    _id: id,
    student: studentId,
  });
  if (!project) throw notFound("Writing project not found.");

  // The teacher's lock and the stage both have to agree: a stale "requested"
  // mark must never carry a student back into the check stage.
  if (
    project.stage !== "ready_for_notebook" ||
    !canMoveTo(project, "awaiting_notebook_check")
  ) {
    throw badRequest(
      "Your teacher has not said this piece is ready for the notebook yet.",
    );
  }
  project.set("notebook", {
    ...(project.notebook || {}),
    state: "requested",
    requestedAt: new Date(),
  });
  project.stage = "awaiting_notebook_check";
  await project.save();
  return {
    projectId: String(project._id),
    stage: project.stage,
    notebook: "requested",
  };
};

/** Teacher view of one student's whole history, including unpublished assessments. */
export const getProjectHistory = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  const project = await WritingProject.findOne({ school: schoolId, _id: id })
    .populate(
      "student",
      "firstName lastName studentId email studentEmail parentInfo",
    )
    .populate("student.user", "email")
    .lean();
  if (!project) throw notFound("Writing project not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  // Ownership is checked before the heavy reads, and a task that was hard
  // deleted is a 404, not a crash further down.
  if (!assignment)
    throw notFound("The writing task this belongs to no longer exists.");
  assertVisibleToTeacher(assignment, userId, isAdmin);

  const studentId = project.student?._id || project.student;
  const [drafts, allAssessments, profileAssessments, spelling] =
    await Promise.all([
      WritingDraft.find({ school: schoolId, project: project._id })
        .sort({ number: 1 })
        .lean(),
      WritingAssessment.find({ school: schoolId, project: project._id })
        .select("-aiOriginal")
        .sort({ createdAt: -1 })
        .lean(),
      WritingAssessment.find({
        school: schoolId,
        student: studentId,
        aiStatus: "done",
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("draft scores")
        .lean(),
      SpellingAnalysis.findOne({
        school: schoolId,
        student: studentId,
        status: "ready",
      })
        .sort({ updatedAt: -1 })
        .select("grade metrics.attempts metrics.accuracy")
        .lean(),
    ]);

  // F13: a returned submission is not a round. Its draft and any assessment on
  // it stay in the database as the record of what happened, but the review
  // panel must never show them as the work the teacher is marking now.
  const liveDrafts = drafts.filter((draft) => !draft.withdrawn);
  const liveDraftIds = new Set(liveDrafts.map((draft) => String(draft._id)));
  const assessments = allAssessments.filter(
    (row) => !row.draft || liveDraftIds.has(String(row.draft)),
  );

  const studentName =
    `${project.student?.firstName || ""} ${project.student?.lastName || ""}`.trim();

  // L5: the publish panel names every address the family email can reach, and
  // the addresses that stopped it, so no recipient is added silently.
  const contactable = resolveRecipients({
    student: project.student,
    channels: { students: true, parents: true },
  });
  const stopped = await optedOutEmails({
    schoolId,
    emails: [...contactable.studentEmails, ...contactable.parentEmails],
  });
  const emailRecipients = {
    student: contactable.studentEmails.filter((email) => !stopped.has(email)),
    parents: contactable.parentEmails.filter((email) => !stopped.has(email)),
    suppressed: [...contactable.studentEmails, ...contactable.parentEmails].filter(
      (email) => stopped.has(email),
    ),
  };

  return {
    project: {
      ...project,
      id: String(project._id),
      // The ledger is stored with a name slot, like every other AI sentence.
      // D2: a stalled task carries the intervention the teacher should try next.
      revisionLedger: fillStudentTokensDeep(
        (project.revisionLedger || []).map((row) =>
          row?.status === "stalled"
            ? { ...row, suggestion: stallSuggestion(row) }
            : row,
        ),
        studentName,
      ),
      student: {
        id: String(project.student?._id || project.student),
        name: studentName,
        code: project.student?.studentId || "",
      },
    },
    differentiation: buildWritingProfile({
      assessments: profileAssessments,
      spelling,
    }),
    // What the child will see of the rubric, so the teacher preview is not a
    // parallel rendering with different rules (F10, C4).
    marksMode: await writingMarksMode(schoolId),
    emailRecipients,
    assignment,
    drafts: liveDrafts,
    assessments,
    tracker: buildTracker({
      assignment,
      project,
      hasComparison: assessments.some((row) => row.kind === "comparison"),
    }),
  };
};
