export default function AttendanceRequestRequesterSection({
  requesterName,
  requesterEmail,
  showDepartmentField,
  formData,
  setFormDataField,
  errors,
}) {
  return (
    <div className="form-section">
      <h2 className="section-title">Requester details</h2>
      <div className="form-row">
        <label className="field-label">
          Name of Requester <span className="ar">اسم مقدم الطلب</span>{" "}
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
          Requester&apos;s Email{" "}
          <span className="ar">البريد الإلكتروني لمقدم الطلب</span>{" "}
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
            Department / Direct supervisor{" "}
            <span className="ar">القسم والمدير المباشر</span>{" "}
            <span className="required">*</span>
          </label>
          <input
            type="text"
            className="form-input"
            value={formData.departmentOrSupervisor}
            onChange={(e) =>
              setFormDataField("departmentOrSupervisor", e.target.value)
            }
            placeholder="e.g. Department name or supervisor"
          />
          {errors.departmentOrSupervisor && (
            <span className="field-error">{errors.departmentOrSupervisor}</span>
          )}
        </div>
      )}
    </div>
  );
}
