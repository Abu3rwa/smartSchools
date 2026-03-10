import { useTranslation } from "react-i18next";

export default function MyAttendanceRequestsLoadingState() {
  const { t } = useTranslation(["myAttendanceRequests"]);

  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>{t("myAttendanceRequests:loading.message")}</p>
    </div>
  );
}
