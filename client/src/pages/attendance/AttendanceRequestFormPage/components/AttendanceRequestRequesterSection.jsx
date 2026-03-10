import { useTranslation } from "react-i18next";

export default function AttendanceRequestRequesterSection({
  requesterName,
  requesterEmail,
  showDepartmentField,
  formData,
  setFormDataField,
  errors,
}) {
  const { t } = useTranslation(["attendanceRequests"]);

  return (
    <div className="form-section">
      <h2 className="section-title">{t("attendanceRequests:requester.sectionTitle")}</h2>
      <div className="form-row">
        <label className="field-label">
          {t("attendanceRequests:requester.name")}{" "}
          <span className="required">*</span>
        </label>
        <input
          type="text"
          className="form-input"
          value={requesterName}
          readOnly
          disabled
        />
      </div>
      <div className="form-row">
        <label className="field-label">
          {t("attendanceRequests:requester.email")}{" "}
          <span className="required">*</span>
        </label>
        <input
          type="email"
          className="form-input"
          value={requesterEmail}
          readOnly
          disabled
        />
      </div>
      {showDepartmentField && (
        <div className="form-row">
          <label className="field-label">
            {t("attendanceRequests:requester.departmentOrSupervisor")}{" "}
            <span className="required">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            value={formData.departmentOrSupervisor}
            onChange={(e) =>
              setFormDataField("departmentOrSupervisor", e.target.value)
            }
            placeholder={t("attendanceRequests:requester.departmentPlaceholder")}
          />
          {errors.departmentOrSupervisor && (
            <span className="field-error">{errors.departmentOrSupervisor}</span>
          )}
        </div>
      )}
    </div>
  );
}
