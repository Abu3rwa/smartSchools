import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  HiOutlineBadgeCheck,
  HiOutlineCheckCircle,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineX,
} from "react-icons/hi";
import writingService from "../../../../services/writingService.js";
import { creditErrorMessage, isCreditError } from "../../../../utils/aiCredit.js";
import {
  formFromAssessment,
  isStaleAssessment,
  latestForDraft,
  payloadFromForm,
} from "./assessmentPresentation.js";
import { formatDateTime } from "./boardPresentation.js";
import FeedbackEmailResend from "./FeedbackEmailResend.jsx";

const pendingLabel = (pending, key) => pending === key;

export default function ReviewPanel({ history, onChanged, emailDelivery }) {
  const { t, i18n } = useTranslation(["writing"]);
  const project = history?.project || null;
  const drafts = history?.drafts || [];
  const latestDraft = drafts[drafts.length - 1] || null;
  const feedback = latestForDraft(history?.assessments, latestDraft?._id, "feedback");
  const comparison = latestForDraft(history?.assessments, latestDraft?._id, "comparison");

  const [form, setForm] = useState(() => formFromAssessment(feedback));
  const [comparisonForm, setComparisonForm] = useState(() => formFromAssessment(comparison));
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [pending, setPending] = useState("");
  const [notify, setNotify] = useState({ student: true, parents: true });
  const runningRun = feedback?.aiStatus === "running" || comparison?.aiStatus === "running";
  const emailRecipients = {
    student: Boolean(emailDelivery?.students && notify.student),
    parents: Boolean(emailDelivery?.parents && notify.parents),
  };

  const feedbackStamp = feedback ? `${feedback._id}:${feedback.aiStatus}:${feedback.teacherEdits?.at || ""}` : "";
  const comparisonStamp = comparison ? `${comparison._id}:${comparison.aiStatus}:${comparison.teacherEdits?.at || ""}` : "";

  useEffect(() => {
    setForm(formFromAssessment(feedback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackStamp]);

  useEffect(() => {
    setComparisonForm(formFromAssessment(comparison));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonStamp]);

  // Nothing polls while a run is in flight; re-render so a dead run turns into a retry.
  useEffect(() => {
    if (!runningRun) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [runningRun]);

  if (!project || !latestDraft) return null;

  const run = async (key, action, successMessage) => {
    setPending(key);
    try {
      await action();
      await onChanged();
      if (successMessage) toast.success(successMessage);
    } catch (error) {
      toast.error(creditErrorMessage(error, t) || error?.response?.data?.message || t("writing:teacher.review.failed"));
      if (isCreditError(error) || key === "assess" || key === "compare") onChanged();
    } finally {
      setPending("");
    }
  };

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));
  const updateSection = (index, patch) => setForm((current) => ({
    ...current,
    sections: current.sections.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )),
  }));
  const updateScore = (index, patch) => setForm((current) => ({
    ...current,
    scores: current.scores.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )),
  }));
  const updateComparison = (patch) => setComparisonForm((current) => ({
    ...current,
    comparison: { ...current.comparison, ...patch },
  }));
  const dropTarget = (word) => setForm((current) => ({
    ...current,
    spellingTargets: (current.spellingTargets || []).filter((row) => row.word !== word),
  }));

  const assess = () => run("assess", () => writingService.assessDraft(latestDraft._id), t("writing:teacher.review.assessedToast"));
  const compare = () => run("compare", () => writingService.compareDraft(latestDraft._id), t("writing:teacher.review.comparedToast"));
  const saveFeedback = (assessment) => run("save", () => writingService.saveAssessmentEdits(
    assessment._id,
    payloadFromForm(form),
  ), t("writing:teacher.review.savedToast"));
  const publishFeedback = (assessment) => run("publish", () => writingService.publishAssessment(
    assessment._id,
    { ...payloadFromForm(form), notify: emailRecipients },
  ), t("writing:teacher.review.publishedToast"));

  const saveComparison = (assessment) => run("saveCompare", () => writingService.saveAssessmentEdits(
    assessment._id,
    payloadFromForm(comparisonForm),
  ), t("writing:teacher.review.savedToast"));
  const publishComparison = (assessment) => run("publishCompare", () => writingService.publishAssessment(
    assessment._id,
    payloadFromForm(comparisonForm),
  ), t("writing:teacher.review.publishedToast"));

  const moveStage = (stage) => run("stage", () => writingService.overrideProjectStage(
    project.id || project._id,
    { stage },
  ), t("writing:teacher.review.stageMoved"));
  const unlockStage = () => run("unlock", () => writingService.overrideProjectStage(
    project.id || project._id,
    { locked: false },
  ), t("writing:teacher.review.stageMoved"));

  const notebook = (state) => run("notebook", () => writingService.recordNotebookReview(
    project.id || project._id,
    {
      state,
      note,
      finalScore: finalScore === "" ? undefined : Number(finalScore),
    },
  ), t("writing:teacher.review.notebookSaved"));

  const feedbackEditable = feedback?.aiStatus === "done" && feedback.publish?.state !== "published";
  const comparisonEditable = comparison?.aiStatus === "done" && comparison.publish?.state !== "published";
  const feedbackStale = isStaleAssessment(feedback, now);
  const comparisonStale = isStaleAssessment(comparison, now);
  const lockedTo = project.teacherOverride?.stageLockedTo || "";
  const totalPoints = (history?.assignment?.rubric || []).reduce(
    (sum, row) => sum + (Number(row.maxScore) || 0),
    0,
  );

  return (
    <section className="wa-review">
      <header className="wa-review-head">
        <h3>{t("writing:teacher.review.title")}</h3>
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

      {!feedback && (
        <div className="wa-review-empty">
          <p>{t("writing:teacher.review.noFeedbackYet")}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={Boolean(pending)}
            onClick={assess}
          >
            <HiOutlineSparkles size={16} aria-hidden="true" />
            {pendingLabel(pending, "assess") ? t("writing:teacher.review.assessing") : t("writing:teacher.review.assess")}
          </button>
        </div>
      )}

      {feedback?.aiStatus === "running" && (
        <div className="wa-review-empty">
          <p className="wa-hint" aria-live="polite">
            {feedbackStale
              ? t("writing:teacher.review.stalled")
              : t("writing:teacher.review.assessing")}
          </p>
          {feedbackStale && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={assess}>
              <HiOutlineRefresh size={15} aria-hidden="true" />
              {t("writing:teacher.review.retryAssess")}
            </button>
          )}
        </div>
      )}

      {feedback?.aiStatus === "failed" && (
        <div className="wa-review-failed">
          <p>{t("writing:teacher.review.aiFailed", { error: feedback.aiError || "" })}</p>
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={assess}>
            <HiOutlineRefresh size={15} aria-hidden="true" />
            {t("writing:teacher.review.retryAssess")}
          </button>
        </div>
      )}

      {history?.differentiation && (
        <p className="wa-differentiation">
          <span className="wa-differentiation-label">{t("writing:teacher.review.differentiation")}</span>
          <span>{t(`writing:teacher.review.tier.${history.differentiation.tier}`)}</span>
          {history.differentiation.spellingGrade && (
            <span>{t("writing:teacher.review.spellingGrade", { grade: history.differentiation.spellingGrade })}</span>
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

      {feedback?.aiStatus === "done" && form && (
        <div className="wa-review-block">
          <div className="wa-review-block-head">
            <h4>{t("writing:teacher.review.draftFeedback", { n: latestDraft.number })}</h4>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={Boolean(pending)}
              onClick={assess}
            >
              {t("writing:teacher.review.reassess")}
            </button>
          </div>

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
            <span className="wa-field-label">{t("writing:teacher.review.nextPriorities")}</span>
            {form.priorities.map((value, index) => (
              <input
                key={index}
                type="text"
                value={value}
                readOnly={!feedbackEditable}
                aria-label={t("writing:teacher.review.priority", { n: index + 1 })}
                onChange={(event) => updateForm({
                  priorities: form.priorities.map((row, rowIndex) => (
                    rowIndex === index ? event.target.value : row
                  )),
                })}
              />
            ))}
          </div>

          {(form.spellingTargets || []).length > 0 && (
            <div className="wa-review-spelling">
              <span className="wa-field-label">{t("writing:teacher.review.spellingTargets")}</span>
              <div className="wa-spelling-chips">
                {form.spellingTargets.map((row) => (
                  <span className="wa-spelling-chip" key={row.word}>
                    {row.word}
                    {row.grade ? <em>{row.grade}</em> : null}
                    {feedbackEditable && (
                      <button
                        type="button"
                        className="wa-spelling-remove"
                        aria-label={t("writing:teacher.review.spellingRemove", { word: row.word })}
                        onClick={() => dropTarget(row.word)}
                      >
                        <HiOutlineX size={12} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <p className="wa-hint">{t("writing:teacher.review.spellingTargetsHint")}</p>
            </div>
          )}

          <div className="wa-review-scores">
            <span className="wa-field-label">{t("writing:teacher.review.scoresTitle")}</span>
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
                  onChange={(event) => updateScore(index, { score: event.target.value })}
                />
                <em>{t("writing:teacher.review.scoreOf", { n: row.score, max: row.maxScore || 0 })}</em>
                <input
                  className="wa-review-score-evidence"
                  type="text"
                  value={row.evidence}
                  readOnly={!feedbackEditable}
                  placeholder={t("writing:teacher.review.scoreEvidencePlaceholder")}
                  aria-label={`${row.label} — ${t("writing:teacher.review.scoreEvidence")}`}
                  onChange={(event) => updateScore(index, { evidence: event.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="wa-review-sections">
            <span className="wa-field-label">{t("writing:teacher.review.sectionsTitle")}</span>
            {form.sections.map((row, index) => (
              <details className="wa-review-section" key={`${row.key}:${row.index}`}>
                <summary>
                  <span>{row.label}</span>
                  <em>{t("writing:teacher.review.scoreOf", { n: row.score, max: row.maxScore || 0 })}</em>
                </summary>
                <label className="wa-field">
                  <span>{t("writing:teacher.review.strengths")}</span>
                  <textarea
                    rows={4}
                    value={row.strengthsText}
                    readOnly={!feedbackEditable}
                    onChange={(event) => updateSection(index, { strengthsText: event.target.value })}
                  />
                </label>
                <label className="wa-field">
                  <span>{t("writing:teacher.review.improvements")}</span>
                  <textarea
                    rows={4}
                    value={row.improvementsText}
                    readOnly={!feedbackEditable}
                    onChange={(event) => updateSection(index, { improvementsText: event.target.value })}
                  />
                </label>
                <div className="wa-review-pair">
                  <label className="wa-field">
                    <span>{t("writing:teacher.review.evidence")}</span>
                    <textarea
                      rows={3}
                      value={row.evidence}
                      readOnly={!feedbackEditable}
                      onChange={(event) => updateSection(index, { evidence: event.target.value })}
                    />
                  </label>
                  <label className="wa-field">
                    <span>{t("writing:teacher.review.nextStep")}</span>
                    <textarea
                      rows={3}
                      value={row.nextStep}
                      readOnly={!feedbackEditable}
                      onChange={(event) => updateSection(index, { nextStep: event.target.value })}
                    />
                  </label>
                </div>
                <label className="wa-field">
                  <span>{t("writing:teacher.review.why")}</span>
                  <textarea
                    rows={3}
                    value={row.why}
                    readOnly={!feedbackEditable}
                    onChange={(event) => updateSection(index, { why: event.target.value })}
                  />
                </label>
              </details>
            ))}
          </div>

          <div className="wa-review-pair">
            <label className="wa-field">
              <span>{t("writing:teacher.review.recommendation")}</span>
              <select
                value={form.path}
                disabled={!feedbackEditable}
                onChange={(event) => updateForm({ path: event.target.value })}
              >
                <option value="revise">{t("writing:teacher.review.revise")}</option>
                <option value="notebook">{t("writing:teacher.review.notebook")}</option>
              </select>
            </label>
            <label className="wa-field">
              <span>{t("writing:teacher.review.reason")}</span>
              <input
                type="text"
                value={form.reason}
                readOnly={!feedbackEditable}
                onChange={(event) => updateForm({ reason: event.target.value })}
              />
            </label>
          </div>
          <p className="wa-hint">{t("writing:teacher.review.recommendationHint")}</p>

          {feedbackEditable && (
            <div className="wa-review-notify">
              <span className="wa-review-notify-label">{t("writing:teacher.review.emailLabel")}</span>
              <label className="wa-review-check">
                <input
                  type="checkbox"
                  checked={emailRecipients.student}
                  disabled={!emailDelivery?.students || Boolean(pending)}
                  onChange={(event) => setNotify((current) => ({ ...current, student: event.target.checked }))}
                />
                <span>{t("writing:teacher.review.emailStudent")}</span>
              </label>
              <label className="wa-review-check">
                <input
                  type="checkbox"
                  checked={emailRecipients.parents}
                  disabled={!emailDelivery?.parents || Boolean(pending)}
                  onChange={(event) => setNotify((current) => ({ ...current, parents: event.target.checked }))}
                />
                <span>{t("writing:teacher.review.emailParents")}</span>
              </label>
              {(!emailDelivery?.students || !emailDelivery?.parents) && (
                <p className="wa-review-notify-hint">{t("writing:teacher.review.resend.disabled")}</p>
              )}
              {(emailDelivery?.students || emailDelivery?.parents) && (
                <p className="wa-review-notify-hint">{t("writing:teacher.review.emailHint")}</p>
              )}
            </div>
          )}

          {feedbackEditable && (
            <div className="wa-review-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={Boolean(pending)}
                onClick={() => saveFeedback(feedback)}
              >
                {pendingLabel(pending, "save") ? t("writing:teacher.review.saving") : t("writing:teacher.review.save")}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={Boolean(pending)}
                onClick={() => publishFeedback(feedback)}
              >
                {pendingLabel(pending, "publish") ? t("writing:teacher.review.publishing") : t("writing:teacher.review.publish")}
              </button>
            </div>
          )}
        </div>
      )}

      {feedback?.aiStatus === "done" && Number(latestDraft.number) >= 2 && (
        <div className="wa-review-block">
          {!comparison && (
            <div className="wa-review-empty">
              <p>{t("writing:teacher.review.compareHint", { from: latestDraft.number - 1, to: latestDraft.number })}</p>
              <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={compare}>
                {pendingLabel(pending, "compare") ? t("writing:teacher.review.comparing") : t("writing:teacher.review.compare")}
              </button>
            </div>
          )}

          {comparison?.aiStatus === "running" && (
            <div className="wa-review-empty">
              <p className="wa-hint" aria-live="polite">
                {comparisonStale
                  ? t("writing:teacher.review.stalled")
                  : t("writing:teacher.review.comparing")}
              </p>
              {comparisonStale && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={compare}>
                  <HiOutlineRefresh size={15} aria-hidden="true" />
                  {t("writing:teacher.review.retryCompare")}
                </button>
              )}
            </div>
          )}

          {comparison?.aiStatus === "failed" && (
            <div className="wa-review-failed">
              <p>{t("writing:teacher.review.aiFailed", { error: comparison.aiError || "" })}</p>
              <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={compare}>
                <HiOutlineRefresh size={15} aria-hidden="true" />
                {t("writing:teacher.review.retryCompare")}
              </button>
            </div>
          )}

          {comparison?.aiStatus === "done" && comparisonForm && (
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

              <p className="wa-hint">
                {t("writing:teacher.review.wordChange", { n: comparisonForm.comparison.wordDelta })}
              </p>

              <label className="wa-field">
                <span>{t("writing:teacher.review.comparisonEncouragement")}</span>
                <textarea
                  rows={3}
                  value={comparisonForm.comparison.encouragement}
                  readOnly={!comparisonEditable}
                  onChange={(event) => updateComparison({ encouragement: event.target.value })}
                />
              </label>

              <label className="wa-field">
                <span>{t("writing:teacher.review.improved")}</span>
                <textarea
                  rows={4}
                  value={comparisonForm.comparison.improvedText}
                  readOnly={!comparisonEditable}
                  onChange={(event) => updateComparison({ improvedText: event.target.value })}
                />
              </label>
              <label className="wa-field">
                <span>{t("writing:teacher.review.unresolved")}</span>
                <textarea
                  rows={4}
                  value={comparisonForm.comparison.unresolvedText}
                  readOnly={!comparisonEditable}
                  onChange={(event) => updateComparison({ unresolvedText: event.target.value })}
                />
              </label>
              <label className="wa-field">
                <span>{t("writing:teacher.review.newIssues")}</span>
                <textarea
                  rows={4}
                  value={comparisonForm.comparison.newIssuesText}
                  readOnly={!comparisonEditable}
                  onChange={(event) => updateComparison({ newIssuesText: event.target.value })}
                />
              </label>

              <div className="wa-review-sections">
                <span className="wa-field-label">{t("writing:teacher.review.changedSections")}</span>
                {comparisonForm.comparison.changedBySection.map((row, index) => (
                  <div className="wa-review-change" key={`${row.key}:${row.index}:${row.kind}`}>
                    <span>{row.label}</span>
                    <textarea
                      rows={3}
                      value={row.summary}
                      readOnly={!comparisonEditable}
                      aria-label={row.label}
                      onChange={(event) => updateComparison({
                        changedBySection: comparisonForm.comparison.changedBySection.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, summary: event.target.value } : item
                        )),
                      })}
                    />
                  </div>
                ))}
              </div>

              {comparisonForm.comparison.taskResults.length > 0 && (
                <div className="wa-review-applied">
                  <span className="wa-field-label">{t("writing:teacher.review.taskResults")}</span>
                  {comparisonForm.comparison.taskResults.map((row, index) => (
                    <label className="wa-review-check" key={row.id}>
                      <input
                        type="checkbox"
                        checked={row.applied}
                        disabled={!comparisonEditable}
                        onChange={(event) => updateComparison({
                          taskResults: comparisonForm.comparison.taskResults.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, applied: event.target.checked } : item
                          )),
                        })}
                      />
                      <span>{row.note ? `${row.text} — ${row.note}` : row.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {(comparisonForm.spellingWins || []).length > 0 && (
                <div className="wa-review-applied">
                  <span className="wa-field-label">{t("writing:teacher.review.spellingWins")}</span>
                  <div className="wa-spelling-chips">
                    {comparisonForm.spellingWins.map((word) => (
                      <span className="wa-spelling-chip is-win" key={word}>{word}</span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(project?.revisionLedger)
                && project.revisionLedger.some((row) => row.status !== "dropped") && (
                  <div className="wa-review-applied wa-ledger">
                    <span className="wa-field-label">{t("writing:teacher.review.ledgerTitle")}</span>
                    {project.revisionLedger
                      .filter((row) => row.status !== "dropped")
                      .map((row) => (
                        <div className={`wa-ledger-row is-${row.status}`} key={row.id}>
                          <span className="wa-ledger-task">{row.text}</span>
                          <span className="wa-ledger-state">
                            {t(`writing:teacher.review.ledger.${row.status}`, { n: row.unresolvedStreak || 0 })}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

              {comparisonForm.comparison.feedbackApplied.length > 0 && (
                <div className="wa-review-applied">
                  <span className="wa-field-label">{t("writing:teacher.review.feedbackApplied")}</span>
                  {comparisonForm.comparison.feedbackApplied.map((row, index) => (
                    <label className="wa-review-check" key={`${row.key}:${row.index}`}>
                      <input
                        type="checkbox"
                        checked={row.applied}
                        disabled={!comparisonEditable}
                        onChange={(event) => updateComparison({
                          feedbackApplied: comparisonForm.comparison.feedbackApplied.map((item, itemIndex) => (
                            itemIndex === index ? { ...item, applied: event.target.checked } : item
                          )),
                        })}
                      />
                      <span>{row.note || row.key}</span>
                    </label>
                  ))}
                </div>
              )}

              {comparisonEditable && (
                <div className="wa-review-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={Boolean(pending)}
                    onClick={() => saveComparison(comparison)}
                  >
                    {pendingLabel(pending, "saveCompare") ? t("writing:teacher.review.saving") : t("writing:teacher.review.save")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(pending)}
                    onClick={() => publishComparison(comparison)}
                  >
                    {pendingLabel(pending, "publishCompare") ? t("writing:teacher.review.publishing") : t("writing:teacher.review.publish")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {((feedback?.publish?.state === "published" && project.stage !== "completed") || lockedTo) && (
        <div className="wa-review-block">
          <div className="wa-review-block-head">
            <h4>{t("writing:teacher.review.nextStage")}</h4>
            {lockedTo && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(pending)} onClick={unlockStage}>
                {t("writing:teacher.review.unlock")}
              </button>
            )}
          </div>
          {lockedTo && (
            <p className="wa-hint">
              {t("writing:teacher.review.locked", { stage: t(`writing:teacher.stages.${lockedTo}`) })}
            </p>
          )}
          {project.stage !== "completed" && (
            <div className="wa-review-actions">
              {project.stage !== "revising" && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={() => moveStage("revising")}>
                  {t("writing:teacher.review.moveRevising")}
                </button>
              )}
              {project.stage !== "ready_for_notebook" && (
                <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(pending)} onClick={() => moveStage("ready_for_notebook")}>
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
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
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
            <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(pending)} onClick={() => notebook("revision_required")}>
              {t("writing:teacher.review.needsRevision")}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(pending)} onClick={() => notebook("checked")}>
              <HiOutlineCheckCircle size={16} aria-hidden="true" />
              {pendingLabel(pending, "notebook") ? t("writing:teacher.review.saving") : t("writing:teacher.review.markChecked")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
