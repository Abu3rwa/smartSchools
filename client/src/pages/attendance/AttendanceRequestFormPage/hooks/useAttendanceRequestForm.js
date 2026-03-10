import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../../../../store/slices/authSlice.js";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";
import { MAX_FILE_SIZE, ALLOWED_EXT } from "../constants.js";
import { useTranslation } from "react-i18next";

/**
 * Data and actions for Attendance Request form page.
 * Handles request types, eligible students, requester context, validation, and submit.
 */
export function useAttendanceRequestForm() {
  const { t } = useTranslation(["attendanceRequests"]);
  const navigate = useNavigate();
  const user = useSelector(selectUser);
  const [requestTypes, setRequestTypes] = useState([]);
  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    departmentOrSupervisor: "",
    requestType: "",
    requestDate: today,
    startDate: today,
    endDate: today,
    fromTime: "",
    toTime: "",
    notes: "",
    student: "",
  });
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [errors, setErrors] = useState({});

  const isParentOrStudent = user?.role === "parent" || user?.role === "student";
  const showStudentSelect = isParentOrStudent && eligibleStudents.length > 0;
  const showDepartmentField =
    user?.role === "teacher" ||
    user?.role === "admin" ||
    user?.role === "department_principal";

  useEffect(() => {
    const fetchTypes = () =>
      api.get("/attendance-request-types").then((res) => {
        if (res.data.success) setRequestTypes(res.data.data || []);
      });
    fetchTypes()
      .catch(() => toast.error(t("attendanceRequests:toast.loadRequestTypesFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!isParentOrStudent) return;
    api
      .get("/attendance-requests/eligible-students")
      .then((res) => {
        if (res.data.success) setEligibleStudents(res.data.data || []);
      })
      .catch(() => {});
  }, [isParentOrStudent]);

  useEffect(() => {
    if (user?.role !== "teacher") return;
    api
      .get("/attendance-requests/requester-context")
      .then((res) => {
        if (res.data.success && res.data.data?.departmentOrSupervisor) {
          setFormData((prev) => ({
            ...prev,
            departmentOrSupervisor: res.data.data.departmentOrSupervisor,
          }));
        }
      })
      .catch(() => {});
  }, [user?.role]);

  const selectedType = requestTypes.find((t) => t._id === formData.requestType);
  const requiresProof = selectedType?.requiresProof === true;
  const useDateRange = selectedType?.useDateRange === true;

  useEffect(() => {
    if (!requiresProof) {
      setFileError("");
      setErrors((prev) => {
        if (!prev.attachment) return prev;
        const next = { ...prev };
        delete next.attachment;
        return next;
      });
    }
  }, [requiresProof]);

  const validate = () => {
    const next = {};
    if (!formData.requestType)
      next.requestType = t("attendanceRequests:validation.requestTypeRequired");
    if (
      showDepartmentField &&
      !formData.departmentOrSupervisor?.trim()
    )
      next.departmentOrSupervisor =
        t("attendanceRequests:validation.departmentRequired");
    if (useDateRange) {
      if (!formData.startDate) next.startDate = t("attendanceRequests:validation.startDateRequired");
      if (!formData.endDate) next.endDate = t("attendanceRequests:validation.endDateRequired");
      if (
        formData.startDate &&
        formData.endDate &&
        formData.endDate < formData.startDate
      )
        next.endDate = t("attendanceRequests:validation.endDateAfterStart");
    } else {
      if (!formData.requestDate) next.requestDate = t("attendanceRequests:validation.dateRequired");
      if (!formData.fromTime) next.fromTime = t("attendanceRequests:validation.fromTimeRequired");
      if (!formData.toTime) next.toTime = t("attendanceRequests:validation.toTimeRequired");
    }
    if (requiresProof && !file)
      next.attachment =
        t("attendanceRequests:validation.attachmentRequired");
    if (file) {
      const ext = file.name
        .toLowerCase()
        .slice(file.name.lastIndexOf("."));
      if (!ALLOWED_EXT.includes(ext))
        next.attachment = t("attendanceRequests:validation.attachmentTypes");
      else if (file.size > MAX_FILE_SIZE)
        next.attachment = t("attendanceRequests:validation.attachmentMaxSize");
    }
    setFileError(next.attachment || "");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("requestType", formData.requestType);
    fd.append("departmentOrSupervisor", formData.departmentOrSupervisor);
    if (useDateRange) {
      fd.append("startDate", formData.startDate);
      fd.append("endDate", formData.endDate);
    } else {
      fd.append("requestDate", formData.requestDate);
      fd.append("fromTime", formData.fromTime);
      fd.append("toTime", formData.toTime);
    }
    fd.append("notes", formData.notes);
    if (formData.student) fd.append("student", formData.student);
    if (file) fd.append("attachment", file);
    try {
      const res = await api.post("/attendance-requests", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        toast.success(
          res.data.message ||
            t("attendanceRequests:toast.submitted"),
        );
        navigate("/portal/attendance-requests");
      } else {
        toast.error(res.data.message || t("attendanceRequests:toast.submitFailed"));
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || t("attendanceRequests:toast.submitRequestFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requesterName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
    : "";
  const requesterEmail = user?.email || "";

  const setFormDataField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (f) => {
    setFile(f ?? null);
    setFileError("");
  };

  return {
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
    onCancel: () => navigate("/portal/attendance-requests"),
  };
}
