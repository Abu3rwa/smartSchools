import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import { requireSchoolContext } from "../middleware/tenantIsolation.js";
import { liveLessonBuilderRateLimiter } from "../middleware/rateLimiters.js";
import { uploadLiveLessonSource } from "../middleware/uploadLiveLessonSource.js";
import {
  appendDraftSource,
  approveDraft,
  cancelDraftOperation,
  createDraft,
  discardDraft,
  generateDraftContent,
  generateDraftPlan,
  getDraft,
  getDraftSource,
  listDrafts,
  quoteDraft,
  regenerateDraftItem,
  removeDraftSourceFile,
  requireBuilderEnabled,
  restoreDraftSource,
  suggestDraftTitle,
  undoDraftItem,
  updateDraftItemContent,
  updateDraftItems,
  updateDraftItemTexts,
  updateDraftSetup,
} from "../controllers/liveLessonDraftController.js";

const router = express.Router();

router.use(protect, requireSchoolContext, authorize("teacher", "admin"), requireBuilderEnabled);

router.get("/", listDrafts);
router.post("/", uploadLiveLessonSource, createDraft);

router.get("/:id", getDraft);
router.get("/:id/source", getDraftSource);
router.get("/:id/title-suggestion", suggestDraftTitle);
router.post("/:id/source", uploadLiveLessonSource, appendDraftSource);
router.post("/:id/source/restore", restoreDraftSource);
router.delete("/:id/source/files/:fileId", removeDraftSourceFile);
router.patch("/:id/setup", updateDraftSetup);
router.post("/:id/quote", quoteDraft);

router.post("/:id/plan", liveLessonBuilderRateLimiter, generateDraftPlan);
router.post("/:id/generate", liveLessonBuilderRateLimiter, generateDraftContent);
router.post("/:id/items/:itemId/regenerate", liveLessonBuilderRateLimiter, regenerateDraftItem);
router.post("/:id/items/:itemId/undo", undoDraftItem);
router.patch("/:id/items/:itemId/texts", updateDraftItemTexts);
router.patch("/:id/items/:itemId", updateDraftItemContent);
router.patch("/:id/items", updateDraftItems);
router.post("/:id/ops/:opKey/cancel", cancelDraftOperation);
router.delete("/:id", discardDraft);
router.post("/:id/approve", approveDraft);

export default router;
