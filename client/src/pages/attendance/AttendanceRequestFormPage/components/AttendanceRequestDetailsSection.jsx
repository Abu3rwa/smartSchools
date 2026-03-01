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
  return (
    <div className="form-section">
      <h2 className="section-title">Request details</h2>
      <div className="form-row">
        <label className="field-label">
          Type of Request <span className="ar">نوع الطلب</span>{" "}
          <span className="required">*</span>
        </label>
        <select
          className="form-select"
          value={formData.requestType}
          onChange={(e) => setFormDataField("requestType", e.target.value)}
          required
          aria-required="true"
        >
          <option value="">— Select type —</option>
          {requestTypes.map((t) => (
            <option key={t._id} value={t._id}>
              {t.labelEn || t.labelAr || t.code || t._id}
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
                  Start Date <span className="ar">التاريخ من</span>{" "}
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
                  End Date <span className="ar">التاريخ إلى</span>{" "}
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
                Date <span className="ar">التاريخ</span>{" "}
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
                  From Time <span className="ar">التوقيت من</span>{" "}
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
                  To Time <span className="ar">التوقيت إلى</span>{" "}
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
          Notes / Comments <span className="ar">الملاحظة أو تعليق</span>{" "}
          (optional)
        </label>
        <textarea
          className="form-textarea"
          value={formData.notes}
          onChange={(e) => setFormDataField("notes", e.target.value)}
          rows={4}
          placeholder="Add any notes or comments..."
        />
      </div>
      <div className="form-row">
        <label className="field-label">
          Supporting Proof Document{" "}
          <span className="ar">وثيقة إثبات (إذا لزم الأمر)</span>
          {requiresProof && <span className="required"> *</span>}
        </label>
        <p className="field-hint">Accepted: jpg, png, pdf. Max 10 MB.</p>
        <div className="file-input-wrap">
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="file-input"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <span className="file-name">{file ? file.name : "No file chosen"}</span>
        </div>
        {(fileError || errors.attachment) && (
          <span className="field-error">{fileError || errors.attachment}</span>
        )}
      </div>
    </div>
  );
}
