import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../../../../store/slices/authSlice.js";
import api from "../../../../config/api.js";
import toast from "react-hot-toast";
import { MAX_FILE_SIZE, ALLOWED_EXT } from "../constants.js";

/**
 * Data and actions for Attendance Request form page.
 * Handles request types, eligible students, requester context, validation, and submit.
 */
export function useAttendanceRequestForm() {
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
      .catch(() => toast.error("Failed to load request types"))
      .finally(() => setLoading(false));
  }, []);

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
      next.requestType = "Type of request is required";
    if (
      showDepartmentField &&
      !formData.departmentOrSupervisor?.trim()
    )
      next.departmentOrSupervisor =
        "Department / Direct supervisor is required";
    if (useDateRange) {
      if (!formData.startDate) next.startDate = "Start date is required";
      if (!formData.endDate) next.endDate = "End date is required";
      if (
        formData.startDate &&
        formData.endDate &&
        formData.endDate < formData.startDate
      )
        next.endDate = "End date must be on or after start date";
    } else {
      if (!formData.requestDate) next.requestDate = "Date is required";
      if (!formData.fromTime) next.fromTime = "From time is required";
      if (!formData.toTime) next.toTime = "To time is required";
    }
    if (requiresProof && !file)
      next.attachment =
        "Supporting proof document is required for this request type";
    if (file) {
      const ext = file.name
        .toLowerCase()
        .slice(file.name.lastIndexOf("."));
      if (!ALLOWED_EXT.includes(ext))
        next.attachment = "Allowed types: jpg, png, pdf";
      else if (file.size > MAX_FILE_SIZE)
        next.attachment = "Max file size 10 MB";
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
            "Request submitted. You will be notified when it is reviewed.",
        );
        navigate("/portal/attendance-requests");
      } else {
        toast.error(res.data.message || "Failed to submit");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to submit request",
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
