import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../../config/api";
import { selectCurrentAcademicYear } from "../../../../../store/slices/uiSlice";

const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || value.classId || "";
};

const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ""));

const mapMasteryCategoryToLevel = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "mastered") return "mastered";
  if (normalized === "developing") return "developing";
  if (normalized === "at_risk" || normalized === "not_met") return "at_risk";
  return "not_started";
};

const mapObjectivePerformanceToAEObjective = (item, index) => {
  const objectiveKey = String(item?.objectiveKey || "").trim();
  const objectiveName = String(item?.objectiveName || objectiveKey || "").trim();
  return {
    _id: `perf_${objectiveKey || index}`,
    objectiveKey,
    objectiveName,
    masteryLevel: mapMasteryCategoryToLevel(item?.masteryCategory),
    masteryScore: Number(item?.masteryRate || 0),
    avgScore: Number(item?.masteryRate || 0),
    atRiskCount: Number(item?.studentsBelowMastery || 0),
    source: "objective_performance",
  };
};

const useTeacherAcademicExcellence = () => {
  const academicYear = useSelector(selectCurrentAcademicYear);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [trackingMode, setTrackingMode] = useState("objectives");

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
        params: { limit: 100 },
      });
      const rawList =
        response.data?.data?.classes ||
        response.data?.classes ||
        [];
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
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Failed to load classes";
      console.error("[AE] loadClasses error:", msg);
      setError(msg);
    }
  }, [selectedClassId]);


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
      const params = { academicYear };
      if (selectedSubjectId) params.subjectId = selectedSubjectId;

      const [summaryResult, objectivesResult, studentsResult, objectivePerformanceResult] = await Promise.allSettled([
        api.get(`/classes/${selectedClassId}/academic-excellence`, { params }),
        api.get(`/classes/${selectedClassId}/academic-excellence/objectives`, { params: { ...params, limit: 50 } }),
        api.get(`/students`, { params: { classId: selectedClassId, limit: 200 } }),
        api.get(`/classes/${selectedClassId}/objective-performance`, {
          params: {
            ...(selectedSubjectId ? { subjectId: selectedSubjectId } : {}),
          },
        }),
      ]);

      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason;
      }

      const summaryRes = summaryResult.value;
      const objectivesRes = objectivesResult.status === "fulfilled" ? objectivesResult.value : null;
      const studentsRes = studentsResult.status === "fulfilled" ? studentsResult.value : null;
      const objectivePerformanceRes = objectivePerformanceResult.status === "fulfilled" ? objectivePerformanceResult.value : null;

      const summaryData = summaryRes?.data?.data || summaryRes?.data || null;
      const objectivesPayload = objectivesRes?.data?.data || objectivesRes?.data || null;
      const objectivePerformanceData = objectivePerformanceRes?.data?.data || objectivePerformanceRes?.data || null;
      const trackedObjectives = Array.isArray(objectivesPayload?.objectives) ? objectivesPayload.objectives : [];
      const objectivePerformanceObjectives = Array.isArray(objectivePerformanceData?.objectives)
        ? objectivePerformanceData.objectives
            .map(mapObjectivePerformanceToAEObjective)
            .filter((item) => item.objectiveKey)
        : [];

      setClassSummary(summaryData);
      setObjectives(trackedObjectives.length > 0 ? trackedObjectives : objectivePerformanceObjectives);
      setTrackingMode(objectivesPayload?.trackingMode === "standards" ? "standards" : "objectives");

      const subjectList = summaryData?.subjects || [];
      setSubjects(subjectList);

      const studentList = studentsRes?.data?.data?.students || studentsRes?.data?.students || [];
      setStudents(studentList);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load class academic excellence data.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedSubjectId, academicYear]);

  useEffect(() => {
    loadClassSummary();
  }, [loadClassSummary]);

  // Load task queue
  const loadTaskQueue = useCallback(async () => {
    try {
      const params = { academicYear, limit: 50 };
      if (selectedClassId) params.classId = selectedClassId;
      const res = await api.get("/academic-excellence/tasks/queue", { params });
      setTaskQueue(res.data?.data?.tasks || []);
    } catch {
      /* non-critical */
    }
  }, [selectedClassId, academicYear]);

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

  const renameObjective = useCallback(async (objectiveId, objectiveName) => {
    await api.patch(`/academic-excellence/objectives/${objectiveId}/rename`, { objectiveName });
    await loadClassSummary();
  }, [loadClassSummary]);

  const deleteObjective = useCallback(async (objectiveId) => {
    await api.delete(`/academic-excellence/objectives/${objectiveId}`);
    await loadClassSummary();
  }, [loadClassSummary]);

  const deleteObjectivesBulk = useCallback(async (objectiveIds = []) => {
    const ids = Array.from(new Set((objectiveIds || []).filter(Boolean)));
    if (ids.length === 0) {
      return { deletedCount: 0, failed: [] };
    }

    const results = await Promise.allSettled(
      ids.map((objectiveId) => api.delete(`/academic-excellence/objectives/${objectiveId}`))
    );

    const failed = [];
    let deletedCount = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        deletedCount += 1;
      } else {
        failed.push({
          objectiveId: ids[index],
          message: result?.reason?.response?.data?.message || result?.reason?.message || "Delete failed",
        });
      }
    });

    await loadClassSummary();
    return { deletedCount, failed };
  }, [loadClassSummary]);

  const saveNotificationPrefs = useCallback(async (prefs) => {
    await api.put("/academic-excellence/notification-preferences", prefs);
    await loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  const toggleStudentAE = useCallback(async (studentId, classId) => {
    const res = await api.patch(`/academic-excellence/students/${studentId}/ae-toggle`, { classId });
    // Refresh summary so studentBreakdown.isDisabled reflects the new state
    await loadClassSummary();
    return res?.data?.data || null;
  }, [loadClassSummary]);

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
    trackingMode,
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
    renameObjective,
    deleteObjective,
    deleteObjectivesBulk,
    saveNotificationPrefs,
    toggleStudentAE,
    refresh,
  };

};

export default useTeacherAcademicExcellence;
