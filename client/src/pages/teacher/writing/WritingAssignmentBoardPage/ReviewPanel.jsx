import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineBadgeCheck,
  HiOutlineCheckCircle,
  HiOutlinePrinter,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineX,
} from "react-icons/hi";
import writingService from "../../../../services/writingService.js";
import { printableErrorText } from "../../../../utils/printDocument.js";
import {
  creditErrorMessage,
  isCreditError,
} from "../../../../utils/aiCredit.js";
import {
  WORD_USE_DEFAULT_SHOWN,
  formFromAssessment,
  latestForDraft,
  payloadFromForm,
  publishCheck,
  reviewStateOf,
  splitLines,
  splitWordUse,
} from "./assessmentPresentation.js";
import { canReturnSubmission, formatDateTime } from "./boardPresentation.js";
import { WRITING_STAGES } from "../../../../constants/writingPresets.js";
import { isRepeatedInstruction } from "../../../../utils/writingTextMatch.js";
import FeedbackEmailResend from "./FeedbackEmailResend.jsx";
import EmailRecipients from "./EmailRecipients.jsx";
import CommentBank from "./CommentBank.jsx";
import DraftDiff from "./DraftDiff.jsx";
import LanguageCorrectionsEditor from "./LanguageCorrectionsEditor.jsx";
import NoteRewrite from "./NoteRewrite.jsx";
import PublishChecklist from "./PublishChecklist.jsx";
import DraftEssayView from "../../../student/writing/WritingWorkspacePage/DraftEssayView.jsx";
import FeedbackCard from "../../../student/writing/WritingWorkspacePage/FeedbackCard.jsx";
import { rubricRows } from "../../../../utils/writingRubric.js";
import "../../../student/writing/WritingWorkspacePage/WritingWorkspacePage.css";

const pendingLabel = (pending, key) => pending === key;

const PRECHECK_KEYS = {
  empty: "writing:teacher.review.precheck.empty",
  below_minimum: "writing:teacher.review.precheck.belowMinimum",
  pasted: "writing:teacher.review.precheck.pasted",
  single_sentence: "writing:teacher.review.precheck.singleSentence",
};

const MECHANICS_ERROR_KEYS = {
  WRITING_MECHANICS_INVALID: "writing:languageCorrections.teacher.saveInvalid",
  WRITING_MECHANICS_ANCHOR_MISMATCH:
    "writing:languageCorrections.teacher.saveAnchor",
  WRITING_MECHANICS_LIMIT: "writing:languageCorrections.teacher.saveLimit",
};

const ADJUSTMENT_REASONS = new Set([
  "empty_section",
  "rebuttal_without_pack_evidence",
  "missing_required_section",
]);

export default function ReviewPanel({ history, onChanged, onDirtyChange, emailDelivery, teacherTools = false }) {
  const { t, i18n } = useTranslation(["writing"]);
  const project = history?.project || null;
  const drafts = history?.drafts || [];
  const latestDraft = drafts[drafts.length - 1] || null;
  const feedback = latestForDraft(
    history?.assessments,
    latestDraft?._id,
    "feedback",
  );
  // Feedback on a revision carries its own comparison; older rounds stored one apart.
  const embedded = Boolean(feedback?.previousDraft);
  const legacyComparison = latestForDraft(
    history?.assessments,
    latestDraft?._id,
    "comparison",
  );
  const comparison = embedded ? feedback : legacyComparison;

  const [form, setForm] = useState(() => formFromAssessment(feedback));
  const [legacyForm, setLegacyForm] = useState(() =>
    formFromAssessment(legacyComparison),
  );
  const comparisonForm = embedded ? form : legacyForm;
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [pending, setPending] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notify, setNotify] = useState({ student: true, parents: true });
  // G1: the evidence list shows eight rows until the teacher asks for the rest.
  const [showAllWordUse, setShowAllWordUse] = useState(false);
  // A claimed run is pending before it is running; both mean "leave it alone".
  const runningRun = ["pending", "running"].includes(feedback?.aiStatus);
  const emailRecipients = {
    student: Boolean(emailDelivery?.students && notify.student),
    parents: Boolean(emailDelivery?.parents && notify.parents),
  };
  // F6: what publishing sends the child and what would stop it. Derived from the
  // live form so the block always describes the text on screen.
  const feedbackCheck = publishCheck({
    form,
    assessment: feedback,
    latestDraft,
    email: emailRecipients,
  });
  const comparisonCheck = embedded
    ? feedbackCheck
    : publishCheck({
        form: comparisonForm,
        assessment: comparison,
        latestDraft,
        email: emailRecipients,
      });

  const feedbackStamp = feedback
    ? `${feedback._id}:${feedback.aiStatus}:${feedback.teacherEdits?.at || ""}`
    : "";
  const comparisonStamp = legacyComparison
    ? `${legacyComparison._id}:${legacyComparison.aiStatus}:${legacyComparison.teacherEdits?.at || ""}`
    : "";

  useEffect(() => {
    setForm(formFromAssessment(feedback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackStamp]);

  useEffect(() => {
    setLegacyForm(formFromAssessment(legacyComparison));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonStamp]);

  // A run started here or in another tab must finish on screen; a clock alone left the modal frozen.
  useEffect(() => {
    if (!runningRun) return undefined;
    const id = window.setInterval(() => {
      setNow(Date.now());
      onChanged();
    }, 6000);
    return () => window.clearInterval(id);
  }, [onChanged, runningRun]);

  const feedbackEditable =
    feedback?.aiStatus === "done" && feedback.publish?.state !== "published";
  const comparisonEditable =
    comparison?.aiStatus === "done" &&
    comparison.publish?.state !== "published";

  // Unsaved text lives here, not in the parent: compare the live form with the
  // saved assessment so closing the panel can ask before dropping the edits.
  const liveFeedback = useMemo(() => JSON.stringify(payloadFromForm(form)), [form]);
  const liveComparison = useMemo(
    () => JSON.stringify(payloadFromForm(comparisonForm)),
    [comparisonForm],
  );
  const savedFeedback = useMemo(
    () => JSON.stringify(payloadFromForm(formFromAssessment(feedback))),
    [feedback],
  );
  const savedComparison = useMemo(
    () => JSON.stringify(payloadFromForm(formFromAssessment(legacyComparison))),
    [legacyComparison],
  );
  const dirty =
    (feedbackEditable && liveFeedback !== savedFeedback) ||
    (comparisonEditable && liveComparison !== savedComparison);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const previewSections = useMemo(
    () => payloadFromForm(form)?.sections || [],
    [form],
  );

  // F10: the preview is the child's own card, fed from the text on this form, so
  // a note the teacher checks here appears to the child in the same words.
  const previewFeedback = useMemo(() => {
    const payload = payloadFromForm(form);
    return {
      overall: payload.overall,
      scores: rubricRows(form?.scores, { marks: history?.marksMode }),
      spellingTargets: payload.spellingTargets || [],
    };
  }, [form, history?.marksMode]);

  if (!project) return null;
  // No draft means nothing to assess; say so instead of leaving the panel blank.
  if (!latestDraft) {
    return (
      <section className="wa-review">
        <header className="wa-review-head">
          <h3>{t("writing:teacher.review.title")}</h3>
        </header>
        <div className="wa-review-empty">
          <h4>{t("writing:teacher.review.noDraftTitle")}</h4>
          <p>{t("writing:teacher.review.noDraftBody")}</p>
        </div>
      </section>
    );
  }

  const wordUse = splitWordUse(form?.wordUse);
  const wordUseCapped =
    !showAllWordUse &&
    wordUse.active.length + wordUse.unused.length > WORD_USE_DEFAULT_SHOWN;
  const wordUseActive = wordUseCapped
    ? wordUse.active.slice(0, WORD_USE_DEFAULT_SHOWN)
    : wordUse.active;
  const wordUseUnused = wordUseCapped
    ? wordUse.unused.slice(0, Math.max(0, WORD_USE_DEFAULT_SHOWN - wordUseActive.length))
    : wordUse.unused;

  const run = async (key, action, successMessage) => {
    setPending(key);
    try {
      const result = await action();
      await onChanged();
      if (successMessage) {
        const message =
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage;
        if (message) toast.success(message);
      }
    } catch (error) {
      const mechanicsKey = MECHANICS_ERROR_KEYS[error?.response?.data?.code];
      toast.error(
        creditErrorMessage(error, t) ||
          (mechanicsKey && t(mechanicsKey)) ||
          error?.response?.data?.message ||
          t("writing:teacher.review.failed"),
      );
      if (isCreditError(error) || key === "assess") onChanged();
    } finally {
      setPending("");
    }
  };

  const updateForm = (patch) =>
    setForm((current) => ({ ...current, ...patch }));
  const updateSection = (index, patch) =>
    setForm((current) => ({
      ...current,
      sections: current.sections.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  // The assessed draft's own words, so a selection is checked against the text
  // the correction will be drawn on.
  const draftTextFor = (row) => {
    const source = (latestDraft?.sections || []).find(
      (item) =>
        item.key === row.key && Number(item.index) === Number(row.index),
    );
    return String(source?.text || "").trim();
  };
  const updateScore = (index, patch) =>
    setForm((current) => ({
      ...current,
      scores: current.scores.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  const updateComparison = (patch) =>
    (embedded ? setForm : setLegacyForm)((current) => ({
      ...current,
      comparison: { ...current.comparison, ...patch },
    }));
  const dropTarget = (word) =>
    setForm((current) => ({
      ...current,
      spellingTargets: (current.spellingTargets || []).filter(
        (row) => row.word !== word,
      ),
    }));
  const decideWordUse = (source, word, decision) =>
    setForm((current) => ({
      ...current,
      wordUse: (current.wordUse || []).map((row) =>
        row.source === source && row.word === word
          ? { ...row, decision: row.decision === decision ? "" : decision }
          : row,
      ),
    }));

  const adjustments = feedback?.scoreAdjustments || [];
  const adjustmentLabel = (row) => {
    if (row.target === "section") {
      const match = (form?.sections || []).find(
        (item) =>
          item.key === row.key && Number(item.index) === Number(row.index),
      );
      return match?.label || `${row.key} ${Number(row.index) + 1}`;
    }
    const match = (form?.scores || []).find((item) => item.key === row.key);
    return match?.label || row.key;
  };

  // The teacher's tap is the confirmation: re-running a finished draft is what
  // the Assess / Re-assess button is for, so it says so to the server.
  const assess = () =>
    run(
      "assess",
      async () => {
        const result = await writingService.assessDraft(latestDraft._id, {
          force: true,
          // K6: a slow provider can outlive the request; the server answers with
          // the claimed run and this panel polls it, so the teacher can leave.
          async: true,
        });
        // A draft the server refused before any AI call: say why, cost nothing.
        if (result?.precheck) {
          const precheck = result.precheck;
          toast.error(
            PRECHECK_KEYS[precheck.code]
              ? t(PRECHECK_KEYS[precheck.code], {
                  words: precheck.words,
                  minWords: precheck.minWords,
                })
              : precheck.guidance,
            { duration: 8000 },
          );
          return null;
        }
        return result;
      },
      (result) => {
        if (result === null) return null;
        return t(
          result?.pending
            ? "writing:teacher.review.assessStarted"
            : "writing:teacher.review.assessedToast",
        );
      },
    );
  // A fresh run replaces the editable text, so ask before dropping unsaved edits.
  const reassess = () => {
    if (dirty && !window.confirm(t("writing:teacher.review.reassessDiscard"))) return;
    assess();
  };
  const saveFeedback = (assessment) =>
    run(
      "save",
      () =>
        writingService.saveAssessmentEdits(
          assessment._id,
          payloadFromForm(form),
        ),
      t("writing:teacher.review.savedToast"),
    );
  // The server sends no delivery result, so never claim an email went out.
  const publishedMessage = (result) => {
    if (result?.alreadyPublished) {
      return t("writing:teacher.review.publishedAlready");
    }
    return t(
      emailRecipients.student || emailRecipients.parents
        ? "writing:teacher.review.publishedToastEmail"
        : "writing:teacher.review.publishedToast",
    );
  };
  // Publishing ends the round and cannot be taken back, so say what happens first.
  const recipientNames = [
    emailRecipients.student && t("writing:teacher.review.emailStudent"),
    emailRecipients.parents && t("writing:teacher.review.emailParents"),
  ]
    .filter(Boolean)
    .join(", ");
  const confirmPublish = () =>
    window.confirm(
      recipientNames
        ? t("writing:teacher.review.publishConfirmEmail", {
            recipients: recipientNames,
          })
        : t("writing:teacher.review.publishConfirm"),
    );
  const publishFeedback = (assessment) =>
    run(
      "publish",
      () =>
        writingService.publishAssessment(assessment._id, {
          ...payloadFromForm(form),
          notify: emailRecipients,
        }),
      publishedMessage,
    );

  const saveComparison = (assessment) =>
    run(
      "saveCompare",
      () =>
        writingService.saveAssessmentEdits(
          assessment._id,
          payloadFromForm(comparisonForm),
        ),
      t("writing:teacher.review.savedToast"),
    );
  const publishComparison = (assessment) =>
    run(
      "publishCompare",
      () =>
        writingService.publishAssessment(assessment._id, {
          ...payloadFromForm(comparisonForm),
          notify: emailRecipients,
        }),
      publishedMessage,
    );

  // D8: publishing closes a round, so moving a student back needs a reason. The
  // server refuses the move without one; ask here so the teacher is not bounced.
  const moveStage = (stage) => {
    const backwards =
      WRITING_STAGES.indexOf(stage) < WRITING_STAGES.indexOf(project.stage);
    let reason = "";
    if (backwards) {
      const answer = window.prompt(
        t("writing:teacher.review.stageReasonPrompt"),
      );
      if (answer === null) return undefined;
      reason = answer.trim();
      if (!reason) {
        toast.error(t("writing:teacher.review.stageReasonRequired"));
        return undefined;
      }
    }
    return run(
      "stage",
      () =>
        writingService.overrideProjectStage(project.id || project._id, {
          stage,
          reason,
        }),
      t("writing:teacher.review.stageMoved"),
    );
  };
  const unlockStage = () =>
    run(
      "unlock",
      () =>
        writingService.overrideProjectStage(project.id || project._id, {
          locked: false,
        }),
      t("writing:teacher.review.stageMoved"),
    );

  const printDraft = async () => {
    if (!latestDraft) return;
    setExporting(true);
    try {
      await writingService.printProjectForTeacher(
        project.id || project._id,
        latestDraft._id,
      );
    } catch (error) {
      toast.error(
        printableErrorText(error, t("writing:teacher.review.exportFailed")),
      );
    } finally {
      setExporting(false);
    }
  };

  // F13: the child pressed submit too early. The text goes back untouched and
  // the reason is kept with the stage move, so an empty answer sends nothing.
  const returnSubmission = () => {
    const answer = window.prompt(
      t("writing:teacher.review.returnPrompt"),
    );
    if (answer === null) return undefined;
    const reason = answer.trim();
    if (!reason) {
      toast.error(t("writing:teacher.review.returnReasonRequired"));
      return undefined;
    }
    return run(
      "return",
      () =>
        writingService.returnDraftToStudent(project.id || project._id, reason),
      t("writing:teacher.review.returned"),
    );
  };

  // D8: "needs more work" sends the student back a stage, so the note explaining
  // what to revise is required before the move is sent.
  const notebook = (state) => {
    if (state === "revision_required" && !note.trim()) {
      toast.error(t("writing:teacher.review.notebookNoteRequired"));
      return undefined;
    }
    return run(
      "notebook",
      () =>
        writingService.recordNotebookReview(project.id || project._id, {
          state,
          note,
          finalScore: finalScore === "" ? undefined : Number(finalScore),
        }),
      t("writing:teacher.review.notebookSaved"),
    );
  };

  const reviewState = reviewStateOf(feedback, now);
  const lockedTo = project.teacherOverride?.stageLockedTo || "";
  const totalPoints = (history?.assignment?.rubric || []).reduce(
    (sum, row) => sum + (Number(row.maxScore) || 0),
    0,
  );

  return (
    <section className="wa-review">
      <header className="wa-review-head">
        <h3>{t("writing:teacher.review.title")}</h3>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={exporting}
          onClick={printDraft}
        >
          <HiOutlinePrinter size={15} aria-hidden="true" />
          {t("writing:teacher.review.exportPdf")}
        </button>
        {canReturnSubmission({
          stage: project.stage,
          published: feedback?.publish?.state === "published",
        }) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={Boolean(pending)}
            onClick={returnSubmission}
          >
            {t("writing:teacher.review.returnAction")}
          </button>
        )}
        {feedback?.publish?.state === "published" && (
          <span className="wa-badge is-published">
            <HiOutlineBadgeCheck size={15} aria-hidden="true" />
            {t("writing:teacher.review.publishedOn", {
              when: formatDateTime(feedback.publish.publishedAt, i18n.language),
            })}
          </span>
        )}
      </header>

      <FeedbackEmailResend
        key={project.id || project._id}
        history={history}
        emailDelivery={emailDelivery}
        disabled={Boolean(pending)}
      />

      {reviewState === "none" && (
        <div className="wa-review-empty">
          <h4>{t("writing:teacher.review.noFeedbackTitle")}</h4>
          <p>{t("writing:teacher.review.noFeedbackYet")}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={Boolean(pending)}
            onClick={assess}
          >
            <HiOutlineSparkles size={16} aria-hidden="true" />
            {pendingLabel(pending, "assess")
              ? t("writing:teacher.review.assessing")
              : t("writing:teacher.review.assess")}
          </button>
        </div>
      )}

      {(reviewState === "running" || reviewState === "stalled") && (
        <div
          className={`wa-review-running${reviewState === "stalled" ? " is-stalled" : ""}`}
          aria-live="polite"
        >
          {reviewState === "stalled" ? (
            <HiOutlineRefresh size={18} aria-hidden="true" />
          ) : (
            <div className="spinner" aria-hidden="true" />
          )}
          <div className="wa-review-running-body">
            <h4>
              {reviewState === "stalled"
                ? t("writing:teacher.review.stalledTitle")
                : t("writing:teacher.review.runningTitle")}
            </h4>
            <p>
              {reviewState === "stalled"
                ? t("writing:teacher.review.stalled")
                : t("writing:teacher.review.assessingHint")}
            </p>
          </div>
          {reviewState === "stalled" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={Boolean(pending)}
              onClick={assess}
            >
              <HiOutlineRefresh size={15} aria-hidden="true" />
              {t("writing:teacher.review.retryAssess")}
            </button>
          )}
        </div>
      )}

      {reviewState === "failed" && (
        <div className="wa-review-failed" role="alert">
          <h4>{t("writing:teacher.review.failedTitle")}</h4>
          <p>
            {feedback.aiError || t("writing:teacher.review.failedNoReason")}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={Boolean(pending)}
            onClick={assess}
          >
            <HiOutlineRefresh size={15} aria-hidden="true" />
            {t("writing:teacher.review.retryAssess")}
          </button>
        </div>
      )}

      {history?.differentiation && (
        <p className="wa-differentiation">
          <span className="wa-differentiation-label">
            {t("writing:teacher.review.differentiation")}
          </span>
          <span>
            {t(`writing:teacher.review.tier.${history.differentiation.tier}`)}
          </span>
          {history.differentiation.spellingGrade && (
            <span>
              {t("writing:teacher.review.spellingGrade", {
                grade: history.differentiation.spellingGrade,
              })}
            </span>
          )}
          {history.differentiation.spellingAccuracy !== null && (
            <span>
              {t("writing:teacher.review.spellingAccuracy", {
                n: Math.round(history.differentiation.spellingAccuracy),
              })}
            </span>
          )}
        </p>
      )}

      {reviewState === "done" && form && (
        <div className="wa-review-block">
          <div className="wa-review-block-head">
            <h4>
              {t("writing:teacher.review.draftFeedback", {
                n: latestDraft.number,
              })}
            </h4>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={Boolean(pending)}
              onClick={reassess}
            >
              {t("writing:teacher.review.reassess")}
            </button>
          </div>

          {/* F10: the child's own card and the child's own draft view, both built
              from this form. A note is read here in the words the child will get. */}
          <details className="wa-preview">
            <summary>{t("writing:teacher.review.previewAsStudent")}</summary>
            <p className="wa-hint">
              {t("writing:teacher.review.previewHint")}
            </p>
            <div className="ws-page wa-preview-body">
              <FeedbackCard
                draftNumber={latestDraft.number}
                feedback={previewFeedback}
                marks={history?.marksMode}
              />
              <DraftEssayView
                assessment={{ sections: previewSections }}
                assignment={history?.assignment}
                draft={latestDraft}
                locale={i18n.language}
              />
            </div>
          </details>

          {/* F12: what the AI never sees and what only the teacher decides.
              Run metadata (model, prompt version, timestamp) stays internal. */}
          <details className="wa-how">
            <summary>{t("writing:teacher.review.howTitle")}</summary>
            <ul className="wa-how-list">
              <li>{t("writing:teacher.review.howSees")}</li>
              <li>{t("writing:teacher.review.howNever")}</li>
              <li>{t("writing:teacher.review.howTeacher")}</li>
              <li>{t("writing:teacher.review.howChild")}</li>
            </ul>
          </details>

          {history?.assignment?.exemplarText && (
            <details className="wa-preview">
              <summary>{t("writing:teacher.review.exemplar")}</summary>
              <p className="wa-hint">
                {t("writing:teacher.review.exemplarHint")}
              </p>
              <div className="wa-review-exemplar">
                {history.assignment.exemplarText}
              </div>
            </details>
          )}

          <label className="wa-field">
            <span>{t("writing:teacher.review.summary")}</span>
            <textarea
              rows={6}
              value={form.summary}
              readOnly={!feedbackEditable}
              onChange={(event) => updateForm({ summary: event.target.value })}
            />
          </label>

          <div className="wa-review-priorities">
            <span className="wa-field-label">
              {t("writing:teacher.review.nextPriorities")}
            </span>
            {form.priorities.map((value, index) => (
              <input
                key={index}
                type="text"
                value={value}
                readOnly={!feedbackEditable}
                aria-label={t("writing:teacher.review.priority", {
                  n: index + 1,
                })}
                onChange={(event) =>
                  updateForm({
                    priorities: form.priorities.map((row, rowIndex) =>
                      rowIndex === index ? event.target.value : row,
                    ),
                  })
                }
              />
            ))}
          </div>

          {(form.spellingTargets || []).length > 0 && (
            <div className="wa-review-spelling">
              <span className="wa-field-label">
                {t("writing:teacher.review.spellingTargets")}
              </span>
              <div className="wa-spelling-chips">
                {form.spellingTargets.map((row) => (
                  <span
                    className="wa-spelling-chip"
                    key={row.word}
                    title={row.reason || undefined}
                  >
                    {row.word}
                    {row.grade ? <em>{row.grade}</em> : null}
                    {feedbackEditable && (
                      <button
                        type="button"
                        className="wa-spelling-remove"
                        aria-label={t("writing:teacher.review.spellingRemove", {
                          word: row.word,
                        })}
                        onClick={() => dropTarget(row.word)}
                      >
                        <HiOutlineX size={12} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <p className="wa-hint">
                {t("writing:teacher.review.spellingTargetsHint")}
              </p>
            </div>
          )}

          {(wordUse.active.length > 0 || wordUse.unused.length > 0) && (
            <div className="wa-review-words">
              <span className="wa-field-label">
                {t("writing:teacher.review.wordUseTitle")}
              </span>
              {wordUseActive.length > 0 && (
                <ul className="wa-word-use">
                  {wordUseActive.map((row) => (
                    <li
                      key={`${row.source}:${row.word}`}
                      className={`wa-word-use-row is-${row.decision || "open"}`}
                    >
                      <span className="wa-word-use-word">
                        {row.word}
                        <em>
                          {row.source === "spelling"
                            ? t("writing:teacher.review.wordUseSpelling")
                            : t("writing:teacher.review.wordUseVocabulary")}
                        </em>
                      </span>
                      <span className="wa-word-use-fact">
                        {row.used
                          ? t("writing:teacher.review.wordUseUsed")
                          : t("writing:teacher.review.wordUseNear", {
                              words: row.nearMisses.join(", "),
                            })}
                      </span>
                      {feedbackEditable && (
                        <span className="wa-word-use-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-pressed={row.decision === "confirmed"}
                            onClick={() =>
                              decideWordUse(row.source, row.word, "confirmed")
                            }
                          >
                            {t("writing:teacher.review.wordUseConfirm")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-pressed={row.decision === "rejected"}
                            onClick={() =>
                              decideWordUse(row.source, row.word, "rejected")
                            }
                          >
                            {t("writing:teacher.review.wordUseReject")}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {wordUseUnused.length > 0 && (
                <p className="wa-word-use-unused">
                  <span>{t("writing:teacher.review.wordUseMissing")}</span>
                  {wordUseUnused.map((row) => (
                    <span
                      key={`${row.source}:${row.word}`}
                      className="wa-word-use-chip"
                    >
                      {row.word}
                    </span>
                  ))}
                </p>
              )}
              {wordUseCapped && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllWordUse(true)}
                >
                  {t("writing:teacher.review.wordUseShowAll", {
                    n: wordUse.active.length + wordUse.unused.length,
                  })}
                </button>
              )}
              <p className="wa-hint">
                {t("writing:teacher.review.wordUseHint")}
              </p>
            </div>
          )}

          <div className="wa-review-scores">
            <span className="wa-field-label">
              {t("writing:teacher.review.scoresTitle")}
            </span>
            {form.scores.map((row, index) => (
              <div className="wa-review-score" key={row.key}>
                <span>{row.label}</span>
                <input
                  type="number"
                  min="0"
                  max={row.maxScore || 0}
                  value={row.score}
                  readOnly={!feedbackEditable}
                  aria-label={`${row.label} — ${t("writing:teacher.review.scoresTitle")}`}
                  onChange={(event) =>
                    updateScore(index, { score: event.target.value })
                  }
                />
                <em>
                  {t("writing:teacher.review.scoreOf", {
                    n: row.score,
                    max: row.maxScore || 0,
                  })}
                </em>
                <input
                  className="wa-review-score-evidence"
                  type="text"
                  value={row.evidence}
                  readOnly={!feedbackEditable}
                  placeholder={t(
                    "writing:teacher.review.scoreEvidencePlaceholder",
                  )}
                  aria-label={`${row.label} — ${t("writing:teacher.review.scoreEvidence")}`}
                  onChange={(event) =>
                    updateScore(index, { evidence: event.target.value })
                  }
                />
              </div>
            ))}
          </div>

          {adjustments.length > 0 && (
            <div className="wa-review-adjustments">
              <span className="wa-field-label">
                {t("writing:teacher.review.scoreAdjustments")}
              </span>
              {adjustments.map((row, index) => (
                <p
                  className={`wa-adjustment${row.overriddenByTeacher ? " is-overridden" : ""}`}
                  key={`${row.target}:${row.key}:${row.index}:${index}`}
                >
                  <span>{adjustmentLabel(row)}</span>
                  <em>
                    {t("writing:teacher.review.adjustmentFromTo", {
                      from: row.from,
                      to: row.to,
                    })}
                  </em>
                  <span>
                    {ADJUSTMENT_REASONS.has(row.reason)
                      ? t(
                          `writing:teacher.review.adjustmentReason.${row.reason}`,
                        )
                      : row.reason}
                    {row.detail
                      ? ` · ${t("writing:teacher.review.adjustmentMissingSection", {
                          detail: row.detail,
                        })}`
                      : ""}
                  </span>
                  {row.overriddenByTeacher && (
                    <em>{t("writing:teacher.review.adjustmentOverride")}</em>
                  )}
                </p>
              ))}
            </div>
          )}

          <div className="wa-review-sections">
            <span className="wa-field-label">
              {t("writing:teacher.review.sectionsTitle")}
            </span>
            {form.sections.map((row, index) => {
              const sectionCriteria =
                (history?.assignment?.sections || []).find(
                  (section) => section.key === row.key,
                )?.criteria || [];
              return (
              <details
                className="wa-review-section"
                key={`${row.key}:${row.index}`}
              >
                <summary>
                  <span>{row.label}</span>
                  <em>
                    {t("writing:teacher.review.scoreOf", {
                      n: row.score,
                      max: row.maxScore || 0,
                    })}
                  </em>
                </summary>
                <label className="wa-field">
                  <span>{t("writing:teacher.review.strengths")}</span>
                  <textarea
                    rows={4}
                    value={row.strengthsText}
                    readOnly={!feedbackEditable}
                    onChange={(event) =>
                      updateSection(index, {
                        strengthsText: event.target.value,
                      })
                    }
                  />
                </label>
                {teacherTools && (
                  <CommentBank
                    sectionKey={row.key}
                    criteria={sectionCriteria}
                    notes={splitLines(row.strengthsText)}
                    disabled={!feedbackEditable}
                    onReplace={(noteIndex, text) => {
                      const lines = splitLines(row.strengthsText);
                      lines[noteIndex] = text;
                      updateSection(index, { strengthsText: lines.join("\n") });
                    }}
                  />
                )}
                <label className="wa-field">
                  <span>{t("writing:teacher.review.improvements")}</span>
                  <textarea
                    rows={4}
                    value={row.improvementsText}
                    readOnly={!feedbackEditable}
                    onChange={(event) =>
                      updateSection(index, {
                        improvementsText: event.target.value,
                      })
                    }
                  />
                </label>
                {teacherTools && (
                  <>
                    <CommentBank
                      sectionKey={row.key}
                      criteria={sectionCriteria}
                      notes={splitLines(row.improvementsText)}
                      disabled={!feedbackEditable}
                      onReplace={(noteIndex, text) => {
                        const lines = splitLines(row.improvementsText);
                        lines[noteIndex] = text;
                        updateSection(index, {
                          improvementsText: lines.join("\n"),
                        });
                      }}
                    />
                    <NoteRewrite
                      assessmentId={feedback._id}
                      sectionKey={row.key}
                      sectionIndex={row.index}
                      field="improvement"
                      notes={splitLines(row.improvementsText)}
                      disabled={!feedbackEditable}
                      onReplace={(noteIndex, text) => {
                        const lines = splitLines(row.improvementsText);
                        lines[noteIndex] = text;
                        updateSection(index, {
                          improvementsText: lines.join("\n"),
                        });
                      }}
                    />
                  </>
                )}
                <div className="wa-review-pair">
                  <label className="wa-field">
                    <span>{t("writing:teacher.review.evidence")}</span>
                    <textarea
                      rows={3}
                      value={row.evidence}
                      readOnly={!feedbackEditable}
                      onChange={(event) =>
                        updateSection(index, { evidence: event.target.value })
                      }
                    />
                  </label>
                  <label className="wa-field">
                    <span>{t("writing:teacher.review.nextStep")}</span>
                    <textarea
                      rows={3}
                      value={row.nextStep}
                      readOnly={!feedbackEditable}
                      onChange={(event) =>
                        updateSection(index, { nextStep: event.target.value })
                      }
                    />
                  </label>
                </div>
                {teacherTools && (
                  <>
                    <CommentBank
                      sectionKey={row.key}
                      criteria={sectionCriteria}
                      notes={[row.nextStep || ""]}
                      disabled={!feedbackEditable}
                      onReplace={(_noteIndex, text) =>
                        updateSection(index, { nextStep: text })
                      }
                    />
                    <NoteRewrite
                      assessmentId={feedback._id}
                      sectionKey={row.key}
                      sectionIndex={row.index}
                      field="nextStep"
                      notes={[row.nextStep || ""]}
                      disabled={!feedbackEditable}
                      onReplace={(_noteIndex, text) =>
                        updateSection(index, { nextStep: text })
                      }
                    />
                  </>
                )}
                {row.intervention?.repeat &&
                  isRepeatedInstruction(row.intervention.previous, row.nextStep) && (
                    <div className="wa-review-repeat" role="alert">
                      <p>{t("writing:teacher.review.repeatBlocked")}</p>
                      <p className="wa-hint">
                        {t("writing:teacher.review.repeatPrevious", {
                          text: row.intervention.previous,
                        })}
                      </p>
                    </div>
                  )}
                <label className="wa-field">
                  <span>{t("writing:teacher.review.why")}</span>
                  <textarea
                    rows={3}
                    value={row.why}
                    readOnly={!feedbackEditable}
                    onChange={(event) =>
                      updateSection(index, { why: event.target.value })
                    }
                  />
                </label>
                <LanguageCorrectionsEditor
                  rows={row.mechanics || []}
                  sectionText={draftTextFor(row)}
                  disabled={!feedbackEditable}
                  onChange={(mechanics) => updateSection(index, { mechanics })}
                />
              </details>
              );
            })}
          </div>

          {/* What the child does not get: over-budget notes and priorities. Kept
              visible so a teacher can promote one instead of losing it (A3). */}
          {(form.focus ||
            (form.teacherOnly?.notes || []).length > 0 ||
            (form.teacherOnly?.priorities || []).length > 0) && (
            <div className="wa-review-teacher-only">
              <span className="wa-field-label">
                {t("writing:teacher.review.teacherOnlyTitle")}
              </span>
              {form.focus && (
                <p className="wa-hint">
                  {t("writing:teacher.review.focusBudget", {
                    tier: t(`writing:teacher.review.tier.${form.focus.tier}`),
                    improvements: form.focus.totalImprovements,
                    sections:
                      form.focus.childSections.length > 0
                        ? form.focus.childSections.length
                        : form.focus.sectionsWithImprovements,
                    priorities: form.focus.priorities,
                  })}
                </p>
              )}
              {(form.teacherOnly?.notes || []).length > 0 && (
                <ul className="wa-word-use">
                  {form.teacherOnly.notes.map((item, index) => (
                    <li className="wa-word-use-row" key={`${item.label}:${index}`}>
                      <span className="wa-word-use-word">{item.label}</span>
                      <span className="wa-word-use-fact">{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(form.teacherOnly?.priorities || []).length > 0 && (
                <ul className="wa-lines">
                  {form.teacherOnly.priorities.map((item, index) => (
                    <li key={`${index}:${item}`}>{item}</li>
                  ))}
                </ul>
              )}
              <p className="wa-hint">
                {t("writing:teacher.review.teacherOnlyHint")}
              </p>
            </div>
          )}

          <div className="wa-review-pair">
            <label className="wa-field">
              <span>{t("writing:teacher.review.recommendation")}</span>
              <select
                value={form.path}
                disabled={!feedbackEditable}
                onChange={(event) => updateForm({ path: event.target.value })}
              >
                <option value="revise">
                  {t("writing:teacher.review.revise")}
                </option>
                <option value="notebook">
                  {t("writing:teacher.review.notebook")}
                </option>
              </select>
            </label>
            <label className="wa-field">
              <span>{t("writing:teacher.review.reason")}</span>
              <input
                type="text"
                maxLength={400}
                value={form.reason || ""}
                readOnly={!feedbackEditable}
                onChange={(event) => updateForm({ reason: event.target.value })}
              />
              <em className="wa-hint">
                {(form.reason || "").length} / 400
              </em>
            </label>
          </div>
          <p className="wa-hint">
            {t("writing:teacher.review.recommendationHint")}
          </p>

          {feedbackEditable && (
            <div className="wa-review-notify">
              <span className="wa-review-notify-label">
                {t("writing:teacher.review.emailLabel")}
              </span>
              <label className="wa-review-check">
                <input
                  type="checkbox"
                  checked={emailRecipients.student}
                  disabled={!emailDelivery?.students || Boolean(pending)}
                  onChange={(event) =>
                    setNotify((current) => ({
                      ...current,
                      student: event.target.checked,
                    }))
                  }
                />
                <span>{t("writing:teacher.review.emailStudent")}</span>
              </label>
              <label className="wa-review-check">
                <input
                  type="checkbox"
                  checked={emailRecipients.parents}
                  disabled={!emailDelivery?.parents || Boolean(pending)}
                  onChange={(event) =>
                    setNotify((current) => ({
                      ...current,
                      parents: event.target.checked,
                    }))
                  }
                />
                <span>{t("writing:teacher.review.emailParents")}</span>
              </label>
              {(!emailDelivery?.students || !emailDelivery?.parents) && (
                <p className="wa-review-notify-hint">
                  {t("writing:teacher.review.resend.disabled")}
                </p>
              )}
              {(emailDelivery?.students || emailDelivery?.parents) && (
                <p className="wa-review-notify-hint">
                  {t("writing:teacher.review.emailHint")}
                </p>
              )}
              <EmailRecipients
                recipients={history.emailRecipients}
                allowed={emailDelivery}
                selected={emailRecipients}
              />
            </div>
          )}

          {feedbackEditable && (
            <>
              <PublishChecklist check={feedbackCheck} />
              <div className="wa-review-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={Boolean(pending)}
                  onClick={() => saveFeedback(feedback)}
                >
                  {pendingLabel(pending, "save")
                    ? t("writing:teacher.review.saving")
                    : t("writing:teacher.review.save")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={Boolean(pending) || feedbackCheck.blocked}
                  onClick={() => {
                    if (confirmPublish()) publishFeedback(feedback);
                  }}
                >
                  {pendingLabel(pending, "publish")
                    ? t("writing:teacher.review.publishing")
                    : t("writing:teacher.review.publish")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {feedback?.aiStatus === "done" &&
        Number(latestDraft.number) >= 2 &&
        comparison?.aiStatus === "done" && (
          <div className="wa-review-block">
            {comparisonForm && (
              <>
                <div className="wa-review-block-head">
                  <h4>
                    {t("writing:teacher.review.comparisonTitle", {
                      from: latestDraft.number - 1,
                      to: latestDraft.number,
                    })}
                  </h4>
                  {comparison.publish?.state === "published" && (
                    <span className="wa-badge is-published">
                      <HiOutlineBadgeCheck size={15} aria-hidden="true" />
                      {t("writing:teacher.review.published")}
                    </span>
                  )}
                </div>

                {/* D6: a length change alone is not progress, so the panel leads
                    with what actually changed and keeps the word count beneath. */}
                {comparisonForm.comparison.changes.length > 0 && (
                  <div className="wa-change-story">
                    <span className="wa-field-label">
                      {t("writing:teacher.review.changeStory")}
                    </span>
                    <ul>
                      {comparisonForm.comparison.changes.map((row) => (
                        <li
                          key={`${row.key}:${row.index}:${row.kind}`}
                          className={`is-${row.kind}`}
                        >
                          <span>{row.label}</span>
                          <em>
                            {t(
                              `writing:teacher.review.changeKind.${row.kind}`,
                              { n: row.wordDelta },
                            )}
                          </em>
                        </li>
                      ))}
                    </ul>
                    {comparisonForm.comparison.mostlyReworded && (
                      <p className="wa-hint">
                        {t("writing:teacher.review.mostlyReworded")}
                      </p>
                    )}
                  </div>
                )}

                <p className="wa-hint">
                  {t("writing:teacher.review.wordChange", {
                    n: comparisonForm.comparison.wordDelta,
                  })}
                </p>

                <DraftDiff
                  previousDraft={drafts[drafts.length - 2] || null}
                  currentDraft={latestDraft}
                />

                <label className="wa-field">
                  <span>
                    {t("writing:teacher.review.comparisonEncouragement")}
                  </span>
                  <textarea
                    rows={3}
                    value={comparisonForm.comparison.encouragement}
                    readOnly={!comparisonEditable}
                    onChange={(event) =>
                      updateComparison({ encouragement: event.target.value })
                    }
                  />
                </label>

                <label className="wa-field">
                  <span>{t("writing:teacher.review.improved")}</span>
                  <textarea
                    rows={4}
                    value={comparisonForm.comparison.improvedText}
                    readOnly={!comparisonEditable}
                    onChange={(event) =>
                      updateComparison({ improvedText: event.target.value })
                    }
                  />
                </label>
                {/* D3: each "got stronger" claim is backed by one computed fact. */}
                {comparisonForm.comparison.improvedFacts.length > 0 && (
                  <ul className="wa-fact-list">
                    {comparisonForm.comparison.improvedFacts.map((row, index) => (
                      <li key={`${row.kind}:${row.label}:${index}`}>
                        <strong>{row.label}</strong>
                        <span>{row.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="wa-field">
                  <span>{t("writing:teacher.review.unresolved")}</span>
                  <textarea
                    rows={4}
                    value={comparisonForm.comparison.unresolvedText}
                    readOnly={!comparisonEditable}
                    onChange={(event) =>
                      updateComparison({ unresolvedText: event.target.value })
                    }
                  />
                </label>
                <label className="wa-field">
                  <span>{t("writing:teacher.review.newIssues")}</span>
                  <textarea
                    rows={4}
                    value={comparisonForm.comparison.newIssuesText}
                    readOnly={!comparisonEditable}
                    onChange={(event) =>
                      updateComparison({ newIssuesText: event.target.value })
                    }
                  />
                </label>
                {/* D4: an issue without a quote from this draft stays marked. */}
                {comparisonForm.comparison.newIssueChecks.length > 0 && (
                  <ul className="wa-fact-list wa-fact-list--issues">
                    {comparisonForm.comparison.newIssueChecks.map(
                      (row, index) => (
                        <li
                          key={`${row.text}:${index}`}
                          className={row.verified ? "is-verified" : "is-unverified"}
                        >
                          <strong>{row.text}</strong>
                          <span>
                            {row.verified
                              ? row.evidence
                              : t("writing:teacher.review.newIssueUnverified")}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                )}

                <div className="wa-review-sections">
                  <span className="wa-field-label">
                    {t("writing:teacher.review.changedSections")}
                  </span>
                  {comparisonForm.comparison.changedBySection.map(
                    (row, index) => (
                      <div
                        className="wa-review-change"
                        key={`${row.key}:${row.index}:${row.kind}`}
                      >
                        <span>{row.label}</span>
                        <textarea
                          rows={3}
                          value={row.summary}
                          readOnly={!comparisonEditable}
                          aria-label={row.label}
                          onChange={(event) =>
                            updateComparison({
                              changedBySection:
                                comparisonForm.comparison.changedBySection.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, summary: event.target.value }
                                      : item,
                                ),
                            })
                          }
                        />
                      </div>
                    ),
                  )}
                </div>

                {comparisonForm.comparison.taskResults.length > 0 && (
                  <div className="wa-review-applied">
                    <span className="wa-field-label">
                      {t("writing:teacher.review.taskResults")}
                    </span>
                    {comparisonForm.comparison.taskResults.map((row, index) => (
                      <label className="wa-review-check" key={row.id}>
                        <input
                          type="checkbox"
                          checked={row.applied}
                          disabled={!comparisonEditable}
                          onChange={(event) =>
                            updateComparison({
                              taskResults:
                                comparisonForm.comparison.taskResults.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          applied: event.target.checked,
                                        }
                                      : item,
                                ),
                            })
                          }
                        />
                        <span>
                          {row.note ? `${row.text} — ${row.note}` : row.text}
                        </span>
                        {/* D5: a tick the server could not find in the draft is shown as a claim. */}
                        {row.claimed && !row.verified && (
                          <em className="wa-review-unverified">
                            {t("writing:teacher.review.taskNotVerified")}
                          </em>
                        )}
                        {row.verified && row.quote && (
                          <em className="wa-review-quote">“{row.quote}”</em>
                        )}
                      </label>
                    ))}
                  </div>
                )}

                {(comparisonForm.spellingWins || []).length > 0 && (
                  <div className="wa-review-applied">
                    <span className="wa-field-label">
                      {t("writing:teacher.review.spellingWins")}
                    </span>
                    <div className="wa-spelling-chips">
                      {comparisonForm.spellingWins.map((word) => (
                        <span className="wa-spelling-chip is-win" key={word}>
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(project?.revisionLedger) &&
                  project.revisionLedger.some(
                    (row) => row.status !== "dropped",
                  ) && (
                    <div className="wa-review-applied wa-ledger">
                      <span className="wa-field-label">
                        {t("writing:teacher.review.ledgerTitle")}
                      </span>
                      {project.revisionLedger
                        .filter((row) => row.status !== "dropped")
                        .map((row) => (
                          <div
                            className={`wa-ledger-row is-${row.status}`}
                            key={row.id}
                          >
                            <span className="wa-ledger-task">{row.text}</span>
                            <span className="wa-ledger-state">
                              {t(
                                `writing:teacher.review.ledger.${row.status}`,
                                { n: row.unresolvedStreak || 0 },
                              )}
                            </span>
                            {/* D2: a task that survives two revisions gets a named next move. */}
                            {row.status === "stalled" && row.suggestion && (
                              <span className="wa-ledger-hint">
                                {t(
                                  `writing:teacher.review.stallSuggestion.${row.suggestion}`,
                                )}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                {comparisonForm.comparison.feedbackApplied.length > 0 && (
                  <div className="wa-review-applied">
                    <span className="wa-field-label">
                      {t("writing:teacher.review.feedbackApplied")}
                    </span>
                    {comparisonForm.comparison.feedbackApplied.map(
                      (row, index) => (
                        <label
                          className="wa-review-check"
                          key={`${row.key}:${row.index}`}
                        >
                          <input
                            type="checkbox"
                            checked={row.applied}
                            disabled={!comparisonEditable}
                            onChange={(event) =>
                              updateComparison({
                                feedbackApplied:
                                  comparisonForm.comparison.feedbackApplied.map(
                                    (item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            applied: event.target.checked,
                                          }
                                        : item,
                                  ),
                              })
                            }
                          />
                          <span>{row.note || row.key}</span>
                        </label>
                      ),
                    )}
                  </div>
                )}

                {comparisonEditable && (
                  <>
                    {/* The feedback block already shows the shared checklist. */}
                    {!embedded && comparisonCheck.blocked && (
                      <PublishChecklist
                        check={comparisonCheck}
                        showSummary={false}
                      />
                    )}
                    <div className="wa-review-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={Boolean(pending)}
                        onClick={() =>
                          embedded
                            ? saveFeedback(feedback)
                            : saveComparison(comparison)
                        }
                      >
                        {pendingLabel(
                          pending,
                          embedded ? "save" : "saveCompare",
                        )
                          ? t("writing:teacher.review.saving")
                          : t("writing:teacher.review.save")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={Boolean(pending) || comparisonCheck.blocked}
                        onClick={() => {
                          if (!confirmPublish()) return;
                          embedded
                            ? publishFeedback(feedback)
                            : publishComparison(comparison);
                        }}
                      >
                        {pendingLabel(
                          pending,
                          embedded ? "publish" : "publishCompare",
                        )
                          ? t("writing:teacher.review.publishing")
                          : t("writing:teacher.review.publish")}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

      {((feedback?.publish?.state === "published" &&
        project.stage !== "completed") ||
        lockedTo) && (
        <div className="wa-review-block">
          <div className="wa-review-block-head">
            <h4>{t("writing:teacher.review.nextStage")}</h4>
            {lockedTo && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(pending)}
                onClick={unlockStage}
              >
                {t("writing:teacher.review.unlock")}
              </button>
            )}
          </div>
          {lockedTo && (
            <p className="wa-hint">
              {t("writing:teacher.review.locked", {
                stage: t(`writing:teacher.stages.${lockedTo}`),
              })}
            </p>
          )}
          {project.stage !== "completed" && (
            <div className="wa-review-actions">
              {project.stage !== "revising" && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={Boolean(pending)}
                  onClick={() => moveStage("revising")}
                >
                  {t("writing:teacher.review.moveRevising")}
                </button>
              )}
              {project.stage !== "ready_for_notebook" && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={Boolean(pending)}
                  onClick={() => moveStage("ready_for_notebook")}
                >
                  {t("writing:teacher.review.moveNotebook")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {project.stage === "awaiting_notebook_check" && (
        <div className="wa-review-block">
          <h4>{t("writing:teacher.review.notebookTitle")}</h4>
          <label className="wa-field">
            <span>{t("writing:teacher.review.notebookNote")}</span>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="wa-field">
            <span>{t("writing:teacher.review.notebookScore")}</span>
            <input
              type="number"
              min="0"
              max={totalPoints || undefined}
              value={finalScore}
              onChange={(event) => setFinalScore(event.target.value)}
            />
          </label>
          <div className="wa-review-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={Boolean(pending)}
              onClick={() => notebook("revision_required")}
            >
              {t("writing:teacher.review.needsRevision")}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={Boolean(pending)}
              onClick={() => notebook("checked")}
            >
              <HiOutlineCheckCircle size={16} aria-hidden="true" />
              {pendingLabel(pending, "notebook")
                ? t("writing:teacher.review.saving")
                : t("writing:teacher.review.markChecked")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
