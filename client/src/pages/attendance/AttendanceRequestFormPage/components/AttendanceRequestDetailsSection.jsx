import { useTranslation } from "react-i18next";

export default function AttendanceRequestDetailsSection({
  formData,
  setFormDataField,
  requestTypes,
  useDateRange,
  requiresProof,
  file,
  fileError,
  handleFileChange,
  errors,
}) {
  const { t, i18n } = useTranslation(["attendanceRequests"]);
  const isArabic = i18n.language?.toLowerCase().startsWith("ar");

  return (
    <div className="form-section">
      <h2 className="section-title">{t("attendanceRequests:details.sectionTitle")}</h2>
      <div className="form-row">
        <label className="field-label">
          {t("attendanceRequests:details.requestType")}{" "}
          <span className="required">*</span>
        </label>
        <select
          className="form-select"
          value={formData.requestType}
          onChange={(e) => setFormDataField("requestType", e.target.value)}
          required
          aria-required="true"
        >
          <option value="">{t("attendanceRequests:details.selectType")}</option>
          {requestTypes.map((typeItem) => (
            <option key={typeItem._id} value={typeItem._id}>
              {(isArabic ? typeItem.labelAr : typeItem.labelEn) || typeItem.labelEn || typeItem.labelAr || typeItem.code || typeItem._id}
            </option>
          ))}
        </select>
        {errors.requestType && (
          <span className="field-error">{errors.requestType}</span>
        )}
      </div>
      {formData.requestType &&
        (useDateRange ? (
          <>
            <div className="form-row form-row-inline">
              <div className="form-field-half">
                <label className="field-label">
                  {t("attendanceRequests:details.startDate")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormDataField("startDate", e.target.value)
                  }
                />
                {errors.startDate && (
                  <span className="field-error">{errors.startDate}</span>
                )}
              </div>
              <div className="form-field-half">
                <label className="field-label">
                  {t("attendanceRequests:details.endDate")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.endDate}
                  onChange={(e) => setFormDataField("endDate", e.target.value)}
                />
                {errors.endDate && (
                  <span className="field-error">{errors.endDate}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <label className="field-label">
                {t("attendanceRequests:details.date")}{" "}
                <span className="required">*</span>
              </label>
              <input
                type="date"
                className="form-input"
                value={formData.requestDate}
                onChange={(e) =>
                  setFormDataField("requestDate", e.target.value)
                }
              />
              {errors.requestDate && (
                <span className="field-error">{errors.requestDate}</span>
              )}
            </div>
            <div className="form-row form-row-inline">
              <div className="form-field-half">
                <label className="field-label">
                  {t("attendanceRequests:details.fromTime")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={formData.fromTime}
                  onChange={(e) =>
                    setFormDataField("fromTime", e.target.value)
                  }
                />
              </div>
              <div className="form-field-half">
                <label className="field-label">
                  {t("attendanceRequests:details.toTime")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={formData.toTime}
                  onChange={(e) => setFormDataField("toTime", e.target.value)}
                />
              </div>
            </div>
            {(errors.fromTime || errors.toTime) && (
              <span className="field-error">
                {errors.fromTime || errors.toTime}
              </span>
            )}
          </>
        ))}
      <div className="form-row">
        <label className="field-label">
          {t("attendanceRequests:details.notes")}{" "}
          ({t("attendanceRequests:details.optional")})
        </label>
        <textarea
          className="form-textarea"
          value={formData.notes}
          onChange={(e) => setFormDataField("notes", e.target.value)}
          rows={4}
          placeholder={t("attendanceRequests:details.notesPlaceholder")}
        />
      </div>
      <div className="form-row">
        <label className="field-label">
          {t("attendanceRequests:details.supportingProof")}
          {requiresProof && <span className="required"> *</span>}
        </label>
        <p className="field-hint">{t("attendanceRequests:details.fileHint")}</p>
        <div className="file-input-wrap">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="file-input"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <span className="file-name">
            {file ? file.name : t("attendanceRequests:details.noFileChosen")}
          </span>
        </div>
        {(fileError || errors.attachment) && (
          <span className="field-error">{fileError || errors.attachment}</span>
        )}
      </div>
    </div>
  );
}
