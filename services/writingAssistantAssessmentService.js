/**
 * Writing Assistant — teacher-triggered assessment (Phase 2).
 *
 * This is the only writing file that reaches the AI. No student route imports it,
 * and no student handler may call it; see tests/writingAssistantAiBoundary.test.js.
 */
import mongoose from "mongoose";

import WritingAssignment from "../models/WritingAssignment.js";
import WritingProject from "../models/WritingProject.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import SpellingAnalysis from "../models/SpellingAnalysis.js";
import SpellingRetestItem from "../models/SpellingRetestItem.js";
import Student from "../models/Student.js";
import School from "../models/School.js";

import {
  NOTEBOOK_STATES,
  WRITING_STAGES,
} from "../constants/writingPresets.js";
import { connectAi } from "../utils/connectAi.js";
import logger from "../utils/logger.js";
import {
  cleanGeneratedString,
  correctivePrompt,
  fillStudentTokensDeep,
  sanitizeGeneratedFields,
  toPlain,
} from "./aiPromptSafety.js";
import { plainJsonIssue } from "../utils/plainJson.js";
import {
  analyzeWordUse,
  applyWordUseDecisions,
} from "./writingWordSupportService.js";
import {
  buildComparisonPrompt,
  buildFeedbackPrompt,
  buildNoteRewritePrompt,
  decideRecommendation,
  extractJsonObject,
  normalizeComparison,
  normalizeFeedback,
} from "./writingAssistantPrompts.js";
import {
  PUBLISHABLE_FROM,
  applyFocusBudget,
  buildWritingProfile,
  canMoveTo,
  configSnapshotFor,
  mergeRevisionLedger,
  staleRunCutoff,
  stalledTasksFrom,
  stageAfterAssessment,
  stageAfterPublish,
  statusAfterPublish,
  tasksFromPriorities,
  verifiedSpellingWins,
} from "./writingAssistantLogic.js";
import {
  notifyFeedbackPublished,
  recordEmailDelivery,
} from "./writingFeedbackEmailService.js";
import {
  costCents,
  isCreditError,
  markUsageOutcome,
  tokenCounts,
} from "./aiCreditService.js";
import {
  assertWritingCredit,
  noteWritingFailure,
} from "./writingFailureAlertService.js";
import { graduatedWords } from "./writingRevisionIntelligence.js";
import {
  AI_FAILURE_MESSAGES,
  aiFailureCodeOf,
} from "./aiFailureCodes.js";
import {
  computeDraftMetrics,
  metricsSummaryForStorage,
  scrubCountClaimsDeep,
} from "./writingDraftMetrics.js";
import { draftPrecheck } from "./writingDraftPrecheck.js";
import { guardScores } from "./writingScoreGuards.js";
import { isRepeatedInstruction } from "../client/src/utils/writingTextMatch.js";
import { publishBlockers } from "../client/src/utils/writingPublishCheck.js";
import {
  canonicalSectionText,
  validateCorrection,
  validateMechanicsEdit,
} from "../client/src/utils/writingMechanics.js";
import {
  readabilityVerdict,
  simplifyFeedbackFields,
} from "./writingFeedbackReadability.js";
import {
  packCoverage,
  packSnapshotForAssignment,
  sourcePacksEnabled,
} from "./writingSourcePackService.js";
import {
  WRITING_PROMPT_VERSIONS,
  WRITING_SCHEMA_VERSION,
} from "./writingPromptVersions.js";

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });
const conflict = (message) =>
  Object.assign(new Error(message), { statusCode: 409 });
// 422 keeps the actionable message visible: the error handler masks every 5xx detail.
const upstream = (message) =>
  Object.assign(new Error(message), { statusCode: 422 });

// A failed run stores a code plus a teacher-facing sentence. The exception text
// itself is logged, never stored or rendered: it can name a model, a library or
// a file path, and aiError reaches the review panel verbatim.

const objectId = (value) => {
  if (!mongoose.isValidObjectId(String(value || ""))) return null;
  return String(value);
};

const sameId = (a, b) => String(a || "") === String(b || "");

const IN_FLIGHT = ["pending", "running"];

const text = (value, max) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
/**
 * Teacher wording reaches a child too, so it is held to the same content rules
 * as the model's. A phrase the rules can remove is removed; anything else is
 * refused with the words that caused it, so the teacher knows what to change.
 */
const editedText = (value, max) => {
  const { text: cleaned, problems } = cleanGeneratedString(text(value, max));
  if (!problems.length) return cleaned;
  const terms = problems
    .map((problem) => problem.split(":").slice(1).join(":"))
    .filter(Boolean);
  throw badRequest(
    terms.length
      ? `This wording cannot be sent to a child. Please remove: ${terms.join(", ")}.`
      : "This wording cannot be sent to a child. Please reword it and save again.",
  );
};
const editedList = (value, maxItems, maxLength) =>
  (Array.isArray(value) ? value : [])
    .map((item) => editedText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
const MECHANICS_EDIT_MESSAGES = {
  WRITING_MECHANICS_INVALID:
    "A language correction is incomplete. Choose a category, the exact words from the draft, a fix and a short reason.",
  WRITING_MECHANICS_ANCHOR_MISMATCH:
    "A language correction no longer matches the submitted draft. Select the exact words again.",
  WRITING_MECHANICS_LIMIT:
    "A part can hold at most 12 language corrections. Remove some before saving.",
};

const mechanicsError = (code, path, index = -1) =>
  Object.assign(
    new Error(
      MECHANICS_EDIT_MESSAGES[code] ||
        MECHANICS_EDIT_MESSAGES.WRITING_MECHANICS_INVALID,
    ),
    {
      statusCode: 400,
      code,
      details: [{ path: index >= 0 ? `${path}[${index}]` : path, code }],
    },
  );

const REWORD_MESSAGE =
  "This wording cannot be sent to a child. Please reword it and save again.";

/** Teacher wording reaches a child too; flagged phrases refuse the whole save. */
const safeMechanicsValue = (value) => {
  const { text: cleaned, problems } = cleanGeneratedString(String(value ?? ""));
  if (!problems.length) return cleaned;
  const terms = problems
    .map((problem) => problem.split(":").slice(1).join(":"))
    .filter(Boolean);
  throw badRequest(
    terms.length
      ? `This wording cannot be sent to a child. Please remove: ${terms.join(", ")}.`
      : REWORD_MESSAGE,
  );
};

/**
 * One part's submitted corrections, validated against the assessed draft text
 * before anything mutates. Typed rows carry the full contract; legacy pairs
 * survive unchanged. Cleaning may shorten a fix, so typed rows are re-checked
 * and a stripped-to-empty replacement is refused, never turned into a delete.
 */
const mechanicsEditRows = (rows, sectionText, path) => {
  const checked = validateMechanicsEdit(rows, sectionText);
  if (!checked.ok) throw mechanicsError(checked.code, path, checked.index);
  return checked.rows.map((row, index) => {
    if (!row.category) {
      const original = safeMechanicsValue(row.original);
      const correction = safeMechanicsValue(row.correction);
      if (!original || !correction) throw badRequest(REWORD_MESSAGE);
      return { original, correction };
    }
    const correction = safeMechanicsValue(row.correction);
    const explanation = safeMechanicsValue(row.explanation);
    if (row.correction && !correction) throw badRequest(REWORD_MESSAGE);
    const rechecked = validateCorrection(sectionText, {
      ...row,
      correction,
      explanation,
    });
    if (!rechecked.ok) throw mechanicsError(rechecked.code, path, index);
    return rechecked.value;
  });
};
const score = (value, maxScore) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, Number(maxScore) || 0);
};

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

const assertOwner = (assignment, userId, isAdmin) => {
  if (isAdmin || sameId(assignment?.assignedBy, userId)) return;
  throw forbidden(
    "Only the teacher who created this writing task or a school admin can review it.",
  );
};

const resolveLanguage = async ({ schoolId, requestedLanguage }) => {
  const explicit = String(requestedLanguage || "")
    .trim()
    .toLowerCase();
  if (explicit === "ar" || explicit === "en") return explicit;

  const school = await School.findOne({ _id: schoolId })
    .select("reportSettings.defaultLanguage")
    .lean();
  const schoolLanguage = String(school?.reportSettings?.defaultLanguage || "")
    .trim()
    .toLowerCase();
  return schoolLanguage === "arabic" ? "ar" : "en";
};

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

/**
 * Spelling words the student actually saw on the previous draft: only published
 * suggestions count, because a win must be a word the student was given.
 * Spelling records are read, never written, from this module.
 */
const loadPriorSpellingTargets = async ({ schoolId, draft }) => {
  if (Number(draft?.number) < 2) return [];
  const previousDraft = await WritingDraft.findOne({
    school: schoolId,
    project: draft.project,
    number: Number(draft.number) - 1,
    withdrawn: { $ne: true },
  })
    .select("_id")
    .lean();
  if (!previousDraft) return [];
  const previous = await WritingAssessment.findOne({
    school: schoolId,
    draft: previousDraft._id,
    aiStatus: "done",
    "publish.state": "published",
    "spellingTargets.0": { $exists: true },
  })
    .sort({ createdAt: -1 })
    .select("spellingTargets")
    .lean();
  return previous?.spellingTargets || [];
};

const draftTextOf = (draft) =>
  (draft?.sections || []).map((section) => section?.text || "").join(" ");

/**
 * Classmates' names, so a draft that says "my friend Mohammed" does not send
 * Mohammed to the provider. Names only, and never the student's own.
 */
const loadRoster = async ({ schoolId, assignment, studentId }) => {
  const selected =
    assignment?.audienceMode === "selected" && (assignment.students || []).length
      ? { _id: { $in: assignment.students } }
      : assignment?.class
        ? {
            $or: [
              { currentClass: assignment.class },
              { enrolledClasses: assignment.class },
            ],
          }
        : null;
  if (!selected) return [];
  const rows = await Student.find({ school: schoolId, ...selected })
    .select("firstName lastName")
    .lean();
  return rows
    .filter((row) => !sameId(row._id, studentId))
    .map((row) => `${row.firstName || ""} ${row.lastName || ""}`.trim())
    .filter(Boolean);
};

const loadDraftContext = async ({ schoolId, draftId }) => {
  const id = objectId(draftId);
  if (!id) throw notFound("Draft not found.");

  const draft = await WritingDraft.findOne({ school: schoolId, _id: id });
  if (!draft) throw notFound("Draft not found.");

  const [
    project,
    assignment,
    student,
    recentAssessments,
    spelling,
    spellingItems,
  ] = await Promise.all([
    WritingProject.findOne({ school: schoolId, _id: draft.project }),
    WritingAssignment.findOne({
      school: schoolId,
      _id: draft.assignment,
    }).lean(),
    Student.findOne({ school: schoolId, _id: draft.student })
      .select("firstName lastName")
      .lean(),
    // Enough marked drafts to see the student's current need, not the whole
    // history. Wins and publish state let recovered spellings graduate (G6).
    WritingAssessment.find({
      school: schoolId,
      student: draft.student,
      aiStatus: "done",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("draft scores spellingWins publish")
      .lean(),
    SpellingAnalysis.findOne({
      school: schoolId,
      student: draft.student,
      status: "ready",
    })
      .sort({ updatedAt: -1 })
      .select("grade metrics.attempts metrics.accuracy")
      .lean(),
    SpellingRetestItem.find({
      school: schoolId,
      student: draft.student,
    })
      .sort({ flaggedAt: -1 })
      .limit(40)
      .select("wordSnapshot grade week")
      .lean(),
  ]);

  if (!project) throw notFound("Writing project not found.");
  if (!assignment) throw notFound("Writing task not found.");

  const priorSpellingTargets = await loadPriorSpellingTargets({
    schoolId,
    draft,
  });
  // The submitted draft carries the words the student was actually offered.
  // A draft that predates a snapshot gets no word evidence rather than
  // evidence measured against today's word lists.
  const wordSupport = draft.configSnapshot?.wordSupport || null;
  const roster = await loadRoster({
    schoolId,
    assignment,
    studentId: draft.student,
  });

  return {
    draft,
    project,
    assignment,
    studentName:
      `${student?.firstName || ""} ${student?.lastName || ""}`.trim(),
    roster,
    goal:
      (assignment.goals || []).find((row) => sameId(row.student, draft.student))
        ?.text || "",
    profile: buildWritingProfile({ assessments: recentAssessments, spelling }),
    // A missed word used correctly in the last two published drafts is no
    // longer fragile, so it is never offered as a target again (G6).
    graduatedSpellingWords: graduatedWords(recentAssessments),
    spellingCandidates: spellingItems.map((row) => ({
      word: row.wordSnapshot,
      grade: row.grade,
      week: row.week,
    })),
    priorSpellingTargets,
    wordSupport,
  };
};

/** The draft before this one and the feedback it got; both null for a first draft. */
const loadPreviousRound = async ({ schoolId, project, draft }) => {
  if (Number(draft.number) < 2)
    return { previousDraft: null, previousAssessment: null };
  const previousDraft = await WritingDraft.findOne({
    school: schoolId,
    project: project._id,
    number: Number(draft.number) - 1,
    withdrawn: { $ne: true },
  });
  // D10: a comparison is only meaningful inside one project, which is one
  // assignment for one student in one academic year. Anything else is a gap
  // the panel must not bridge.
  if (
    !previousDraft ||
    !sameId(previousDraft.assignment, draft.assignment) ||
    !sameId(previousDraft.project, draft.project)
  )
    return { previousDraft: null, previousAssessment: null };
  const previousAssessment = await WritingAssessment.findOne({
    school: schoolId,
    draft: previousDraft._id,
    kind: "feedback",
    aiStatus: "done",
  })
    .sort({ createdAt: -1 })
    .lean();
  return { previousDraft, previousAssessment };
};

/** Feedback on a revision carries its own comparison, so it ends the round like one. */
const roundKind = (assessment) =>
  assessment.previousDraft ? "comparison" : assessment.kind;

const snapshotFor = (draft, assignment) =>
  draft?.configSnapshot && Object.keys(draft.configSnapshot).length
    ? draft.configSnapshot
    : configSnapshotFor(assignment);

/**
 * The lesson facts this run is judged against, with the draft's own coverage of
 * them (B1/B2). The submitted draft's snapshot wins so the feedback matches what
 * the student saw; a draft from before snapshots existed falls back to the pack
 * as it stands today. Flag off means no facts enter a prompt or a guard.
 */
const packFor = async ({ schoolId, snapshot, assignment, draft }) => {
  if (!sourcePacksEnabled()) return null;
  const stored = snapshot?.sourcePack;
  const pack = (stored?.facts || []).length
    ? stored
    : await packSnapshotForAssignment({ schoolId, assignment });
  if (!pack?.facts?.length) return null;
  return {
    title: pack.title,
    version: pack.version,
    coverage: packCoverage({ facts: pack.facts, draft }),
  };
};

/** C3/A9: mechanical clamps on the model's marks, recorded on the assessment. */
const applyScoreGuards = (normalized, { snapshot, metrics, pack }) => {
  const guarded = guardScores({
    sections: normalized.sections,
    scores: normalized.scores,
    snapshot,
    metrics,
    packCoverage: pack?.coverage || null,
  });
  normalized.sections = guarded.sections;
  normalized.scores = guarded.scores;
  normalized.totalScore = guarded.scores.reduce(
    (sum, row) => sum + (row.focusExcluded ? 0 : Number(row.score) || 0),
    0,
  );
  return guarded.adjustments;
};

/**
 * A10: a draft the text itself disqualifies is answered without a run. No
 * assessment is claimed, no credit is spent, and the teacher gets guidance.
 */
const precheckOf = (context) =>
  draftPrecheck({
    assignment: context.assignment,
    draft: context.draft,
    metrics: computeDraftMetrics({
      draft: context.draft,
      spellingCandidates: context.spellingCandidates,
    }),
  });

/* ------------------------------------------------------------------ */
/* Claim / retry                                                       */
/* ------------------------------------------------------------------ */

const isDuplicateKey = (error) => Number(error?.code) === 11000;

/**
 * Feedback and the project's stage are one change to the student, so their two
 * writes commit together on a live connection. The test harness runs without a
 * connection; there the writes run directly, in the same order.
 */
const withTransaction = async (work) => {
  if (mongoose.connection.readyState !== 1) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const saveInSession = (doc, session) =>
  session ? doc.save({ session }) : doc.save();

const HEARTBEAT_MS = 60_000;
const runFilter = (assessment) => ({
  _id: assessment._id,
  aiStatus: "running",
  attempts: Number(assessment.attempts) || 1,
});

/**
 * A run can take up to two provider timeouts (240 s), while the stale-run
 * cutoff is shorter than that plus headroom. Touching `updatedAt` while the
 * model is thinking keeps a live run from being mistaken for a dead one.
 * Timers are only armed on a live connection: the test harness has none.
 */
const startRunHeartbeat = (assessment) => {
  if (mongoose.connection.readyState !== 1) return () => {};
  const timer = setInterval(() => {
    WritingAssessment.updateOne(runFilter(assessment), {
      $set: { updatedAt: new Date() },
    }).catch((error) =>
      logger.warn("writing_run_heartbeat_failed", { message: error?.message }),
    );
  }, HEARTBEAT_MS);
  if (typeof timer.unref === "function") timer.unref();
  return () => clearInterval(timer);
};

/**
 * The finished reply is written only by the attempt that still owns the row.
 * If another run replaced it, this one's result is dropped rather than
 * overwriting newer feedback (and billing a second time).
 */
const saveFinishedRun = async ({ assessment, session }) => {
  const plain =
    typeof assessment.toObject === "function"
      ? assessment.toObject()
      : { ...assessment };
  const fields = { ...plain };
  for (const key of ["_id", "id", "__v", "createdAt", "updatedAt"]) {
    delete fields[key];
  }
  const result = await WritingAssessment.updateOne(
    runFilter(assessment),
    { $set: fields },
    session ? { session } : {},
  );
  if (Number(result?.matchedCount) === 0) {
    throw conflict(
      "This draft was assessed by another run. Reload the student and check the result.",
    );
  }
};

/**
 * A run whose request was cut short (server restart, killed process) leaves a
 * row in flight forever, and the in-flight row blocks every later attempt. Once
 * the AI timeouts have long passed, such a run is failed so it can be retried.
 */
const releaseStaleRuns = async ({ schoolId, draft, kind }) => {
  await WritingAssessment.updateOne(
    {
      school: schoolId,
      draft: draft._id,
      kind,
      aiStatus: { $in: IN_FLIGHT },
      updatedAt: { $lt: staleRunCutoff() },
    },
    {
      $set: {
        aiStatus: "failed",
        aiErrorCode: "INTERNAL",
        aiError: "The previous run did not finish. Try again.",
        ranAt: new Date(),
      },
    },
  );
};

/**
 * One assessment per draft per kind may be in flight. A failed attempt is reused
 * so a retry never leaves two competing rows; a finished one is never overwritten.
 */
const promptVersionForKind = (kind) =>
  kind === "comparison"
    ? WRITING_PROMPT_VERSIONS.comparison
    : WRITING_PROMPT_VERSIONS.feedback;

const claimAssessment = async ({
  schoolId,
  project,
  draft,
  kind,
  previousDraft,
  userId,
  language = "en",
  force = false,
}) => {
  await releaseStaleRuns({ schoolId, draft, kind });

  // A finished run is expensive and already visible to the teacher. Re-running
  // it spends credit again, so the caller has to say so explicitly.
  if (!force) {
    const finished = await WritingAssessment.findOne({
      school: schoolId,
      draft: draft._id,
      kind,
      aiStatus: "done",
    })
      .select("_id")
      .lean();
    if (finished) {
      throw conflict(
        "This draft has already been assessed. Ask to assess it again if you want a fresh result.",
      );
    }
  }

  const inFlight = await WritingAssessment.findOne({
    school: schoolId,
    draft: draft._id,
    kind,
    aiStatus: { $in: IN_FLIGHT },
  })
    .select("_id")
    .lean();
  if (inFlight) {
    throw conflict(
      "This draft is already being assessed. Wait for that to finish.",
    );
  }

  const failed = await WritingAssessment.findOne({
    school: schoolId,
    draft: draft._id,
    kind,
    aiStatus: "failed",
  }).sort({ createdAt: -1 });

  if (failed) {
    const claimed = await WritingAssessment.findOneAndUpdate(
      { _id: failed._id, aiStatus: "failed" },
      {
        $set: {
          aiStatus: "running",
          aiErrorCode: "",
          aiError: "",
          language,
          requestedBy: userId,
          // A failed row keeps the version it ran under, so failures are
          // countable by prompt version in the report.
          promptVersion: promptVersionForKind(kind),
          schemaVersion: WRITING_SCHEMA_VERSION,
          ...(previousDraft?._id ? { previousDraft: previousDraft._id } : {}),
        },
        $inc: { attempts: 1 },
      },
      { new: true },
    );
    if (!claimed) {
      throw conflict(
        "This draft is already being assessed. Wait for that to finish.",
      );
    }
    return claimed;
  }

  try {
    return await WritingAssessment.create({
      school: schoolId,
      project: project._id,
      assignment: draft.assignment,
      student: draft.student,
      draft: draft._id,
      previousDraft: previousDraft?._id,
      kind,
      language,
      aiStatus: "running",
      attempts: 1,
      requestedBy: userId,
      promptVersion: promptVersionForKind(kind),
      schemaVersion: WRITING_SCHEMA_VERSION,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw conflict(
        "This draft is already being assessed. Wait for that to finish.",
      );
    }
    throw error;
  }
};

const failAssessment = async (assessment, error) => {
  const aiErrorCode = aiFailureCodeOf(error);
  const message = AI_FAILURE_MESSAGES[aiErrorCode];
  const detail = text(error?.message || "", 500);
  assessment.aiStatus = "failed";
  assessment.aiError = message;
  assessment.aiErrorCode = aiErrorCode;
  assessment.ranAt = new Date();
  // Never mark a row that another run has since claimed.
  await WritingAssessment.updateOne(runFilter(assessment), {
    $set: {
      aiStatus: "failed",
      aiError: message,
      aiErrorCode,
      ranAt: assessment.ranAt,
    },
  });
  logger.warn("Writing assessment failed", {
    assessmentId: String(assessment._id),
    draft: String(assessment.draft),
    kind: assessment.kind,
    promptVersion: assessment.promptVersion || "",
    code: aiErrorCode,
    message: detail,
  });
  logRun({
    feature: `writing_${assessment.kind || "feedback"}`,
    promptVersion: assessment.promptVersion || "",
    outcome: "failed",
    code: aiErrorCode,
  });
  // K8: repeated provider or credit failures alert the school admins once.
  void noteWritingFailure({ schoolId: assessment.school, errorCode: aiErrorCode });
};

/* ------------------------------------------------------------------ */
/* Project transitions                                                 */
/* ------------------------------------------------------------------ */

const markPublished = (assessment, userId) => {
  assessment.publish = {
    state: "published",
    publishedBy: userId,
    publishedAt: new Date(),
  };
};

/**
 * The AI moved the student only as far as "your work is ready to be read".
 * Everything past that is the teacher's publication decision.
 */
const applyAssessmentToProject = ({
  project,
  assessment,
  autoPublish,
  userId,
}) => {
  project.latestAssessment = assessment._id;

  if (autoPublish) {
    const kind = roundKind(assessment);
    const target = stageAfterPublish(kind, assessment.recommendation?.path);
    // An automatic publish is held to the same stages a manual one is: a
    // finished or notebook-ready project must not be dragged back by a re-run.
    const allowedFrom = PUBLISHABLE_FROM[kind] || [];
    if (allowedFrom.includes(project.stage) && canMoveTo(project, target)) {
      markPublished(assessment, userId);
      project.stage = target;
      project.status = statusAfterPublish(assessment.recommendation?.path);
      return true;
    }
    // A stage lock or a finished project is the teacher's decision: leave it.
    return false;
  }

  if (
    project.stage === "submitted" &&
    canMoveTo(project, stageAfterAssessment())
  ) {
    project.stage = stageAfterAssessment();
  }
  return false;
};

/**
 * The family email is a courtesy, not part of the publish contract: it runs
 * detached and can never turn a successful publish into an error. Auto-publish
 * uses the same dispatch so an auto-published round still reaches the family.
 */
const dispatchFeedbackEmail = ({
  schoolId,
  userId,
  project,
  assignment,
  draft = null,
  assessment,
  notify,
}) => {
  void (async () => {
    try {
      const row =
        draft ||
        (await WritingDraft.findOne({
          school: schoolId,
          _id: assessment.draft,
        }).lean());
      await notifyFeedbackPublished({
        schoolId,
        userId,
        project: project.toObject ? project.toObject() : project,
        assignment,
        draft: row,
        assessment,
        notify,
      });
    } catch (error) {
      logger.warn("writing_feedback_email_dispatch_failed", {
        error: error?.message,
      });
      // The draft read above can fail before the email service is reached; the
      // record still has to say the family was not written to.
      await recordEmailDelivery({
        schoolId,
        assessmentId: assessment._id,
        result: { skipped: "error" },
      });
    }
  })();
};

const shouldAutoPublish = (assignment) =>
  assignment?.workflow?.teacherPublishesFeedback === false;

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/**
 * Writing feedback and comparisons run on GPT. The provider is fixed here, not
 * read from the environment: a mis-set variable must never move this feature to
 * another model family without a code review.
 */
export const WRITING_AI = {
  provider: "openai",
  ...(process.env.WRITING_AI_MODEL
    ? { modelName: process.env.WRITING_AI_MODEL }
    : {}),
};

/**
 * Billing identity for one writing AI call. The credit gateway in connectAi reads
 * this, writes the ledger row and hands back its id, so an unusable reply can be
 * marked afterwards without a second charge.
 */
const aiOptions = ({ billing, context, feature }) => ({
  ...WRITING_AI,
  // Every writing reply is parsed as JSON; asking for JSON mode up front is
  // cheaper than retrying prose, and the gateway falls back if the model
  // endpoint will not take it.
  json: true,
  maxTokens: Number(process.env.WRITING_AI_MAX_TOKENS) || 6000,
  usage: {
    schoolId: billing.schoolId,
    userId: billing.userId,
    feature,
    billable: true,
    refs: {
      assignment: context.assignment?._id,
      project: context.project?._id,
      draft: context.draft?._id,
      student: context.draft?.student,
      assignmentTitle: context.assignment?.title,
      draftNumber: context.draft?.number,
    },
  },
});

/**
 * Model prose is inspected before any of it is stored. Phrase-class problems
 * are removed; anything left makes the reply unusable, and an unusable reply is
 * not billed. Evidence quotes and server-derived word evidence are left alone.
 */
const inspectReply = async (payload, entryId) => {
  const { value, problems } = sanitizeGeneratedFields(payload, {
    // Evidence quotes, server-resolved lesson facts and server-derived word
    // evidence are teacher or server text, not model prose. `original` is the
    // verified source slice of a language correction: normalization already
    // proved it equals the draft's own words, so prose rewriting must not
    // touch it. The correction and explanation stay fully inspected.
    skipKeys: ["evidence", "evidenceFact", "wordUseEvidence", "spellingWins", "original"],
    // Phase 3: a field that is nothing but a compliment is dropped (A14).
    strictPraise: feedbackV2Enabled(),
  });
  if (problems.length) {
    logger.warn("writing_reply_rejected_by_content_inspection", { problems });
    await markUsageOutcome({ entryId, outcome: "unusable" });
    throw upstream(
      "The AI reply was not suitable to show a child. Run it again.",
    );
  }
  return value;
};

/**
 * Source slices are verified once more after content inspection: a safety
 * transformation may have altered a replacement or explanation, and the row
 * that gets stored must satisfy the same anchor invariant the student page
 * and the emails check. A row that no longer passes is dropped and its section
 * downgraded to partial — never the whole assessment, and never silently.
 * Legacy pairs carry no category or anchor and are left untouched.
 */
const reverifyMechanics = (fields, draft) => {
  const textBySlot = new Map(
    (draft?.sections || []).map((row) => [
      `${row.key}:${Number(row.index) || 0}`,
      canonicalSectionText(row.text),
    ]),
  );
  for (const section of fields?.sections || []) {
    const rows = section.mechanics || [];
    if (!rows.length) continue;
    const text =
      textBySlot.get(`${section.key}:${Number(section.index) || 0}`) || "";
    const kept = rows.filter(
      (row) => !row.category || validateCorrection(text, row).ok,
    );
    if (kept.length === rows.length) continue;
    section.mechanics = kept;
    if (section.mechanicsReview) {
      section.mechanicsReview = {
        ...section.mechanicsReview,
        status:
          section.mechanicsReview.status === "checked"
            ? "partial"
            : section.mechanicsReview.status,
        reasons: [
          ...new Set([
            ...(section.mechanicsReview.reasons || []),
            "invalid_candidate",
          ]),
        ].slice(0, 8),
      };
    }
  }
};

/**
 * The tokenised reply is the baseline the edit trail diffs against, and the
 * next round is prompted from it. It has to be plain, bounded JSON: an ORM
 * object or an over-deep payload would fail to load later, so it is refused
 * here while the run can still be reported as a read failure.
 */
const tokenisedOriginal = (fields) => {
  const original = toPlain(fields);
  const issue = plainJsonIssue(original);
  if (issue) {
    throw Object.assign(new Error(`The reply cannot be stored (${issue}).`), {
      aiCode: "AI_INVALID_REPLY",
    });
  }
  return original;
};

/**
 * One reply, plus a second attempt when the first is not JSON at all. The
 * unusable first reply is voided, so a retry never bills the school twice for
 * a reply that could not be read. `call` is the caller's own closure, built
 * from aiOptions at the call site, so the pinned provider stays visible there.
 */
const askForJson = async ({ prompt, call, feature }) => {
  const first = await call(prompt);
  const firstParsed = extractJsonObject(first.text);
  if (firstParsed) return { reply: first, parsed: firstParsed };

  logger.warn("writing_reply_not_json_retrying", { feature });
  await markUsageOutcome({
    entryId: first.usage?.entryId,
    outcome: "unusable",
  });
  const retryPrompt = correctivePrompt(prompt, [
    "the reply was not a single JSON object",
  ]);
  const second = await call(retryPrompt);
  return { reply: second, parsed: extractJsonObject(second.text) };
};

/** What one run cost and how long it took; stored on the assessment it wrote. */
const runUsage = (reply, latencyMs) => {
  const tokens = tokenCounts(reply);
  const entryId = reply?.usage?.entryId;
  // The ledger priced a metered reply; only an unmetered call is costed here.
  const ledgerCost = Number(reply?.usage?.providerCostCents);
  return {
    ...tokens,
    costCents: Number.isFinite(ledgerCost) ? ledgerCost : costCents(tokens),
    latencyMs: Math.max(0, Number(latencyMs) || 0),
    ...(entryId ? { entryId } : {}),
  };
};

/**
 * Kill switch for the prompt half of the metrics layer (the facts block and the
 * count scrub). The computed metrics are still stored and the run is still
 * versioned: they describe the draft, and a switch must not make the record lie.
 */
const metricsEnabled = () => process.env.WRITING_METRICS !== "0";

/**
 * Phase 3 child-facing feedback. Off by default: prompt shape, budgets,
 * mechanics, repeat guard and reading-level control all key off this one flag
 * so a rollout is a redeploy, and stored Phase 2 rows keep reading the same.
 */
export const feedbackV2Enabled = () => process.env.WRITING_FEEDBACK_V2 === "1";

/**
 * Phase 4 revision intelligence. Off by default: computed improvement claims,
 * evidence-gated new issues, verified task quotes, the change story, ranked
 * spelling targets and rotation of repeated scaffolds all key off this flag.
 */
export const revisionV2Enabled = () => process.env.WRITING_REVISION_V2 === "1";

/** A task the student has not done yet, which the repeat guard protects. */
const hasUnresolvedTask = (ledger = []) =>
  (ledger || []).some(
    (row) => row?.status === "open" || row?.status === "stalled",
  );

/**
 * One line per finished run. The admin report reads stored rows, but a log
 * search must answer "did this prompt version start failing?" immediately.
 */
const logRun = ({ feature, promptVersion, outcome, usage = {}, code = "" }) => {
  logger.info("writing_ai_run", {
    feature,
    promptVersion,
    outcome,
    code,
    totalTokens: usage.totalTokens || 0,
    latencyMs: usage.latencyMs || 0,
  });
};

const runFeedback = async ({
  context,
  language,
  billing,
  previousDraft = null,
  previousAssessment = null,
}) => {
  const {
    draft,
    project,
    assignment,
    studentName,
    roster,
    goal,
    profile,
    spellingCandidates,
    priorSpellingTargets,
    graduatedSpellingWords,
    wordSupport,
  } = context;
  const snapshot = snapshotFor(draft, assignment);
  const revisionV2 = revisionV2Enabled();
  const stalledTasks = stalledTasksFrom(project?.revisionLedger || []);
  const wordUse = analyzeWordUse({
    draftText: draftTextOf(draft),
    wordSupport,
  });
  // The numbers the prompt quotes come from the text itself, never the model.
  const metrics = computeDraftMetrics({
    draft,
    wordUseEvidence: wordUse,
    spellingCandidates,
  });
  const pack = await packFor({
    schoolId: billing.schoolId,
    snapshot,
    assignment,
    draft,
  });
  const v2 = feedbackV2Enabled();
  const taughtFocus = v2
    ? (assignment.taughtFocus || []).map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  // Only a task the student has not done yet triggers the repeat guard.
  const repeatGuard = v2 && hasUnresolvedTask(project?.revisionLedger);
  const previousNextSteps = (previousAssessment?.sections || []).map((row) => ({
    key: row.key,
    index: Number(row.index) || 0,
    label: row.label || row.key,
    nextStep: row.nextStep || "",
    // The scaffold form already tried, so the next round must rotate down (A5).
    kind: row.intervention?.kind || "",
  }));
  const prompt = buildFeedbackPrompt({
    snapshot,
    draft,
    studentName,
    roster,
    goal,
    aiConstraints: assignment.aiConstraints || "",
    stalledTasks,
    profile,
    spellingCandidates,
    language,
    previousDraft,
    previousAssessment,
    metrics: metricsEnabled() ? metrics : null,
    pack,
    feedbackV2: v2,
    repeatGuard,
    previousNextSteps,
    taughtFocus,
    revisionV2,
  });

  const startedAt = Date.now();
  const { reply, parsed: rawParsed } = await askForJson({
    prompt,
    feature: "writing_feedback",
    call: (body) =>
      connectAi(
        body,
        aiOptions({ billing, context, feature: "writing_feedback" }),
      ),
  });
  const latencyMs = Date.now() - startedAt;
  // A count in the prose that contradicts the draft is corrected before
  // anything reads it. Quotes are the child's own words and are kept.
  const parsed = metricsEnabled()
    ? scrubCountClaimsDeep(rawParsed, metrics)
    : rawParsed;
  const normalized = normalizeFeedback({
    parsed,
    draft,
    snapshot,
    assignment,
    spellingCandidates,
    studentName,
    roster,
    packFacts: pack?.coverage.facts || [],
    feedbackV2: v2,
    repeatGuard,
    previousNextSteps,
    taughtFocus,
    tier: profile?.tier || "developing",
    publishedTargets: priorSpellingTargets,
    graduatedWords: graduatedSpellingWords || [],
  });
  if (!normalized.ok) {
    await markUsageOutcome({
      entryId: reply.usage?.entryId,
      outcome: "unusable",
    });
    throw upstream(normalized.error);
  }
  const scoreAdjustments = applyScoreGuards(normalized, {
    snapshot,
    metrics,
    pack,
  });

  // Focus budget and reading level are server decisions, never prompt hopes.
  let focusFields = {};
  if (v2) {
    const tier = profile?.tier || "developing";
    const budgeted = applyFocusBudget({
      sections: normalized.sections,
      priorities: normalized.overall.nextPriorities,
      tier,
    });
    const simplified = simplifyFeedbackFields(
      { sections: budgeted.sections, overall: { ...normalized.overall, nextPriorities: budgeted.priorities } },
      tier,
    );
    normalized.sections = simplified.sections;
    normalized.overall = simplified.overall;
    normalized.tasks = tasksFromPriorities(normalized.overall.nextPriorities);
    focusFields = {
      focus: budgeted.focus,
      teacherOnly: {
        notes: budgeted.dropped.all,
        priorities: budgeted.dropped.priorities,
      },
      readability: readabilityVerdict({
        fields: {
          sections: normalized.sections,
          overall: normalized.overall,
        },
        tier,
      }),
    };
  }

  // A revision is checked against the earlier round in the same reply.
  const checked = previousDraft
    ? normalizeComparison({
        parsed,
        previousDraft,
        currentDraft: draft,
        previousAssessment,
        snapshot,
        ledger: project?.revisionLedger || [],
        assignment,
        spellingCandidates,
        priorSpellingTargets,
        studentName,
        roster,
        revisionV2,
        tier: profile?.tier || "developing",
        publishedTargets: priorSpellingTargets,
        graduatedWords: graduatedSpellingWords || [],
      })
    : null;

  normalized.stalledTasks = checked ? checked.stalledTasks : stalledTasks;
  if (checked) {
    normalized.comparison = {
      criteriaUnresolved: checked.criteriaUnresolved,
      newIssues: checked.newIssues,
      ...(revisionV2
        ? {
            criteriaImproved: checked.criteriaImproved,
            improvedFacts: checked.improvedFacts,
            newIssueChecks: checked.newIssueChecks,
            changes: checked.changes || [],
            mostlyReworded: checked.mostlyReworded === true,
          }
        : {}),
    };
  }
  const decision = decideRecommendation({ normalized });
  // normalizeComparison already merged this round's taskResults. Merging again
  // without them pushes every task back to "open", erasing resolved/stalled.
  const revisionLedger = checked
    ? checked.revisionLedger
    : mergeRevisionLedger({
        ledger: project?.revisionLedger || [],
        tasks: normalized.tasks,
        draftNumber: Number(draft.number) || 1,
      });

  const fields = {
    sections: normalized.sections,
    overall: normalized.overall,
    scores: normalized.scores,
    tasks: normalized.tasks,
    spellingTargets: normalized.spellingTargets,
    // Only words from an already-published round count as a win, and only
    // when the word is really in this draft.
    spellingWins: verifiedSpellingWins({
      targets: priorSpellingTargets,
      draftText: draftTextOf(draft),
    }),
    ...(wordUse ? { wordUseEvidence: wordUse } : {}),
    totalScore: normalized.totalScore,
    scoreAdjustments,
    ...focusFields,
    recommendation: { path: decision.path, reason: decision.reason },
    ...(checked
      ? {
          comparison: {
            changedBySection: checked.changedBySection,
            criteriaImproved: checked.criteriaImproved,
            criteriaUnresolved: checked.criteriaUnresolved,
            feedbackApplied: checked.feedbackApplied,
            taskResults: checked.taskResults,
            newIssues: checked.newIssues,
            wordDelta: checked.wordDelta,
            encouragement: checked.encouragement,
            ...(revisionV2
              ? {
                  improvedFacts: checked.improvedFacts,
                  newIssueChecks: checked.newIssueChecks,
                  changes: checked.changes || [],
                  mostlyReworded: checked.mostlyReworded === true,
                }
              : {}),
          },
        }
      : {}),
  };
  const inspected = await inspectReply(
    { fields, revisionLedger },
    reply.usage?.entryId,
  );
  reverifyMechanics(inspected.fields, draft);
  // The stored original stays tokenised: it is what a later round is prompted
  // from, and the name is filled in only when a person reads or receives it.
  const original = tokenisedOriginal(inspected.fields);
  const filled = fillStudentTokensDeep(original, studentName);

  return {
    modelName: reply.modelName,
    fields: filled,
    original,
    revisionLedger: inspected.revisionLedger,
    promptVersion: WRITING_PROMPT_VERSIONS.feedback,
    usage: runUsage(reply, latencyMs),
    metrics,
  };
};

const runComparison = async ({
  context,
  previousDraft,
  previousAssessment,
  language,
  billing,
}) => {
  const {
    draft,
    project,
    assignment,
    studentName,
    roster,
    goal,
    profile,
    spellingCandidates,
    priorSpellingTargets,
    graduatedSpellingWords,
    wordSupport,
  } = context;
  const snapshot = snapshotFor(draft, assignment);
  const revisionV2 = revisionV2Enabled();
  const wordUse = analyzeWordUse({
    draftText: draftTextOf(draft),
    wordSupport,
  });
  const metrics = computeDraftMetrics({
    draft,
    wordUseEvidence: wordUse,
    spellingCandidates,
  });
  const pack = await packFor({
    schoolId: billing.schoolId,
    snapshot,
    assignment,
    draft,
  });
  const prompt = buildComparisonPrompt({
    snapshot,
    previousDraft,
    currentDraft: draft,
    previousAssessment,
    studentName,
    roster,
    goal,
    aiConstraints: assignment.aiConstraints || "",
    profile,
    spellingCandidates,
    language,
    metrics: metricsEnabled() ? metrics : null,
    pack,
    revisionV2,
  });

  const startedAt = Date.now();
  const { reply, parsed: rawParsed } = await askForJson({
    prompt,
    feature: "writing_comparison",
    call: (body) =>
      connectAi(
        body,
        aiOptions({ billing, context, feature: "writing_comparison" }),
      ),
  });
  const latencyMs = Date.now() - startedAt;
  const parsed = metricsEnabled()
    ? scrubCountClaimsDeep(rawParsed, metrics)
    : rawParsed;
  const normalized = normalizeComparison({
    parsed,
    previousDraft,
    currentDraft: draft,
    previousAssessment,
    snapshot,
    ledger: project?.revisionLedger || [],
    assignment,
    spellingCandidates,
    priorSpellingTargets,
    studentName,
    roster,
    revisionV2,
    tier: profile?.tier || "developing",
    publishedTargets: priorSpellingTargets,
    graduatedWords: graduatedSpellingWords || [],
  });
  if (!normalized.ok) {
    await markUsageOutcome({
      entryId: reply.usage?.entryId,
      outcome: "unusable",
    });
    throw upstream(normalized.error);
  }

  const scoreAdjustments = applyScoreGuards(normalized, {
    snapshot,
    metrics,
    pack,
  });
  const decision = decideRecommendation({ normalized });

  const fields = {
    comparison: {
      changedBySection: normalized.changedBySection,
      criteriaImproved: normalized.criteriaImproved,
      criteriaUnresolved: normalized.criteriaUnresolved,
      feedbackApplied: normalized.feedbackApplied,
      taskResults: normalized.taskResults,
      newIssues: normalized.newIssues,
      wordDelta: normalized.wordDelta,
      encouragement: normalized.encouragement,
      ...(revisionV2
        ? {
            improvedFacts: normalized.improvedFacts,
            newIssueChecks: normalized.newIssueChecks,
            changes: normalized.changes || [],
            mostlyReworded: normalized.mostlyReworded === true,
          }
        : {}),
    },
    // The tasks this revision was checked against, so the student view is
    // self-contained even if the earlier feedback is never published.
    tasks: normalized.tasks,
    overall: normalized.overall,
    scores: normalized.scores,
    spellingTargets: normalized.spellingTargets,
    spellingWins: normalized.spellingWins,
    ...(wordUse ? { wordUseEvidence: wordUse } : {}),
    totalScore: normalized.totalScore,
    scoreAdjustments,
    recommendation: { path: decision.path, reason: decision.reason },
  };

  const inspected = await inspectReply(
    { fields, revisionLedger: normalized.revisionLedger },
    reply.usage?.entryId,
  );
  const original = tokenisedOriginal(inspected.fields);
  const filled = fillStudentTokensDeep(original, studentName);
  return {
    modelName: reply.modelName,
    fields: filled,
    original,
    revisionLedger: inspected.revisionLedger,
    promptVersion: WRITING_PROMPT_VERSIONS.comparison,
    usage: runUsage(reply, latencyMs),
    metrics,
  };
};

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

const summarizeAssessment = (doc, extra = {}) => {
  const row = doc.toObject ? doc.toObject() : doc;
  delete row.aiOriginal;
  return {
    ...row,
    id: String(row._id),
    draftId: String(row.draft),
    previousDraftId: row.previousDraft ? String(row.previousDraft) : "",
    projectId: String(row.project),
    stage: extra.stage || "",
    status: extra.status || "",
  };
};

const projectSummary = (project) => ({
  id: String(project._id),
  stage: project.stage,
  status: project.status,
  draftCount: project.draftCount,
});

/* ------------------------------------------------------------------ */
/* Assess one draft                                                    */
/* ------------------------------------------------------------------ */

/**
 * K6: everything after a run is claimed. The plain call awaits it; a detached
 * call starts it and answers at once, so a long provider timeout never has to
 * outlive a proxy timeout. The row itself is the run record the panel polls.
 */
const finishClaimedAssessment = async ({
  context,
  project,
  assignment,
  draft,
  assessment,
  language,
  previousDraft,
  previousAssessment,
  billing,
  userId,
}) => {
  const stopHeartbeat = startRunHeartbeat(assessment);
  try {
    const result = await runFeedback({
      context,
      language,
      billing,
      previousDraft,
      previousAssessment,
    });
    assessment.set({
      ...result.fields,
      aiStatus: "done",
      aiErrorCode: "",
      aiError: "",
      ranAt: new Date(),
      modelUsed: result.modelName || "",
      aiOriginal: result.original,
      promptVersion: result.promptVersion,
      schemaVersion: WRITING_SCHEMA_VERSION,
      usage: result.usage,
      metrics: metricsSummaryForStorage(result.metrics),
    });
    logRun({
      feature: "writing_feedback",
      promptVersion: result.promptVersion,
      outcome: "done",
      usage: result.usage,
    });
    project.revisionLedger = result.revisionLedger || project.revisionLedger;
  } catch (error) {
    stopHeartbeat();
    await failAssessment(assessment, error);
    // The 402 contract has to survive the wrap: the client shows a credit
    // message and a batch stops instead of recording a spurious failure.
    if (isCreditError(error)) throw error;
    throw upstream("The draft could not be assessed. Try again in a moment.");
  }
  stopHeartbeat();

  const autosave = shouldAutoPublish(assignment);
  const autoPublished = applyAssessmentToProject({
    project,
    assessment,
    autoPublish: autosave,
    userId,
  });
  await withTransaction(async (session) => {
    await saveFinishedRun({ assessment, session });
    await saveInSession(project, session);
  });
  if (autoPublished) {
    dispatchFeedbackEmail({
      schoolId: billing.schoolId,
      userId,
      project,
      assignment,
      draft,
      assessment,
    });
  }

  return {
    assessment: summarizeAssessment(assessment),
    project: projectSummary(project),
    autoPublished,
  };
};

export const assessDraft = async ({
  schoolId,
  draftId,
  userId,
  isAdmin = false,
  language = "",
  force = false,
  // A batch checks credit once for the whole run; single calls check here.
  creditChecked = false,
  // K6: answer after the claim and let the stored row report the outcome.
  detached = false,
}) => {
  const context = await loadDraftContext({ schoolId, draftId });
  const { draft, project, assignment } = context;
  assertOwner(assignment, userId, isAdmin);

  if (draft.withdrawn) {
    throw badRequest("This submission was returned to the student.");
  }

  if (!sameId(project.latestDraft, draft._id)) {
    throw badRequest("Only the newest submitted draft can be assessed.");
  }

  // Checked before the credit gate: a draft that cannot be assessed must cost
  // nothing at all, not even a credit check.
  const precheck = precheckOf(context);
  if (precheck) {
    return {
      assessment: null,
      precheck,
      project: projectSummary(project),
      autoPublished: false,
    };
  }

  if (!creditChecked) await assertWritingCredit({ schoolId, userId });
  const resolvedLanguage = await resolveLanguage({
    schoolId,
    requestedLanguage: language,
  });
  // From draft 2 on, one reply gives the feedback and what the revision changed.
  const { previousDraft, previousAssessment } = await loadPreviousRound({
    schoolId,
    project,
    draft,
  });
  const assessment = await claimAssessment({
    schoolId,
    project,
    draft,
    kind: "feedback",
    previousDraft,
    userId,
    language: resolvedLanguage,
    force,
  });

  const runInput = {
    context,
    project,
    assignment,
    draft,
    assessment,
    language: resolvedLanguage,
    previousDraft,
    previousAssessment,
    billing: { schoolId, userId },
    userId,
  };
  // K6: a detached run answers at once; the row it already claimed is what the
  // review panel polls, so the outcome still lands after the request is gone.
  if (detached) {
    finishClaimedAssessment(runInput).catch((error) => {
      // failAssessment already recorded the reason on the row; this is the log trail.
      logger.warn("writing_detached_assessment_failed", {
        draftId: String(draft._id),
        errorCode: aiFailureCodeOf(error),
        message: error?.message,
      });
    });
    return {
      assessment: summarizeAssessment(assessment),
      project: projectSummary(project),
      autoPublished: false,
      pending: true,
    };
  }
  return finishClaimedAssessment(runInput);
};

/* ------------------------------------------------------------------ */
/* Compare two drafts                                                  */
/* ------------------------------------------------------------------ */

export const compareDrafts = async ({
  schoolId,
  draftId,
  userId,
  isAdmin = false,
  language = "",
  force = false,
  creditChecked = false,
}) => {
  const context = await loadDraftContext({ schoolId, draftId });
  const { draft, project, assignment } = context;
  assertOwner(assignment, userId, isAdmin);

  if (draft.withdrawn) {
    throw badRequest("This submission was returned to the student.");
  }

  if (!sameId(project.latestDraft, draft._id)) {
    throw badRequest("Only the newest submitted draft can be compared.");
  }
  if (Number(draft.number) < 2) {
    throw badRequest("There is only one draft so far. A comparison needs two.");
  }

  const precheck = precheckOf(context);
  if (precheck) {
    return {
      assessment: null,
      precheck,
      project: projectSummary(project),
      autoPublished: false,
    };
  }

  const { previousDraft, previousAssessment } = await loadPreviousRound({
    schoolId,
    project,
    draft,
  });
  if (!previousDraft) {
    throw notFound("The previous draft could not be found.");
  }

  if (!creditChecked) await assertWritingCredit({ schoolId, userId });
  const resolvedLanguage = await resolveLanguage({
    schoolId,
    requestedLanguage: language,
  });
  const assessment = await claimAssessment({
    schoolId,
    project,
    draft,
    kind: "comparison",
    previousDraft,
    userId,
    language: resolvedLanguage,
    force,
  });

  const stopHeartbeat = startRunHeartbeat(assessment);
  try {
    const result = await runComparison({
      context,
      previousDraft,
      previousAssessment,
      language: resolvedLanguage,
      billing: { schoolId, userId },
    });
    assessment.set({
      ...result.fields,
      aiStatus: "done",
      aiErrorCode: "",
      aiError: "",
      ranAt: new Date(),
      modelUsed: result.modelName || "",
      aiOriginal: result.original,
      promptVersion: result.promptVersion,
      schemaVersion: WRITING_SCHEMA_VERSION,
      usage: result.usage,
      metrics: metricsSummaryForStorage(result.metrics),
    });
    logRun({
      feature: "writing_comparison",
      promptVersion: result.promptVersion,
      outcome: "done",
      usage: result.usage,
    });
    project.revisionLedger = result.revisionLedger || project.revisionLedger;
  } catch (error) {
    stopHeartbeat();
    await failAssessment(assessment, error);
    if (isCreditError(error)) throw error;
    throw upstream("The drafts could not be compared. Try again in a moment.");
  }
  stopHeartbeat();

  const autosave = shouldAutoPublish(assignment);
  const autoPublished = applyAssessmentToProject({
    project,
    assessment,
    autoPublish: autosave,
    userId,
  });
  await withTransaction(async (session) => {
    await saveFinishedRun({ assessment, session });
    await saveInSession(project, session);
  });
  if (autoPublished) {
    dispatchFeedbackEmail({
      schoolId,
      userId,
      project,
      assignment,
      draft,
      assessment,
    });
  }

  return {
    assessment: summarizeAssessment(assessment),
    project: projectSummary(project),
    autoPublished,
  };
};

/* ------------------------------------------------------------------ */
/* Batch assess                                                        */
/* ------------------------------------------------------------------ */

export const assessPendingBatch = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
  classId = "",
  limit = 5,
  language = "",
}) => {
  const id = objectId(assignmentId);
  if (!id) throw notFound("Writing task not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: id,
  }).lean();
  if (!assignment) throw notFound("Writing task not found.");
  assertOwner(assignment, userId, isAdmin);
  await assertWritingCredit({ schoolId, userId });

  const cap = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const filter = {
    school: schoolId,
    assignment: assignment._id,
    stage: "submitted",
  };
  if (objectId(classId)) filter.class = classId;

  const waiting = await WritingProject.find(filter)
    .sort({ updatedAt: 1 })
    .limit(cap)
    .select("_id student latestDraft")
    .lean();

  const resolvedLanguage = await resolveLanguage({
    schoolId,
    requestedLanguage: language,
  });
  // Credit and language are batch-invariant: one check covers every item.
  await assertWritingCredit({ schoolId, userId });
  const budgetMs = Number(process.env.WRITING_BATCH_BUDGET_MS) || 90_000;
  const startedAt = Date.now();
  const outcomes = [];
  let creditStopped = false;
  let budgetExhausted = false;

  // Sequential on purpose: one rate-limit budget and no malformed fan-out.
  for (const project of waiting) {
    // The budget decides whether another item starts; an item already talking
    // to the provider is allowed to finish so its reply is not thrown away.
    if (Date.now() - startedAt >= budgetMs) {
      budgetExhausted = true;
      break;
    }
    if (!project.latestDraft) {
      outcomes.push({
        projectId: String(project._id),
        studentId: String(project.student),
        ok: false,
        error: "No submitted draft was found.",
      });
      continue;
    }
    try {
      const result = await assessDraft({
        schoolId,
        draftId: project.latestDraft,
        userId,
        isAdmin,
        language: resolvedLanguage,
        creditChecked: true,
      });
      if (result.precheck) {
        // A precheck draft stays in the queue for the teacher to fix; it is
        // reported as skipped rather than counted as assessed.
        outcomes.push({
          projectId: String(project._id),
          studentId: String(project.student),
          ok: false,
          precheck: result.precheck.code,
          error: result.precheck.guidance,
        });
        continue;
      }
      outcomes.push({
        projectId: String(project._id),
        studentId: String(project.student),
        ok: true,
        assessmentId: result.assessment.id,
        recommendation: result.assessment.recommendation?.path || "",
      });
    } catch (error) {
      if (isCreditError(error)) {
        creditStopped = true;
        break;
      }
      outcomes.push({
        projectId: String(project._id),
        studentId: String(project.student),
        ok: false,
        error: text(error?.message || "Assessment failed.", 300),
      });
    }
  }

  const remaining = await WritingProject.countDocuments({
    ...filter,
    stage: "submitted",
  });

  return {
    attempted: outcomes.length,
    assessed: outcomes.filter((row) => row.ok).length,
    failed: outcomes.filter((row) => !row.ok).length,
    remaining,
    creditStopped,
    budgetExhausted,
    outcomes,
  };
};

/* ------------------------------------------------------------------ */
/* Teacher edits                                                       */
/* ------------------------------------------------------------------ */

/**
 * A teacher's mark beats the server's mechanical clamp; keep the clamp row as
 * history but stop it from describing the current score.
 */
const noteTeacherScoreOverride = (assessment, target, key, index = 0) => {
  const row = (assessment.scoreAdjustments || []).find(
    (item) =>
      item.target === target &&
      item.key === key &&
      (target === "score" || Number(item.index) === Number(index)),
  );
  if (row) row.overriddenByTeacher = true;
};

const applyEdits = ({ assessment, payload = {}, userId, draftSections = [] }) => {
  const changed = new Set();
  const mark = (path) => changed.add(path);

  // Every submitted mechanics array is validated against the assessed draft
  // before any field mutates: one bad row must not partially save the rest.
  const mechanicsBySlot = new Map();
  if (Array.isArray(payload.sections)) {
    for (const incoming of payload.sections) {
      if (!incoming || !incoming.key || incoming.mechanics === undefined)
        continue;
      const index = Number.isFinite(Number(incoming.index))
        ? Number(incoming.index)
        : 0;
      const target = assessment.sections.find(
        (row) => row.key === incoming.key && Number(row.index) === index,
      );
      if (!target) continue;
      const draftSection = (draftSections || []).find(
        (row) => row.key === incoming.key && Number(row.index) === index,
      );
      mechanicsBySlot.set(
        `${incoming.key}:${index}`,
        mechanicsEditRows(
          incoming.mechanics,
          canonicalSectionText(draftSection?.text),
          `sections.${incoming.key}:${index}.mechanics`,
        ),
      );
    }
  }

  if (!assessment.aiOriginal) {
    const plain = (row) =>
      typeof row?.toObject === "function" ? row.toObject() : row;
    assessment.aiOriginal = {
      sections: (assessment.sections || []).map(plain),
      overall: plain(assessment.overall),
      scores: (assessment.scores || []).map(plain),
      tasks: (assessment.tasks || []).map(plain),
      spellingTargets: (assessment.spellingTargets || []).map(plain),
      totalScore: assessment.totalScore,
      comparison: plain(assessment.comparison),
      recommendation: plain(assessment.recommendation),
      wordUseEvidence: plain(assessment.wordUseEvidence),
    };
  }

  if (Array.isArray(payload.sections)) {
    for (const incoming of payload.sections) {
      if (!incoming || !incoming.key) continue;
      const index = Number.isFinite(Number(incoming.index))
        ? Number(incoming.index)
        : 0;
      const target = assessment.sections.find(
        (row) => row.key === incoming.key && Number(row.index) === index,
      );
      if (!target) continue;
      const next = {
        strengths:
          incoming.strengths === undefined
            ? target.strengths
            : editedList(incoming.strengths, 6, 260),
        improvements:
          incoming.improvements === undefined
            ? target.improvements
            : editedList(incoming.improvements, 6, 260),
        evidence:
          incoming.evidence === undefined
            ? target.evidence
            : text(incoming.evidence, 300),
        why: incoming.why === undefined ? target.why : editedText(incoming.why, 400),
        nextStep:
          incoming.nextStep === undefined
            ? target.nextStep
            : editedText(incoming.nextStep, 400),
        mechanics:
          incoming.mechanics === undefined
            ? target.mechanics
            : mechanicsBySlot.get(`${incoming.key}:${index}`),
        score:
          incoming.score === undefined
            ? target.score
            : score(incoming.score, target.maxScore),
      };
      const hadNextStep = target.nextStep;
      for (const [field, value] of Object.entries(next)) {
        const before = Array.isArray(target[field])
          ? JSON.stringify(target[field])
          : target[field];
        const after = Array.isArray(value) ? JSON.stringify(value) : value;
        if (before !== after) {
          target[field] = value;
          mark(`sections.${incoming.key}:${index}.${field}`);
          if (field === "score") {
            noteTeacherScoreOverride(assessment, "section", incoming.key, index);
          }
        }
      }
      // A blocked instruction unblocks only when the teacher writes a
      // genuinely different one; otherwise the same repeat would be sent again.
      if (
        target.nextStep !== hadNextStep &&
        target.intervention?.needsRewrite &&
        !isRepeatedInstruction(target.intervention.previous, target.nextStep)
      ) {
        target.intervention = {
          ...(typeof target.intervention.toObject === "function"
            ? target.intervention.toObject()
            : target.intervention),
          needsRewrite: false,
        };
        mark(`sections.${incoming.key}:${index}.intervention`);
      }
    }
  }

  if (payload.overall && typeof payload.overall === "object") {
    const limits = {
      summary: 1200,
      organisation: 600,
      centralIdea: 600,
      flow: 600,
      repetition: 600,
      requirements: 600,
    };
    for (const [field, max] of Object.entries(limits)) {
      if (payload.overall[field] === undefined) continue;
      const value = editedText(payload.overall[field], max);
      if (value !== assessment.overall[field]) {
        assessment.overall[field] = value;
        mark(`overall.${field}`);
      }
    }
    if (payload.overall.nextPriorities !== undefined) {
      const value = editedList(payload.overall.nextPriorities, 3, 260);
      if (
        JSON.stringify(value) !==
        JSON.stringify(assessment.overall.nextPriorities)
      ) {
        assessment.overall.nextPriorities = value;
        mark("overall.nextPriorities");
        // Tasks are the priorities with ids; rewording keeps the id at that position.
        if (assessment.kind !== "comparison") {
          assessment.tasks = tasksFromPriorities(value);
          mark("tasks");
        }
      }
    }
  }

  if (Array.isArray(payload.scores)) {
    for (const incoming of payload.scores) {
      if (!incoming || !incoming.key) continue;
      const target = assessment.scores.find((row) => row.key === incoming.key);
      if (!target) continue;
      if (incoming.score !== undefined) {
        const value = score(incoming.score, target.maxScore);
        if (value !== target.score) {
          target.score = value;
          mark(`scores.${incoming.key}.score`);
          noteTeacherScoreOverride(assessment, "score", incoming.key);
        }
      }
      if (incoming.explanation !== undefined) {
        const value = editedText(incoming.explanation, 400);
        if (value !== target.explanation) {
          target.explanation = value;
          mark(`scores.${incoming.key}.explanation`);
        }
      }
      if (incoming.evidence !== undefined) {
        const value = text(incoming.evidence, 300);
        if (value !== target.evidence) {
          target.evidence = value;
          mark(`scores.${incoming.key}.evidence`);
        }
      }
    }
    assessment.totalScore = assessment.scores.reduce(
      (sum, row) => sum + (row.focusExcluded ? 0 : Number(row.score) || 0),
      0,
    );
  }

  // A teacher may drop a suggested word but never add one: the only words that
  // can reach a student are the ones the server already approved.
  if (Array.isArray(payload.spellingTargets)) {
    const keep = new Set(
      payload.spellingTargets
        .map((row) =>
          String(row?.word ?? row ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const before = assessment.spellingTargets || [];
    const value = before.filter((row) =>
      keep.has(String(row.word).toLowerCase()),
    );
    if (value.length !== before.length) {
      assessment.spellingTargets = value;
      mark("spellingTargets");
    }
  }

  // A teacher can confirm or set aside a word-use observation. This never
  // changes a score; it only records what the teacher verified.
  if (Array.isArray(payload.wordUse) && assessment.wordUseEvidence) {
    const plainEvidence =
      typeof assessment.wordUseEvidence.toObject === "function"
        ? assessment.wordUseEvidence.toObject()
        : assessment.wordUseEvidence;
    const touched = applyWordUseDecisions({
      evidence: plainEvidence,
      decisions: payload.wordUse,
    });
    if (touched.length) {
      assessment.wordUseEvidence = plainEvidence;
      touched.forEach((path) => mark(`wordUse.${path}`));
    }
  }

  if (payload.recommendation && typeof payload.recommendation === "object") {
    const path =
      payload.recommendation.path === "notebook" ? "notebook" : "revise";
    if (path !== assessment.recommendation?.path) {
      assessment.recommendation.path = path;
      mark("recommendation.path");
    }
    if (payload.recommendation.reason !== undefined) {
      const reason = editedText(payload.recommendation.reason, 400);
      if (reason !== assessment.recommendation?.reason) {
        assessment.recommendation.reason = reason;
        mark("recommendation.reason");
      }
    }
  }

  if (
    roundKind(assessment) === "comparison" &&
    payload.comparison &&
    typeof payload.comparison === "object"
  ) {
    const comparison = assessment.comparison || {};
    if (payload.comparison.encouragement !== undefined) {
      const value = editedText(payload.comparison.encouragement, 600);
      if (value !== comparison.encouragement) {
        comparison.encouragement = value;
        mark("comparison.encouragement");
      }
    }
    for (const field of [
      "criteriaImproved",
      "criteriaUnresolved",
      "newIssues",
    ]) {
      if (payload.comparison[field] === undefined) continue;
      const value = editedList(payload.comparison[field], 8, 260);
      if (JSON.stringify(value) !== JSON.stringify(comparison[field] || [])) {
        comparison[field] = value;
        mark(`comparison.${field}`);
      }
    }
    if (Array.isArray(payload.comparison.changedBySection)) {
      for (const incoming of payload.comparison.changedBySection) {
        if (!incoming || !incoming.key) continue;
        const index = Number.isFinite(Number(incoming.index))
          ? Number(incoming.index)
          : 0;
        const target = (comparison.changedBySection || []).find(
          (row) => row.key === incoming.key && Number(row.index) === index,
        );
        if (!target || incoming.summary === undefined) continue;
        const value = editedText(incoming.summary, 500);
        if (value !== target.summary) {
          target.summary = value;
          mark(`comparison.changedBySection.${incoming.key}:${index}.summary`);
        }
      }
    }
    if (Array.isArray(payload.comparison.feedbackApplied)) {
      for (const incoming of payload.comparison.feedbackApplied) {
        if (!incoming || !incoming.key) continue;
        const index = Number.isFinite(Number(incoming.index))
          ? Number(incoming.index)
          : 0;
        const target = (comparison.feedbackApplied || []).find(
          (row) => row.key === incoming.key && Number(row.index) === index,
        );
        if (!target || incoming.applied === undefined) continue;
        const value = incoming.applied === true;
        if (value !== target.applied) {
          target.applied = value;
          mark(`comparison.feedbackApplied.${incoming.key}:${index}.applied`);
        }
      }
    }
    if (Array.isArray(payload.comparison.taskResults)) {
      for (const incoming of payload.comparison.taskResults) {
        if (!incoming || !incoming.id) continue;
        const target = (comparison.taskResults || []).find(
          (row) => row.id === incoming.id,
        );
        if (!target || incoming.applied === undefined) continue;
        const value = incoming.applied === true;
        if (value !== target.applied) {
          target.applied = value;
          mark(`comparison.taskResults.${incoming.id}.applied`);
        }
      }
    }
    assessment.comparison = comparison;
  }

  if (changed.size || text(payload.note, 400)) {
    assessment.teacherEdits = {
      by: userId,
      at: new Date(),
      changedPaths: [...changed],
      note: text(payload.note, 400),
    };
  }
};

export const saveAssessmentEdits = async ({
  schoolId,
  assessmentId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(assessmentId);
  if (!id) throw notFound("Assessment not found.");

  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    _id: id,
  });
  if (!assessment) throw notFound("Assessment not found.");

  const [project, assignment] = await Promise.all([
    WritingProject.findOne({ school: schoolId, _id: assessment.project }),
    WritingAssignment.findOne({
      school: schoolId,
      _id: assessment.assignment,
    }).lean(),
  ]);
  if (!project) throw notFound("Writing project not found.");
  assertOwner(assignment, userId, isAdmin);

  if (assessment.publish?.state === "published") {
    throw conflict(
      "This feedback is already published. Reassess the draft to make changes.",
    );
  }
  if (assessment.aiStatus !== "done") {
    throw badRequest("There is no finished assessment to edit yet.");
  }

  // The draft is needed only to verify submitted corrections; a summary-only
  // save must not pay for a read it does not use.
  const editsMechanics =
    Array.isArray(payload.sections) &&
    payload.sections.some((row) => row && row.mechanics !== undefined);
  const draftRow = editsMechanics
    ? await WritingDraft.findOne({
        school: schoolId,
        _id: assessment.draft,
      })
        .select("sections")
        .lean()
    : null;

  applyEdits({
    assessment,
    payload,
    userId,
    draftSections: draftRow?.sections || [],
  });
  await assessment.save();

  return {
    assessment: summarizeAssessment(assessment),
    project: projectSummary(project),
  };
};

/**
 * F1: rewrite one note the teacher is looking at. The rest of the assessment is
 * never sent to the model and never returned, so a regeneration cannot rewrite
 * other sections, scores or priorities. Nothing is stored: the teacher's own
 * save remains the only write.
 */
export const regenerateNote = async ({
  schoolId,
  assessmentId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(assessmentId);
  if (!id) throw notFound("Assessment not found.");

  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    _id: id,
  });
  if (!assessment) throw notFound("Assessment not found.");
  const [project, assignment] = await Promise.all([
    WritingProject.findOne({ school: schoolId, _id: assessment.project }),
    WritingAssignment.findOne({
      school: schoolId,
      _id: assessment.assignment,
    }).lean(),
  ]);
  if (!project) throw notFound("Writing project not found.");
  assertOwner(assignment, userId, isAdmin);

  if (assessment.publish?.state === "published") {
    throw conflict(
      "Published feedback cannot be rewritten. Reassess the draft to make changes.",
    );
  }
  if (assessment.aiStatus !== "done") {
    throw badRequest("There is no finished assessment to edit yet.");
  }

  const draft = await WritingDraft.findOne({
    school: schoolId,
    _id: assessment.draft,
  }).lean();
  if (!draft || draft.withdrawn) {
    throw badRequest("This submission was returned to the student.");
  }

  const mode = ["shorter", "specific", "simpler"].includes(String(payload.mode))
    ? String(payload.mode)
    : "";
  if (!mode) throw badRequest("Choose how the note should change.");
  const field = ["strength", "improvement", "nextStep"].includes(
    String(payload.field),
  )
    ? String(payload.field)
    : "";
  if (!field) throw badRequest("Choose which note to rewrite.");

  const key = String(payload.key || "").trim();
  const index = Number(payload.index) || 0;
  const section =
    (draft.sections || []).find(
      (row) => row.key === key && Number(row.index) === index,
    ) || (draft.sections || []).find((row) => row.key === key);
  if (!section) throw notFound("That section is not part of this draft.");

  const current = text(payload.text, 400);
  if (!current) throw badRequest("There is no note to rewrite.");

  await assertWritingCredit({ schoolId, userId });
  const startedAt = Date.now();
  const { reply, parsed } = await askForJson({
    prompt: buildNoteRewritePrompt({
      mode,
      field,
      sectionLabel: section.label || section.key,
      sectionText: section.text || "",
      note: current,
      language: assessment.language === "ar" ? "ar" : "en",
    }),
    feature: "writing_note_rewrite",
    call: (body) =>
      connectAi(
        body,
        aiOptions({
          billing: { schoolId, userId },
          context: { assignment, project, draft },
          feature: "writing_note_rewrite",
        }),
      ),
  });
  const latencyMs = Date.now() - startedAt;

  const cleaned = cleanGeneratedString(String(parsed?.note || "").slice(0, 600));
  const note = text(cleaned.text, 300);
  if (cleaned.problems.length || !note) {
    await markUsageOutcome({
      entryId: reply.usage?.entryId,
      outcome: "unusable",
    });
    throw upstream(
      "The rewritten note was not suitable to show a child. Try again.",
    );
  }

  const usage = runUsage(reply, latencyMs);
  logRun({
    feature: "writing_note_rewrite",
    promptVersion: WRITING_PROMPT_VERSIONS.note,
    outcome: "done",
    usage,
  });
  return {
    note,
    usage: { totalTokens: usage.totalTokens, costCents: usage.costCents },
  };
};

/* ------------------------------------------------------------------ */
/* Publish                                                             */
/* ------------------------------------------------------------------ */

export const publishAssessment = async ({
  schoolId,
  assessmentId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(assessmentId);
  if (!id) throw notFound("Assessment not found.");

  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    _id: id,
  });
  if (!assessment) throw notFound("Assessment not found.");

  const [project, assignment] = await Promise.all([
    WritingProject.findOne({ school: schoolId, _id: assessment.project }),
    WritingAssignment.findOne({
      school: schoolId,
      _id: assessment.assignment,
    }).lean(),
  ]);
  if (!project) throw notFound("Writing project not found.");
  assertOwner(assignment, userId, isAdmin);

  const draftRow = await WritingDraft.findOne({
    school: schoolId,
    _id: assessment.draft,
  })
    .select("withdrawn sections")
    .lean();
  if (draftRow?.withdrawn) {
    throw badRequest(
      "This submission was returned to the student and cannot be published.",
    );
  }

  if (assessment.publish?.state === "published") {
    return {
      assessment: summarizeAssessment(assessment),
      project: projectSummary(project),
      alreadyPublished: true,
    };
  }
  if (assessment.aiStatus !== "done") {
    throw badRequest("This assessment is not ready to publish.");
  }
  if (!sameId(assessment.draft, project.latestDraft)) {
    throw conflict(
      "A newer draft has been submitted. This feedback can no longer be published.",
    );
  }

  if (payload && Object.keys(payload).length) {
    applyEdits({
      assessment,
      payload,
      userId,
      draftSections: draftRow?.sections || [],
    });
  }

  // F6: what the child will read must be final. An unfilled {{token}} would
  // reach the child raw, and a quote that is not in the draft cannot be
  // highlighted. The review checklist runs the same checks before this call.
  const publishFixes = publishBlockers({
    assessment: toPlain(assessment),
    draft: draftRow,
  });
  const tokenBlocker = publishFixes.find((row) => row.kind === "tokens");
  if (tokenBlocker) {
    throw badRequest(
      `The feedback still contains ${tokenBlocker.items.join(", ")}. Replace it with the student's name before publishing.`,
    );
  }
  const anchorBlocker = publishFixes.find((row) => row.kind === "anchors");
  if (anchorBlocker) {
    throw conflict(
      `A quote in ${anchorBlocker.items.join(", ")} is not in this draft. Fix it or clear it, then publish.`,
    );
  }
  const mechanicsBlocker = publishFixes.find(
    (row) => row.kind === "mechanics",
  );
  if (mechanicsBlocker) {
    throw badRequest(
      `A language correction in ${mechanicsBlocker.items.join(", ")} no longer matches the draft. Fix it or remove it, then publish.`,
    );
  }

  const allowedFrom = PUBLISHABLE_FROM[roundKind(assessment)] || [];
  const target = stageAfterPublish(
    roundKind(assessment),
    assessment.recommendation?.path,
  );
  if (!allowedFrom.includes(project.stage)) {
    throw conflict(
      "The student has already moved past this feedback. Assess the newest draft instead.",
    );
  }
  if (!canMoveTo(project, target)) {
    throw conflict(
      "This project is locked to a different stage. Remove the lock before publishing.",
    );
  }
  // A next step the child already ignored would read as the same instruction
  // again. Publishing stays blocked until the teacher writes a different one.
  const blocked = (assessment.sections || []).filter(
    (section) => section.intervention?.needsRewrite,
  );
  if (blocked.length) {
    const names = blocked
      .map((section) => section.label || section.key)
      .join(", ");
    throw conflict(
      `The next step for ${names} repeats what the student already did not act on. Rewrite it in the draft's feedback before publishing.`,
    );
  }

  // Two publishes at once must not both email the family: only the request
  // that wins this guarded update owns the notification.
  const published = await withTransaction(async (session) => {
    const claim = await WritingAssessment.findOneAndUpdate(
      {
        school: schoolId,
        _id: assessment._id,
        aiStatus: "done",
        "publish.state": { $ne: "published" },
      },
      {
        $set: {
          "publish.state": "published",
          "publish.publishedBy": userId,
          "publish.publishedAt": new Date(),
        },
      },
      session ? { new: true, session } : { new: true },
    );
    if (!claim) return false;

    markPublished(assessment, userId);
    project.stage = target;
    project.status = statusAfterPublish(assessment.recommendation?.path);
    project.latestAssessment = assessment._id;
    await saveInSession(assessment, session);
    await saveInSession(project, session);
    return true;
  });

  if (!published) {
    const fresh = await WritingAssessment.findOne({
      school: schoolId,
      _id: assessment._id,
    }).lean();
    if (fresh?.publish?.state === "published") {
      return {
        assessment: summarizeAssessment(fresh),
        project: projectSummary(project),
        alreadyPublished: true,
      };
    }
    throw conflict("This assessment could not be published. Try again.");
  }

  dispatchFeedbackEmail({
    schoolId,
    userId,
    project,
    assignment,
    assessment,
    notify: payload.notify,
  });

  return {
    assessment: summarizeAssessment(assessment),
    project: projectSummary(project),
    alreadyPublished: false,
  };
};

/* ------------------------------------------------------------------ */
/* Stage override and notebook check                                   */
/* ------------------------------------------------------------------ */

const statusForStage = (stage) => {
  if (stage === "completed") return "completed";
  if (stage === "ready_for_notebook" || stage === "awaiting_notebook_check")
    return "ready_for_final";
  return "in_progress";
};

/** D8: every teacher-made stage move is recorded, newest last, bounded. */
const recordStageMove = (project, { from, to, userId, reason = "" }) => {
  if (!from || !to || from === to) return;
  project.stageHistory = [
    ...(project.stageHistory || []),
    { from, to, at: new Date(), by: userId, reason: text(reason, 400) },
  ].slice(-20);
};

const movesBackwards = (from, to) =>
  WRITING_STAGES.indexOf(to) < WRITING_STAGES.indexOf(from);

export const overrideStage = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");

  const project = await WritingProject.findOne({ school: schoolId, _id: id });
  if (!project) throw notFound("Writing project not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  assertOwner(assignment, userId, isAdmin);

  const unlock = payload.locked === false;
  if (unlock) {
    project.teacherOverride = {
      setBy: userId,
      at: new Date(),
      reason: text(payload.reason, 400),
    };
    await project.save();
    return { project: projectSummary(project) };
  }

  const stage = String(payload.stage || "").trim();
  if (!WRITING_STAGES.includes(stage)) {
    throw badRequest("That is not a stage of the writing workflow.");
  }
  if (stage === "awaiting_notebook_check" || stage === "completed") {
    throw badRequest(
      "Use the notebook check to move a student through the final two stages.",
    );
  }

  // D8: publishing closes a round. Re-opening one is a deliberate teacher
  // choice, and it has to say why before the student sees the round reopened.
  const fromStage = project.stage;
  if (movesBackwards(fromStage, stage) && !text(payload.reason, 400)) {
    throw badRequest("Give a reason for moving this student back a stage.");
  }
  recordStageMove(project, {
    from: fromStage,
    to: stage,
    userId,
    reason: payload.reason,
  });

  project.stage = stage;
  project.status = statusForStage(stage);
  // An old "written in the notebook" mark belongs to the stage the teacher just
  // left, so it is cleared with it.
  project.set("notebook.state", "not_requested");
  project.teacherOverride = {
    setBy: userId,
    at: new Date(),
    reason: text(payload.reason, 400),
    stageLockedTo: stage,
  };
  await project.save();

  return { project: projectSummary(project) };
};

const NOTEBOOK_STAGE = {
  not_requested: "ready_for_notebook",
  requested: "awaiting_notebook_check",
  checked: "completed",
  revision_required: "revising",
};

export const recordNotebookReview = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");

  const project = await WritingProject.findOne({ school: schoolId, _id: id });
  if (!project) throw notFound("Writing project not found.");

  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  if (!assignment)
    throw notFound("The writing task this belongs to no longer exists.");
  assertOwner(assignment, userId, isAdmin);

  const state = String(payload.state || "").trim();
  if (!NOTEBOOK_STATES.includes(state)) {
    throw badRequest("Choose a notebook result.");
  }

  const lockedTo = project.teacherOverride?.stageLockedTo;
  if (lockedTo && lockedTo !== NOTEBOOK_STAGE[state]) {
    throw conflict(
      "This project is locked to a different stage. Remove the lock first.",
    );
  }

  const totalPoints = (assignment.rubric || []).reduce(
    (sum, row) => sum + (Number(row.maxScore) || 0),
    0,
  );
  const finalScore =
    payload.finalScore === undefined || payload.finalScore === ""
      ? undefined
      : score(payload.finalScore, totalPoints || 1000);

  project.set("notebook", {
    ...(project.notebook || {}),
    state,
    teacherNote: text(payload.note, 1000),
    checkedAt:
      state === "checked" || state === "revision_required"
        ? new Date()
        : project.notebook?.checkedAt,
    checkedBy:
      state === "checked" || state === "revision_required"
        ? userId
        : project.notebook?.checkedBy,
    finalScore,
  });
  // D8: "needs more work" sends the student back, so it is a backward move and
  // the teacher has to say why before the student is sent back to revise.
  const fromStage = project.stage;
  const toStage = NOTEBOOK_STAGE[state];
  if (state === "revision_required" && movesBackwards(fromStage, toStage) && !text(payload.note, 1000)) {
    throw badRequest("Add a note telling the student what to revise.");
  }
  recordStageMove(project, {
    from: fromStage,
    to: toStage,
    userId,
    reason: payload.note,
  });
  project.stage = toStage;
  project.status =
    state === "checked"
      ? "completed"
      : state === "revision_required"
        ? "needs_revision"
        : "ready_for_final";
  await project.save();

  return {
    project: projectSummary(project),
    notebook: project.notebook?.state || "not_requested",
  };
};

/* ------------------------------------------------------------------ */
/* F13. Return a submission sent by mistake                            */
/* ------------------------------------------------------------------ */

/**
 * Pull back a submission that was not meant to happen. Only a draft that is
 * waiting on the teacher and has nothing published can be returned: the draft
 * is marked withdrawn (never a revision, never a comparison, never published),
 * the editor is restored to exactly what the student sent, the stage goes back
 * to drafting and the next submit reuses the number. The reason is required
 * because the record outlives the click.
 */
export const returnDraftToStudent = async ({
  schoolId,
  projectId,
  userId,
  isAdmin = false,
  payload = {},
}) => {
  const id = objectId(projectId);
  if (!id) throw notFound("Writing project not found.");

  const reason = text(payload.reason, 400);
  if (!reason) throw badRequest("Say why this submission is going back.");

  const project = await WritingProject.findOne({ school: schoolId, _id: id });
  if (!project) throw notFound("Writing project not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: project.assignment,
  }).lean();
  if (!assignment)
    throw notFound("The writing task this belongs to no longer exists.");
  assertOwner(assignment, userId, isAdmin);

  if (!["submitted", "feedback_ready"].includes(project.stage)) {
    throw badRequest(
      "Only a submission that is still waiting on you can be returned.",
    );
  }
  const draft = project.latestDraft
    ? await WritingDraft.findOne({
        school: schoolId,
        _id: project.latestDraft,
        project: project._id,
      })
    : null;
  if (!draft) throw notFound("There is no submitted draft to return.");
  if (draft.withdrawn) {
    throw badRequest("This submission has already been returned.");
  }

  const published = await WritingAssessment.findOne({
    school: schoolId,
    draft: draft._id,
    "publish.state": "published",
  })
    .select("_id")
    .lean();
  if (published) {
    throw badRequest(
      "This feedback is already published. Returning the submission is no longer possible.",
    );
  }

  // An in-flight run has nothing the student can see yet; it is cancelled
  // before it can land on a draft that no longer exists. A finished run is
  // kept on the withdrawn draft (and charged, as the model's work was done),
  // but it can never be published or shown.
  const cancelled = await WritingAssessment.updateMany(
    {
      school: schoolId,
      draft: draft._id,
      aiStatus: { $in: ["pending", "running"] },
    },
    {
      $set: {
        aiStatus: "failed",
        aiErrorCode: "RETURNED_TO_STUDENT",
        aiError: "Returned to the student before the feedback was finished.",
      },
    },
  );
  const kept = await WritingAssessment.countDocuments({
    school: schoolId,
    draft: draft._id,
    aiStatus: "done",
  });

  draft.withdrawn = true;
  draft.withdrawal = { at: new Date(), by: userId, reason };
  await draft.save();

  // The number is free again, and the student's next submit takes it back.
  const previous = await WritingDraft.findOne({
    school: schoolId,
    project: project._id,
    number: { $lt: draft.number },
    withdrawn: { $ne: true },
  })
    .sort({ number: -1 })
    .select("_id number")
    .lean();

  // Restore exactly what was sent, including edits made inside the submit sheet.
  project.autosave = {
    title: draft.title || "",
    sections: (draft.sections || []).map(({ key, index, text: body }) => ({
      key,
      index,
      text: body,
    })),
    updatedAt: new Date(),
  };
  project.draftCount = Number(previous?.number) || 0;
  project.latestDraft = previous?._id || null;
  project.wordCount = draft.totalWords || 0;
  project.lastEditedAt = new Date();
  const latest = project.latestAssessment
    ? await WritingAssessment.findOne({
        school: schoolId,
        _id: project.latestAssessment,
      })
        .select("draft")
        .lean()
    : null;
  if (!latest || sameId(latest.draft, draft._id)) {
    project.latestAssessment = null;
  }
  recordStageMove(project, {
    from: project.stage,
    to: "drafting",
    userId,
    reason,
  });
  project.stage = "drafting";
  project.status = "in_progress";
  await project.save();

  return {
    project: projectSummary(project),
    draft: { id: String(draft._id), number: draft.number, withdrawn: true },
    cancelledAssessments: cancelled.modifiedCount || 0,
    keptAssessments: kept,
  };
};
