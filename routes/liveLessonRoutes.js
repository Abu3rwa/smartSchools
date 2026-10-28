import express from "express";
import aiTokenBudgetGuard from "../middleware/aiTokenBudgetGuard.js";
import { authorize, protect } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import {
  createLiveSession,
  createLiveLesson,
  createLiveLessonFolder,
  createLiveSessionGradebookEntries,
  bulkDeleteLiveLessons,
  deleteFinishedLiveSessions,
  endLiveSession,
  exportLiveLessonCsv,
  exportLiveLessonPerformanceReportPdf,
  exportLiveSessionReportPdf,
  deleteLiveSession,
  deleteLiveLesson,
  deleteLiveLessonFolder,
  draftLiveSessionQuestionMarks,
  getLiveLesson,
  getLiveSession,
  getLiveSessionReplay,
  getLiveSessionReport,
  getLiveLessonPerformanceReport,
  getLiveSessionGradebookPreview,
  getLiveLessonSettings,
  importLiveLessonCsv,
  joinLiveSessionById,
  joinLiveSession,
  listAvailableLiveSessions,
  listLiveLessons,
  listLiveLessonSelection,
  listLiveLessonFolders,
  listLiveSessions,
  previewLiveLessonCsv,
  listLiveLessonMoveTargets,
  moveLiveLessonYear,
  setLiveLessonDone,
  updateLiveLesson,
  updateLiveLessonSettings,
  setLiveSessionReplayAvailability,
  updateLiveSessionQuestionMarks,
  addLiveLessonFolderShortcut,
  removeLiveLessonFolderShortcut,
  reorderLiveLessonFolderShortcuts,
  reorderLiveLessonFolders,
  updateLiveLessonFolder,
} from "../controllers/liveLessonController.js";
import {
  acceptLiveLessonShare,
  createLiveLessonShare,
  createLiveLessonShares,
  declineLiveLessonShare,
  listIncomingLiveLessonShares,
  listLiveLessonShareTeachers,
  listOutgoingLiveLessonShares,
  revokeLiveLessonShare,
  respondToLiveLessonShares,
} from "../controllers/liveLessonShareController.js";
import {
  createLiveGroup,
  deleteLiveGroup,
  listLiveGroups,
  updateLiveGroup,
} from "../controllers/liveLessonGroupController.js";

const router = express.Router();
router.use(protect, requireSchoolContext);

router.get("/groups", authorize("teacher", "admin", "department_principal"), listLiveGroups);
router.post("/groups", authorize("teacher", "admin", "department_principal"), createLiveGroup);
router.patch("/groups/:groupId", authorize("teacher", "admin", "department_principal"), updateLiveGroup);
router.delete("/groups/:groupId", authorize("teacher", "admin", "department_principal"), deleteLiveGroup);

router.post("/lessons/:lessonId/shares", authorize("teacher", "admin"), createLiveLessonShare);
router.post("/shares/bulk", authorize("teacher", "admin"), createLiveLessonShares);
router.post("/shares/bulk-respond", authorize("teacher", "admin"), respondToLiveLessonShares);
router.get("/shares/teachers", authorize("teacher", "admin"), listLiveLessonShareTeachers);
router.get("/shares/incoming", authorize("teacher", "admin"), listIncomingLiveLessonShares);
router.get("/shares/outgoing", authorize("teacher", "admin"), listOutgoingLiveLessonShares);
router.post("/shares/:invitationId/accept", authorize("teacher", "admin"), acceptLiveLessonShare);
router.post("/shares/:invitationId/decline", authorize("teacher", "admin"), declineLiveLessonShare);
router.delete("/shares/:invitationId", authorize("teacher", "admin"), revokeLiveLessonShare);

router.get("/settings", authorize("teacher", "admin", "department_principal"), getLiveLessonSettings);
router.patch("/settings", authorize("admin"), updateLiveLessonSettings);
router.post("/lessons/preview", authorize("teacher", "admin", "department_principal"), previewLiveLessonCsv);
router.post("/lessons/import", authorize("teacher", "admin", "department_principal"), importLiveLessonCsv);
router.post("/lessons", authorize("teacher", "admin", "department_principal"), createLiveLesson);
router.get("/lessons", authorize("teacher", "admin", "department_principal"), listLiveLessons);
router.get("/lessons/selection", authorize("teacher", "admin", "department_principal"), listLiveLessonSelection);
router.get("/lessons/:id/export.csv", authorize("teacher", "admin", "department_principal"), exportLiveLessonCsv);
router.get("/lessons/folders", authorize("teacher", "admin", "department_principal"), listLiveLessonFolders);
router.post("/lessons/folders", authorize("teacher", "admin", "department_principal"), createLiveLessonFolder);
router.patch("/lessons/folders/order", authorize("teacher", "admin", "department_principal"), reorderLiveLessonFolders);
router.patch("/lessons/folders/:folderId/lessons/order", authorize("teacher", "admin", "department_principal"), reorderLiveLessonFolderShortcuts);
router.post("/lessons/folders/:folderId/lessons/:lessonId", authorize("teacher", "admin", "department_principal"), addLiveLessonFolderShortcut);
router.delete("/lessons/folders/:folderId/lessons/:lessonId", authorize("teacher", "admin", "department_principal"), removeLiveLessonFolderShortcut);
router.patch("/lessons/folders/:folderId", authorize("teacher", "admin", "department_principal"), updateLiveLessonFolder);
router.delete("/lessons/folders/:folderId", authorize("teacher", "admin", "department_principal"), deleteLiveLessonFolder);
router.post("/lessons/bulk-delete", authorize("teacher", "admin"), bulkDeleteLiveLessons);
router
  .route("/lessons/:id")
  .get(authorize("teacher", "admin", "department_principal"), getLiveLesson)
  .put(authorize("teacher", "admin", "department_principal"), updateLiveLesson)
  .delete(authorize("teacher", "admin", "department_principal"), deleteLiveLesson);
router.patch("/lessons/:id/done", authorize("teacher", "admin", "department_principal"), setLiveLessonDone);
router.get("/lessons/:id/move-targets", authorize("teacher", "admin", "department_principal"), listLiveLessonMoveTargets);
router.post("/lessons/:id/move-year", authorize("teacher", "admin", "department_principal"), moveLiveLessonYear);

router.post("/sessions", authorize("teacher", "admin", "department_principal"), createLiveSession);
router.get("/sessions", authorize("teacher", "admin", "department_principal"), listLiveSessions);
router.get("/sessions/performance", authorize("teacher", "admin", "department_principal"), getLiveLessonPerformanceReport);
router.get("/sessions/performance/export.pdf", authorize("teacher", "admin", "department_principal"), exportLiveLessonPerformanceReportPdf);
router.post("/sessions/:id/end", authorize("teacher", "admin", "department_principal"), endLiveSession);
router.patch("/sessions/:id/replay-availability", authorize("teacher", "admin", "department_principal"), setLiveSessionReplayAvailability);
router.get("/sessions/available", authorize("student"), listAvailableLiveSessions);
router.post("/sessions/:id/join", authorize("student"), joinLiveSessionById);
router.post("/sessions/join", authorize("student"), joinLiveSession);
router.delete("/sessions/finished", authorize("teacher", "admin", "department_principal"), deleteFinishedLiveSessions);
router.delete("/sessions/:id", authorize("teacher", "admin", "department_principal"), deleteLiveSession);
router.get("/sessions/:id/replay", authorize("teacher", "admin", "department_principal", "student"), getLiveSessionReplay);
router.get("/sessions/:id/report", authorize("teacher", "admin", "department_principal"), getLiveSessionReport);
router.patch("/sessions/:id/marks", authorize("teacher", "admin", "department_principal"), updateLiveSessionQuestionMarks);
router.post("/sessions/:id/marks/draft", authorize("teacher", "admin", "department_principal"), aiTokenBudgetGuard, draftLiveSessionQuestionMarks);
router.post("/sessions/:id/report/export.pdf", authorize("teacher", "admin", "department_principal"), exportLiveSessionReportPdf);
router.get("/sessions/:id/gradebook-preview", authorize("teacher", "admin", "department_principal"), getLiveSessionGradebookPreview);
router.post("/sessions/:id/gradebook", authorize("teacher", "admin", "department_principal"), createLiveSessionGradebookEntries);
router.get("/sessions/:id", authorize("teacher", "admin", "department_principal", "student"), getLiveSession);

export default router;
