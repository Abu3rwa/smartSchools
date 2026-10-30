import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { HiOutlineDocumentText, HiOutlinePencilAlt } from "react-icons/hi";
import { actionKey } from "../studentAction.js";
import { useWritingFeedData } from "./hooks/useWritingFeedData.js";
import "./WritingFeedPage.css";

const TOTALS = ["open", "awaitingTeacher", "ready", "completed"];

export default function WritingFeedPage() {
  const { t, i18n } = useTranslation(["writing"]);
  const { assignments, totals, loading, opening, openAssignment } = useWritingFeedData();

  if (loading) {
    return (
      <div className="wf-page wf-loading" aria-live="polite">
        <div className="spinner" />
        <p>{t("writing:student.loading")}</p>
      </div>
    );
  }

  const dueLabel = (value) => new Date(value).toLocaleDateString(i18n.language, {
    day: "2-digit", month: "short",
  });

  const columns = {
    task: t("writing:student.columns.task"),
    progress: t("writing:student.columns.progress"),
    drafts: t("writing:student.columns.drafts"),
    yourDrafts: t("writing:student.columns.yourDrafts"),
    next: t("writing:student.columns.next"),
  };

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

      {assignments.length > 0 && (
        <>
          <div className="wf-stats">
            {TOTALS.map((key) => (
              <div key={key} className={`wf-stat is-${key}`}>
                <span className="wf-stat-value">{totals[key] || 0}</span>
                <span className="wf-stat-label">{t(`writing:student.totals.${key}`)}</span>
              </div>
            ))}
          </div>

          <div className="wf-table-card">
            <table className="wf-table">
              <thead>
                <tr>
                  <th scope="col">{columns.task}</th>
                  <th scope="col">{columns.progress}</th>
                  <th scope="col">{columns.drafts}</th>
                  <th scope="col">{columns.yourDrafts}</th>
                  <th scope="col" className="wf-col-next">{columns.next}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((card) => {
                  const key = actionKey({ stage: card.stage, action: card.nextAction?.action });
                  const waiting = card.nextAction?.action === "wait" || card.nextAction?.action === "done";
                  const done = card.nextAction?.action === "done";
                  const label = t(`writing:student.actions.${key}`, {
                    n: key === "teacherReviewing" ? Math.max(1, card.draftCount) : card.draftCount + 1,
                  });
                  const steps = card.tracker || [];
                  const doneSteps = steps.filter((step) => step.state === "done").length;
                  const currentStep = steps.find((step) => step.state === "current");
                  const position = Math.min(doneSteps + 1, Math.max(steps.length, 1));

                  return (
                    <tr key={card.id} className={waiting ? "is-waiting" : ""}>
                      <td data-label={columns.task}>
                        <span className="wf-title">{card.title}</span>
                        <span className="wf-meta">
                          {t(`writing:student.types.${card.writingType}`)}
                          {" · "}
                          {card.dueDate
                            ? t("writing:student.dueBefore", { date: dueLabel(card.dueDate) })
                            : t("writing:student.noDue")}
                        </span>
                        {card.topic && <span className="wf-topic">{card.topic}</span>}
                      </td>

                      <td data-label={columns.progress}>
                        <div className="wf-progress">
                          {steps.length > 0 && (
                            <div className="wf-progress-bar" role="img" aria-label={t("writing:student.progressAria")}>
                              {steps.map((step) => (
                                <span
                                  key={step.key}
                                  className={`wf-progress-seg is-${step.state}`}
                                  title={t(`writing:student.tracker.${step.key}`)}
                                />
                              ))}
                            </div>
                          )}
                          <span className="wf-progress-label">
                            {currentStep
                              ? t(`writing:student.tracker.${currentStep.key}`)
                              : t("writing:student.tracker.completed")}
                          </span>
                          {steps.length > 0 && (
                            <span className="wf-meta">
                              {t("writing:student.stepOf", { n: position, total: steps.length })}
                            </span>
                          )}
                        </div>
                      </td>

                      <td data-label={columns.drafts} className="wf-col-num">
                        <span className="wf-strong">
                          {t("writing:student.draftCount", { n: card.draftCount })}
                        </span>
                        {card.wordCount > 0 && (
                          <span className="wf-meta">{t("writing:student.words", { n: card.wordCount })}</span>
                        )}
                      </td>

                      <td data-label={columns.yourDrafts}>
                        {card.projectId && card.draftCount > 0 ? (
                          <div className="wf-drafts">
                            {Array.from({ length: card.draftCount }, (_, index) => index + 1).map((n) => (
                              <Link
                                key={n}
                                className="wf-draft-link"
                                to={`/portal/writing/project/${card.projectId}?draft=${n}`}
                              >
                                {t("writing:student.draftTab", { n })}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="wf-dash" aria-hidden="true">—</span>
                        )}
                      </td>

                      <td data-label={columns.next} className="wf-col-next">
                        {waiting ? (
                          <span className={`wf-waiting${done ? " is-done" : ""}`}>{label}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={opening === card.id}
                            onClick={() => openAssignment(card)}
                          >
                            <HiOutlinePencilAlt size={15} aria-hidden="true" />
                            {label}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
