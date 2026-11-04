import { useTranslation } from "react-i18next";
import { isSendAllowed, placeholderCountKey } from "../inboxUi.js";

export default function DraftEditor({
  draft,
  placeholders,
  language,
  sending,
  gmailSaving,
  discarding,
  onField,
  onIncludeCc,
  onRequestSend,
  onRequestRegenerate,
  onSaveGmail,
  onRequestDiscard,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const busy = sending || gmailSaving || discarding;
  const sendable = isSendAllowed(draft) && !busy;
  const showSendHint = !sendable && !busy && placeholders.length === 0;
  const hasText = Boolean(String(draft.subject || "").trim() && String(draft.body || "").trim());
  const ccList = Array.isArray(draft.cc) ? draft.cc : [];

  return (
    <section className="ia-draft" aria-label={t("inboxAssistant:reply.body")}>
      <div className="ia-draft-recipients">
        <p>
          <span className="ia-chip-label">{t("inboxAssistant:reply.to")}</span>
          {draft.to?.length
            ? <span className="ia-addresses">{draft.to.join(", ")}</span>
            : <span className="ia-warning">{t("inboxAssistant:reply.noRecipient")}</span>}
        </p>
        <label className="ia-check ia-check-inline">
          <input
            type="checkbox"
            checked={Boolean(draft.includeCc)}
            disabled={busy}
            onChange={(event) => onIncludeCc(event.target.checked)}
          />
          <span>{t("inboxAssistant:reply.includeCc")}</span>
        </label>
        {draft.includeCc && (
          <p>
            <span className="ia-chip-label">{t("inboxAssistant:reply.cc")}</span>
            {ccList.length
              ? <span className="ia-addresses">{ccList.join(", ")}</span>
              : <span className="ia-hint">{t("inboxAssistant:reply.noCc")}</span>}
          </p>
        )}
      </div>

      <label className="ia-field">
        <span>{t("inboxAssistant:reply.subject")}</span>
        <input
          type="text"
          maxLength={300}
          value={draft.subject}
          disabled={busy}
          onChange={(event) => onField("subject", event.target.value)}
        />
      </label>

      <label className="ia-field">
        <span>{t("inboxAssistant:reply.body")}</span>
        <textarea
          rows={12}
          maxLength={8000}
          value={draft.body}
          disabled={busy}
          onChange={(event) => onField("body", event.target.value)}
        />
      </label>

      {placeholders.length > 0 && (
        <div className="ia-placeholders" role="status">
          <strong>
            {t(`inboxAssistant:${placeholderCountKey(placeholders.length, language)}`, {
              n: placeholders.length,
            })}
          </strong>
          <p>{t("inboxAssistant:reply.placeholderBanner", { list: placeholders.join(", ") })}</p>
        </div>
      )}

      {draft.assumptions?.length > 0 && (
        <div className="ia-assumed">
          <h3>{t("inboxAssistant:reply.assumedTitle")}</h3>
          <ul>
            {draft.assumptions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      <div className="ia-draft-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!sendable}
          aria-describedby={showSendHint ? "ia-send-hint" : undefined}
          onClick={onRequestSend}
        >
          {t(sending ? "inboxAssistant:reply.sending" : "inboxAssistant:reply.send")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !hasText}
          onClick={onSaveGmail}
        >
          {t(gmailSaving ? "inboxAssistant:reply.savingGmail" : "inboxAssistant:reply.saveGmail")}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRequestRegenerate}>
          {t("inboxAssistant:reply.regenerate")}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onRequestDiscard}>
          {t("inboxAssistant:reply.discard")}
        </button>
      </div>

      {showSendHint && (
        <p id="ia-send-hint" className="ia-hint">
          {t("inboxAssistant:reply.sendBlocked")}
        </p>
      )}
    </section>
  );
}
