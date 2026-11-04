import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCheck,
  HiOutlineEyeSlash,
  HiOutlinePencilSquare,
} from "react-icons/hi2";
import { priorityKey, senderRoleKey, waitingDaysKey } from "../inboxUi.js";

export default function EmailRow({ email, language, index = 0, onDraftReply, onDone, onNotImportant }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [busy, setBusy] = useState(false);
  const roleKey = senderRoleKey(email.senderRole);
  const prioKey = priorityKey(email.priority);
  const sender = email.fromName || email.fromEmail || t("inboxAssistant:row.unknownSender");

  const act = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(email.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`ia-row is-${email.priority}`} style={{ "--ia-i": index }}>
      <div className="ia-row-main">
        <div className="ia-row-top">
          <strong className="ia-sender" title={email.fromEmail || undefined}>{sender}</strong>
          {roleKey && (
            <span className={`ia-chip ia-role is-${email.senderRole}`}>
              {t(`inboxAssistant:${roleKey}`)}
            </span>
          )}
          {prioKey && (
            <span className={`ia-chip ia-priority is-${email.priority}`}>
              {t(`inboxAssistant:${prioKey}`)}
            </span>
          )}
          {email.isWaiting && (
            <span className="ia-chip ia-waiting">
              <span className="ia-waiting-dot" aria-hidden="true" />
              {t(`inboxAssistant:${waitingDaysKey(email.waitingDays, language)}`, {
                n: email.waitingDays,
              })}
            </span>
          )}
        </div>
        <h3 className="ia-subject">{email.subject || t("inboxAssistant:row.noSubject")}</h3>
        {email.summary && <p className="ia-summary">{email.summary}</p>}
        {email.reason && <p className="ia-reason">{email.reason}</p>}
      </div>
      <div className="ia-row-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => onDraftReply(email)}
        >
          <HiOutlinePencilSquare size={15} aria-hidden="true" />
          {t("inboxAssistant:row.draftReply")}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => act(onDone)}
        >
          <HiOutlineCheck size={15} aria-hidden="true" />
          {t("inboxAssistant:row.markDone")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => act(onNotImportant)}
        >
          <HiOutlineEyeSlash size={15} aria-hidden="true" />
          {t("inboxAssistant:row.notImportant")}
        </button>
      </div>
    </li>
  );
}
