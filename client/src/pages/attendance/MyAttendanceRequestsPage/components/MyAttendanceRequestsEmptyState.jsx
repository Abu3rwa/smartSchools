import { HiOutlinePlus } from "react-icons/hi";
import { useTranslation } from "react-i18next";

export default function MyAttendanceRequestsEmptyState({ onNewRequest }) {
  const { t } = useTranslation(["myAttendanceRequests"]);

  return (
    <div className="empty-state">
      <p>{t("myAttendanceRequests:empty.message")}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNewRequest}
      >
        <HiOutlinePlus className="btn-icon" /> {t("myAttendanceRequests:actions.submitFirstRequest")}
      </button>
    </div>
  );
}
