import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlinePencilSquare } from "react-icons/hi2";
import ConfirmDialog from "./ConfirmDialog.jsx";
import DraftEditor from "./DraftEditor.jsx";
import ReplyTypePicker from "./ReplyTypePicker.jsx";
import { formatEstimate, senderRoleKey } from "../inboxUi.js";
import { formatEmailTime } from "./display.js";

export default function ReplyPanel({ reply, language, defaultTone }) {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateNote, setRegenerateNote] = useState("");
  const sendLockRef = useRef(false);

  const email = reply.email;
  const draft = reply.draft;
  const detail = reply.detail;
  const sender = email.fromName || email.fromEmail || t("inboxAssistant:row.unknownSender");
  const busy = reply.sending || reply.gmailSaving || reply.discarding;
  const roleKey = senderRoleKey(detail?.senderRole);
  const draftLanguage = draft?.language === "ar" ? "ar" : "en";
  const draftTone = draft?.tone || defaultTone || "professional";

  const doSend = async () => {
    if (sendLockRef.current) return;
    sendLockRef.current = true;
    const sent = await reply.send();
    if (!sent) sendLockRef.current = false;
  };

  const doRegenerate = async () => {
    if (reply.generating) return;
    const next = await reply.regenerate(regenerateNote);
    if (next) {
      setRegenerateOpen(false);
      setRegenerateNote("");
    }
  };

  const doDiscard = async () => {
    if (reply.discarding) return;
    const discarded = await reply.discard();
    if (discarded) setConfirmDiscard(false);
  };

  return (
    <section className="ia-panel ia-reply" aria-labelledby="ia-reply-title">
      <header className="ia-panel-head ia-reply-head">
        <span className="ia-reply-heading">
          <HiOutlinePencilSquare size={15} aria-hidden="true" />
          <h2 id="ia-reply-title">{t("inboxAssistant:reply.title", { sender })}</h2>
        </span>
        <div className="ia-panel-tools">
          {draft && <span className="ia-chip is-fyi">{t("inboxAssistant:reply.draftNotSent")}</span>}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={reply.sending || reply.discarding}
            onClick={() => reply.close()}
          >
            {t("inboxAssistant:reply.close")}
          </button>
        </div>
      </header>

      {reply.errorKey && (
        <p className="ia-notice is-error" role="alert">{t(`inboxAssistant:${reply.errorKey}`)}</p>
      )}
      {reply.noticeKey && (
        <p className="ia-notice is-ok" role="status">{t(`inboxAssistant:${reply.noticeKey}`)}</p>
      )}

      <div className="ia-reply-grid">
        <article className="ia-reply-col ia-original">
          <p className="ia-col-label">{t("inboxAssistant:reply.original")}</p>
          {reply.detailState === "loading" && (
            <p className="ia-list-state" role="status">{t("inboxAssistant:reply.loading")}</p>
          )}
          {reply.detailState === "error" && (
            <div className="ia-list-state" role="alert">
              <p>{t("inboxAssistant:reply.loadFailed")}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={reply.retryDetail}>
                {t("inboxAssistant:reply.retry")}
              </button>
            </div>
          )}
          {reply.detailState === "ready" && (
            <>
              <p className="ia-orig-meta">{sender}</p>
              <p className="ia-orig-time">
                {formatEmailTime(detail?.receivedAt, {
                  language,
                  yesterday: t("inboxAssistant:row.yesterday"),
                })}
                {roleKey ? ` · ${t(`inboxAssistant:${roleKey}`)}` : ""}
              </p>
              {detail?.subject && <p className="ia-orig-subject">{detail.subject}</p>}
              {detail?.summary && <p className="ia-original-summary">{detail.summary}</p>}
              {detail?.bodyText
                ? <div className="ia-orig-body">{detail.bodyText}</div>
                : <p className="ia-hint">{t("inboxAssistant:reply.noText")}</p>}
            </>
          )}

          {draft?.assumptions?.length > 0 && (
            <div className="ia-assumed">
              <p className="ia-col-label">{t("inboxAssistant:reply.assumedTitle")}</p>
              <ul>
                {draft.assumptions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </article>

        <div className="ia-reply-col ia-reply-draft">
          <p className="ia-col-label">{t("inboxAssistant:reply.body")}</p>
          {draft && (
            <p className="ia-draft-meta">
              {t("inboxAssistant:reply.replyingIn", {
                language: t(`inboxAssistant:reply.languages.${draftLanguage}`),
              })}
              {" · "}
              {t("inboxAssistant:reply.toneLine", {
                tone: t(`inboxAssistant:toolbar.tones.${draftTone}`),
              })}
            </p>
          )}
          {!draft && (
            <ReplyTypePicker
              key={email.id}
              types={reply.replyTypes}
              customTypes={reply.customTypes}
              typesState={reply.typesState}
              suggested={email.suggestedReplyType}
              defaultTone={defaultTone}
              estimateCents={reply.estimateCents}
              generating={reply.generating}
              onWrite={reply.writeDraft}
              onSaveType={reply.saveAsType}
              onRetryTypes={reply.retryTypes}
            />
          )}
          {draft && (
            <DraftEditor
              draft={draft}
              placeholders={reply.placeholders}
              language={language}
              sending={reply.sending}
              gmailSaving={reply.gmailSaving}
              discarding={reply.discarding}
              onField={reply.setField}
              onIncludeCc={reply.setIncludeCc}
              onRequestSend={() => setConfirmSend(true)}
              onRequestRegenerate={() => setRegenerateOpen(true)}
              onSaveGmail={reply.saveToGmail}
              onRequestDiscard={() => setConfirmDiscard(true)}
            />
          )}
        </div>
      </div>

      {confirmSend && draft && (
        <ConfirmDialog
          titleId="ia-send-title"
          onClose={() => {
            if (!reply.sending) setConfirmSend(false);
          }}
        >
          <h2 id="ia-send-title">{t("inboxAssistant:reply.sendTitle")}</h2>
          <dl className="ia-send-summary">
            <div>
              <dt>{t("inboxAssistant:reply.to")}</dt>
              <dd>{draft.to?.join(", ") || t("inboxAssistant:reply.noRecipient")}</dd>
            </div>
            {draft.cc?.length > 0 && (
              <div>
                <dt>{t("inboxAssistant:reply.cc")}</dt>
                <dd>{draft.cc.join(", ")}</dd>
              </div>
            )}
            <div>
              <dt>{t("inboxAssistant:reply.subject")}</dt>
              <dd>{draft.subject}</dd>
            </div>
          </dl>
          <p className="ia-dialog-note">
            {t("inboxAssistant:reply.sendThread")} {t("inboxAssistant:reply.sendNoAiRecipients")}
          </p>
          <div className="ia-send-body">{draft.body}</div>
          <div className="ia-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reply.sending}
              onClick={() => setConfirmSend(false)}
            >
              {t("inboxAssistant:reply.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={reply.sending || !draft.to?.length}
              onClick={doSend}
            >
              {t(reply.sending ? "inboxAssistant:reply.sending" : "inboxAssistant:reply.sendNow")}
            </button>
          </div>
        </ConfirmDialog>
      )}

      {regenerateOpen && draft && (
        <ConfirmDialog
          titleId="ia-regenerate-title"
          onClose={() => {
            if (!reply.generating) setRegenerateOpen(false);
          }}
        >
          <h2 id="ia-regenerate-title">{t("inboxAssistant:reply.regenerateTitle")}</h2>
          <label className="ia-field">
            <span>{t("inboxAssistant:reply.regenerateNote")}</span>
            <textarea
              rows={3}
              maxLength={500}
              value={regenerateNote}
              disabled={reply.generating}
              onChange={(event) => setRegenerateNote(event.target.value)}
              aria-describedby="ia-regenerate-hint"
            />
            <small id="ia-regenerate-hint" className="ia-hint">
              {t("inboxAssistant:reply.regenerateNoteHint")}
            </small>
          </label>
          <p className="ia-hint">
            {reply.estimateCents !== null
              ? t("inboxAssistant:reply.estimate", {
                cost: formatEstimate(reply.estimateCents, i18n.language),
              })
              : ""}
          </p>
          <div className="ia-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reply.generating}
              onClick={() => setRegenerateOpen(false)}
            >
              {t("inboxAssistant:reply.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={reply.generating}
              onClick={doRegenerate}
            >
              {t(reply.generating ? "inboxAssistant:reply.regenerating" : "inboxAssistant:reply.regenerateGo")}
            </button>
          </div>
        </ConfirmDialog>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          titleId="ia-discard-title"
          onClose={() => {
            if (!reply.discarding) setConfirmDiscard(false);
          }}
        >
          <h2 id="ia-discard-title">{t("inboxAssistant:reply.discardTitle")}</h2>
          <p>{t("inboxAssistant:reply.discardBody")}</p>
          <div className="ia-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reply.discarding || busy}
              onClick={() => setConfirmDiscard(false)}
            >
              {t("inboxAssistant:reply.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={reply.discarding}
              onClick={doDiscard}
            >
              {t(reply.discarding ? "inboxAssistant:reply.discarding" : "inboxAssistant:reply.discardConfirm")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
