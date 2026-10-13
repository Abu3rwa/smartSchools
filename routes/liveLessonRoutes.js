import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import {
  createLiveSession,
  createLiveLesson,
  deleteLiveSession,
  deleteLiveLesson,
  getLiveLesson,
  getLiveSession,
  getLiveSessionReplay,
  getLiveSessionReport,
  importLiveLessonCsv,
  joinLiveSessionById,
  joinLiveSession,
  listAvailableLiveSessions,
  listLiveLessons,
  listLiveSessions,
  previewLiveLessonCsv,
  updateLiveLesson,
} from "../controllers/liveLessonController.js";

const router = express.Router();
router.use(protect, requireSchoolContext);

router.post("/lessons/preview", authorize("teacher", "admin", "department_principal"), previewLiveLessonCsv);
router.post("/lessons/import", authorize("teacher", "admin", "department_principal"), importLiveLessonCsv);
router.post("/lessons", authorize("teacher", "admin", "department_principal"), createLiveLesson);
router.get("/lessons", authorize("teacher", "admin", "department_principal"), listLiveLessons);
router
  .route("/lessons/:id")
  .get(authorize("teacher", "admin", "department_principal"), getLiveLesson)
  .put(authorize("teacher", "admin", "department_principal"), updateLiveLesson)
  .delete(authorize("teacher", "admin", "department_principal"), deleteLiveLesson);

router.post("/sessions", authorize("teacher", "admin", "department_principal"), createLiveSession);
router.get("/sessions", authorize("teacher", "admin", "department_principal"), listLiveSessions);
router.get("/sessions/available", authorize("student"), listAvailableLiveSessions);
router.post("/sessions/:id/join", authorize("student"), joinLiveSessionById);
router.post("/sessions/join", authorize("student"), joinLiveSession);
router.delete("/sessions/:id", authorize("teacher", "admin", "department_principal"), deleteLiveSession);
router.get("/sessions/:id/replay", authorize("teacher", "admin", "department_principal"), getLiveSessionReplay);
router.get("/sessions/:id/report", authorize("teacher", "admin", "department_principal"), getLiveSessionReport);
router.get("/sessions/:id", authorize("teacher", "admin", "department_principal", "student"), getLiveSession);

export default router;
