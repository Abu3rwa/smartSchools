import { useTranslation } from "react-i18next";
import RubricStrip from "./RubricStrip.jsx";
import { formatPasteTime } from "./pasteGuard.js";

/**
 * The feedback for the draft just sent, in the order a student should act on
 * it: the one thing to do first stays open, everything else waits behind
 * "see more" so the card fits a phone screen (E1).
 */
export default function FeedbackCard({
  draftNumber,
  feedback,
  marks = "words",
  onReadDraft,
  pasteAttempts = [],
  revising,
}) {
  const { t, i18n } = useTranslation(["writing"]);
  const summary = feedback?.overall?.summary;
  const priorities = (feedback?.overall?.nextPriorities || []).slice(0, 3);
  const [first, ...rest] = priorities;
  const more =
    rest.length > 0 ||
    (feedback?.scores || []).length > 0 ||
    (feedback?.spellingTargets || []).length > 0;
  if (!feedback || (!summary && priorities.length === 0)) return null;

  return (
    <section
      className="ws-feedback-card"
      aria-label={t("writing:student.feedbackTitle")}
    >
      <header className="ws-feedback-card-head">
        <h2>{t("writing:student.feedbackTitle")}</h2>
        <span className="ws-feedback-card-tag">
          {t("writing:student.draftTab", { n: draftNumber })}
        </span>
      </header>
      {pasteAttempts.length > 0 && (
        <div className="ws-paste-flag" role="note">
          <h3>{t("writing:student.pasteFlagTitle")}</h3>
          <p>{t("writing:student.pasteFlagBody")}</p>
          <ul>
            {pasteAttempts.map((row) => (
              <li key={`${row.at}-${row.key}-${row.index}`}>
                <strong>
                  {t("writing:student.pasteFlagAt", {
                    when: formatPasteTime(row.at, i18n.language),
                  })}
                </strong>
                {row.text ? (
                  <blockquote>{row.text}</blockquote>
                ) : (
                  <em>{t("writing:student.pasteFlagNoText")}</em>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary && <p className="ws-feedback-card-summary">{summary}</p>}
      {first && (
        <div className="ws-feedback-card-next">
          <h3 className="ws-feedback-card-sub">
            {t("writing:student.doThisFirst")}
          </h3>
          <p>{first}</p>
        </div>
      )}
      {more && (
        <details className="ws-feedback-card-more">
          <summary>{t("writing:student.seeMore")}</summary>
          {rest.length > 0 && (
            <>
              <h3 className="ws-feedback-card-sub">
                {t("writing:student.doTheseNext")}
              </h3>
              <ol className="ws-feedback-card-list">
                {rest.map((item, index) => (
                  <li key={`${index}:${item}`}>{item}</li>
                ))}
              </ol>
            </>
          )}
          {(feedback.scores || []).length > 0 && (
            <>
              <h3 className="ws-feedback-card-sub">
                {t("writing:student.rubricTitle")}
              </h3>
              <RubricStrip scores={feedback.scores} marks={marks} />
            </>
          )}
          {(feedback.spellingTargets || []).length > 0 && (
            <>
              <h3 className="ws-feedback-card-sub">
                {t("writing:student.spellingTargetsTitle")}
              </h3>
              <p className="ws-feedback-card-note">
                {t("writing:student.spellingTargetsHint")}
              </p>
              <div className="ws-spelling-chips">
                {feedback.spellingTargets.map((row) => (
                  <span className="ws-spelling-chip" key={row.word}>
                    {row.word}
                  </span>
                ))}
              </div>
            </>
          )}
        </details>
      )}
      {revising && onReadDraft && (
        <div className="ws-feedback-card-foot">
          <span>
            {t("writing:student.revisingHint", { n: draftNumber + 1 })}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onReadDraft}
          >
            {t("writing:student.readPrevious", { n: draftNumber })}
          </button>
        </div>
      )}
    </section>
  );
}
