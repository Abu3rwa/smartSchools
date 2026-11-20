import { useTranslation } from "react-i18next";

/**
 * F6: the one block shown before publishing. Says what the child will receive
 * and lists everything that blocks the publish, so the teacher fixes it here
 * instead of meeting a refused request.
 */
export default function PublishChecklist({ check, showSummary = true }) {
  const { t } = useTranslation(["writing"]);
  if (!check) return null;
  const channels = [
    check.email?.student && t("writing:teacher.review.emailStudent"),
    check.email?.parents && t("writing:teacher.review.emailParents"),
  ].filter(Boolean);

  return (
    <div className="wa-publish-check">
      <span className="wa-field-label">
        {t("writing:teacher.review.check.title")}
      </span>
      {showSummary && (
        <ul className="wa-publish-summary">
          <li>
            {t("writing:teacher.review.check.notes", { count: check.notes })}
          </li>
          <li>
            {t("writing:teacher.review.check.parts", { count: check.parts })}
          </li>
          <li>
            {t(
              check.path === "notebook"
                ? "writing:teacher.review.check.pathNotebook"
                : "writing:teacher.review.check.pathRevise",
            )}
          </li>
          <li>
            {t("writing:teacher.review.check.targets", {
              count: check.targets,
            })}
          </li>
          <li>
            {channels.length
              ? t("writing:teacher.review.check.emailChannels", {
                  channels: channels.join(", "),
                })
              : t("writing:teacher.review.check.emailNone")}
          </li>
        </ul>
      )}
      {check.blocked && (
        <div className="wa-publish-blockers" role="alert">
          <p>{t("writing:teacher.review.check.blocked")}</p>
          <ul>
            {check.blockers.map((row) => (
              <li key={row.kind}>
                {t(`writing:teacher.review.check.blocker.${row.kind}`, {
                  items: (row.items || []).join(", "),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
