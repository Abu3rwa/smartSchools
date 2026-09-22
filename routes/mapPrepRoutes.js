import express from 'express';
import {
    getMapClasses,
    getMapClassStudents,
    getStudentMapRecords,
    uploadMapRecord,
    deleteMapRecord,
    confirmMapRecord,
    getMapRecord,
    analyzeNextMapRound,
    getMapAnalysis,
    approveMapAnalysis,
    generateMapQuestionDrafts,
    deleteMapPrepRound,
    getMapPlanTopics,
    getMapPlanRounds,
    generateMapTopicQuestions,
    approveMapQuestionSet,
    getMapQuestionSets,
    updateMapQuestionSet,
    publishMapQuiz,
    getStudentMapQuizzes,
    startStudentMapQuiz,
    submitStudentMapAnswer,
    submitStudentMapQuiz,
    gradeMapQuizWithAi,
    closeMapQuiz,
    gradeMapShortAnswer,
    overrideMapGrade,
    getMapPlanReport,
    exportMapPlanReport
} from '../controllers/mapPrepController.js';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { uploadMapPdf } from '../middleware/uploadMapPdf.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();
const requireMapPrepAccess = asyncHandler(async (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    return requireFeature('mapTestPrep')(req, res, next);
});

router.use(protect, requireSchoolContext, requireMapPrepAccess);

router.get('/classes', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_TEST_PREP]), getMapClasses);
router.get('/classes/:classId/students', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_TEST_PREP]), getMapClassStudents);
router.get('/students/:studentId/map-records', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getStudentMapRecords);
router.post('/students/:studentId/map-records/upload', authorizeWithPermission(['admin'], [PERMISSIONS.UPLOAD_MAP_PDF_DATA]), uploadMapPdf.single('file'), uploadMapRecord);
router.delete('/map-records/:recordId', authorizeWithPermission(['admin'], [PERMISSIONS.CREATE_MAP_PREP_PLAN]), deleteMapRecord);
router.get('/map-records/:recordId', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapRecord);
router.patch('/map-records/:recordId/confirm', authorizeWithPermission(['admin'], [PERMISSIONS.CREATE_MAP_PREP_PLAN]), confirmMapRecord);
router.post('/plans/:planId/rounds/next/analyze', authorizeWithPermission(['admin'], [PERMISSIONS.ANALYZE_MAP_PREP_DATA]), analyzeNextMapRound);
router.get('/plans/:planId/analyses/:analysisId', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapAnalysis);
router.post('/plans/:planId/analyses/:analysisId/approve', authorizeWithPermission(['admin'], [PERMISSIONS.APPROVE_MAP_PREP_CONTENT]), approveMapAnalysis);
router.post('/plans/:planId/rounds/:roundId/questions/generate', authorizeWithPermission(['admin'], [PERMISSIONS.GENERATE_MAP_PREP_QUESTIONS]), generateMapQuestionDrafts);
router.delete('/plans/:planId/rounds/:roundId', authorizeWithPermission(['admin'], [PERMISSIONS.GENERATE_MAP_PREP_QUESTIONS]), deleteMapPrepRound);
router.get('/plans/:planId/rounds', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapPlanRounds);
router.get('/plans/:planId/topics', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapPlanTopics);
router.post('/plans/:planId/topics/:topicId/questions/generate', authorizeWithPermission(['admin'], [PERMISSIONS.GENERATE_MAP_PREP_QUESTIONS]), generateMapTopicQuestions);
router.post('/plans/:planId/question-sets/:questionSetId/approve', authorizeWithPermission(['admin'], [PERMISSIONS.APPROVE_MAP_PREP_CONTENT]), approveMapQuestionSet);
router.get('/plans/:planId/question-sets', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapQuestionSets);
router.patch('/plans/:planId/question-sets/:questionSetId', authorizeWithPermission(['admin'], [PERMISSIONS.APPROVE_MAP_PREP_CONTENT]), updateMapQuestionSet);
router.post('/plans/:planId/question-sets/:questionSetId/publish', authorizeWithPermission(['admin'], [PERMISSIONS.PUBLISH_MAP_PREP_QUIZ]), publishMapQuiz);
router.get('/student/quizzes', authorizeWithPermission(['student'], []), getStudentMapQuizzes);
router.post('/student/quizzes/:quizId/start', authorizeWithPermission(['student'], []), startStudentMapQuiz);
router.post('/student/attempts/:attemptId/answer', authorizeWithPermission(['student'], []), submitStudentMapAnswer);
router.post('/student/attempts/:attemptId/submit', authorizeWithPermission(['student'], []), submitStudentMapQuiz);
router.post('/quizzes/:quizId/grade-with-ai', authorizeWithPermission(['admin'], [PERMISSIONS.GRADE_MAP_SHORT_ANSWERS_WITH_AI]), gradeMapQuizWithAi);
router.post('/quizzes/:quizId/close', authorizeWithPermission(['admin'], [PERMISSIONS.PUBLISH_MAP_PREP_QUIZ]), closeMapQuiz);
router.patch('/attempts/:attemptId/grade', authorizeWithPermission(['admin'], [PERMISSIONS.GRADE_MAP_SHORT_ANSWERS]), gradeMapShortAnswer);
router.post('/attempts/:attemptId/override', authorizeWithPermission(['admin'], [PERMISSIONS.OVERRIDE_MAP_GRADING]), overrideMapGrade);
router.get('/reports/plan/:planId', authorizeWithPermission(['admin'], [PERMISSIONS.VIEW_MAP_PREP_PROGRESS]), getMapPlanReport);
router.get('/reports/plan/:planId/export', authorizeWithPermission(['admin'], [PERMISSIONS.EXPORT_MAP_REPORTS]), exportMapPlanReport);

export default router;
