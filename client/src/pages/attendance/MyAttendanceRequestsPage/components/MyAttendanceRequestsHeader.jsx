import { HiOutlineClipboardList, HiOutlinePlus } from "react-icons/hi";
import { useTranslation } from "react-i18next";

export default function MyAttendanceRequestsHeader({ onNewRequest }) {
  const { t } = useTranslation(["myAttendanceRequests"]);

  return (
    <header className="page-header">
      <div>
        <h1>
          <HiOutlineClipboardList className="header-icon" /> {t("myAttendanceRequests:header.title")}
        </h1>
        <p className="page-subtitle">
          {t("myAttendanceRequests:header.subtitle")}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onNewRequest}
      >
        <HiOutlinePlus className="btn-icon" /> {t("myAttendanceRequests:actions.newRequest")}
      </button>
    </header>
  );
}
