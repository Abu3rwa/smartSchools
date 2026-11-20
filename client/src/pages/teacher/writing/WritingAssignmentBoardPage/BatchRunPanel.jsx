import { useTranslation } from "react-i18next";
import { formatUsd } from "../../../../utils/aiCredit.js";

/**
 * F3: the confirmation before a batch starts, and the live progress of the run
 * afterwards. Both live in one compact card above the table; the per-student
 * list folds away so the table stays above the fold.
 */
export default function BatchRunPanel({
  prompt,
  run,
  busy = false,
  locale = "en",
  onConfirm,
  onDismiss,
  onCancel,
  onRetry,
}) {
  const { t } = useTranslation(["writing"]);

  if (prompt) {
    return (
      <section className="wa-batch-card" aria-live="polite">
        <div className="wa-batch-text">
          <strong>
            {t("writing:teacher.review.batchConfirmTitle", {
              n: prompt.drafts,
            })}
          </strong>
          <p>
            {t("writing:teacher.review.batchConfirmBody", {
              cost: formatUsd(prompt.estimate?.totalCents || 0, locale),
              per: formatUsd(prompt.estimate?.perDraftCents || 0, locale),
            })}
          </p>
          {prompt.waiting > prompt.drafts && (
            <p className="wa-hint">
              {t("writing:teacher.review.batchConfirmRemainder", {
                n: prompt.waiting - prompt.drafts,
              })}
            </p>
          )}
        </div>
        <div className="wa-batch-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy
              ? t("writing:teacher.review.batchStarting")
              : t("writing:teacher.review.batchConfirmStart")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onDismiss}
          >
            {t("writing:teacher.review.batchConfirmCancel")}
          </button>
        </div>
      </section>
    );
  }

  if (!run) return null;
  const totals = run.totals || {};
  const running = run.status === "running";
  // A finished run stays on screen only while it still needs the teacher.
  if (!running && !(totals.pending > 0 || totals.failed > 0)) return null;

  const title = running
    ? t("writing:teacher.review.batchRunningTitle", {
        done: totals.finished || 0,
        total: totals.drafts || 0,
      })
    : run.stoppedReason === "credit"
      ? t("writing:teacher.review.batchStoppedCredit")
      : run.status === "interrupted"
        ? t("writing:teacher.review.batchInterrupted")
        : run.status === "cancelled"
          ? t("writing:teacher.review.batchCancelled")
          : t("writing:teacher.review.batchFinishedFailed", {
              done: totals.done || 0,
              failed: totals.failed || 0,
            });

  return (
    <section
      className={`wa-batch-card is-${run.status}`}
      aria-live="polite"
    >
      <div className="wa-batch-text">
        <strong>{title}</strong>
        <p>
          {t("writing:teacher.review.batchProgress", {
            done: totals.finished || 0,
            total: totals.drafts || 0,
            failed: totals.failed || 0,
            skipped: totals.skipped || 0,
          })}
        </p>
        {running && run.cancelRequested && (
          <p className="wa-hint">
            {t("writing:teacher.review.batchCancelRequested")}
          </p>
        )}
      </div>
      <div className="wa-batch-actions">
        {running ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={run.cancelRequested}
            onClick={onCancel}
          >
            {run.cancelRequested
              ? t("writing:teacher.review.batchCancelling")
              : t("writing:teacher.review.batchCancel")}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRetry}
          >
            {(totals.failed || 0) > 0
              ? t("writing:teacher.review.batchRetry")
              : t("writing:teacher.review.batchResume")}
          </button>
        )}
      </div>
      <details className="wa-batch-items">
        <summary>
          {t("writing:teacher.review.batchShowStudents", {
            n: totals.drafts || 0,
          })}
        </summary>
        <ul>
          {(run.items || []).map((item) => (
            <li key={item.projectId}>
              <span>{item.studentName || item.studentId}</span>
              <em>
                {t(`writing:teacher.review.batchItem.${item.status}`)}
              </em>
              {item.error && <small>{item.error}</small>}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
