import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../../config/api";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../../store/slices/uiSlice";

const useTeacherAcademicExcellence = () => {
  const academicYear = useSelector(selectCurrentAcademicYear);
  const selectedSemester = useSelector(selectSelectedSemester);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  // Data
  const [classSummary, setClassSummary] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [students, setStudents] = useState([]);
  const [taskQueue, setTaskQueue] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState(null);

  // Load teacher's classes
  const loadClasses = useCallback(async () => {
    try {
      const response = await api.get("/classes", {
        params: { academicYear, semester: selectedSemester, limit: 100 },
      });
      const list = response.data?.data?.classes || response.data?.classes || [];
      setClasses(list);
      if (list.length > 0 && !selectedClassId) {
        setSelectedClassId(list[0]._id);
      }
    } catch {
      /* classes may already be loaded */
    }
  }, [academicYear, selectedSemester, selectedClassId]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Load class AE summary
  const loadClassSummary = useCallback(async () => {
    if (!selectedClassId) return;
    setLoading(true);
    setError("");
    try {
      const params = { academicYear, semester: selectedSemester };
      if (selectedSubjectId) params.subjectId = selectedSubjectId;

      const [summaryRes, objectivesRes, studentsRes] = await Promise.all([
        api.get(`/classes/${selectedClassId}/academic-excellence`, { params }),
        api.get(`/classes/${selectedClassId}/academic-excellence/objectives`, { params: { ...params, limit: 50 } }),
        api.get(`/students`, { params: { classId: selectedClassId, limit: 200 } }),
      ]);

      setClassSummary(summaryRes.data?.data || null);
      setObjectives(objectivesRes.data?.data?.objectives || []);

      const subjectList = summaryRes.data?.data?.subjects || [];
      setSubjects(subjectList);

      const studentList = studentsRes.data?.data?.students || studentsRes.data?.students || [];
      setStudents(studentList);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load class academic excellence data.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedSubjectId, academicYear, selectedSemester]);

  useEffect(() => {
    loadClassSummary();
  }, [loadClassSummary]);

  // Load task queue
  const loadTaskQueue = useCallback(async () => {
    try {
      const params = { academicYear, semester: selectedSemester, limit: 50 };
      if (selectedClassId) params.classId = selectedClassId;
      const res = await api.get("/academic-excellence/tasks/queue", { params });
      setTaskQueue(res.data?.data?.tasks || []);
    } catch {
      /* non-critical */
    }
  }, [selectedClassId, academicYear, selectedSemester]);

  useEffect(() => {
    loadTaskQueue();
  }, [loadTaskQueue]);

  // Load exclusions
  const loadExclusions = useCallback(async () => {
    if (!selectedClassId) return;
    try {
      const params = { classId: selectedClassId, limit: 50 };
      const res = await api.get("/academic-excellence/exclusions", { params });
      setExclusions(res.data?.data?.exclusions || []);
    } catch {
      /* non-critical */
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadExclusions();
  }, [loadExclusions]);

  // Load notification preferences
  const loadNotificationPrefs = useCallback(async () => {
    try {
      const res = await api.get("/academic-excellence/notification-preferences");
      setNotificationPrefs(res.data?.data || null);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  // Actions
  const assignTask = useCallback(async (taskData) => {
    await api.post("/academic-excellence/tasks", taskData);
    await loadTaskQueue();
    await loadClassSummary();
  }, [loadTaskQueue, loadClassSummary]);

  const bulkAssignTasks = useCallback(async (taskData) => {
    await api.post("/academic-excellence/tasks/bulk", taskData);
    await loadTaskQueue();
    await loadClassSummary();
  }, [loadTaskQueue, loadClassSummary]);

  const reviewTask = useCallback(async (taskId, feedback) => {
    await api.patch(`/academic-excellence/tasks/${taskId}/review`, feedback);
    await loadTaskQueue();
  }, [loadTaskQueue]);

  const createExclusion = useCallback(async (exclusionData) => {
    await api.post("/academic-excellence/exclusions", exclusionData);
    await loadExclusions();
    await loadClassSummary();
  }, [loadExclusions, loadClassSummary]);

  const toggleExclusion = useCallback(async (exclusionId) => {
    await api.patch(`/academic-excellence/exclusions/${exclusionId}/toggle`);
    await loadExclusions();
  }, [loadExclusions]);

  const deleteExclusion = useCallback(async (exclusionId) => {
    await api.delete(`/academic-excellence/exclusions/${exclusionId}`);
    await loadExclusions();
  }, [loadExclusions]);

  const saveNotificationPrefs = useCallback(async (prefs) => {
    await api.put("/academic-excellence/notification-preferences", prefs);
    await loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  const refresh = useCallback(() => {
    loadClassSummary();
    loadTaskQueue();
    loadExclusions();
  }, [loadClassSummary, loadTaskQueue, loadExclusions]);

  return {
    loading,
    error,
    classes,
    selectedClassId,
    setSelectedClassId,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    classSummary,
    objectives,
    students,
    taskQueue,
    exclusions,
    notificationPrefs,
    assignTask,
    bulkAssignTasks,
    reviewTask,
    createExclusion,
    toggleExclusion,
    deleteExclusion,
    saveNotificationPrefs,
    refresh,
  };
};

export default useTeacherAcademicExcellence;
