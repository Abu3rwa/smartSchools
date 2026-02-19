import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getInterventionQueue,
  acknowledgeInterventionCase,
  resolveInterventionCase,
  dismissInterventionCase,
} from '../controllers/interventionController.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'teacher', 'department_principal'));

router.get('/queue', getInterventionQueue);
router.post('/:caseId/acknowledge', acknowledgeInterventionCase);
router.post('/:caseId/resolve', resolveInterventionCase);
router.post('/:caseId/dismiss', dismissInterventionCase);

export default router;
