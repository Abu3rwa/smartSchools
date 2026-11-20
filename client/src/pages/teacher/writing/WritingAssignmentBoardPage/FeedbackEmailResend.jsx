import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineMail } from "react-icons/hi";
import writingService from "../../../../services/writingService.js";
import { publishedFeedbackForEmail } from "./assessmentPresentation.js";
import EmailRecipients from "./EmailRecipients.jsx";

const ERROR_KEYS = {
  WRITING_EMAIL_NOT_FOUND: "notFound",
  WRITING_EMAIL_FORBIDDEN: "forbidden",
  WRITING_EMAIL_NOT_PUBLISHED: "notPublished",
  WRITING_EMAIL_RECIPIENTS_REQUIRED: "chooseRecipients",
  WRITING_EMAIL_DISABLED: "disabled",
  WRITING_EMAIL_EMPTY: "empty",
  WRITING_EMAIL_NO_ADDRESSES: "noAddresses",
  WRITING_EMAIL_SUPPRESSED: "suppressed",
};

export default function FeedbackEmailResend({ history, emailDelivery, disabled }) {
  const { t } = useTranslation("writing");
  const published = publishedFeedbackForEmail(history.assessments);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [notify, setNotify] = useState({
    student: Boolean(emailDelivery?.students),
    parents: Boolean(emailDelivery?.parents),
  });
  const [loadedPreview, setPreview] = useState(null);
  const [previewRole, setPreviewRole] = useState("student");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const busy = useRef(false);
  const assessmentId = published.find((row) => row._id === selected)?._id || published[0]?._id;
  const enabled = Boolean(emailDelivery?.students || emailDelivery?.parents);
  const locked = disabled || Boolean(pending);
  const preview = loadedPreview?.assessmentId === assessmentId ? loadedPreview : null;
  const message = preview?.previews.find((row) => row.role === previewRole) || preview?.previews[0];
  const label = (key, values) => t(`teacher.review.resend.${key}`, values);
  const sentState = published.find((row) => row._id === assessmentId)?.publish?.email?.status;
  const recipientLabel = (role) => t(`teacher.review.${role === "student" ? "emailStudent" : "emailParents"}`);

  if (!published.length) return null;

  const clearPreview = () => {
    setPreview(null);
    setError("");
    setResult(null);
  };

  const request = async (send) => {
    if (busy.current || locked || !enabled || (!notify.student && !notify.parents) || (send && !preview)) return;
    busy.current = true;
    setPending(send ? "send" : "preview");
    setError("");
    setResult(null);
    try {
      if (send) {
        setResult(await writingService.resendFeedbackEmail(assessmentId, notify));
        setPreview(null);
      } else {
        const data = await writingService.previewFeedbackEmail(assessmentId, notify);
        setPreview({ ...data, assessmentId });
        setPreviewRole(data.previews[0]?.role || "student");
      }
    } catch (cause) {
      const key = ERROR_KEYS[cause?.response?.data?.code];
      setError(label(key || (send ? "sendFailed" : "previewFailed")));
      setPreview(null);
    } finally {
      busy.current = false;
      setPending("");
    }
  };

  return (
    <section className="wa-email-resend">
      {!open ? (
        <>
          <button type="button" className="btn btn-secondary btn-sm" disabled={locked || !enabled} onClick={() => setOpen(true)}>
            <HiOutlineMail size={16} aria-hidden="true" />
            {label("open")}
          </button>
          {!enabled && <p className="wa-hint">{label("disabled")}</p>}
        </>
      ) : (
        <div className="wa-review-block">
          <div className="wa-review-block-head">
            <h4>{label("open")}</h4>
            <button type="button" className="btn btn-ghost btn-sm" disabled={locked} onClick={() => { setOpen(false); clearPreview(); }}>
              {label("close")}
            </button>
          </div>
          <p className="wa-hint">{label("hint")}</p>
          <label className="wa-field">
            <span>{label("feedback")}</span>
            <select value={assessmentId} disabled={locked} onChange={(event) => { setSelected(event.target.value); clearPreview(); }}>
              {published.map((row) => (
                <option key={row._id} value={row._id}>
                  {t("teacher.board.draftNumber", { n: history.drafts.find((draft) => String(draft._id) === String(row.draft))?.number })}
                </option>
              ))}
            </select>
          </label>
          {/* What the last send actually did. Publishing returns before the mail
              leaves, so without this line a failure is invisible to the teacher. */}
          {sentState && (
            <p className={sentState === "failed" ? "wa-email-error" : "wa-hint"} role="status">
              {label(`delivery.${sentState}`)}
            </p>
          )}
          <fieldset className="wa-review-notify" disabled={locked}>
            <legend className="wa-review-notify-label">{label("recipients")}</legend>
            {/* Both channels stay visible when gated off, like the publish panel:
                hiding a channel leaves the teacher guessing why it is missing. */}
            {[{ role: "student", allowed: emailDelivery?.students }, { role: "parents", allowed: emailDelivery?.parents }].map(({ role, allowed }) => (
              <label className="wa-review-check" key={role}>
                <input type="checkbox" checked={Boolean(allowed && notify[role])} disabled={!allowed} onChange={(event) => { setNotify((current) => ({ ...current, [role]: event.target.checked })); clearPreview(); }} />
                <span>{recipientLabel(role)}</span>
              </label>
            ))}
            {(!emailDelivery?.students || !emailDelivery?.parents) && <p className="wa-review-notify-hint">{label("disabled")}</p>}
            <EmailRecipients
              recipients={history.emailRecipients}
              allowed={emailDelivery}
              selected={notify}
            />
          </fieldset>
          {!notify.student && !notify.parents && <p className="wa-hint">{label("chooseRecipients")}</p>}
          {error && <p className="wa-email-error" role="alert">{error}</p>}
          {result && (
            <div className={result.failed ? "wa-email-error" : "wa-email-result"} role="status">
              <p>{label("result", { sent: result.sent, failed: result.failed })}</p>
              {result.failed > 0 && <p>{label(result.sent > 0 ? "partial" : "allFailed")}</p>}
              {result.skipped > 0 && <p>{label("resultAlreadySent", { n: result.skipped })}</p>}
              {result.suppressed > 0 && <p>{label("resultSuppressed", { n: result.suppressed })}</p>}
            </div>
          )}
          {(preview?.missing || result?.missing || []).map((role) => (
            <p className="wa-hint" key={role}>{label("missing", { recipient: recipientLabel(role) })}</p>
          ))}
          {message && (
            <div className="wa-email-preview">
              <div className="wa-review-actions" role="group" aria-label={label("previewFor")}>
                {preview.previews.map((row) => (
                  <button type="button" key={row.role} className={`btn btn-sm ${message.role === row.role ? "btn-secondary" : "btn-ghost"}`} aria-pressed={message.role === row.role} onClick={() => setPreviewRole(row.role)}>
                    {recipientLabel(row.role)}
                  </button>
                ))}
              </div>
              <p className="wa-email-subject">{message.subject}</p>
              <iframe title={label("previewFor")} sandbox="" referrerPolicy="no-referrer" srcDoc={message.html} />
              <p className="wa-hint">{label("recipientTotal", { n: preview.previews.reduce((sum, row) => sum + row.recipients, 0) })}</p>
              {preview.previews.some((row) => row.sent > 0) && (
                <p className="wa-hint">
                  {label("previewAlreadySent", {
                    n: preview.previews.reduce((sum, row) => sum + (row.sent || 0), 0),
                  })}
                </p>
              )}
              {preview.suppressed > 0 && (
                <p className="wa-hint">{label("resultSuppressed", { n: preview.suppressed })}</p>
              )}
            </div>
          )}
          <div className="wa-review-actions">
            {preview ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={locked || !enabled} onClick={() => request(true)}>
                {label(pending === "send" ? "sending" : "send")}
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={locked || !enabled || (!notify.student && !notify.parents)} onClick={() => request(false)}>
                {label(pending === "preview" ? "loading" : "preview")}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
