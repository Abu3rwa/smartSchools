import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { estimateNotice, formatEstimate } from "../inboxUi.js";

export default function EstimateDialog({
  estimate,
  fallbackBalanceCents,
  scanning,
  onClose,
  onScan,
}) {
  const { t, i18n } = useTranslation(["inboxAssistant"]);
  const notice = estimateNotice(estimate, fallbackBalanceCents);
  const cost = formatEstimate(estimate.estimateCents, i18n.language);

  if (notice === "noCredit") {
    const balance = formatEstimate(
      estimate.creditBalanceCents ?? fallbackBalanceCents,
      i18n.language,
    );
    return (
      <ConfirmDialog titleId="ia-estimate-title" onClose={onClose}>
        <h2 id="ia-estimate-title">{t("inboxAssistant:estimate.insufficientTitle")}</h2>
        <p>{t("inboxAssistant:estimate.insufficientBody", { cost, balance })}</p>
        <div className="ia-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t("inboxAssistant:estimate.close")}
          </button>
          <Link className="btn btn-primary" to="/portal/ai-credit/me">
            {t("inboxAssistant:estimate.creditLink")}
          </Link>
        </div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog titleId="ia-estimate-title" onClose={onClose}>
      <h2 id="ia-estimate-title">{t("inboxAssistant:estimate.title")}</h2>
      <p>{t("inboxAssistant:estimate.body", { n: estimate.newCount })}</p>
      <p>{t("inboxAssistant:estimate.cost", { cost })}</p>
      {estimate.changed && (
        <p className="ia-dialog-note" role="status">{t("inboxAssistant:estimate.changed")}</p>
      )}
      <div className="ia-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={scanning}>
          {t("inboxAssistant:estimate.cancel")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onScan} disabled={scanning}>
          {t(scanning ? "inboxAssistant:toolbar.scanning" : "inboxAssistant:estimate.scan")}
        </button>
      </div>
    </ConfirmDialog>
  );
}
