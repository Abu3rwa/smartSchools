import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import writingService from "../../../../../services/writingService.js";
import classService from "../../../../../services/classService.js";
import studentService from "../../../../../services/studentService.js";
import { buildPayload, emptyForm, formFromAssignment, validateForm } from "../form.js";

const listFrom = (payload) => {
  const raw = payload?.data ?? payload;
  if (Array.isArray(raw)) return raw;
  return raw?.classes || raw?.students || raw?.items || [];
};

export function useWritingBuilderData() {
  const { t } = useTranslation(["writing"]);
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(assignmentId);

  const [form, setForm] = useState(emptyForm);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let active = true;
    classService.getClasses()
      .then((response) => {
        if (active) setClasses(listFrom(response));
      })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setLoading(true);
    writingService.getAssignment(assignmentId)
      .then((assignment) => {
        if (active) setForm(formFromAssignment(assignment));
      })
      .catch((error) => {
        if (active) toast.error(error?.response?.data?.message || t("writing:teacher.builder.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [assignmentId, isEdit, t]);

  // The goals repeater needs the roster, so the class pick loads the students.
  useEffect(() => {
    if (!form.classId) {
      setStudents([]);
      return undefined;
    }
    let active = true;
    studentService.getStudentsByClass(form.classId)
      .then((response) => {
        if (active) setStudents(listFrom(response));
      })
      .catch(() => {
        if (active) setStudents([]);
      });
    return () => { active = false; };
  }, [form.classId]);

  const update = useCallback((patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
  }, []);

  const roster = useMemo(() => students.map((row) => ({
    id: String(row._id || row.id),
    name: `${row.firstName || ""} ${row.lastName || ""}`.trim() || row.name || row.studentId || "",
  })), [students]);

  const save = useCallback(async ({ isActive = true } = {}) => {
    const check = validateForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      toast.error(t("writing:teacher.builder.fixErrors"));
      return false;
    }
    setSaving(true);
    try {
      const payload = { ...buildPayload(form), isActive };
      const saved = isEdit
        ? await writingService.updateAssignment(assignmentId, payload)
        : await writingService.createAssignment(payload);
      toast.success(t(isEdit ? "writing:teacher.builder.saved" : "writing:teacher.builder.published"));
      navigate(`/portal/writing/assignments/${saved?._id || assignmentId}`);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:teacher.builder.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [assignmentId, form, isEdit, navigate, t]);

  return {
    errors,
    form,
    isEdit,
    classes,
    roster,
    loading,
    saving,
    update,
    save,
    onCancel: () => navigate("/portal/writing/assignments"),
  };
}
