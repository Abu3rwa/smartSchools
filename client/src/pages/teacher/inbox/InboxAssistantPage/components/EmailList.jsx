import { useTranslation } from "react-i18next";
import { HiOutlineInbox } from "react-icons/hi2";
import EmailRow from "./EmailRow.jsx";

export default function EmailList({ group, list, language, onRetry, onDraftReply, onDone, onNotImportant }) {
  const { t } = useTranslation(["inboxAssistant"]);

  if (list.state === "loading" || list.state === "idle") {
    return (
      <div className="ia-skeleton-state" role="status">
        <span className="ia-sr-only">{t("inboxAssistant:list.loading")}</span>
        <div className="ia-skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="ia-skeleton-row" style={{ "--ia-i": row }}>
              <span className="ia-skeleton-line is-meta" />
              <span className="ia-skeleton-line is-title" />
              <span className="ia-skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (list.state === "error") {
    return (
      <div className="ia-list-state" role="alert">
        <p>{list.errorKey ? t(`inboxAssistant:${list.errorKey}`) : t("inboxAssistant:list.loadFailed")}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t("inboxAssistant:retry")}
        </button>
      </div>
    );
  }

  if (!list.emails.length) {
    return (
      <div className="ia-list-state ia-empty">
        <span className="ia-empty-icon" aria-hidden="true">
          <HiOutlineInbox size={22} />
        </span>
        <strong>{t(`inboxAssistant:list.empty.${group}`)}</strong>
        <p>{t("inboxAssistant:list.emptyHint")}</p>
      </div>
    );
  }

  return (
    <ul className="ia-rows">
      {list.emails.map((email, index) => (
        <EmailRow
          key={email.id}
          email={email}
          index={index}
          language={language}
          onDraftReply={onDraftReply}
          onDone={onDone}
          onNotImportant={onNotImportant}
        />
      ))}
    </ul>
  );
}
