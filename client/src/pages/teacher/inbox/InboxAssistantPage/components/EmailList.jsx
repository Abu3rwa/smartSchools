import { useTranslation } from "react-i18next";
import { HiOutlineArrowPath, HiOutlineInbox, HiOutlineLockClosed } from "react-icons/hi2";
import EmailRow from "./EmailRow.jsx";

export default function EmailList({
  group,
  list,
  language,
  onRetry,
  onRefresh,
  onDraftReply,
  onDone,
  onNotImportant,
  onAddDeadline,
}) {
  const { t } = useTranslation(["inboxAssistant"]);
  const emails = list?.emails || [];
  const hasRows = emails.length > 0;

  if (list?.state === "loading" || list?.state === "idle") {
    return (
      <div className="ia-skeleton-state" role="status">
        <span className="ia-sr-only">{t("inboxAssistant:list.loading")}</span>
        <div className="ia-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="ia-skeleton-row" style={{ "--ia-i": row }}>
              <span className="ia-skeleton-avatar" />
              <div className="ia-skeleton-lines">
                <span className="ia-skeleton-line is-short" />
                <span className="ia-skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const failure = list?.state === "error" && (
    <div className="ia-list-state is-error" role="alert">
      <p className="ia-state-notice is-error">
        {list.errorKey ? t(`inboxAssistant:${list.errorKey}`) : t("inboxAssistant:list.loadFailed")}
      </p>
      <p className="ia-state-notice">
        <HiOutlineLockClosed size={13} aria-hidden="true" />
        {t("inboxAssistant:list.failureKeep")}
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        {t("inboxAssistant:retry")}
      </button>
    </div>
  );

  if (list?.state === "error" && !hasRows) return failure;

  if (!hasRows) {
    return (
      <div className="ia-list-state ia-empty">
        <span className="ia-empty-icon" aria-hidden="true">
          <HiOutlineInbox size={22} />
        </span>
        <strong>{t(`inboxAssistant:list.empty.${group}`)}</strong>
        <p>{t("inboxAssistant:list.emptyHint")}</p>
        {onRefresh && (
          <div className="ia-state-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
              <HiOutlineArrowPath size={14} aria-hidden="true" />
              {t("inboxAssistant:toolbar.refresh")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {failure}
      <ul className="ia-rows">
        {emails.map((email, index) => (
          <EmailRow
            key={email.id}
            email={email}
            index={index}
            language={language}
            onDraftReply={onDraftReply}
            onDone={onDone}
            onNotImportant={onNotImportant}
            onAddDeadline={onAddDeadline}
          />
        ))}
      </ul>
    </>
  );
}
