import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
  getMyDeviceTokens,
  registerDeviceToken,
  unregisterDeviceToken
} from '../controllers/deviceController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/me', getMyDeviceTokens);
router.post('/register', registerDeviceToken);
router.post('/unregister', unregisterDeviceToken);

export default router;
