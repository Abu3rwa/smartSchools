import express from 'express';
import {
    getGrammarTests,
    getGrammarTest,
    createGrammarTest,
    updateGrammarTest,
    deleteGrammarTest,
    getGrammarTestPool,
    updateGrammarTestPool,
    regenerateGrammarTestQuestion,
    publishGrammarTest,
    toggleGrammarTest,
} from '../controllers/grammarTestController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('standardsPractice'));

router.route('/')
    .get(authorize('admin', 'teacher', 'department_principal'), getGrammarTests)
    .post(authorize('admin', 'teacher'), createGrammarTest);

router.route('/:id')
    .get(authorize('admin', 'teacher', 'department_principal'), validationRules.mongoId, validate, getGrammarTest)
    .put(authorize('admin', 'teacher'), validationRules.mongoId, validate, updateGrammarTest)
    .delete(authorize('admin', 'teacher'), validationRules.mongoId, validate, deleteGrammarTest);

router.route('/:id/pool')
    .get(authorize('admin', 'teacher', 'department_principal'), validationRules.mongoId, validate, getGrammarTestPool)
    .put(authorize('admin', 'teacher'), validationRules.mongoId, validate, updateGrammarTestPool);

router.post('/:id/pool/regenerate', authorize('admin', 'teacher'), validationRules.mongoId, validate, regenerateGrammarTestQuestion);
router.post('/:id/publish', authorize('admin', 'teacher'), validationRules.mongoId, validate, publishGrammarTest);
router.patch('/:id/toggle', authorize('admin', 'teacher'), validationRules.mongoId, validate, toggleGrammarTest);

export default router;
