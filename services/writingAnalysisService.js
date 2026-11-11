/**
 * Writing Analysis — longitudinal review of one student's submitted writing
 * against the school's standards.
 *
 * The AI supplies evidence per piece only. Selection, counting, level mapping,
 * pattern aggregation and growth direction are deterministic and live in
 * writingAnalysisLogic.js. Nothing here is reachable from a student request.
 */
import crypto from "crypto";
import mongoose from "mongoose";

import Class from "../models/Class.js";
import School from "../models/School.js";
import Standard from "../models/Standard.js";
import Student from "../models/Student.js";
import WritingAnalysis from "../models/WritingAnalysis.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingProject from "../models/WritingProject.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import StandardAssignment from "../models/StandardAssignment.js";

import logger from "../utils/logger.js";
import { connectAi } from "../utils/connectAi.js";
import {
  applyMarkup,
  assertCanSpend,
  costCents,
  creditRates,
  getMarkupPercent,
  markUsageOutcome,
  roundCents,
  tokenCounts,
} from "./aiCreditService.js";
import { getTeacherProfile, isTeacherAuthorizedForClassSubject } from "../helpers/teacherScoping.js";
import { assertProjectVisibleToTeacher } from "./writingAssistantService.js";
import {
  ANALYSIS_LIMITS,
  aggregateAnalysis,
  estimateRun,
  levelForStandard,
  pieceText,
  promptTextFor,
  selectPieces,
} from "./writingAnalysisLogic.js";
import { extractJsonObject } from "./writingAssistantPrompts.js";
import {
  buildPieceEvidencePrompt,
  normalizePieceEvidence,
} from "./writingAnalysisPrompts.js";

const MAX_CONCURRENT_PIECES = 3;
const STALE_RUN_MS = 10 * 60 * 1000;
const MAX_TEACHER_EDITS = 50;

const WRITING_AI = {
  provider: "openai",
  ...(process.env.WRITING_AI_MODEL
    ? { modelName: process.env.WRITING_AI_MODEL }
    : {}),
};

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) =>
  Object.assign(new Error(message), { statusCode: 409 });

const objectId = (value) =>
  mongoose.isValidObjectId(String(value || "")) ? String(value) : null;

/** House pattern for a reversible rollout: read at request time, default on. */
export const analysisEnabled = () =>
  String(process.env.WRITING_ANALYSIS_ENABLED ?? "true").trim().toLowerCase() !==
  "false";

const assertEnabled = () => {
  if (analysisEnabled()) return;
  throw Object.assign(
    new Error("Writing Analysis is switched off. Ask an administrator to enable it."),
    { statusCode: 403, code: "WRITING_ANALYSIS_DISABLED" },
  );
};

const parseWindow = ({ from, to }) => {
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  if (start && Number.isNaN(start.getTime()))
    throw badRequest("The start date is not valid.");
  if (end && Number.isNaN(end.getTime()))
    throw badRequest("The end date is not valid.");
  if (start && end && start.getTime() > end.getTime())
    throw badRequest("The start date must be before the end date.");
  return { from: start, to: end };
};

const teacherIdOf = async (userId) => {
  const teacher = await getTeacherProfile(userId);
  return teacher?._id || null;
};

const assertSubjectAccess = async ({
  userId,
  isAdmin,
  classId,
  subjectId,
}) => {
  if (isAdmin) return;
  const teacherId = await teacherIdOf(userId);
  if (!teacherId) throw forbidden("Only a teacher or an admin can use Writing Analysis.");
  const allowed = await isTeacherAuthorizedForClassSubject(
    teacherId,
    classId,
    subjectId,
  );
  if (!allowed)
    throw forbidden("You are not assigned to teach this subject in this class.");
};

const assertClassAccess = async ({ userId, isAdmin, classId }) => {
  if (isAdmin) return;
  const teacherId = await teacherIdOf(userId);
  if (!teacherId) throw forbidden("Only a teacher or an admin can read this analysis.");
  const classDoc = await Class.findOne({ _id: classId })
    .select("subjects classTeacher")
    .lean();
  if (!classDoc) throw notFound("Class not found.");
  const isClassTeacher =
    String(classDoc.classTeacher || "") === String(teacherId);
  const isSubjectTeacher = (classDoc.subjects || []).some(
    (row) => String(row.teacher || "") === String(teacherId),
  );
  if (!isClassTeacher && !isSubjectTeacher)
    throw forbidden("You do not teach this class.");
};

/* ------------------------------------------------------------------ */
/* Scope resolution                                                    */
/* ------------------------------------------------------------------ */

const resolveStudentName = (student) =>
  [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim();

const resolveLanguage = async (schoolId, requested) => {
  const explicit = String(requested || "").trim().toLowerCase();
  if (explicit === "en" || explicit === "ar") return explicit;
  const school = await School.findOne({ _id: schoolId })
    .select("reportSettings.defaultLanguage")
    .lean();
  return String(school?.reportSettings?.defaultLanguage || "").toLowerCase() ===
    "arabic"
    ? "ar"
    : "en";
};

const subjectsForClass = (classDoc) =>
  (classDoc?.subjects || [])
    .map((row) => ({
      _id: row.subject?._id || row.subject,
      name: String(row.subject?.name || "").trim(),
      teacher: row.teacher,
    }))
    .filter((row) => row._id);

const standardsForSubject = async ({ schoolId, subjectId, gradeLevel }) =>
  Standard.find({
    school: schoolId,
    subject: subjectId,
    gradeLevel: Number(gradeLevel),
    isActive: { $ne: false },
  })
    .select("code name description category gradeLevel")
    .sort({ code: 1 })
    .lean();

const loadPieces = async ({ schoolId, studentId, classId, academicYear, from, to }) => {
  const projectFilter = { school: schoolId, student: studentId, class: classId };
  if (academicYear) projectFilter.academicYear = academicYear;
  const projects = await WritingProject.find(projectFilter)
    .select("assignment student class academicYear")
    .populate({
      path: "assignment",
      select: "title writingType rubric academicYear class",
    })
    .lean();
  const projectIds = projects.map((row) => row._id);
  if (!projectIds.length) return { projects, drafts: [], pieces: [], excluded: [] };

  const drafts = await WritingDraft.find({
    school: schoolId,
    project: { $in: projectIds },
  })
    .select("project number sections totalWords submittedAt submissionSource")
    .lean();

  const { included, excluded } = selectPieces({
    projects,
    drafts,
    from,
    to,
    limits: ANALYSIS_LIMITS,
  });
  return { projects, drafts, pieces: included, excluded };
};

const assignedStandardsFor = async ({ schoolId, classId, subjectId }) => {
  const ids = await StandardAssignment.distinct("standard", {
    school: schoolId,
    class: classId,
    subject: subjectId,
    isActive: true,
  });
  return ids.map(String);
};

const parseDraftIds = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(","))
    .map((row) => String(row).trim())
    .filter(Boolean);

const assertStudentEnrolled = async ({ schoolId, classId, studentId }) => {
  const student = await Student.findOne({
    school: schoolId,
    _id: studentId,
    $or: [{ currentClass: classId }, { enrolledClasses: classId }],
  })
    .select("firstName lastName")
    .lean();
  if (!student) throw notFound("That student is not in this class.");
  return student;
};

/**
 * The shared tail of both entry points: given a validated class and student,
 * resolve the subject, the standards, the eligible pieces and the price.
 */
const buildScope = async ({
  schoolId,
  classDoc,
  student,
  userId,
  isAdmin,
  subjectId = "",
  academicYear = "",
  window,
  language = "",
  standardCount = 0,
  draftIds = [],
}) => {
  const allSubjects = subjectsForClass(classDoc);
  let subjects = allSubjects;
  if (!isAdmin) {
    const teacherId = await teacherIdOf(userId);
    const isClassTeacher =
      String(classDoc.classTeacher || "") === String(teacherId || "");
    if (!isClassTeacher) {
      subjects = allSubjects.filter(
        (row) => String(row.teacher || "") === String(teacherId || ""),
      );
    }
  }
  if (!subjects.length)
    throw forbidden("You are not assigned to a subject in this class.");

  const requested = objectId(subjectId)
    ? subjects.find((row) => String(row._id) === String(subjectId))
    : null;
  if (subjectId && !requested)
    throw badRequest("That subject is not taught in this class by you.");
  const subject = requested || subjects[0];

  const [standards, loaded, assignedStandardIds] = await Promise.all([
    standardsForSubject({
      schoolId,
      subjectId: subject._id,
      gradeLevel: classDoc.grade,
    }),
    loadPieces({
      schoolId,
      studentId: student._id,
      classId: classDoc._id,
      academicYear,
      from: window.from,
      to: window.to,
    }),
    assignedStandardsFor({
      schoolId,
      classId: classDoc._id,
      subjectId: subject._id,
    }),
  ]);

  const chosenCount = Number(standardCount);
  const pricedIds = parseDraftIds(draftIds);
  const pricedPieces = pricedIds.length
    ? loaded.pieces.filter((piece) => pricedIds.includes(String(piece.draft)))
    : loaded.pieces;
  const estimate = await estimateFor({
    pieces: pricedPieces,
    standardCount:
      Number.isInteger(chosenCount) && chosenCount > 0
        ? Math.min(chosenCount, standards.length)
        : Math.min(standards.length, ANALYSIS_LIMITS.defaultStandards),
  });

  const [history, resolvedLanguage] = await Promise.all([
    WritingAnalysis.find({
      school: schoolId,
      student: student._id,
      subject: subject._id,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("status from to summary publish.state createdAt academicYear")
      .lean(),
    resolveLanguage(schoolId, language),
  ]);

  return {
    enabled: analysisEnabled(),
    student: {
      _id: student._id,
      name: resolveStudentName(student),
    },
    class: {
      _id: classDoc._id,
      grade: classDoc.grade,
      academicYear: classDoc.academicYear || academicYear,
    },
    academicYear,
    subjects,
    subject,
    standards,
    assignedStandardIds,
    defaultStandardCount: ANALYSIS_LIMITS.defaultStandards,
    pieceCap: ANALYSIS_LIMITS.maxPieces,
    pieces: loaded.pieces,
    excluded: loaded.excluded,
    window: {
      from: window.from,
      to: window.to,
    },
    estimate,
    language: resolvedLanguage,
    history,
  };
};

const scopeFromProject = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
  ...rest
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");
  await assertProjectVisibleToTeacher({ schoolId, projectId: id, userId, isAdmin });

  const project = await WritingProject.findOne({ school: schoolId, _id: id })
    .select("student class academicYear assignment")
    .populate({ path: "assignment", select: "title writingType class academicYear" })
    .lean();
  if (!project) throw notFound("Writing project not found.");

  const classId = project.class || project.assignment?.class;
  if (!classId) throw badRequest("This writing task has no class attached.");

  const [classDoc, student] = await Promise.all([
    Class.findOne({ school: schoolId, _id: classId })
      .populate({ path: "subjects.subject", select: "name" })
      .select("grade academicYear subjects classTeacher")
      .lean(),
    Student.findOne({ school: schoolId, _id: project.student })
      .select("firstName lastName")
      .lean(),
  ]);
  if (!classDoc) throw notFound("Class not found.");
  if (!student) throw notFound("Student not found.");

  const academicYear =
    project.academicYear ||
    project.assignment?.academicYear ||
    classDoc.academicYear ||
    "";

  return buildScope({ schoolId, classDoc, student, userId, isAdmin, academicYear, ...rest });
};

const scopeFromStudent = async ({
  schoolId,
  classId,
  studentId,
  userId,
  isAdmin = false,
  ...rest
}) => {
  const classObjectId = objectId(classId);
  const studentObjectId = objectId(studentId);
  if (!classObjectId || !studentObjectId)
    throw badRequest("Choose a class and a student.");

  await assertClassAccess({ userId, isAdmin, classId: classObjectId });

  const classDoc = await Class.findOne({
    school: schoolId,
    _id: classObjectId,
  })
    .populate({ path: "subjects.subject", select: "name" })
    .select("grade academicYear subjects classTeacher")
    .lean();
  if (!classDoc) throw notFound("Class not found.");

  const student = await assertStudentEnrolled({
    schoolId,
    classId: classObjectId,
    studentId: studentObjectId,
  });

  return buildScope({
    schoolId,
    classDoc,
    student,
    userId,
    isAdmin,
    academicYear: classDoc.academicYear || "",
    ...rest,
  });
};

/**
 * Two entry points, one payload: a writing project (the board shortcut) or a
 * class + student + subject (the analysis workspace).
 */
export const getAnalysisScope = async ({
  schoolId,
  projectId,
  classId,
  studentId,
  userId,
  isAdmin = false,
  subjectId = "",
  from = "",
  to = "",
  language = "",
  standardCount = 0,
  draftIds = [],
}) => {
  const common = {
    schoolId,
    userId,
    isAdmin,
    subjectId,
    language,
    standardCount,
    draftIds,
    window: parseWindow({ from, to }),
  };
  if (projectId) return scopeFromProject({ ...common, projectId });
  return scopeFromStudent({ ...common, classId, studentId });
};

const estimateFor = async ({ pieces, standardCount }) => {
  const estimate = estimateRun({ pieces, standardCount });
  const rates = creditRates(process.env, WRITING_AI.modelName);
  const providerCostCents = costCents(
    {
      inputTokens: estimate.inputTokens,
      outputTokens: estimate.outputTokens,
      totalTokens: estimate.totalTokens,
    },
    rates,
  );
  const markupPercent = await getMarkupPercent();
  return {
    ...estimate,
    model: rates.model,
    providerCostCents,
    chargedCents: applyMarkup(providerCostCents, markupPercent),
    markupPercent,
  };
};

/* ------------------------------------------------------------------ */
/* Create and run                                                      */
/* ------------------------------------------------------------------ */

const scopeHashOf = ({ student, subject, from, to, standardIds, pieceIds }) =>
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        student: String(student),
        subject: String(subject),
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(to).toISOString() : null,
        standardIds: [...standardIds].map(String).sort(),
        pieceIds: [...pieceIds].map(String).sort(),
      }),
    )
    .digest("hex")
    .slice(0, 40);

export const createAnalysis = async ({
  schoolId,
  projectId,
  classId,
  studentId,
  userId,
  isAdmin = false,
  subjectId = "",
  standardIds = [],
  draftIds,
  from = "",
  to = "",
  language = "",
}) => {
  assertEnabled();
  const scope = await getAnalysisScope({
    schoolId,
    projectId,
    classId,
    studentId,
    userId,
    isAdmin,
    subjectId,
    from,
    to,
    language,
  });

  const availableIds = new Set(scope.standards.map((row) => String(row._id)));
  const chosen = [...new Set((Array.isArray(standardIds) ? standardIds : []).map(String))];
  if (!chosen.length) throw badRequest("Choose at least one standard to analyse.");
  if (chosen.some((id) => !availableIds.has(id)))
    throw badRequest("One of the chosen standards is not part of this subject and grade.");

  let pieces = scope.pieces;
  if (Array.isArray(draftIds)) {
    const wanted = [...new Set(draftIds.map(String))];
    if (!wanted.length) throw badRequest("Choose at least one piece to analyse.");
    const byDraft = new Map(scope.pieces.map((piece) => [String(piece.draft), piece]));
    if (wanted.some((id) => !byDraft.has(id)))
      throw badRequest("One of the chosen pieces is not part of this window.");
    pieces = wanted.map((id) => byDraft.get(id));
  }
  if (!pieces.length) {
    throw badRequest(
      "No submitted piece in this window has enough writing to analyse. Check the excluded list for the reason.",
    );
  }

  const standardRows = scope.standards.filter((row) => chosen.includes(String(row._id)));
  const window = parseWindow({ from, to });

  const duplicate = await WritingAnalysis.findOne({
    school: schoolId,
    student: scope.student._id,
    subject: scope.subject._id,
    status: { $in: ["pending", "running"] },
  })
    .select("_id status")
    .lean();
  if (duplicate)
    throw conflict("An analysis for this student and subject is already running.");

  await assertCanSpend({ schoolId, userId });

  const previous = await WritingAnalysis.findOne({
    school: schoolId,
    student: scope.student._id,
    subject: scope.subject._id,
    isCurrent: true,
  })
    .select("_id")
    .lean();

  const analysis = await WritingAnalysis.create({
    school: schoolId,
    student: scope.student._id,
    class: scope.class._id,
    subject: scope.subject._id,
    academicYear: scope.academicYear,
    language: scope.language,
    from: window.from,
    to: window.to,
    status: "pending",
    runBy: userId,
    modelUsed: WRITING_AI.modelName || "",
    scopeHash: scopeHashOf({
      student: scope.student._id,
      subject: scope.subject._id,
      from: scope.window.from,
      to: scope.window.to,
      standardIds: chosen,
      pieceIds: pieces.map((piece) => piece.draft),
    }),
    standardSnapshot: standardRows.map((row) => ({
      standard: row._id,
      code: row.code || "",
      name: row.name || "",
      description: row.description || "",
      category: row.category || "",
      gradeLevel: row.gradeLevel ?? null,
    })),
    draftSelection: pieces.map((piece) => ({
      draft: piece.draft,
      project: piece.project,
      assignment: piece.assignment,
      title: piece.title,
      writingType: piece.writingType,
      submittedAt: piece.submittedAt,
      totalWords: piece.totalWords,
      truncated: false,
    })),
    excludedPieces: scope.excluded.map((piece) => ({
      draft: piece.draft,
      project: piece.project,
      title: piece.title,
      submittedAt: piece.submittedAt,
      totalWords: piece.totalWords,
      reason: piece.reason,
    })),
    pieceRuns: pieces.map((piece) => ({ draft: piece.draft, aiStatus: "pending" })),
    supersedes: previous?._id || null,
    isCurrent: true,
  });

  return runAnalysis({
    schoolId,
    analysisId: String(analysis._id),
    userId,
  });
};

const setRunFields = (analysisId, draftId, fields) =>
  WritingAnalysis.updateOne(
    { _id: analysisId },
    {
      $set: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          `pieceRuns.$[row].${key}`,
          value,
        ]),
      ),
    },
    { arrayFilters: [{ "row.draft": draftId }] },
  );

const aiOptionsFor = ({ analysis, piece, userId }) => ({
  ...WRITING_AI,
  usage: {
    schoolId: analysis.school,
    userId,
    feature: "writing_analysis",
    billable: true,
    refs: {
      analysis: analysis._id,
      project: piece.project,
      draft: piece.draft,
      student: analysis.student,
    },
  },
});

const rubricForAssignment = async (cache, assignmentId, schoolId) => {
  if (!assignmentId) return [];
  const key = String(assignmentId);
  if (!cache.has(key)) {
    const assignment = await WritingAssignment.findOne({
      school: schoolId,
      _id: assignmentId,
    })
      .select("rubric")
      .lean();
    cache.set(
      key,
      (assignment?.rubric || [])
        .map((row) => row?.label || row?.criterion)
        .filter(Boolean),
    );
  }
  return cache.get(key);
};

const analysePiece = async ({
  analysis,
  piece,
  studentName,
  userId,
  rubricCache,
}) => {
  const draft = await WritingDraft.findOne({
    school: analysis.school,
    _id: piece.draft,
  })
    .select("sections")
    .lean();
  if (!draft) {
    await setRunFields(analysis._id, piece.draft, {
      aiStatus: "failed",
      error: "The submitted draft could not be found.",
    });
    return;
  }

  const fullText = pieceText(draft);
  const capped = promptTextFor(fullText, ANALYSIS_LIMITS.maxCharsPerPiece);
  if (capped.truncated) {
    await WritingAnalysis.updateOne(
      { _id: analysis._id },
      { $set: { "draftSelection.$[row].truncated": true } },
      { arrayFilters: [{ "row.draft": piece.draft }] },
    );
  }

  const standards = (analysis.standardSnapshot || []).map((row) => ({
    standard: row.standard,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
  }));
  const rubric = await rubricForAssignment(
    rubricCache,
    piece.assignment,
    analysis.school,
  );
  const prompt = buildPieceEvidencePrompt({
    text: capped.text,
    standards,
    writingType: piece.writingType,
    rubric,
    language: analysis.language,
    studentName,
  });

  await setRunFields(analysis._id, piece.draft, {
    aiStatus: "running",
    error: "",
  });

  try {
    const reply = await connectAi(
      prompt,
      aiOptionsFor({ analysis, piece, userId }),
    );
    const parsed = extractJsonObject(reply.text);
    const tokens = tokenCounts(reply).totalTokens;
    const cost = roundCents(reply.usage?.providerCostCents || 0);

    if (!parsed) {
      await markUsageOutcome({
        entryId: reply.usage?.entryId,
        outcome: "unusable",
      });
      await setRunFields(analysis._id, piece.draft, {
        aiStatus: "failed",
        error: "The model did not return usable evidence.",
        tokens,
        costCents: cost,
      });
      return;
    }

    const normalized = normalizePieceEvidence({
      parsed,
      text: fullText,
      standards,
      studentName,
      limits: ANALYSIS_LIMITS,
    });
    if (!normalized.ok) {
      await markUsageOutcome({
        entryId: reply.usage?.entryId,
        outcome: "unusable",
      });
      await setRunFields(analysis._id, piece.draft, {
        aiStatus: "unusable",
        error:
          normalized.reason === "quotes_dropped"
            ? "Too many quoted excerpts could not be found in the piece."
            : "The reply named no standard from this run.",
        quotesDropped: normalized.quotesDropped,
        quotesKept: normalized.quotesKept,
        vagueNotes: normalized.vagueNotes,
        tokens,
        costCents: cost,
        evidence: { standards: [], patterns: [] },
      });
      return;
    }

    await setRunFields(analysis._id, piece.draft, {
      aiStatus: "done",
      error: "",
      quotesDropped: normalized.quotesDropped,
      quotesKept: normalized.quotesKept,
      vagueNotes: normalized.vagueNotes,
      tokens,
      costCents: cost,
      evidence: {
        standards: normalized.standards,
        patterns: normalized.patterns,
      },
    });
  } catch (error) {
    await setRunFields(analysis._id, piece.draft, {
      aiStatus: "failed",
      error: String(error?.message || "The analysis call failed.").slice(0, 500),
    });
  }
};

const finalizeAnalysis = async (analysisId) => {
  const fresh = await WritingAnalysis.findById(analysisId).lean();
  if (!fresh) return;
  const pieceResults = (fresh.pieceRuns || []).map((run) => ({
    draft: run.draft,
    aiStatus: run.aiStatus,
    quotesDropped: run.quotesDropped,
    vagueNotes: run.vagueNotes,
    standards: run.evidence?.standards || [],
    patterns: run.evidence?.patterns || [],
  }));
  const aggregated = aggregateAnalysis({
    standardSnapshot: fresh.standardSnapshot,
    pieces: fresh.draftSelection,
    pieceResults,
    limits: ANALYSIS_LIMITS,
  });
  const done = pieceResults.filter((row) => row.aiStatus === "done").length;
  const warnings = pieceResults.filter((row) =>
    ["failed", "unusable"].includes(row.aiStatus),
  ).length;
  const vagueNotes = (fresh.pieceRuns || []).reduce(
    (sum, row) => sum + (Number(row.vagueNotes) || 0),
    0,
  );
  const costCentsTotal = roundCents(
    (fresh.pieceRuns || []).reduce(
      (sum, row) => sum + (Number(row.costCents) || 0),
      0,
    ),
  );
  const status =
    done === 0 ? "failed" : warnings || vagueNotes ? "done_with_warnings" : "done";
  await WritingAnalysis.updateOne(
    { _id: analysisId },
    {
      $set: {
        standards: aggregated.standards,
        patterns: aggregated.patterns,
        growth: aggregated.growth,
        summary: aggregated.summary,
        status,
        aiError:
          status === "failed"
            ? "No piece of writing could be analysed. Retry the run."
            : "",
        costCents: costCentsTotal,
      },
    },
  );
  if (status !== "failed") {
    await WritingAnalysis.updateMany(
      {
        school: fresh.school,
        student: fresh.student,
        subject: fresh.subject,
        _id: { $ne: fresh._id },
        isCurrent: true,
      },
      { $set: { isCurrent: false } },
    );
  }
};

/**
 * Claims a run and returns while the pieces are still being analysed in the
 * background (at most three calls at a time). Only pending/failed pieces are
 * called; a retry keeps every successful piece and never pays for it twice.
 */
export const runAnalysis = async ({
  schoolId,
  analysisId,
  userId,
  onlyFailed = false,
}) => {
  const id = objectId(analysisId);
  if (!id) throw notFound("Analysis not found.");

  if (onlyFailed) {
    const current = await WritingAnalysis.findOne({ school: schoolId, _id: id })
      .select("pieceRuns")
      .lean();
    if (!current) throw notFound("Analysis not found.");
    const retryable = (current.pieceRuns || []).some((run) =>
      ["failed", "unusable"].includes(run.aiStatus),
    );
    if (!retryable)
      throw badRequest("Every piece in this analysis has already been analysed.");
  }

  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const claimFilter = {
    school: schoolId,
    _id: id,
    $or: [
      { status: { $in: ["pending", "failed", "done", "done_with_warnings"] } },
      { status: "running", updatedAt: { $lt: staleBefore } },
    ],
  };
  const analysis = await WritingAnalysis.findOneAndUpdate(
    claimFilter,
    { $set: { status: "running", aiError: "" } },
    { new: true },
  ).lean();
  if (!analysis) {
    const exists = await WritingAnalysis.exists({ school: schoolId, _id: id });
    if (!exists) throw notFound("Analysis not found.");
    throw conflict("This analysis is already running.");
  }

  const runByDraft = new Map(
    (analysis.pieceRuns || []).map((run) => [String(run.draft), run]),
  );
  const pieces = (analysis.draftSelection || []).filter((piece) => {
    const run = runByDraft.get(String(piece.draft));
    if (!run) return true;
    if (onlyFailed) return ["failed", "unusable"].includes(run.aiStatus);
    return ["pending", "failed", "unusable", "running"].includes(run.aiStatus);
  });

  if (!pieces.length) {
    await finalizeAnalysis(analysis._id);
    return WritingAnalysis.findById(analysis._id).lean();
  }

  const work = async () => {
    const student = await Student.findOne({
      school: schoolId,
      _id: analysis.student,
    })
      .select("firstName lastName")
      .lean();
    const studentName = resolveStudentName(student);
    const rubricCache = new Map();
    let cursor = 0;

    const worker = async () => {
      while (cursor < pieces.length) {
        const piece = pieces[cursor];
        cursor += 1;
        await analysePiece({
          analysis,
          piece,
          studentName,
          userId: userId || analysis.runBy,
          rubricCache,
        });
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(MAX_CONCURRENT_PIECES, pieces.length) },
          worker,
        ),
      );
    } finally {
      await finalizeAnalysis(analysis._id);
    }
  };

  void work().catch((error) => {
    logger.error("Writing analysis worker failed", {
      analysisId: String(analysis._id),
      error: error?.message,
    });
  });

  return analysis;
};

/* ------------------------------------------------------------------ */
/* Reads and edits                                                     */
/* ------------------------------------------------------------------ */

const loadVisibleAnalysis = async ({ schoolId, analysisId, userId, isAdmin, subjectLevel = false }) => {
  const id = objectId(analysisId);
  if (!id) throw notFound("Analysis not found.");
  const analysis = await WritingAnalysis.findOne({ school: schoolId, _id: id }).lean();
  if (!analysis) throw notFound("Analysis not found.");
  if (subjectLevel) {
    await assertSubjectAccess({
      userId,
      isAdmin,
      classId: analysis.class,
      subjectId: analysis.subject,
    });
  } else {
    await assertClassAccess({ userId, isAdmin, classId: analysis.class });
  }
  return analysis;
};

export const getAnalysis = async ({ schoolId, analysisId, userId, isAdmin = false }) => {
  const analysis = await loadVisibleAnalysis({
    schoolId,
    analysisId,
    userId,
    isAdmin,
  });
  return {
    ...analysis,
    enabled: analysisEnabled(),
  };
};

export const listAnalyses = async ({
  schoolId,
  studentId,
  classId,
  userId,
  isAdmin = false,
}) => {
  const id = objectId(studentId);
  if (!id) throw badRequest("Choose a student to see their analyses.");
  if (classId) {
    await assertClassAccess({ userId, isAdmin, classId });
  } else {
    const any = await WritingAnalysis.findOne({
      school: schoolId,
      student: id,
    })
      .select("class")
      .lean();
    if (any) await assertClassAccess({ userId, isAdmin, classId: any.class });
    else if (!isAdmin) {
      const teacherId = await teacherIdOf(userId);
      if (!teacherId)
        throw forbidden("Only a teacher or an admin can read these analyses.");
    }
  }
  const rows = await WritingAnalysis.find({ school: schoolId, student: id })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("status from to summary publish.state createdAt academicYear subject class")
    .lean();
  return rows;
};

const recomputeStandard = (result) => {
  const { counts, status, proposedLevel } = levelForStandard({
    rows: result.pieces || [],
  });
  result.counts = counts;
  result.status = status;
  result.proposedLevel = proposedLevel;
};

/**
 * Teacher edits. A level is theirs alone; evidence can be corrected by flipping
 * `opportunity` and, when switching it on, the judgment they saw.
 */
export const updateAnalysis = async ({
  schoolId,
  analysisId,
  userId,
  isAdmin = false,
  edits = {},
}) => {
  assertEnabled();
  const analysis = await loadVisibleAnalysis({
    schoolId,
    analysisId,
    userId,
    isAdmin,
    subjectLevel: true,
  });
  if (analysis.publish?.state === "published")
    throw badRequest("Published analyses are read-only.");

  const levelEdits = Array.isArray(edits.standards) ? edits.standards : [];
  const opportunityEdits = Array.isArray(edits.opportunity)
    ? edits.opportunity
    : [];
  if (!levelEdits.length && !opportunityEdits.length)
    throw badRequest("There is nothing to update.");

  const doc = await WritingAnalysis.findOne({ school: schoolId, _id: analysis._id });
  if (!doc) throw notFound("Analysis not found.");
  let changed = 0;

  for (const edit of levelEdits) {
    const result = (doc.standards || []).find(
      (row) => String(row.standard) === String(edit?.standard || ""),
    );
    if (!result) continue;
    if (edit.teacherLevel === null || edit.teacherLevel === "") {
      result.teacherLevel = null;
      changed += 1;
    } else if (edit.teacherLevel !== undefined) {
      const level = Number(edit.teacherLevel);
      if (!Number.isInteger(level) || level < 0 || level > 4)
        throw badRequest("A teacher level must be a whole number from 0 to 4.");
      result.teacherLevel = level;
      changed += 1;
    }
    if (edit.teacherNote !== undefined) {
      result.teacherNote = String(edit.teacherNote || "").slice(0, 600);
      changed += 1;
    }
  }

  for (const edit of opportunityEdits) {
    const result = (doc.standards || []).find(
      (row) => String(row.standard) === String(edit?.standard || ""),
    );
    const evidence = (result?.pieces || []).find(
      (row) => String(row.draft) === String(edit?.draft || ""),
    );
    if (!result || !evidence) continue;
    if (edit.opportunity === true) {
      if (!["met", "partly", "not_met"].includes(edit.judgment))
        throw badRequest(
          "When a piece showed the standard, record how well it did (met, partly or not met).",
        );
      evidence.opportunity = true;
      evidence.judgment = edit.judgment;
    } else {
      evidence.opportunity = false;
      evidence.judgment = "none";
      evidence.quote = "";
      evidence.note = "";
    }
    evidence.teacherOverridden = true;
    recomputeStandard(result);
    changed += 1;
  }

  if (!changed) throw badRequest("None of the edits matched this analysis.");
  doc.teacherEdits = [
    ...(doc.teacherEdits || []),
    {
      by: userId,
      at: new Date(),
      note: `${levelEdits.length} level edit(s), ${opportunityEdits.length} evidence edit(s).`,
    },
  ].slice(-MAX_TEACHER_EDITS);
  await doc.save();
  return getAnalysis({ schoolId, analysisId: doc._id, userId, isAdmin });
};

/* ------------------------------------------------------------------ */
/* Publish to the standards gradebook                                  */
/* ------------------------------------------------------------------ */

const semesterOf = (date) => (date.getMonth() + 1 >= 8 ? 1 : 2);

const liveStandardChanges = async ({ schoolId, snapshot }) => {
  const ids = (snapshot || []).map((row) => row.standard);
  if (!ids.length) return [];
  const live = await Standard.find({ school: schoolId, _id: { $in: ids } })
    .select("code name description")
    .lean();
  const byId = new Map(live.map((row) => [String(row._id), row]));
  return (snapshot || [])
    .filter((row) => {
      const now = byId.get(String(row.standard));
      if (!now) return true;
      return (
        String(now.code || "") !== String(row.code || "") ||
        String(now.name || "") !== String(row.name || "") ||
        String(now.description || "") !== String(row.description || "")
      );
    })
    .map((row) => ({ standard: row.standard, code: row.code, name: row.name }));
};

/** A placeholder assignment needs a teacher; take the class's own teacher for the subject. */
const teacherForClassSubject = async ({ schoolId, classId, subjectId }) => {
  const classDoc = await Class.findOne({ school: schoolId, _id: classId })
    .select("subjects classTeacher")
    .lean();
  const row = (classDoc?.subjects || []).find(
    (item) => String(item.subject) === String(subjectId) && item.teacher,
  );
  return row?.teacher || classDoc?.classTeacher || null;
};

const ensureManualAssignment = async ({
  schoolId,
  classId,
  subjectId,
  standardId,
  academicYear,
  semester,
  userId,
  teacherId,
}) => {
  const existing = await StandardAssignment.findOne({
    school: schoolId,
    class: classId,
    subject: subjectId,
    standard: standardId,
    isActive: true,
  })
    .select("_id")
    .lean();
  if (existing) return existing._id;
  if (!teacherId)
    throw badRequest(
      "No teacher is assigned to this class and subject, so a gradebook entry cannot be created. Set the grade in the standards gradebook instead.",
    );
  const created = await StandardAssignment.create({
    school: schoolId,
    class: classId,
    subject: subjectId,
    standard: standardId,
    teacher: teacherId,
    title: "Manual Assessment",
    createdBy: userId,
    isActive: true,
    academicYear,
    semester: semester || null,
    practiceConfig: { sessionType: "assessment" },
  });
  return created._id;
};

/**
 * What publishing would do, without writing anything: which standards become
 * which score, which scores already exist and would change, and which standards
 * have no gradebook column yet.
 */
const publishPlanFor = async ({ schoolId, analysis, semester }) => {
  const targets = (analysis.standards || []).filter(
    (row) => row.teacherLevel !== null && row.teacherLevel !== undefined,
  );
  const rows = [];
  for (const target of targets) {
    const entry = await StandardsGradebookEntry.findOne({
      school: schoolId,
      student: analysis.student,
      standard: target.standard,
      class: analysis.class,
      subject: analysis.subject,
      academicYear: analysis.academicYear,
      semester,
    })
      .select("_id manualScore")
      .lean();
    const hasColumn =
      Boolean(entry) ||
      Boolean(
        await StandardAssignment.exists({
          school: schoolId,
          class: analysis.class,
          subject: analysis.subject,
          standard: target.standard,
          isActive: true,
        }),
      );
    rows.push({
      standard: target.standard,
      code: target.code,
      name: target.name,
      teacherLevel: target.teacherLevel,
      entry: entry?._id || null,
      previousManualScore:
        entry?.manualScore !== null && entry?.manualScore !== undefined
          ? entry.manualScore
          : null,
      hasColumn,
    });
  }
  return { rows, semester };
};

const previewShape = (row) => ({
  standard: row.standard,
  code: row.code,
  name: row.name,
  manualScore: row.teacherLevel,
  previousManualScore: row.previousManualScore,
});

export const getPublishPreview = async ({
  schoolId,
  analysisId,
  userId,
  isAdmin = false,
}) => {
  assertEnabled();
  const analysis = await loadVisibleAnalysis({
    schoolId,
    analysisId,
    userId,
    isAdmin,
    subjectLevel: true,
  });
  if (analysis.publish?.state === "published")
    throw badRequest("This analysis has already been published.");

  const plan = await publishPlanFor({
    schoolId,
    analysis,
    semester: semesterOf(new Date()),
  });
  const replace = plan.rows.filter(
    (row) =>
      row.previousManualScore !== null &&
      Number(row.previousManualScore) !== Number(row.teacherLevel),
  );
  const missingColumns = plan.rows.filter(
    (row) => !row.hasColumn && row.previousManualScore === null,
  );
  return {
    targets: plan.rows.length,
    ready: plan.rows.length - missingColumns.length,
    replace: replace.map(previewShape),
    missingColumns: missingColumns.map(previewShape),
  };
};

export const publishAnalysis = async ({
  schoolId,
  analysisId,
  userId,
  isAdmin = false,
  confirmOverwrite = false,
  createMissingColumns = false,
}) => {
  assertEnabled();
  const analysis = await loadVisibleAnalysis({
    schoolId,
    analysisId,
    userId,
    isAdmin,
    subjectLevel: true,
  });
  if (analysis.publish?.state === "published")
    throw badRequest("This analysis has already been published.");
  if (!["done", "done_with_warnings"].includes(analysis.status))
    throw badRequest("Run the analysis before publishing grades.");

  const semester = semesterOf(new Date());
  const plan = await publishPlanFor({ schoolId, analysis, semester });
  if (!plan.rows.length)
    throw badRequest("Set a teacher level for at least one standard before publishing.");

  const conflicts = plan.rows
    .filter(
      (row) =>
        row.previousManualScore !== null &&
        Number(row.previousManualScore) !== Number(row.teacherLevel),
    )
    .map((row) => ({
      standard: row.standard,
      code: row.code,
      name: row.name,
      previousManualScore: row.previousManualScore,
      manualScore: row.teacherLevel,
    }));
  if (conflicts.length && !confirmOverwrite)
    throw Object.assign(
      new Error(
        "Some standards already have a different manual score in this gradebook. Confirm to replace them.",
      ),
      { statusCode: 409, code: "MANUAL_SCORE_CONFLICT", conflicts },
    );

  const grades = [];
  const skipped = [];
  const manualTeacher = await teacherForClassSubject({
    schoolId,
    classId: analysis.class,
    subjectId: analysis.subject,
  });
  for (const target of plan.rows) {
    // A new gradebook column is never created silently; the teacher opts in
    // after the preview lists the standards that would need one.
    if (!target.hasColumn && !createMissingColumns) {
      skipped.push({ standard: target.standard, code: target.code, name: target.name });
      continue;
    }
    const filter = {
      school: schoolId,
      student: analysis.student,
      standard: target.standard,
      class: analysis.class,
      subject: analysis.subject,
      academicYear: analysis.academicYear,
      semester,
    };
    let entry = await StandardsGradebookEntry.findOne(filter);
    const previousManualScore =
      entry?.manualScore !== null && entry?.manualScore !== undefined
        ? entry.manualScore
        : null;

    if (!entry) {
      const assignmentId = await ensureManualAssignment({
        schoolId,
        classId: analysis.class,
        subjectId: analysis.subject,
        standardId: target.standard,
        academicYear: analysis.academicYear,
        semester,
        userId,
        teacherId: manualTeacher,
      });
      entry = await StandardsGradebookEntry.create({
        school: schoolId,
        assignment: assignmentId,
        student: analysis.student,
        standard: target.standard,
        class: analysis.class,
        subject: analysis.subject,
        academicYear: analysis.academicYear,
        semester,
        status: "released",
        manualScore: target.teacherLevel,
        isManualEntry: true,
        manualEnteredBy: userId,
        manualEnteredAt: new Date(),
        effectiveScore: target.teacherLevel,
      });
    } else {
      entry.manualScore = target.teacherLevel;
      entry.isManualEntry = true;
      entry.manualEnteredBy = userId;
      entry.manualEnteredAt = new Date();
      entry.effectiveScore = target.teacherLevel;
      await entry.save();
    }
    grades.push({
      standard: target.standard,
      manualScore: target.teacherLevel,
      previousManualScore,
      entry: entry._id,
    });
  }

  if (!grades.length)
    throw Object.assign(
      new Error(
        "These standards have no column in the standards gradebook yet. Choose to create the columns, or assign the standards first.",
      ),
      { statusCode: 409, code: "NO_GRADEBOOK_COLUMNS", skipped },
    );

  await WritingAnalysis.updateOne(
    { school: schoolId, _id: analysis._id },
    {
      $set: {
        "publish.state": "published",
        "publish.by": userId,
        "publish.at": new Date(),
        "publish.grades": grades,
      },
    },
  );

  const changed = await liveStandardChanges({
    schoolId,
    snapshot: analysis.standardSnapshot,
  });
  return {
    analysis: await getAnalysis({ schoolId, analysisId: analysis._id, userId, isAdmin }),
    grades,
    skipped,
    changedStandards: changed,
  };
};
