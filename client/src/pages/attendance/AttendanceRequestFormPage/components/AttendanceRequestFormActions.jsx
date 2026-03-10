import { useTranslation } from "react-i18next";

export default function AttendanceRequestFormActions({
  submitting,
  onCancel,
}) {
  const { t } = useTranslation(["attendanceRequests"]);

  return (
    <div className="form-actions">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onCancel}
        disabled={submitting}
      >
        {t("attendanceRequests:actions.cancel")}
      </button>
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting
          ? t("attendanceRequests:actions.submitting")
          : t("attendanceRequests:actions.submit")}
      </button>
    </div>
  );
}
