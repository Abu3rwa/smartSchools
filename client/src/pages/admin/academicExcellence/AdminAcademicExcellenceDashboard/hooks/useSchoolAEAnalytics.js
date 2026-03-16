import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../../config/api";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../../store/slices/uiSlice";
import { selectUser } from "../../../../../store/slices/authSlice";

const useSchoolAEAnalytics = () => {
  const user = useSelector(selectUser);
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);

  const schoolId = user?.school?._id || user?.school || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  // Analytics data
  const [analytics, setAnalytics] = useState(null);
  const [atRiskStudents, setAtRiskStudents] = useState([]);
  const [classComparison, setClassComparison] = useState([]);
  const [weakestObjectives, setWeakestObjectives] = useState([]);

  // Settings
  const [aeSettings, setAeSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Load classes for filter
  const loadClasses = useCallback(async () => {
    try {
      const res = await api.get("/classes", {
        params: { academicYear, semester: selectedSemester, limit: 200 },
      });
      const list = res.data?.data?.classes || res.data?.classes || [];
      setClasses(list);
    } catch {
      /* non-critical */
    }
  }, [academicYear, selectedSemester]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Load school analytics
  const loadAnalytics = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError("");
    try {
      const params = { academicYear, semester: selectedSemester };
      if (selectedClassId) params.classId = selectedClassId;
      if (selectedSubjectId) params.subjectId = selectedSubjectId;

      const [analyticsRes, atRiskRes] = await Promise.all([
        api.get(`/schools/${schoolId}/academic-excellence/analytics`, { params }),
        api.get(`/schools/${schoolId}/academic-excellence/at-risk`, { params: { ...params, limit: 50 } }),
      ]);

      const data = analyticsRes.data?.data || {};
      setAnalytics(data);
      setClassComparison(data.classComparison || []);
      setWeakestObjectives(data.weakestObjectives || []);
      setSubjects(data.subjects || []);
      setAtRiskStudents(atRiskRes.data?.data?.students || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load school analytics.");
    } finally {
      setLoading(false);
    }
  }, [schoolId, selectedClassId, selectedSubjectId, academicYear, selectedSemester]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Load AE settings
  const loadSettings = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await api.get(`/schools/${schoolId}/academic-excellence/settings`);
      setAeSettings(res.data?.data || null);
    } catch {
      /* non-critical */
    }
  }, [schoolId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Save settings
  const saveSettings = useCallback(async (settings) => {
    if (!schoolId) return;
    setSavingSettings(true);
    try {
      await api.patch(`/schools/${schoolId}/academic-excellence/settings`, settings);
      await loadSettings();
    } finally {
      setSavingSettings(false);
    }
  }, [schoolId, loadSettings]);

  // Export
  const exportReport = useCallback(async (format = "csv") => {
    if (!schoolId) return;
    const params = { format, academicYear, semester: selectedSemester };
    if (selectedClassId) params.classId = selectedClassId;
    if (selectedSubjectId) params.subjectId = selectedSubjectId;

    const res = await api.get(`/schools/${schoolId}/academic-excellence/export`, {
      params,
      responseType: "blob",
    });

    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `academic-excellence-report.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }, [schoolId, selectedClassId, selectedSubjectId, academicYear, selectedSemester]);

  return {
    loading,
    error,
    schoolId,
    classes,
    selectedClassId,
    setSelectedClassId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    analytics,
    atRiskStudents,
    classComparison,
    weakestObjectives,
    aeSettings,
    savingSettings,
    saveSettings,
    exportReport,
    refresh: loadAnalytics,
  };
};

export default useSchoolAEAnalytics;
