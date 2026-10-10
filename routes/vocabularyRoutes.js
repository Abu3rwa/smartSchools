import express from 'express';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import uploadImportTemplate from '../middleware/uploadImportTemplate.js';
import {
    createWord,
    downloadTemplate,
    getAssignments,
    getSettings,
    importCsv,
    listLists,
    listWordSources,
    listWords,
    patchList,
    patchSettings,
    patchWord,
    putAssignments,
    putWordSource,
    seed,
    studentOverview,
    studentSaveSelection,
    studentWords
} from '../controllers/vocabularyController.js';

const router = express.Router();
const staff = authorize('admin', 'department_principal', 'teacher');
const student = authorize('student');

router.use(protect, requireSchoolContext, express.json());

router.get('/student/overview', student, studentOverview);
router.put('/student/selection', student, studentSaveSelection);
router.get('/student/words', student, studentWords);

router.get('/settings', staff, getSettings);
router.patch('/settings', staff, patchSettings);
router.post('/seed', staff, seed);
router.get('/lists', staff, listLists);
router.patch('/lists/:listId', staff, patchList);
router.get('/lists/:listId/assignments', staff, getAssignments);
router.put('/lists/:listId/assignments', staff, putAssignments);
router.get('/words', staff, listWords);
router.post('/words', staff, createWord);
router.patch('/words/:id', staff, patchWord);
router.get('/words/:id/sources', staff, listWordSources);
router.put('/words/:id/sources/:source', staff, putWordSource);
router.get('/import/templates/:type', staff, downloadTemplate);
router.post('/import/:type', staff, uploadImportTemplate.single('file'), importCsv);

export default router;
