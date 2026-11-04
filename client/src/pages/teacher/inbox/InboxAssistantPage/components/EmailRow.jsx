import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  HiOutlineCalendarDays,
  HiOutlineCheck,
  HiOutlineEllipsisHorizontal,
  HiOutlineExclamationTriangle,
  HiOutlineEyeSlash,
  HiOutlinePencilSquare,
  HiOutlinePlus,
} from "react-icons/hi2";
import { priorityKey, senderRoleKey, waitingDaysKey } from "../inboxUi.js";
import { avatarTone, formatEmailTime, initialsFor } from "./display.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function EmailRow({
  email,
  language,
  index = 0,
  onDraftReply,
  onDone,
  onNotImportant,
  onAddDeadline,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const roleKey = senderRoleKey(email.senderRole);
  const prioKey = priorityKey(email.priority);
  const sender = email.fromName || email.fromEmail || t("inboxAssistant:row.unknownSender");
  const primaryDraft = email.priority === "urgent" || email.priority === "needs_reply";
  const ignored = email.priority === "ignore";

  const receivedMs = new Date(email.receivedAt).getTime();
  const elapsedDays = Number.isFinite(receivedMs)
    ? Math.floor((Date.now() - receivedMs) / DAY_MS)
    : 0;
  const waitDays = Number(email.waitingDays);
  const showWaiting = Boolean(email.isWaiting)
    && elapsedDays > 0
    && waitDays === elapsedDays;

  const why = email.reason || t(`inboxAssistant:row.why${
    email.priority === "urgent" ? "Urgent"
      : email.priority === "needs_reply" ? "NeedsReply"
        : email.priority === "ignore" ? "Ignored" : "Fyi"
  }`);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const act = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(email.id);
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action) => {
    setMenuOpen(false);
    void act(action);
  };

  return (
    <li className={`ia-row is-${email.priority}`} style={{ "--ia-i": index }}>
      <span className={`ia-avatar is-${avatarTone(sender)}`} aria-hidden="true">
        {initialsFor(sender, email.fromEmail)}
      </span>

      <div className="ia-row-main">
        <div className="ia-row-top">
          <strong className="ia-sender" title={email.fromEmail || undefined}>{sender}</strong>
          {roleKey && <span className="ia-role">{t(`inboxAssistant:${roleKey}`)}</span>}
          <time className="ia-time" dateTime={email.receivedAt}>
            {formatEmailTime(email.receivedAt, {
              language,
              yesterday: t("inboxAssistant:row.yesterday"),
            })}
          </time>
        </div>
        <h3 className="ia-subject">{email.subject || t("inboxAssistant:row.noSubject")}</h3>
        {email.summary && <p className="ia-snippet">{email.summary}</p>}
        {why && <p className="ia-why">{why}</p>}
        <div className="ia-chips">
          {prioKey && (
            <span className={`ia-chip is-${email.priority}`}>
              {email.priority === "urgent" && <HiOutlineExclamationTriangle size={12} aria-hidden="true" />}
              {t(`inboxAssistant:${prioKey}`)}
            </span>
          )}
          {showWaiting && (
            <span className="ia-chip is-waiting">
              <span className="ia-waiting-dot" aria-hidden="true" />
              {t(`inboxAssistant:${waitingDaysKey(waitDays, language)}`, { n: waitDays })}
            </span>
          )}
          {email.hasOpenDeadline && (
            <span className="ia-chip is-deadline">
              <HiOutlineCalendarDays size={12} aria-hidden="true" />
              {t("inboxAssistant:row.hasDeadline")}
            </span>
          )}
        </div>
      </div>

      <div className="ia-mail-actions">
        {primaryDraft && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => onDraftReply(email)}
            >
              <HiOutlinePencilSquare size={14} aria-hidden="true" />
              {t("inboxAssistant:row.draftReply")}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm ia-icon-btn"
              aria-label={t("inboxAssistant:row.markDone")}
              title={t("inboxAssistant:row.markDone")}
              disabled={busy}
              onClick={() => act(onDone)}
            >
              <HiOutlineCheck size={15} aria-hidden="true" />
            </button>
          </>
        )}

        <div className="ia-menu" ref={menuRef}>
          <button
            type="button"
            className="ia-kebab"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("inboxAssistant:row.more")}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <HiOutlineEllipsisHorizontal size={17} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="ia-menu-list" role="menu">
              {!primaryDraft && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDraftReply(email);
                  }}
                >
                  <HiOutlinePencilSquare size={14} aria-hidden="true" />
                  {t("inboxAssistant:row.draftReply")}
                </button>
              )}
              {!primaryDraft && (
                <button type="button" role="menuitem" onClick={() => runAction(onDone)}>
                  <HiOutlineCheck size={14} aria-hidden="true" />
                  {t("inboxAssistant:row.markDone")}
                </button>
              )}
              {onAddDeadline && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onAddDeadline(email);
                  }}
                >
                  <HiOutlinePlus size={14} aria-hidden="true" />
                  {t("inboxAssistant:row.addDeadline")}
                </button>
              )}
              {!ignored && (
                <button type="button" role="menuitem" onClick={() => runAction(onNotImportant)}>
                  <HiOutlineEyeSlash size={14} aria-hidden="true" />
                  {t("inboxAssistant:row.notImportant")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
