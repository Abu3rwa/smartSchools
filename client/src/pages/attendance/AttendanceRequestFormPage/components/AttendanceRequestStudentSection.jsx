import { useTranslation } from "react-i18next";

export default function AttendanceRequestStudentSection({
  formData,
  setFormDataField,
  eligibleStudents,
}) {
  const { t } = useTranslation(["attendanceRequests"]);

  return (
    <div className="form-section">
      <h2 className="section-title">{t("attendanceRequests:student.sectionTitle")}</h2>
      <div className="form-row">
        <label className="field-label">{t("attendanceRequests:student.selectOptional")}</label>
        <select
          className="form-select"
          value={formData.student}
          onChange={(e) => setFormDataField("student", e.target.value)}
        >
          <option value="">{t("attendanceRequests:student.selectPlaceholder")}</option>
          {eligibleStudents.map((s) => (
            <option key={s._id} value={s._id}>
              {s.firstName} {s.lastName}{" "}
              {s.studentId ? `(${s.studentId})` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
