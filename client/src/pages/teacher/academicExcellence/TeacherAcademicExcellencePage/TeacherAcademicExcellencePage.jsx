import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import api from "../../../../config/api";
import { PERMISSIONS } from "../../../../constants/permissions";
import { selectUser } from "../../../../store/slices/authSlice";
import useTeacherAcademicExcellence from "./hooks/useTeacherAcademicExcellence";

// Modals & Drawers (existing)
import AEAssignTaskModal        from "./components/AEAssignTaskModal";
import AEBulkAssignModal        from "./components/AEBulkAssignModal";
import AEAIPracticeModal        from "./components/AEAIPracticeModal";
import AEStudentProgressDrawer  from "./components/AEStudentProgressDrawer";
import QuestionPoolEditorModal  from "../../../standards/StandardAssignPage/components/QuestionPoolEditorModal";

// Tab components
import AEOverviewTab        from "./components/AEOverviewTab";
import AEStudentMonitorTab  from "./components/AEStudentMonitorTab";
import AETaskQueueTab       from "./components/AETaskQueueTab";
import AEExclusionsTab      from "./components/AEExclusionsTab";
import AENotificationsTab   from "./components/AENotificationsTab";

import { TABS, PAGE_SIZE } from "./constants";
import "./TeacherAcademicExcellencePage.css";
import { PageLoader } from "@/components/ui";

// ─── Page ────────────────────────────────────────────────────────────
const TeacherAcademicExcellencePage = () => {
  const user = useSelector(selectUser);
  const [activeTab, setActiveTab] = useState("overview");

  // ── Modal / drawer state ──
  const [assignModal,       setAssignModal]       = useState(null);
  const [bulkAssignModal,   setBulkAssignModal]   = useState(null);
  const [drawerStudent,     setDrawerStudent]     = useState(null);
  const [aiPracticeModal,   setAiPracticeModal]   = useState(null);
  const [poolEditorModal,   setPoolEditorModal]   = useState(null);
  const [savingPool,        setSavingPool]        = useState(false);
  const [poolEditorError,   setPoolEditorError]   = useState("");
  const [reviewingTaskId,   setReviewingTaskId]   = useState(null);
  const [feedbackText,      setFeedbackText]      = useState("");

  // ── Exclusion form ──
  const [newExclusion, setNewExclusion] = useState({
    scopeType: "objective", objectiveKey: "", targetType: "all_students", reason: "",
  });

  // ── Pagination ──
  const [objectivesPage,      setObjectivesPage]      = useState(1);
  const [heatmapPage,         setHeatmapPage]         = useState(1);
  const [heatmapStudentsPage, setHeatmapStudentsPage] = useState(1);
  const [studentsPage,        setStudentsPage]        = useState(1);
  const [tasksPage,           setTasksPage]           = useState(1);
  const [exclusionsPage,      setExclusionsPage]      = useState(1);

  // ── Objective edit state ──
  const [editingObjectiveId,       setEditingObjectiveId]       = useState(null);
  const [editingObjectiveName,     setEditingObjectiveName]     = useState("");
  const [confirmDeleteObjectiveId, setConfirmDeleteObjectiveId] = useState(null);

  // ── Notification prefs ──
  const [localNotifPrefs, setLocalNotifPrefs] = useState(null);
  const [savingNotifs,    setSavingNotifs]    = useState(false);

  // ── Hook ──
  const {
    loading, error,
    classes, selectedClassId, setSelectedClassId,
    subjects, selectedSubjectId, setSelectedSubjectId,
    classSummary, objectives, students, taskQueue, exclusions, notificationPrefs,
    aiPracticeCreating,
    assignTask, bulkAssignTasks, createAIPracticeAssignment, fetchAIPracticePool,
    reviewTask, createExclusion, toggleExclusion, deleteExclusion,
    renameObjective, deleteObjective, saveNotificationPrefs, toggleStudentAE, refresh,
  } = useTeacherAcademicExcellence();

  // ── Permission helper ──
  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      if (user.role === "super_admin" || user.role === "admin") return true;
      return user.permissions?.includes(perm) ?? false;
    },
    [user],
  );

  // ── Derived data ──
  const kpis = useMemo(() => {
    const summary = classSummary?.summary || {};
    return {
      totalStudents:    summary.totalStudents    || students.length || 0,
      atRiskPercent:    summary.atRiskPercent    || 0,
      developingPercent:summary.developingPercent|| 0,
      masteredPercent:  summary.masteredPercent  || 0,
    };
  }, [classSummary, students]);

  const heatmapData = useMemo(() => classSummary?.heatmap || null, [classSummary]);

  const assignableObjectives = useMemo(() => {
    const fromObjectives = Array.isArray(objectives)             ? objectives             : [];
    const fromHeatmap    = Array.isArray(heatmapData?.objectives)? heatmapData.objectives : [];
    const map = new Map();
    for (const item of [...fromObjectives, ...fromHeatmap]) {
      const key = String(item?.objectiveKey || "").trim();
      if (!key || map.has(key)) continue;
      map.set(key, {
        objectiveKey:  key,
        objectiveName: item?.objectiveName || key,
        subject:       item?.subject || selectedSubjectId || "",
      });
    }
    return Array.from(map.values());
  }, [objectives, heatmapData, selectedSubjectId]);

  // ── Reset pages on class/subject change ──
  useEffect(() => {
    setObjectivesPage(1); setHeatmapPage(1); setHeatmapStudentsPage(1);
    setStudentsPage(1);   setTasksPage(1);   setExclusionsPage(1);
  }, [selectedClassId, selectedSubjectId]);

  // ── Sync notification prefs ──
  useEffect(() => {
    if (notificationPrefs && !localNotifPrefs) setLocalNotifPrefs(notificationPrefs);
  }, [notificationPrefs, localNotifPrefs]);

  // ── Handlers ──
  const handleReviewSubmit = async (taskId) => {
    try { await reviewTask(taskId, { teacherFeedback: feedbackText }); }
    catch { /* toast */ }
    setReviewingTaskId(null); setFeedbackText("");
  };

  const handleCreateExclusion = async () => {
    try { await createExclusion({ ...newExclusion, classId: selectedClassId }); }
    catch { /* toast */ }
    setNewExclusion({ scopeType: "objective", objectiveKey: "", targetType: "all_students", reason: "" });
  };

  const handleSaveNotifPrefs = async () => {
    if (!localNotifPrefs) return;
    setSavingNotifs(true);
    try { await saveNotificationPrefs(localNotifPrefs); }
    catch { /* toast */ }
    finally { setSavingNotifs(false); }
  };

  const handleStartRename = (obj) => {
    setEditingObjectiveId(obj._id);
    setEditingObjectiveName(obj.objectiveName || obj.objectiveKey || "");
  };

  const handleConfirmRename = async () => {
    if (!editingObjectiveId || !editingObjectiveName.trim()) return;
    try { await renameObjective(editingObjectiveId, editingObjectiveName.trim()); }
    catch { /* toast */ }
    setEditingObjectiveId(null); setEditingObjectiveName("");
  };

  const handleCancelRename = () => { setEditingObjectiveId(null); setEditingObjectiveName(""); };

  const handleDeleteObjective = async (objectiveId) => {
    try { await deleteObjective(objectiveId); }
    catch { /* toast */ }
    setConfirmDeleteObjectiveId(null);
  };

  const updateNotifField = (path, value) => {
    setLocalNotifPrefs((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const resolveObjectiveSubject = useCallback((objective) => {
    const objectiveSubjectId = objective?.subject?._id || objective?.subject || selectedSubjectId;
    const subjectEntry = (subjects || []).find((s) => (s?._id || s) === objectiveSubjectId)
      || (subjects || []).find((s) => (s?._id || s) === selectedSubjectId) || null;
    return { subjectId: objectiveSubjectId || selectedSubjectId || "", subjectName: subjectEntry?.name || "" };
  }, [selectedSubjectId, subjects]);

  const openAIPracticeModal = useCallback((objective, options = {}) => {
    const { subjectId, subjectName } = resolveObjectiveSubject(objective);
    setAiPracticeModal({
      objectiveKey:  objective?.objectiveKey  || "",
      objectiveName: objective?.objectiveName || objective?.objectiveKey || "",
      subjectId, subjectName,
      classId: selectedClassId,
      ...options,
    });
  }, [resolveObjectiveSubject, selectedClassId]);

  const handleAIPracticeSuccess = useCallback(async (result) => {
    if (!result?.assignmentId) return;
    setAiPracticeModal(null);
    setPoolEditorError("");
    setPoolEditorModal({ assignmentId: result.assignmentId, loading: true, poolData: null });
    try {
      const poolData = await fetchAIPracticePool(result.assignmentId);
      setPoolEditorModal({ assignmentId: result.assignmentId, loading: false, poolData });
    } catch (err) {
      setPoolEditorError(err?.response?.data?.message || "Unable to load question pool.");
      setPoolEditorModal({ assignmentId: result.assignmentId, loading: false, poolData: null });
    }
  }, [fetchAIPracticePool]);

  const retryAIPracticePool = useCallback(async () => {
    if (!poolEditorModal?.assignmentId) return;
    setPoolEditorError("");
    setPoolEditorModal((prev) => prev ? { ...prev, loading: true } : prev);
    try {
      const poolData = await fetchAIPracticePool(poolEditorModal.assignmentId);
      setPoolEditorModal({ assignmentId: poolEditorModal.assignmentId, loading: false, poolData });
    } catch (err) {
      setPoolEditorError(err?.response?.data?.message || "Unable to load question pool.");
      setPoolEditorModal((prev) => prev ? { ...prev, loading: false } : prev);
    }
  }, [fetchAIPracticePool, poolEditorModal]);

  const handlePoolSave = useCallback(async (questions, changeSummary = "") => {
    if (!poolEditorModal?.assignmentId) return;
    setSavingPool(true); setPoolEditorError("");
    try {
      await api.put(`/standard-assignments/${poolEditorModal.assignmentId}/question-pool`, { questions, changeSummary });
      const poolData = await fetchAIPracticePool(poolEditorModal.assignmentId);
      setPoolEditorModal((prev) => prev ? { ...prev, poolData } : prev);
    } catch (err) {
      setPoolEditorError(err?.response?.data?.message || "Failed to save question pool.");
    } finally {
      setSavingPool(false);
    }
  }, [fetchAIPracticePool, poolEditorModal]);

  // ── Render ──
  return (
    <div className="teacher-academic-excellence-page">

      {/* Header */}
      <header className="teacher-ae-header">
        <div>
          <h1>Academic Excellence</h1>
          <p>Monitor student mastery, assign tasks, and manage exclusions.</p>
        </div>
        <div className="teacher-ae-header-actions">
          <button type="button" className="teacher-ae-btn" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="teacher-ae-filters">
        <select className="teacher-ae-select" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
          <option value="">Select Class</option>
          {classes.map((cls) => (
            <option key={cls._id} value={cls._id}>{cls.name || cls.className || cls._id}</option>
          ))}
        </select>
        {subjects.length > 0 && (
          <select className="teacher-ae-select" value={selectedSubjectId} onChange={(e) => setSelectedSubjectId(e.target.value)}>
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub._id || sub} value={sub._id || sub}>{sub.name || sub}</option>
            ))}
          </select>
        )}
      </div>

      {loading && <PageLoader message="Loading academic excellence data…" />}
      {error   && <div className="teacher-ae-error">{error}</div>}

      {/* Tabs */}
      <nav className="teacher-ae-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`teacher-ae-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Tab panels ── */}
      {activeTab === "overview" && (
        <AEOverviewTab
          kpis={kpis}
          heatmapData={heatmapData}
          selectedClassId={selectedClassId}
          objectives={objectives}
          heatmapPage={heatmapPage}           setHeatmapPage={setHeatmapPage}
          heatmapStudentsPage={heatmapStudentsPage} setHeatmapStudentsPage={setHeatmapStudentsPage}
          objectivesPage={objectivesPage}     setObjectivesPage={setObjectivesPage}
          editingObjectiveId={editingObjectiveId}
          editingObjectiveName={editingObjectiveName}
          setEditingObjectiveName={setEditingObjectiveName}
          confirmDeleteObjectiveId={confirmDeleteObjectiveId}
          hasPermission={hasPermission}
          onHeatmapCellClick={(s, obj) => setDrawerStudent({ ...s, objectiveKey: obj.objectiveKey })}
          onHeatmapCellDoubleClick={(obj, s) => openAIPracticeModal(obj, { studentId: s._id, studentName: s.name })}
          onStartRename={handleStartRename}
          onConfirmRename={handleConfirmRename}
          onCancelRename={handleCancelRename}
          onDeleteRequest={setConfirmDeleteObjectiveId}
          onDeleteConfirm={handleDeleteObjective}
          onBulkAssign={(obj) => setBulkAssignModal({ objectiveKey: obj.objectiveKey, objectiveName: obj.objectiveName })}
          onAIPracticeAll={(obj) => openAIPracticeModal(obj, { isBulk: true })}
        />
      )}

      {activeTab === "students" && (
        <AEStudentMonitorTab
          students={students}
          classSummary={classSummary}
          studentsPage={studentsPage}
          setStudentsPage={setStudentsPage}
          selectedClassId={selectedClassId}
          hasPermission={hasPermission}
          onOpenDrawer={setDrawerStudent}
          onAssignTask={(student) => setAssignModal({ studentId: student._id, studentName: student.name || student.firstName })}
          onToggleAE={toggleStudentAE}
        />
      )}

      {activeTab === "tasks" && (
        <AETaskQueueTab
          taskQueue={taskQueue}
          tasksPage={tasksPage}
          setTasksPage={setTasksPage}
          reviewingTaskId={reviewingTaskId}
          feedbackText={feedbackText}
          setFeedbackText={setFeedbackText}
          hasPermission={hasPermission}
          onStartReview={setReviewingTaskId}
          onSubmitReview={handleReviewSubmit}
          onCancelReview={() => { setReviewingTaskId(null); setFeedbackText(""); }}
        />
      )}

      {activeTab === "exclusions" && (
        <AEExclusionsTab
          exclusions={exclusions}
          exclusionsPage={exclusionsPage}
          setExclusionsPage={setExclusionsPage}
          newExclusion={newExclusion}
          setNewExclusion={setNewExclusion}
          hasPermission={hasPermission}
          onCreateExclusion={handleCreateExclusion}
          onToggleExclusion={toggleExclusion}
          onDeleteExclusion={deleteExclusion}
        />
      )}

      {activeTab === "notifications" && (
        <AENotificationsTab
          localNotifPrefs={localNotifPrefs}
          savingNotifs={savingNotifs}
          onUpdateField={updateNotifField}
          onSave={handleSaveNotifPrefs}
        />
      )}

      {/* ── Modals ── */}
      {assignModal && (
        <AEAssignTaskModal
          studentId={assignModal.studentId}
          studentName={assignModal.studentName}
          classId={selectedClassId}
          objectives={assignableObjectives}
          subjectId={selectedSubjectId}
          subjectName={subjects.find((s) => (s._id || s) === selectedSubjectId)?.name || ""}
          onAssign={async (taskData) => { await assignTask(taskData); setAssignModal(null); }}
          onClose={() => setAssignModal(null)}
        />
      )}

      {bulkAssignModal && (
        <AEBulkAssignModal
          classId={selectedClassId}
          objectiveKey={bulkAssignModal.objectiveKey}
          objectiveName={bulkAssignModal.objectiveName}
          subjectId={selectedSubjectId}
          subjectName={subjects.find((s) => (s._id || s) === selectedSubjectId)?.name || ""}
          onAssign={async (taskData) => { await bulkAssignTasks(taskData); setBulkAssignModal(null); }}
          onClose={() => setBulkAssignModal(null)}
        />
      )}

      {drawerStudent && (
        <AEStudentProgressDrawer
          student={drawerStudent}
          classId={selectedClassId}
          onClose={() => setDrawerStudent(null)}
        />
      )}

      {aiPracticeModal && (
        <AEAIPracticeModal
          {...aiPracticeModal}
          creating={aiPracticeCreating}
          onSuccess={handleAIPracticeSuccess}
          onClose={() => setAiPracticeModal(null)}
          onCreateAssignment={createAIPracticeAssignment}
        />
      )}

      {poolEditorModal && (
        <QuestionPoolEditorModal
          assignmentId={poolEditorModal.assignmentId}
          loading={poolEditorModal.loading}
          poolData={poolEditorModal.poolData}
          error={poolEditorError}
          saving={savingPool}
          onSave={handlePoolSave}
          onRetry={retryAIPracticePool}
          onClose={() => { setPoolEditorModal(null); setPoolEditorError(""); }}
        />
      )}
    </div>
  );
};

export default TeacherAcademicExcellencePage;
