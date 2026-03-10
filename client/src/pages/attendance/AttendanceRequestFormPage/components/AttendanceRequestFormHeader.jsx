import { HiOutlineClipboardList } from "react-icons/hi";
import { useTranslation } from "react-i18next";

export default function AttendanceRequestFormHeader() {
  const { t } = useTranslation(["attendanceRequests"]);

  return (
    <header className="page-header">
      <h1>
        <HiOutlineClipboardList className="header-icon" /> {t("attendanceRequests:header.title")}
      </h1>
      <p className="page-subtitle">
        {t("attendanceRequests:header.subtitle")}
      </p>
    </header>
  );
}
