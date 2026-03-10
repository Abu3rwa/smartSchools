import { statusConfig } from "../constants.js";
import { formatDate, formatTimeRange } from "../utils/myAttendanceRequestsPresentation.js";
import { useTranslation } from "react-i18next";

export default function MyAttendanceRequestsList({ requests }) {
  const { t, i18n } = useTranslation(["myAttendanceRequests"]);
  const locale = i18n.resolvedLanguage === "ar" ? "ar" : "en";

  return (
    <div className="requests-list">
      <div className="requests-table-header">
        <span>{t("myAttendanceRequests:table.date")}</span>
        <span>{t("myAttendanceRequests:table.type")}</span>
        <span>{t("myAttendanceRequests:table.time")}</span>
        <span>{t("myAttendanceRequests:table.status")}</span>
        <span className="hide-mobile">{t("myAttendanceRequests:table.reviewNote")}</span>
      </div>
      {requests.map((r) => {
        const config = statusConfig[r.status] || statusConfig.pending;
        const Icon = config.Icon;
        const typeLabel =
          r.requestType?.labelEn || r.requestType?.labelAr || t("myAttendanceRequests:common.dash");
        return (
          <div key={r._id} className={`request-card ${config.className}`}>
            <div className="request-main">
              <span className="request-date">
                {formatDate(r.startDate || r.requestDate || r.createdAt, locale)}
              </span>
              <span className="request-type">{typeLabel}</span>
              <span className="request-time">{formatTimeRange(r, locale)}</span>
              <span className="request-status">
                <Icon className="status-icon" /> {t(`myAttendanceRequests:${config.labelKey}`)}
              </span>
              <span className="request-note hide-mobile">
                {r.reviewNote || t("myAttendanceRequests:common.dash")}
              </span>
            </div>
            {r.reviewNote && (
              <div className="request-note-mobile show-mobile">
                <strong>{t("myAttendanceRequests:table.reviewNote")}:</strong> {r.reviewNote}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
