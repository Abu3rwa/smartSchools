import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import {
  createLiveSession,
  createLiveLesson,
  createLiveSessionGradebookEntries,
  bulkDeleteLiveLessons,
  deleteFinishedLiveSessions,
  endLiveSession,
  exportLiveLessonPerformanceReportPdf,
  exportLiveSessionReportPdf,
  deleteLiveSession,
  deleteLiveLesson,
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
  listLiveSessions,
  previewLiveLessonCsv,
  setLiveLessonDone,
  updateLiveLesson,
  updateLiveLessonSettings,
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

const router = express.Router();
router.use(protect, requireSchoolContext);

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
router.post("/lessons/bulk-delete", authorize("teacher", "admin"), bulkDeleteLiveLessons);
router
  .route("/lessons/:id")
  .get(authorize("teacher", "admin", "department_principal"), getLiveLesson)
  .put(authorize("teacher", "admin", "department_principal"), updateLiveLesson)
  .delete(authorize("teacher", "admin", "department_principal"), deleteLiveLesson);
router.patch("/lessons/:id/done", authorize("teacher", "admin", "department_principal"), setLiveLessonDone);

router.post("/sessions", authorize("teacher", "admin", "department_principal"), createLiveSession);
router.get("/sessions", authorize("teacher", "admin", "department_principal"), listLiveSessions);
router.get("/sessions/performance", authorize("teacher", "admin", "department_principal"), getLiveLessonPerformanceReport);
router.get("/sessions/performance/export.pdf", authorize("teacher", "admin", "department_principal"), exportLiveLessonPerformanceReportPdf);
router.post("/sessions/:id/end", authorize("teacher", "admin", "department_principal"), endLiveSession);
router.get("/sessions/available", authorize("student"), listAvailableLiveSessions);
router.post("/sessions/:id/join", authorize("student"), joinLiveSessionById);
router.post("/sessions/join", authorize("student"), joinLiveSession);
router.delete("/sessions/finished", authorize("teacher", "admin", "department_principal"), deleteFinishedLiveSessions);
router.delete("/sessions/:id", authorize("teacher", "admin", "department_principal"), deleteLiveSession);
router.get("/sessions/:id/replay", authorize("teacher", "admin", "department_principal"), getLiveSessionReplay);
router.get("/sessions/:id/report", authorize("teacher", "admin", "department_principal"), getLiveSessionReport);
router.post("/sessions/:id/report/export.pdf", authorize("teacher", "admin", "department_principal"), exportLiveSessionReportPdf);
router.get("/sessions/:id/gradebook-preview", authorize("teacher", "admin", "department_principal"), getLiveSessionGradebookPreview);
router.post("/sessions/:id/gradebook", authorize("teacher", "admin", "department_principal"), createLiveSessionGradebookEntries);
router.get("/sessions/:id", authorize("teacher", "admin", "department_principal", "student"), getLiveSession);

export default router;
