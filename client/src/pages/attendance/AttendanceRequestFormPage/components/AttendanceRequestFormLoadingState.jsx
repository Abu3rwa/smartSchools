import { useTranslation } from "react-i18next";

export default function AttendanceRequestFormLoadingState() {
  const { t } = useTranslation(["attendanceRequests"]);

  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>{t("attendanceRequests:loading.message")}</p>
    </div>
  );
}
