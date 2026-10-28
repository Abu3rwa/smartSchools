import { useTranslation } from "react-i18next";
import { HiOutlineDocumentText, HiOutlinePencilAlt } from "react-icons/hi";
import { actionKey } from "../studentAction.js";
import { useWritingFeedData } from "./hooks/useWritingFeedData.js";
import "./WritingFeedPage.css";

export default function WritingFeedPage() {
  const { t, i18n } = useTranslation(["writing"]);
  const { assignments, loading, opening, openAssignment } = useWritingFeedData();

  if (loading) {
    return (
      <div className="wf-page wf-loading" aria-live="polite">
        <div className="spinner" />
      </div>
    );
  }

  const dueLabel = (value) => new Date(value).toLocaleDateString(i18n.language, {
    day: "2-digit", month: "short",
  });

  return (
    <div className="wf-page">
      <header className="wf-head">
        <h1>{t("writing:student.feedTitle")}</h1>
        <p className="wf-sub">{t("writing:student.feedSubtitle")}</p>
      </header>

      {assignments.length === 0 && (
        <div className="wf-empty">
          <HiOutlineDocumentText size={42} aria-hidden="true" />
          <h2>{t("writing:student.emptyTitle")}</h2>
          <p>{t("writing:student.emptyBody")}</p>
        </div>
      )}

      {assignments.map((card) => {
        const key = actionKey({ stage: card.stage, action: card.nextAction?.action });
        const waiting = card.nextAction?.action === "wait" || card.nextAction?.action === "done";
        const label = t(`writing:student.actions.${key}`, {
          n: key === "teacherReviewing" ? Math.max(1, card.draftCount) : card.draftCount + 1,
        });
        return (
          <article className="wf-card" key={card.id}>
            <header>
              <div>
                <h2>{card.title}</h2>
                <p className="wf-meta">
                  {t(`writing:student.types.${card.writingType}`)}
                  {card.dueDate && <> · {t("writing:student.dueBefore", { date: dueLabel(card.dueDate) })}</>}
                </p>
              </div>
              {card.topic && <p className="wf-topic">{card.topic}</p>}
            </header>

            <ol className="wf-tracker" aria-label={t("writing:student.progressAria")}>
              {(card.tracker || []).map((step) => (
                <li key={step.key} className={`wf-step is-${step.state}`}>
                  {t(`writing:student.tracker.${step.key}`)}
                </li>
              ))}
            </ol>

            <p className="wf-counts">
              {t("writing:student.draftsSoFar", { n: card.draftCount, max: card.maxDrafts })}
              {card.wordCount > 0 && <> · {t("writing:student.words", { n: card.wordCount })}</>}
            </p>

            <footer className="wf-card-foot">
              {waiting ? (
                <p className="wf-waiting">{label}</p>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={opening === card.id}
                  onClick={() => openAssignment(card)}
                >
                  <HiOutlinePencilAlt size={16} aria-hidden="true" />
                  {label}
                </button>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
