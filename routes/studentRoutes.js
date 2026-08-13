import express from 'express';
import {
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    uploadStudentPhoto,
    removeStudentPhoto,
    deleteStudent,
    bulkDeleteStudents,
    getStudentsByClass,
    bulkEnrollStudents,
    enrollStudent,
    importStudents,
    transferStudent,
    getPromotionQueue,
    decideStudentPromotion,
    updateStudentReEnrollmentStatus,
    createStudentLogin,
    sendStudentLoginInvite,
    bulkSendStudentLoginInvites,
    bulkCreateStudentLogin,
    resetStudentPassword,
    sendParentCredentials,
    sendParentLoginInvite,
    bulkSendParentLoginInvites
} from '../controllers/studentController.js';
import {
    getStudentLearningTraceController,
    getStudentParentLearningSummaryController
} from '../controllers/academicIntelligenceController.js';
import {
    getStudentAcademicExcellenceDashboard,
    getStudentObjectivesList,
    getStudentTasks,
    studentCompleteTask,
    studentStartInteractiveSession,
    studentAnswerInteractiveSession,
    studentCompleteInteractiveSession
} from '../controllers/academicExcellenceStudentController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireLimit } from '../middleware/checkUsageLimit.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.route('/')
    .get(authorize('admin', 'department_principal', 'teacher'), getStudents)
    .post(authorize('admin'), requireLimit('students'), validationRules.createStudent, validate, createStudent);

// Additional routes (before /:id to avoid param conflicts)
router.post('/import', authorize('admin'), importStudents);
router.post('/bulk-delete', authorize('admin'), bulkDeleteStudents);
router.post('/bulk-create-login', authorize('admin'), bulkCreateStudentLogin);
router.post('/bulk-send-login-invites', authorize('admin'), bulkSendStudentLoginInvites);
router.post('/bulk-send-parent-login-invites', authorize('admin'), bulkSendParentLoginInvites);
router.get('/promotion/queue', authorize('admin'), getPromotionQueue);
router.get('/class/:classId', authorize('admin', 'department_principal', 'teacher'), getStudentsByClass);
router.get('/:id/learning-trace', authorize('admin', 'department_principal', 'teacher', 'student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getStudentLearningTraceController);
router.get('/:id/parent-learning-summary', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getStudentParentLearningSummaryController);
router.get('/:id/academic-excellence', authorize('admin', 'department_principal', 'teacher', 'student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getStudentAcademicExcellenceDashboard);
router.get('/:id/academic-excellence/objectives', authorize('admin', 'department_principal', 'teacher', 'student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getStudentObjectivesList);
router.get('/:id/academic-excellence/tasks', authorize('admin', 'department_principal', 'teacher', 'student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getStudentTasks);
router.patch('/:id/academic-excellence/tasks/:taskId/complete', authorize('student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, studentCompleteTask);
router.post('/:id/academic-excellence/tasks/:taskId/session/start', authorize('student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, studentStartInteractiveSession);
router.post('/:id/academic-excellence/tasks/:taskId/session/answer', authorize('student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, studentAnswerInteractiveSession);
router.post('/:id/academic-excellence/tasks/:taskId/session/complete', authorize('student'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, studentCompleteInteractiveSession);
router.put('/:id/photo', authorize('admin'), validationRules.mongoId, validate, upload.single('photo'), uploadStudentPhoto);
router.delete('/:id/photo', authorize('admin'), validationRules.mongoId, validate, removeStudentPhoto);

router.route('/:id')
    .get(authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getStudent)
    .put(authorize('admin'), validationRules.mongoId, validate, updateStudent)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteStudent);
router.post('/bulk-enroll', authorize('admin'), validationRules.bulkEnrollStudents, validate, bulkEnrollStudents);
router.post('/:id/create-login', authorize('admin'), validationRules.mongoId, validationRules.createStudentLogin, validate, createStudentLogin);
router.post('/:id/send-login-invite', authorize('admin'), validationRules.mongoId, validationRules.createStudentLogin, validate, sendStudentLoginInvite);
router.post('/:id/reset-password', authorize('admin'), validationRules.mongoId, validate, resetStudentPassword);
router.post('/:id/send-parent-credentials', authorize('admin'), validationRules.mongoId, validate, sendParentCredentials);
router.post('/:id/send-parent-login-invite', authorize('admin'), validationRules.mongoId, validate, sendParentLoginInvite);
router.put('/:id/transfer', authorize('admin'), validationRules.mongoId, validationRules.transferStudent, validate, transferStudent);
router.patch('/:id/re-enrollment', authorize('admin'), validationRules.mongoId, validationRules.updateReEnrollmentStatus, validate, updateStudentReEnrollmentStatus);
router.post('/:id/promotion-decisions', authorize('admin'), validationRules.mongoId, validationRules.promotionDecision, validate, decideStudentPromotion);
router.put('/:id/enroll', authorize('admin'), validationRules.mongoId, validate, enrollStudent);

export default router;
