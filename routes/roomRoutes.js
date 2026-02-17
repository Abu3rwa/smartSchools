import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getRooms,
    createRoom,
    updateRoom,
    deleteRoom
} from '../controllers/roomController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorize('admin', 'department_principal'), getRooms);
router.post('/', authorize('admin', 'department_principal'), createRoom);
router.put('/:id', authorize('admin', 'department_principal'), updateRoom);
router.delete('/:id', authorize('admin', 'department_principal'), deleteRoom);

export default router;
