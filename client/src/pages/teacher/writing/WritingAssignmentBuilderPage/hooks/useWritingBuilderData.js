import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import writingService from "../../../../../services/writingService.js";
import classService from "../../../../../services/classService.js";
import studentService from "../../../../../services/studentService.js";
import api from "../../../../../config/api.js";
import { buildPayload, emptyForm, formFromAssignment, formFromTemplate, validateForm } from "../form.js";

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
  const [wasActive, setWasActive] = useState(true);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState({});
  const [vocabularyLists, setVocabularyLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (isEdit) return undefined;
    let active = true;
    setTemplatesLoading(true);
    writingService
      .listTemplates()
      .then((rows) => {
        if (active) setTemplates(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setTemplates([]);
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit]);

  useEffect(() => {
    let active = true;
    classService.getClasses()
      .then((response) => {
        if (active) setClasses(listFrom(response));
      })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, []);

  // The builder only offers lists; each student still sees just the lists they
  // are assigned, resolved server-side at read time.
  useEffect(() => {
    let active = true;
    api
      .get("/vocabulary/lists")
      .then((response) => {
        const raw = response?.data?.data ?? response?.data;
        if (active) {
          setVocabularyLists(
            (Array.isArray(raw) ? raw : []).filter(
              (row) => row?.visible !== false && row?.listId,
            ),
          );
        }
      })
      .catch(() => {
        if (active) setVocabularyLists([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setLoading(true);
    setFailed(false);
    writingService.getAssignment(assignmentId)
      .then((assignment) => {
        if (active) {
          setForm(formFromAssignment(assignment));
          // A draft stays a draft: saving changes must not quietly publish it.
          setWasActive(assignment.isActive !== false);
        }
      })
      .catch(() => {
        // An empty form plus a working Save would overwrite the real task.
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [assignmentId, attempt, isEdit]);

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

  /** F8: the template list is slim; the full configuration is read on choose. */
  const applyTemplate = useCallback(async (templateId) => {
    if (!templateId) return false;
    try {
      const template = await writingService.getAssignment(templateId);
      setForm((current) => formFromTemplate(current, template));
      setErrors({});
      toast.success(t("writing:teacher.builder.template.applied"));
      return true;
    } catch {
      toast.error(t("writing:teacher.builder.template.failed"));
      return false;
    }
  }, [t]);

  const saveTemplate = useCallback(async () => {
    if (!assignmentId || savingTemplate) return false;
    setSavingTemplate(true);
    try {
      await writingService.saveAsTemplate(assignmentId);
      toast.success(t("writing:teacher.builder.template.saved"));
      return true;
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          t("writing:teacher.builder.template.saveFailed"),
      );
      return false;
    } finally {
      setSavingTemplate(false);
    }
  }, [assignmentId, savingTemplate, t]);

  const roster = useMemo(() => students.map((row) => ({
    id: String(row._id || row.id),
    name: `${row.firstName || ""} ${row.lastName || ""}`.trim() || row.name || row.studentId || "",
  })), [students]);

  const save = useCallback(async ({ isActive = isEdit ? wasActive : true } = {}) => {
    // Never PATCH a blank form over a task that failed to load.
    if (isEdit && (loading || failed)) return false;
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
      const wentLive = isEdit ? isActive && !wasActive : isActive;
      toast.success(t(wentLive ? "writing:teacher.builder.published" : "writing:teacher.builder.saved"));
      navigate(`/portal/writing/assignments/${saved?._id || assignmentId}`);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || t("writing:teacher.builder.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [assignmentId, failed, form, isEdit, loading, navigate, t, wasActive]);

  return {
    assignmentId,
    errors,
    failed,
    form,
    isEdit,
    classes,
    roster,
    vocabularyLists,
    loading,
    saving,
    savingTemplate,
    wasActive,
    update,
    applyTemplate,
    saveTemplate,
    templates,
    templatesLoading,
    retry: () => setAttempt((current) => current + 1),
    save,
    onCancel: () => navigate("/portal/writing/assignments"),
  };
}
