import { useTranslation } from "react-i18next";

/**
 * L5: every address the family email can reach, the ones that stopped it, and
 * why a channel sends nothing. A disabled or empty channel is named, not hidden.
 */
export default function EmailRecipients({ recipients, allowed, selected }) {
  const { t } = useTranslation("writing");
  const suppressed = recipients?.suppressed || [];
  const rows = [
    { key: "student", label: t("writing:teacher.review.emailStudent") },
    { key: "parents", label: t("writing:teacher.review.emailParents") },
  ];

  return (
    <div className="wa-email-recipients">
      <p className="wa-review-notify-hint">{t("writing:teacher.review.emailWho")}</p>
      <ul>
        {rows.map(({ key, label }) => {
          const addresses = recipients?.[key] || [];
          const state = !allowed?.[key]
            ? t("writing:teacher.review.emailChannelOff")
            : !selected?.[key]
              ? t("writing:teacher.review.emailNotSelected")
              : addresses.length
                ? addresses.join(", ")
                : t("writing:teacher.review.emailNone");
          return (
            <li key={key} className={addresses.length ? "" : "is-muted"}>
              <span className="wa-email-recipient-role">{label}</span>
              <span className="wa-email-recipient-state" dir="auto">{state}</span>
            </li>
          );
        })}
        {suppressed.length > 0 && (
          <li className="is-muted">
            <span className="wa-email-recipient-role">
              {t("writing:teacher.review.emailSuppressedLabel")}
            </span>
            <span className="wa-email-recipient-state" dir="auto">
              {suppressed.join(", ")}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
