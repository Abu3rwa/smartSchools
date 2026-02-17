import express from 'express';
import {
    createBehaviorIncident,
    getBehaviorIncidents,
    getBehaviorIncident,
    updateBehaviorIncident,
    deleteBehaviorIncident,
    addNote,
    resolveIncident,
    getStudentBehaviorSummary,
    getClassBehaviorStats,
    getPendingFollowUps,
    completeFollowUp
} from '../controllers/studentBehaviorController.js';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// All routes require authentication and school context
router.use(protect);
router.use(requireSchoolContext);

// Behavior incident CRUD
router.post('/', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), createBehaviorIncident);

router.get('/', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR]
), getBehaviorIncidents);

router.get('/:id', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR]
), getBehaviorIncident);

router.put('/:id', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), updateBehaviorIncident);

router.delete('/:id', authorizeWithPermission(
    ['admin'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), deleteBehaviorIncident);

// Notes
router.post('/:id/notes', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), addNote);

// Resolution
router.patch('/:id/resolve', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), resolveIncident);

// Follow-ups
router.get('/follow-ups/pending', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), getPendingFollowUps);

router.patch('/:id/follow-up', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR]
), completeFollowUp);

// Statistics and summaries
router.get('/student/:studentId/summary', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR]
), getStudentBehaviorSummary);

router.get('/class/:classId/stats', authorizeWithPermission(
    ['admin', 'teacher', 'department_principal'],
    [PERMISSIONS.MANAGE_BEHAVIOR, PERMISSIONS.VIEW_BEHAVIOR]
), getClassBehaviorStats);

export default router;
