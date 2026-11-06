import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlinePaperAirplane,
  HiOutlineTrash,
} from "react-icons/hi2";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { gmailThreadUrl } from "../inboxUi.js";

const CLEANUP_PATH = "/portal/notifications?tab=gmail-cleanup";

const preview = (body) => String(body ?? "").replace(/\s+/g, " ").trim().slice(0, 160);

export default function SentList({ list, language, onRetry, onDelete, onLoadMore, onEmpty }) {
  const { t } = useTranslation(["inboxAssistant"]);
  const [confirming, setConfirming] = useState(false);

  const doEmpty = async () => {
    if (list.emptying) return;
    const emptied = await onEmpty();
    if (emptied) setConfirming(false);
  };

  const when = (sentAt) => (
    sentAt
      ? new Date(sentAt).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })
      : ""
  );

  return (
    <section className="ia-sent" aria-label={t("inboxAssistant:tabs.sent")}>
      <div className="ia-sent-head">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!list.items.length || list.emptying}
          onClick={() => setConfirming(true)}
        >
          {t("inboxAssistant:sent.emptyHistory")}
        </button>
      </div>

      {(list.state === "loading" || list.state === "idle") && (
        <div className="ia-skeleton-state" role="status">
          <span className="ia-sr-only">{t("inboxAssistant:list.loading")}</span>
          <div className="ia-skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="ia-skeleton-row" style={{ "--ia-i": row }}>
                <span className="ia-skeleton-line is-title" />
                <span className="ia-skeleton-line is-meta" />
                <span className="ia-skeleton-line" />
              </div>
            ))}
          </div>
        </div>
      )}

      {list.state === "error" && (
        <div className="ia-list-state" role="alert">
          <p>{t("inboxAssistant:sent.loadFailed")}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            {t("inboxAssistant:retry")}
          </button>
        </div>
      )}

      {list.state === "ready" && !list.items.length && (
        <div className="ia-list-state ia-empty">
          <span className="ia-empty-icon" aria-hidden="true">
            <HiOutlinePaperAirplane size={22} />
          </span>
          <strong>{t("inboxAssistant:sent.empty")}</strong>
          <p>{t("inboxAssistant:sent.emptyHint")}</p>
        </div>
      )}

      {list.state === "ready" && list.items.length > 0 && (
        <>
          <ul className="ia-sent-rows">
            {list.items.map((item, index) => (
              <li key={item.id} className="ia-sent-row" style={{ "--ia-i": index }}>
                <div className="ia-sent-main">
                  <h3>
                    {item.subject || t("inboxAssistant:sent.noSubject")}
                    {item.source === "auto" && (
                      <span className="ia-sent-auto">{t("inboxAssistant:sent.autoSent")}</span>
                    )}
                  </h3>
                  <p className="ia-sent-to">
                    {t("inboxAssistant:sent.to")}: {item.to?.join(", ") || "—"}
                    {item.cc?.length ? ` · ${t("inboxAssistant:reply.cc")}: ${item.cc.join(", ")}` : ""}
                  </p>
                  {item.body && <p className="ia-sent-preview">{preview(item.body)}</p>}
                  <p className="ia-sent-date">{when(item.sentAt)}</p>
                </div>
                <div className="ia-sent-actions">
                  {item.threadId && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={gmailThreadUrl(item.threadId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <HiOutlineArrowTopRightOnSquare size={15} aria-hidden="true" />
                      {t("inboxAssistant:sent.openThread")}
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm ia-icon-btn"
                    aria-label={t("inboxAssistant:sent.delete")}
                    title={t("inboxAssistant:sent.delete")}
                    disabled={list.deletingId === item.id}
                    onClick={() => onDelete(item.id)}
                  >
                    <HiOutlineTrash size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {list.nextCursor && (
            <button
              type="button"
              className="btn btn-secondary btn-sm ia-sent-more"
              disabled={list.loadingMore}
              onClick={onLoadMore}
            >
              {t(list.loadingMore ? "inboxAssistant:sent.loadingMore" : "inboxAssistant:sent.loadMore")}
            </button>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDialog
          titleId="ia-empty-sent-title"
          onClose={() => {
            if (!list.emptying) setConfirming(false);
          }}
        >
          <h2 id="ia-empty-sent-title">{t("inboxAssistant:sent.emptyTitle")}</h2>
          <p>{t("inboxAssistant:sent.emptyBody")}</p>
          <p className="ia-hint">
            {`${t("inboxAssistant:sent.cleanupLine")} `}
            <Link to={CLEANUP_PATH}>{t("inboxAssistant:sent.cleanupLink")}</Link>
            .
          </p>
          <div className="ia-dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={list.emptying}
              onClick={() => setConfirming(false)}
            >
              {t("inboxAssistant:sent.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={list.emptying}
              onClick={doEmpty}
            >
              {t(list.emptying ? "inboxAssistant:sent.emptying" : "inboxAssistant:sent.emptyConfirm")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
