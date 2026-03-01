import { useAttendanceRequestForm } from "./hooks/useAttendanceRequestForm.js";
import AttendanceRequestFormHeader from "./components/AttendanceRequestFormHeader.jsx";
import AttendanceRequestFormLoadingState from "./components/AttendanceRequestFormLoadingState.jsx";
import AttendanceRequestRequesterSection from "./components/AttendanceRequestRequesterSection.jsx";
import AttendanceRequestStudentSection from "./components/AttendanceRequestStudentSection.jsx";
import AttendanceRequestDetailsSection from "./components/AttendanceRequestDetailsSection.jsx";
import AttendanceRequestFormActions from "./components/AttendanceRequestFormActions.jsx";
import "./AttendanceRequestFormPage.css";

/**
 * Attendance Request form page. Route: /portal/attendance-request.
 * Roles: student, parent, teacher, admin, department_principal.
 */
export default function AttendanceRequestFormPage() {
  const {
    loading,
    submitting,
    formData,
    setFormDataField,
    requestTypes,
    eligibleStudents,
    file,
    fileError,
    handleFileChange,
    errors,
    showStudentSelect,
    showDepartmentField,
    useDateRange,
    requiresProof,
    requesterName,
    requesterEmail,
    handleSubmit,
    onCancel,
  } = useAttendanceRequestForm();

  if (loading) {
    return (
      <div className="attendance-request-form-page">
        <AttendanceRequestFormLoadingState />
      </div>
    );
  }

  return (
    <div className="attendance-request-form-page">
      <AttendanceRequestFormHeader />

      <form className="attendance-request-form" onSubmit={handleSubmit}>
        <AttendanceRequestRequesterSection
          requesterName={requesterName}
          requesterEmail={requesterEmail}
          showDepartmentField={showDepartmentField}
          formData={formData}
          setFormDataField={setFormDataField}
          errors={errors}
        />

        {showStudentSelect && (
          <AttendanceRequestStudentSection
            formData={formData}
            setFormDataField={setFormDataField}
            eligibleStudents={eligibleStudents}
          />
        )}

        <AttendanceRequestDetailsSection
          formData={formData}
          setFormDataField={setFormDataField}
          requestTypes={requestTypes}
          useDateRange={useDateRange}
          requiresProof={requiresProof}
          file={file}
          fileError={fileError}
          handleFileChange={handleFileChange}
          errors={errors}
        />

        <AttendanceRequestFormActions
          submitting={submitting}
          onCancel={onCancel}
        />
      </form>
    </div>
  );
}
