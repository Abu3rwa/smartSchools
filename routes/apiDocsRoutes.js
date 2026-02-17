import express from 'express';
import { getApiDocumentation } from '../controllers/apiDocsController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, authorize('admin', 'super_admin'), getApiDocumentation);

export default router;
