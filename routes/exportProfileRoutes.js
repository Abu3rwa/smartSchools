import express from 'express';
import { listProfiles, createProfile, updateProfile, deleteProfile } from '../controllers/exportProfileController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal'));

router.get('/', listProfiles);
router.post('/', createProfile);
router.put('/:id', updateProfile);
router.delete('/:id', deleteProfile);

export default router;
