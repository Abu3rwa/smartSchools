import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { plainJsonIssue } from "../utils/plainJson.js";
import {
  MECHANICS_CATEGORIES,
  MECHANICS_REVIEW_STATUSES,
} from "../client/src/utils/writingMechanics.js";

/** One lesson fact the server resolved from the AI's fact id. */
const evidenceFactSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/** A verified position in the canonical displayed section text (UTF-16 units). */
const mechanicAnchorSchema = new mongoose.Schema(
  {
    start: { type: Number, min: 0 },
    end: { type: Number, min: 0 },
  },
  { _id: false },
);

/**
 * A word-level fix the child sees apart from the coaching sentence (A2).
 * Legacy pairs carry only original/correction and stay legal; typed language
 * corrections add category, explanation and a server-verified source anchor.
 * The new fields default to absent so an unrelated save never materialises
 * them onto historical rows.
 */
const mechanicSchema = new mongoose.Schema(
  {
    original: { type: String, trim: true, default: "" },
    correction: { type: String, trim: true, default: "" },
    category: {
      type: String,
      enum: [...MECHANICS_CATEGORIES, ""],
      default: undefined,
    },
    explanation: { type: String, trim: true, default: undefined },
    anchor: { type: mechanicAnchorSchema, default: undefined },
  },
  { _id: false },
);

/**
 * The honest state of one section's language check. Absent on historical
 * records; only the server writes it. `reasons` holds bounded teacher-only
 * codes and is never projected to the child or the family email.
 */
const mechanicsReviewSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1 },
    status: { type: String, enum: MECHANICS_REVIEW_STATUSES },
    reasons: [{ type: String, trim: true }],
  },
  { _id: false },
);

/** The same next step in another form, used when an earlier one was ignored. */
const scaffoldSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["question", "frame", "pointer", "smaller_step"],
      default: "question",
    },
    text: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/** Why this next step changed shape, and whether it still repeats the old one. */
const interventionSchema = new mongoose.Schema(
  {
    previous: { type: String, trim: true, default: "" },
    kind: {
      type: String,
      enum: ["question", "frame", "pointer", "smaller_step", ""],
      default: "",
    },
    repeat: { type: Boolean, default: false },
    // Publish is blocked while true: the reply reissued an ignored instruction.
    needsRewrite: { type: Boolean, default: false },
  },
  { _id: false },
);

const sectionFeedbackSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: "" },
    strengths: [{ type: String, trim: true }],
    improvements: [{ type: String, trim: true }],
    evidence: { type: String, trim: true, default: "" },
    why: { type: String, trim: true, default: "" },
    nextStep: { type: String, trim: true, default: "" },
    // Phase 3 child-facing shape.
    mechanics: [mechanicSchema],
    mechanicsReview: { type: mechanicsReviewSchema, default: undefined },
    scaffold: { type: scaffoldSchema, default: undefined },
    intervention: { type: interventionSchema, default: undefined },
    // The lesson fact the AI named for this section, by server id. Stored with
    // its text so the hint survives a later edit of the pack.
    evidenceFact: { type: evidenceFactSchema, default: undefined },
    score: { type: Number, min: 0, max: 1000 },
    maxScore: { type: Number, min: 0, max: 1000 },
  },
  { _id: false },
);

/** A mechanical clamp applied after the model's own scores (C3/A9). */
const scoreAdjustmentSchema = new mongoose.Schema(
  {
    target: {
      type: String,
      enum: ["section", "score"],
      default: "score",
    },
    key: { type: String, trim: true, default: "" },
    index: { type: Number, default: 0 },
    from: { type: Number, default: 0 },
    to: { type: Number, default: 0 },
    reason: { type: String, trim: true, default: "" },
    detail: { type: String, trim: true, default: "" },
    // True once a teacher changed this exact mark themselves; the clamp is
    // kept as history, but it no longer describes the current score.
    overriddenByTeacher: { type: Boolean, default: false },
  },
  { _id: false },
);

const changedSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    meaningful: { type: Boolean, default: false },
    kind: {
      type: String,
      enum: ["changed", "added", "removed"],
      default: "changed",
    },
  },
  { _id: false },
);

const feedbackAppliedSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    note: { type: String, trim: true, default: "" },
    applied: { type: Boolean, default: false },
  },
  { _id: false },
);

/** One revision task, keyed so the next draft can be checked against it. */
const revisionTaskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const taskResultSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, trim: true, default: "" },
    applied: { type: Boolean, default: false },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

/** One supported word and whether the draft actually used it. */
const wordUseRowSchema = new mongoose.Schema(
  {
    word: { type: String, trim: true, required: true },
    listId: { type: String, trim: true, default: "" },
    grade: { type: String, trim: true, default: "" },
    week: { type: Number, default: null },
    used: { type: Boolean, default: false },
    count: { type: Number, default: 0, min: 0 },
    nearMisses: [{ type: String, trim: true }],
    // A teacher may confirm the evidence or set it aside; neither changes a score.
    teacherDecision: {
      type: String,
      enum: ["", "confirmed", "rejected"],
      default: "",
    },
  },
  { _id: false },
);

/** What one AI reply cost and how long it took; the credit ledger keeps the money. */
const usageSchema = new mongoose.Schema(
  {
    inputTokens: { type: Number, default: 0, min: 0 },
    cachedInputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, default: 0, min: 0 },
    // Provider cost in the same unit as the credit ledger's costCents.
    costCents: { type: Number, default: 0, min: 0 },
    latencyMs: { type: Number, default: 0, min: 0 },
    entryId: { type: mongoose.Schema.Types.ObjectId, ref: "AiCreditEntry" },
  },
  { _id: false },
);

/** Server-computed facts about the draft the reply was written from. */
const metricsSchema = new mongoose.Schema(
  {
    totalWords: { type: Number, default: 0, min: 0 },
    sentenceCount: { type: Number, default: 0, min: 0 },
    paragraphCount: { type: Number, default: 0, min: 0 },
    averageSentenceWords: { type: Number, default: 0, min: 0 },
    longestSentenceWords: { type: Number, default: 0, min: 0 },
    repeatedPhraseCount: { type: Number, default: 0, min: 0 },
    repeatedPhrases: [{ type: String, trim: true }],
    readingMinutes: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/** A missed spelling word the AI suggested reusing, filtered to this topic. */
const spellingTargetSchema = new mongoose.Schema(
  {
    word: { type: String, required: true, trim: true },
    grade: { type: String, trim: true, default: "" },
    week: { type: Number, default: null },
  },
  { _id: false },
);

/**
 * AI output for one draft version, plus the teacher's edits.
 * `kind: 'feedback'` assesses a draft. `kind: 'comparison'` assesses what changed
 * between two drafts. A reassessment is a new document so the older one survives.
 */
const writingAssessmentSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingProject",
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingAssignment",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    draft: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingDraft",
      required: true,
    },
    previousDraft: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingDraft",
    },
    kind: {
      type: String,
      enum: ["feedback", "comparison"],
      default: "feedback",
    },
    // The language the feedback text itself was written in. A family email must
    // not dress English sentences in Arabic chrome, so it follows this.
    language: { type: String, enum: ["en", "ar"], default: "en" },
    aiStatus: {
      type: String,
      enum: ["pending", "running", "done", "failed"],
      default: "pending",
    },
    // Machine signal for a failed run; aiError is the sentence a teacher reads.
    aiErrorCode: { type: String, trim: true, default: "" },
    aiError: { type: String, trim: true, default: "" },
    attempts: { type: Number, default: 0, min: 0 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ranAt: { type: Date },
    modelUsed: { type: String, trim: true, default: "" },
    // Which prompt and reply shape produced this row; see writingPromptVersions.
    promptVersion: { type: String, trim: true, default: "" },
    schemaVersion: { type: String, trim: true, default: "" },
    usage: { type: usageSchema, default: undefined },
    metrics: { type: metricsSchema, default: undefined },
    sections: { type: [sectionFeedbackSchema], default: [] },
    overall: {
      summary: { type: String, trim: true, default: "" },
      nextPriorities: [{ type: String, trim: true }],
      organisation: { type: String, trim: true, default: "" },
      centralIdea: { type: String, trim: true, default: "" },
      flow: { type: String, trim: true, default: "" },
      repetition: { type: String, trim: true, default: "" },
      requirements: { type: String, trim: true, default: "" },
    },
    scores: [
      {
        key: { type: String, trim: true },
        label: { type: String, trim: true },
        score: { type: Number, min: 0, max: 1000 },
        maxScore: { type: Number, min: 0, max: 1000 },
        explanation: { type: String, trim: true, default: "" },
        // One quote from the draft this criterion was judged on.
        evidence: { type: String, trim: true, default: "" },
        // A criterion outside the class's taught focus: kept for the teacher,
        // never shown to the child and never counted in the total (A7).
        focusExcluded: { type: Boolean, default: false },
      },
    ],
    totalScore: { type: Number, default: 0 },
    // The child-facing budget the server applied, so every view can prove the
    // same cap without recomputing it (A1/A3).
    focus: {
      tier: { type: String, trim: true, default: "" },
      strengthsPerSection: { type: Number, default: 0 },
      improvementsPerSection: { type: Number, default: 0 },
      sectionsWithImprovements: { type: Number, default: 0 },
      totalImprovements: { type: Number, default: 0 },
      priorities: { type: Number, default: 0 },
      childSections: [{ type: String, trim: true }],
    },
    // Analysis the teacher keeps but the child does not see: notes trimmed by
    // the focus budget, waiting to be promoted by hand (A3).
    teacherOnly: {
      notes: [
        {
          key: { type: String, trim: true },
          index: { type: Number, default: 0 },
          label: { type: String, trim: true, default: "" },
          text: { type: String, trim: true, default: "" },
        },
      ],
      priorities: [{ type: String, trim: true }],
    },
    // Measured reading level of the child-facing prose, kept with its ceiling
    // so a prompt change that raises it is visible in the eval (A4).
    readability: {
      score: { type: Number, default: 0 },
      ceiling: { type: Number, default: 0 },
      ok: { type: Boolean, default: true },
    },
    // Marks the server lowered because the draft's own shape contradicted the
    // model. Recorded so a teacher sees why a mark differs from the reply.
    scoreAdjustments: { type: [scoreAdjustmentSchema], default: [] },
    // The priorities as keyed tasks, so a comparison can report each one.
    tasks: { type: [revisionTaskSchema], default: [] },
    // Missed words from the student's spelling list that fit this topic. The
    // server picks them from a fixed candidate list; the model only proposes.
    spellingTargets: { type: [spellingTargetSchema], default: [] },
    // Words from a published earlier round that are really in this draft.
    // Read from the text, never taken from a model claim.
    spellingWins: {
      type: [{ word: { type: String, trim: true } }],
      default: [],
    },
    // Deterministic evidence from the draft itself: which supported words the
    // student used, and conservative near misses. Never scored by this field.
    wordUseEvidence: {
      spelling: { type: [wordUseRowSchema], default: undefined },
      vocabulary: { type: [wordUseRowSchema], default: undefined },
    },
    comparison: {
      changedBySection: { type: [changedSectionSchema], default: [] },
      criteriaImproved: [{ type: String, trim: true }],
      criteriaUnresolved: [{ type: String, trim: true }],
      feedbackApplied: { type: [feedbackAppliedSchema], default: [] },
      taskResults: { type: [taskResultSchema], default: [] },
      newIssues: [{ type: String, trim: true }],
      wordDelta: { type: Number, default: 0 },
      encouragement: { type: String, trim: true, default: "" },
    },
    recommendation: {
      path: { type: String, enum: ["revise", "notebook"] },
      reason: { type: String, trim: true, default: "" },
    },
    publish: {
      state: { type: String, enum: ["draft", "published"], default: "draft" },
      publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      publishedAt: { type: Date },
      // What happened to the family email. The send itself is detached from the
      // publish response, so without this record a crash mid-send is invisible:
      // the teacher sees "published" and no one can tell whether the mail left.
      email: {
        status: {
          type: String,
          enum: ["pending", "sent", "partial", "failed", "skipped"],
          default: undefined,
        },
        attempts: { type: Number, default: 0, min: 0 },
        lastAttemptAt: { type: Date },
        sentAt: { type: Date },
        // "off", "empty", "not-feedback" — why nothing was sent, in the
        // service's own vocabulary so a retry job can decide to leave it alone.
        skippedReason: { type: String, trim: true, default: "" },
        lastError: { type: String, trim: true, default: "" },
        recipients: { type: Number, default: 0, min: 0 },
        // The channels the teacher chose, so a retry cannot widen the audience.
        channels: {
          student: { type: Boolean, default: false },
          parents: { type: Boolean, default: false },
        },
        // L2: one row per address. The aggregate above answers "did it leave?";
        // these rows answer "who has it?", which a resend needs to stay
        // idempotent and a partial failure needs to retry without a duplicate.
        deliveries: {
          type: [
            new mongoose.Schema(
              {
                email: { type: String, required: true, trim: true, lowercase: true },
                role: { type: String, enum: ["student", "parent"], required: true },
                status: {
                  type: String,
                  enum: ["queued", "sent", "failed", "suppressed"],
                  default: "queued",
                },
                attempts: { type: Number, default: 0, min: 0 },
                lastAttemptAt: Date,
                sentAt: Date,
                lastError: { type: String, trim: true, default: "" },
                suppressedReason: { type: String, trim: true, default: "" },
              },
              { _id: false },
            ),
          ],
          default: [],
        },
      },
    },
    teacherEdits: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: { type: Date },
      changedPaths: [{ type: String, trim: true }],
      note: { type: String, trim: true, default: "" },
    },
    // The tokenised reply the edit trail diffs against. It is written by the
    // service as plain JSON; the validator keeps any other writer honest.
    aiOriginal: {
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: (value) => plainJsonIssue(value) === null,
        message: "aiOriginal must be bounded plain JSON",
      },
    },
  },
  { timestamps: true },
);

writingAssessmentSchema.index({ school: 1, draft: 1, kind: 1, createdAt: -1 });
writingAssessmentSchema.index({ school: 1, project: 1, kind: 1 });
// The per-student history read runs on every assess/compare and every history
// view; without this index it scans the school's whole collection.
writingAssessmentSchema.index({ school: 1, student: 1, aiStatus: 1, createdAt: -1 });
writingAssessmentSchema.index({ school: 1, assignment: 1, "publish.state": 1 });
// Two teachers clicking Assess must not spend the AI twice on the same draft.
writingAssessmentSchema.index(
  { school: 1, draft: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { aiStatus: { $in: ["pending", "running"] } },
  },
);
writingAssessmentSchema.plugin(tenantIsolationPlugin);

const WritingAssessment = mongoose.model(
  "WritingAssessment",
  writingAssessmentSchema,
);
export default WritingAssessment;
