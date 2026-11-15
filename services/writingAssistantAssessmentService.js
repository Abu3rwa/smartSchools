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
} from "./aiPromptSafety.js";
import {
  analyzeWordUse,
  applyWordUseDecisions,
} from "./writingWordSupportService.js";
import {
  buildComparisonPrompt,
  buildFeedbackPrompt,
  decideRecommendation,
  extractJsonObject,
  normalizeComparison,
  normalizeFeedback,
} from "./writingAssistantPrompts.js";
import {
  PUBLISHABLE_FROM,
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
  assertCanSpend,
  isCreditError,
  markUsageOutcome,
} from "./aiCreditService.js";

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
    // Enough marked drafts to see the student's current need, not the whole history.
    WritingAssessment.find({
      school: schoolId,
      student: draft.student,
      aiStatus: "done",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("draft scores")
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
  });
  if (!previousDraft) return { previousDraft: null, previousAssessment: null };
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
          aiError: "",
          language,
          requestedBy: userId,
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
  const message = text(
    error?.message || "The assessment could not be completed.",
    500,
  );
  assessment.aiStatus = "failed";
  assessment.aiError = message;
  assessment.ranAt = new Date();
  // Never mark a row that another run has since claimed.
  await WritingAssessment.updateOne(runFilter(assessment), {
    $set: { aiStatus: "failed", aiError: message, ranAt: assessment.ranAt },
  });
  logger.warn("Writing assessment failed", {
    assessmentId: String(assessment._id),
    draft: String(assessment.draft),
    kind: assessment.kind,
    message,
  });
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
const WRITING_AI = {
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
    skipKeys: ["evidence", "wordUseEvidence", "spellingWins"],
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
    wordSupport,
  } = context;
  const snapshot = snapshotFor(draft, assignment);
  const stalledTasks = stalledTasksFrom(project?.revisionLedger || []);
  const wordUse = analyzeWordUse({
    draftText: draftTextOf(draft),
    wordSupport,
  });
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
  });

  const { reply, parsed } = await askForJson({
    prompt,
    feature: "writing_feedback",
    call: (body) =>
      connectAi(
        body,
        aiOptions({ billing, context, feature: "writing_feedback" }),
      ),
  });
  const normalized = normalizeFeedback({
    parsed,
    draft,
    snapshot,
    assignment,
    spellingCandidates,
    studentName,
    roster,
  });
  if (!normalized.ok) {
    await markUsageOutcome({
      entryId: reply.usage?.entryId,
      outcome: "unusable",
    });
    throw upstream(normalized.error);
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
      })
    : null;

  normalized.stalledTasks = checked ? checked.stalledTasks : stalledTasks;
  if (checked) {
    normalized.comparison = {
      criteriaUnresolved: checked.criteriaUnresolved,
      newIssues: checked.newIssues,
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
          },
        }
      : {}),
  };
  const inspected = await inspectReply(
    { fields, revisionLedger },
    reply.usage?.entryId,
  );
  // The stored original stays tokenised: it is what a later round is prompted
  // from, and the name is filled in only when a person reads or receives it.
  const filled = fillStudentTokensDeep(inspected.fields, studentName);

  return {
    modelName: reply.modelName,
    fields: filled,
    original: inspected.fields,
    revisionLedger: inspected.revisionLedger,
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
    wordSupport,
  } = context;
  const snapshot = snapshotFor(draft, assignment);
  const wordUse = analyzeWordUse({
    draftText: draftTextOf(draft),
    wordSupport,
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
  });

  const { reply, parsed } = await askForJson({
    prompt,
    feature: "writing_comparison",
    call: (body) =>
      connectAi(
        body,
        aiOptions({ billing, context, feature: "writing_comparison" }),
      ),
  });
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
  });
  if (!normalized.ok) {
    await markUsageOutcome({
      entryId: reply.usage?.entryId,
      outcome: "unusable",
    });
    throw upstream(normalized.error);
  }

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
    },
    // The tasks this revision was checked against, so the student view is
    // self-contained even if the earlier feedback is never published.
    tasks: normalized.tasks,
    overall: normalized.overall,
    scores: normalized.scores,
    spellingTargets: normalized.spellingTargets,
    spellingWins: normalized.spellingWins,
    ...(wordUse ? { wordUseEvidence: wordUse } : {}),
    totalScore: normalized.scores.reduce(
      (sum, row) => sum + (Number(row.score) || 0),
      0,
    ),
    recommendation: { path: decision.path, reason: decision.reason },
  };

  const inspected = await inspectReply(
    { fields, revisionLedger: normalized.revisionLedger },
    reply.usage?.entryId,
  );
  const filled = fillStudentTokensDeep(inspected.fields, studentName);
  return {
    modelName: reply.modelName,
    fields: filled,
    original: inspected.fields,
    revisionLedger: inspected.revisionLedger,
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

export const assessDraft = async ({
  schoolId,
  draftId,
  userId,
  isAdmin = false,
  language = "",
  force = false,
  // A batch checks credit once for the whole run; single calls check here.
  creditChecked = false,
}) => {
  const context = await loadDraftContext({ schoolId, draftId });
  const { draft, project, assignment } = context;
  assertOwner(assignment, userId, isAdmin);

  if (!sameId(project.latestDraft, draft._id)) {
    throw badRequest("Only the newest submitted draft can be assessed.");
  }

  if (!creditChecked) await assertCanSpend({ schoolId, userId });
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

  const stopHeartbeat = startRunHeartbeat(assessment);
  try {
    const result = await runFeedback({
      context,
      language: resolvedLanguage,
      billing: { schoolId, userId },
      previousDraft,
      previousAssessment,
    });
    assessment.set({
      ...result.fields,
      aiStatus: "done",
      aiError: "",
      ranAt: new Date(),
      modelUsed: result.modelName || "",
      aiOriginal: result.original,
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

  if (!sameId(project.latestDraft, draft._id)) {
    throw badRequest("Only the newest submitted draft can be compared.");
  }
  if (Number(draft.number) < 2) {
    throw badRequest("There is only one draft so far. A comparison needs two.");
  }

  const { previousDraft, previousAssessment } = await loadPreviousRound({
    schoolId,
    project,
    draft,
  });
  if (!previousDraft) {
    throw notFound("The previous draft could not be found.");
  }

  if (!creditChecked) await assertCanSpend({ schoolId, userId });
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
      aiError: "",
      ranAt: new Date(),
      modelUsed: result.modelName || "",
      aiOriginal: result.original,
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
  await assertCanSpend({ schoolId, userId });

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
  await assertCanSpend({ schoolId, userId });
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

const applyEdits = ({ assessment, payload = {}, userId }) => {
  const changed = new Set();
  const mark = (path) => changed.add(path);

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
        score:
          incoming.score === undefined
            ? target.score
            : score(incoming.score, target.maxScore),
      };
      for (const [field, value] of Object.entries(next)) {
        const before = Array.isArray(target[field])
          ? JSON.stringify(target[field])
          : target[field];
        const after = Array.isArray(value) ? JSON.stringify(value) : value;
        if (before !== after) {
          target[field] = value;
          mark(`sections.${incoming.key}:${index}.${field}`);
        }
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
      (sum, row) => sum + (Number(row.score) || 0),
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

  applyEdits({ assessment, payload, userId });
  await assessment.save();

  return {
    assessment: summarizeAssessment(assessment),
    project: projectSummary(project),
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
    applyEdits({ assessment, payload, userId });
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
  project.stage = NOTEBOOK_STAGE[state];
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
