import { useTranslation } from "react-i18next";

/**
 * F7: the confirmation block for a class-wide publish. The preview lists every
 * selected row, says which ones cannot go out and why, shows the email channels
 * and one real sample message. Nothing is published until the teacher confirms.
 */
export default function BulkPublishPanel({
  prompt,
  result,
  pending,
  emailDelivery,
  notify,
  onNotifyChange,
  onConfirm,
  onDismiss,
}) {
  const { t } = useTranslation(["writing"]);
  if (!prompt && !result) return null;

  if (result) {
    return (
      <section className="wa-bulk-card" aria-live="polite">
        <div className="wa-bulk-head">
          <h3>{t("writing:teacher.bulk.resultTitle")}</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDismiss}
          >
            {t("writing:teacher.bulk.close")}
          </button>
        </div>
        <ul className="wa-bulk-rows">
          {result.rows.map((row) => (
            <li
              key={row.projectId}
              className={`is-${row.status}`}
            >
              <span className="wa-bulk-name">{row.studentName || "—"}</span>
              <span className="wa-bulk-status">
                {t(`writing:teacher.bulk.status.${row.status}`)}
              </span>
              {row.status === "blocked" && row.reasons.length > 0 && (
                <span className="wa-bulk-reason">
                  {[...new Set(row.reasons)]
                    .map((reason) => t(`writing:teacher.bulk.reason.${reason}`))
                    .join(" ")}
                </span>
              )}
              {row.status === "failed" && (
                <span className="wa-bulk-reason">{row.message}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const { summary, email, sampleEmail } = prompt;
  return (
    <section className="wa-bulk-card">
      <div className="wa-bulk-head">
        <h3>{t("writing:teacher.bulk.title", { n: summary.selected })}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={onDismiss}
        >
          {t("writing:teacher.bulk.cancel")}
        </button>
      </div>
      <p className="wa-hint">{t("writing:teacher.bulk.hint")}</p>
      <p className="wa-bulk-count">
        {t("writing:teacher.bulk.eligible", { n: summary.eligible })}
        {summary.blocked > 0 && (
          <> · {t("writing:teacher.bulk.blockedCount", { n: summary.blocked })}</>
        )}
      </p>
      <ul className="wa-bulk-rows">
        {prompt.rows.map((row) => (
          <li
            key={row.projectId}
            className={row.reasons.length ? "is-blocked" : "is-eligible"}
          >
            <span className="wa-bulk-name">{row.studentName || "—"}</span>
            {row.reasons.length ? (
              <span className="wa-bulk-reason">
                {[...new Set(row.reasons)]
                  .map((reason) => t(`writing:teacher.bulk.reason.${reason}`))
                  .join(" ")}
              </span>
            ) : (
              <span className="wa-bulk-reason">
                {(row.email?.students || 0) + (row.email?.parents || 0) > 0
                  ? t("writing:teacher.bulk.rowEmail", {
                      students: row.email.students,
                      parents: row.email.parents,
                    })
                  : t(
                      `writing:teacher.bulk.emailNote.${row.email?.note || "none"}`,
                    )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <fieldset className="wa-review-notify" disabled={pending}>
        <legend className="wa-review-notify-label">
          {t("writing:teacher.bulk.recipientsLabel")}
        </legend>
        <label className="wa-review-check">
          <input
            type="checkbox"
            checked={Boolean(emailDelivery?.students && notify.student)}
            disabled={!emailDelivery?.students}
            onChange={(event) => onNotifyChange("student", event.target.checked)}
          />
          <span>{t("writing:teacher.review.emailStudent")}</span>
        </label>
        <label className="wa-review-check">
          <input
            type="checkbox"
            checked={Boolean(emailDelivery?.parents && notify.parents)}
            disabled={!emailDelivery?.parents}
            onChange={(event) => onNotifyChange("parents", event.target.checked)}
          />
          <span>{t("writing:teacher.review.emailParents")}</span>
        </label>
        {(!emailDelivery?.students || !emailDelivery?.parents) && (
          <p className="wa-review-notify-hint">
            {t("writing:teacher.review.resend.disabled")}
          </p>
        )}
        <p className="wa-review-notify-hint">
          {(email?.students || 0) + (email?.parents || 0) > 0
            ? t("writing:teacher.bulk.emailSummary", {
                students: email.students,
                parents: email.parents,
              })
            : t("writing:teacher.bulk.emailOff")}
        </p>
      </fieldset>
      {sampleEmail && (
        <details className="wa-bulk-sample">
          <summary>{t("writing:teacher.bulk.previewEmail")}</summary>
          <p className="wa-email-subject">{sampleEmail.subject}</p>
          <iframe
            title={t("writing:teacher.bulk.previewEmail")}
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={sampleEmail.html}
          />
          <p className="wa-hint">
            {t("writing:teacher.bulk.sampleFor", {
              name: sampleEmail.studentName,
            })}
          </p>
        </details>
      )}
      <div className="wa-review-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || summary.eligible === 0}
          onClick={onConfirm}
        >
          {pending
            ? t("writing:teacher.bulk.publishing")
            : t("writing:teacher.bulk.confirm", { n: summary.eligible })}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending}
          onClick={onDismiss}
        >
          {t("writing:teacher.bulk.cancel")}
        </button>
      </div>
    </section>
  );
}
