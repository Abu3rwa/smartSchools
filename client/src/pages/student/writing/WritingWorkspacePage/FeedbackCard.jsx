import { useTranslation } from "react-i18next";

/** The feedback for the draft just sent, in the order a student should act on it. */
export default function FeedbackCard({ draftNumber, feedback, onReadDraft, revising }) {
  const { t } = useTranslation(["writing"]);
  const summary = feedback?.overall?.summary;
  const priorities = (feedback?.overall?.nextPriorities || []).slice(0, 3);
  if (!feedback || (!summary && priorities.length === 0)) return null;

  return (
    <section className="ws-feedback-card" aria-label={t("writing:student.feedbackTitle")}>
      <header className="ws-feedback-card-head">
        <h2>{t("writing:student.feedbackTitle")}</h2>
        <span className="ws-feedback-card-tag">{t("writing:student.draftTab", { n: draftNumber })}</span>
      </header>
      {summary && <p className="ws-feedback-card-summary">{summary}</p>}
      {priorities.length > 0 && (
        <>
          <h3 className="ws-feedback-card-sub">{t("writing:student.doTheseNext")}</h3>
          <ol className="ws-feedback-card-list">
            {priorities.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </>
      )}
      {revising && onReadDraft && (
        <div className="ws-feedback-card-foot">
          <span>{t("writing:student.revisingHint", { n: draftNumber + 1 })}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReadDraft}>
            {t("writing:student.readPrevious", { n: draftNumber })}
          </button>
        </div>
      )}
    </section>
  );
}
