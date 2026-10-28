import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireFeature } from '../middleware/featureGate.js';
import {
    autosaveProject,
    createAssignment,
    deactivateAssignment,
    getAssignment,
    getBoard,
    getProgress,
    getProjectHistory,
    instantiateTemplate,
    listAssignments,
    listTemplates,
    markNotebookWritten,
    myProject,
    myProjectById,
    myWriting,
    saveAsTemplate,
    submitProject,
    updateAssignment
} from '../controllers/writingController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('writingAssistant'));

const staff = authorize('teacher', 'admin', 'super_admin');

/* Teacher: assignment configuration */
router.post('/assignments', staff, createAssignment);
router.get('/assignments', staff, listAssignments);
router.get('/assignments/:assignmentId', staff, getAssignment);
router.patch('/assignments/:assignmentId', staff, updateAssignment);
router.delete('/assignments/:assignmentId', staff, deactivateAssignment);

/* Teacher: templates */
router.get('/templates', staff, listTemplates);
router.post('/assignments/:assignmentId/template', staff, saveAsTemplate);
router.post('/templates/:templateId/instantiate', staff, instantiateTemplate);

/* Teacher: progress and history */
router.get('/assignments/:assignmentId/board', staff, getBoard);
router.get('/assignments/:assignmentId/progress', staff, getProgress);
router.get('/projects/:projectId/history', staff, getProjectHistory);

/*
 * Student. These routes read published feedback only and never reach the AI
 * assessment path — see tests/writingAssistantAiBoundary.test.js.
 */
router.get('/my', authorize('student'), myWriting);
router.post('/assignments/:assignmentId/open', authorize('student'), myProject);
router.get('/projects/:projectId', authorize('student'), myProjectById);
router.put('/projects/:projectId/autosave', authorize('student'), autosaveProject);
router.post('/projects/:projectId/submit', authorize('student'), submitProject);
router.post('/projects/:projectId/notebook-written', authorize('student'), markNotebookWritten);

export default router;
