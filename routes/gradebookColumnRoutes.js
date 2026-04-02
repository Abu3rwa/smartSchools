import express from 'express';
import {
    getColumns,
    getColumn,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    toggleLock,
    migrateColumns
} from '../controllers/gradebookColumnController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Read — any teacher/admin in the school can view columns
router.get('/', getColumns);
router.get('/:id', getColumn);

// Write — requires EDIT_GRADES (same as grade entry)
router.post('/', requirePermission(PERMISSIONS.EDIT_GRADES), createColumn);
router.put('/:id', requirePermission(PERMISSIONS.EDIT_GRADES), updateColumn);
router.delete('/:id', requirePermission(PERMISSIONS.EDIT_GRADES), deleteColumn);
router.patch('/reorder', requirePermission(PERMISSIONS.EDIT_GRADES), reorderColumns);
router.patch('/:id/lock', requirePermission(PERMISSIONS.EDIT_GRADES), toggleLock);

// Migration — triggers lazy migration of legacy grades to columns
router.post('/migrate', requirePermission(PERMISSIONS.EDIT_GRADES), migrateColumns);

export default router;
