import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../../config/api";
import { selectCurrentAcademicYear, selectSelectedSemester } from "../../../../../store/slices/uiSlice";

const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || value.classId || "";
};

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

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
  const [aiPracticeCreating, setAiPracticeCreating] = useState(false);
  const [aiPracticeError, setAiPracticeError] = useState(null);

  // Load teacher's classes
  const loadClasses = useCallback(async () => {
    try {
      const response = await api.get("/classes", {
        params: { academicYear, semester: selectedSemester, limit: 100 },
      });
      const rawList = response.data?.data?.classes || response.data?.classes || [];
      const normalized = rawList
        .map((cls) => {
          const id = getEntityId(cls);
          if (!id) return null;
          return { ...cls, _id: id };
        })
        .filter(Boolean);

      setClasses(normalized);

      const hasSelectedClass = normalized.some((cls) => cls._id === selectedClassId);
      if (!hasSelectedClass) {
        setSelectedClassId(normalized[0]?._id || "");
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
    if (!isMongoObjectId(selectedClassId)) {
      setError("Invalid class selection. Please reselect a class.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = { academicYear, semester: selectedSemester };
      if (selectedSubjectId) params.subjectId = selectedSubjectId;

      const [summaryResult, objectivesResult, studentsResult] = await Promise.allSettled([
        api.get(`/classes/${selectedClassId}/academic-excellence`, { params }),
        api.get(`/classes/${selectedClassId}/academic-excellence/objectives`, { params: { ...params, limit: 50 } }),
        api.get(`/students`, { params: { classId: selectedClassId, limit: 200 } }),
      ]);

      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason;
      }

      const summaryRes = summaryResult.value;
      const objectivesRes = objectivesResult.status === "fulfilled" ? objectivesResult.value : null;
      const studentsRes = studentsResult.status === "fulfilled" ? studentsResult.value : null;

      setClassSummary(summaryRes.data?.data || null);
      setObjectives(objectivesRes?.data?.data?.objectives || []);

      const subjectList = summaryRes.data?.data?.subjects || [];
      setSubjects(subjectList);

      const studentList = studentsRes?.data?.data?.students || studentsRes?.data?.students || [];
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

  const createAIPracticeAssignment = useCallback(async (payload) => {
    setAiPracticeCreating(true);
    setAiPracticeError(null);
    try {
      const response = await api.post("/academic-excellence/ai-practice", payload);
      return response?.data?.data || null;
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to create AI practice assignment.";
      setAiPracticeError(message);
      throw err;
    } finally {
      setAiPracticeCreating(false);
    }
  }, []);

  const fetchAIPracticePool = useCallback(async (assignmentId) => {
    const response = await api.get(`/academic-excellence/ai-practice/${assignmentId}/pool`);
    return response?.data?.data || null;
  }, []);

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
    aiPracticeCreating,
    aiPracticeError,
    assignTask,
    bulkAssignTasks,
    createAIPracticeAssignment,
    fetchAIPracticePool,
    reviewTask,
    createExclusion,
    toggleExclusion,
    deleteExclusion,
    saveNotificationPrefs,
    refresh,
  };
};

export default useTeacherAcademicExcellence;
