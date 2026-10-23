import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { authorize } from '../middleware/auth.js';
import {
    getMonthConfigs, getMonthConfig, createMonthConfig, updateMonthConfig,
    publishMonthConfig, closeMonthConfig,
    getRecords, getLeaderboard, getRecord, exportRecordDocx, exportRecordPdf, exportRoundReports, createRecord, initializeRoundRecords, updateRecord, deleteRecord, submitRecord, unlockRecord,
    getEvidence, getStudentEvidence, exportObservationsByTrait, getTraitScoreSuggestions, createEvidence, updateEvidence, deleteEvidence,
    classifyObservationDraft, createQuickObservation, getNeedsReviewObservations,
    getRecordInteractions, addSupervisorNote,
    getAwardCandidates, setAwardDecision,
    getRecommendations, regenerateRecommendations,
    getSupervisorTeachers,
    getSupervisorAssignments, createSupervisorAssignment, deleteSupervisorAssignment,
    getAuditLogs, getThemeLabels,
    getTraits, getTrait, createTrait, updateTrait, setTraitActive, seedTraits,
    getSelCompetencies, createSelCompetency, updateSelCompetency, seedSelCompetenciesAction,
    getCharacterThemes, createCharacterTheme, updateCharacterTheme, seedCharacterThemesAction,
} from '../controllers/plpController.js';
import {
    getCycles, createCycle, updateCycle, publishCycle, closeCycle, deleteCycle,
    getRecordGoals, createGoal, updateGoal, deleteGoal, reviewGoalByTeacher,
    getPlpEmailConsent, updatePlpEmailConsent,
    getPlpProgressEmailPreview, sendPlpProgressEmail, getPlpEmailDeliveries, getPlpGoalReviewQueue, getPlpTaskReviewQueue,
    getGoalCopyDestinations, copyGoalToRecords,
    getPlpGoalPracticeCandidates, suggestPlpGoalPracticeLinks, updatePlpGoalPracticeLinks,
    getGoalTasks, createTask, updateTask, deleteTask,
    retryTaskNotification,
    getRecordActivities, createActivity, updateActivity, deleteActivity,
    getMyStudentTasks, submitTaskByStudent, reviewTaskByTeacher, getMyStudentRecord,
    getMyStudentRecordHistory, getMyStudentRecordById,
} from '../controllers/plpV2Controller.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);

// ─── Theme labels ────────────────────────────────────────────────────────────────
router.get('/theme-labels', getThemeLabels);

// ─── Month Config ─────────────────────────────────────────────────────────────────
router.route('/config/month').get(getMonthConfigs).post(createMonthConfig);
router.route('/config/month/:id').get(getMonthConfig).put(updateMonthConfig);
router.post('/config/month/:id/publish', publishMonthConfig);
router.post('/config/month/:id/close', closeMonthConfig);

// ─── Records ──────────────────────────────────────────────────────────────────────
router.route('/records')
    .get(authorize('admin', 'teacher', 'department_principal'), getRecords)
    .post(authorize('teacher', 'admin'), createRecord);
router.post('/records/initialize-round', authorize('teacher', 'admin'), initializeRoundRecords);
router.get('/records/export-round', authorize('admin', 'teacher', 'department_principal'), exportRoundReports);
router.get('/leaderboard', authorize('admin', 'teacher', 'department_principal'), getLeaderboard);
router.route('/records/:id')
    .get(authorize('admin', 'teacher', 'department_principal'), getRecord)
    .put(authorize('teacher', 'admin'), updateRecord);
router.get('/records/:id/export-docx', authorize('admin', 'teacher', 'department_principal'), exportRecordDocx);
router.get('/records/:id/export-pdf', authorize('admin', 'teacher', 'department_principal'), exportRecordPdf);
router.delete('/records/:id', authorize('teacher', 'admin'), deleteRecord);
router.post('/records/:id/submit', authorize('teacher', 'admin'), submitRecord);
router.post('/records/:id/unlock', authorize('admin'), unlockRecord);
router.get('/records/:id/trait-score-suggestions', authorize('admin', 'teacher', 'department_principal'), getTraitScoreSuggestions);
router.get('/records/:id/interactions', authorize('admin', 'teacher', 'department_principal'), getRecordInteractions);
router.post('/records/:id/supervisor-note', authorize('admin', 'department_principal'), addSupervisorNote);

// ─── Evidence ─────────────────────────────────────────────────────────────────────
router.get('/records/:id/evidence', authorize('admin', 'teacher', 'department_principal'), getEvidence);
router.get('/students/:studentId/evidence', authorize('admin', 'teacher', 'department_principal'), getStudentEvidence);
router.get('/observations/export', authorize('admin', 'teacher', 'department_principal'), exportObservationsByTrait);
router.post('/records/:id/evidence', authorize('teacher', 'admin'), createEvidence);
router.put('/evidence/:id', authorize('teacher', 'admin'), updateEvidence);
router.delete('/evidence/:id', authorize('teacher', 'admin'), deleteEvidence);
router.post('/observations/classify', authorize('teacher', 'admin'), classifyObservationDraft);
router.post('/observations', authorize('teacher', 'admin'), createQuickObservation);
router.get('/observations/needs-review', authorize('teacher', 'admin'), getNeedsReviewObservations);

// ─── Awards ───────────────────────────────────────────────────────────────────────
router.get('/awards/candidates', authorize('admin', 'teacher'), getAwardCandidates);
router.post('/awards/decision', authorize('admin', 'teacher'), setAwardDecision);

// ─── Recommendations ──────────────────────────────────────────────────────────────
router.get('/records/:id/recommendations', getRecommendations);
router.post('/recommendations/regenerate/:id', regenerateRecommendations);

// ─── Supervisor scope ─────────────────────────────────────────────────────────────
router.get('/supervisor/teachers', getSupervisorTeachers);

// ─── Supervisor assignments (admin) ───────────────────────────────────────────────
router.route('/supervisor-assignments').get(getSupervisorAssignments).post(createSupervisorAssignment);
router.delete('/supervisor-assignments/:id', deleteSupervisorAssignment);

// ─── Audit ────────────────────────────────────────────────────────────────────────
router.get('/audit', getAuditLogs);

// ─── Trait Config ────────────────────────────────────────────────────────────────
router.get('/traits', getTraits);
router.get('/traits/:id', getTrait);
router.post('/traits', authorize('admin'), createTrait);
router.put('/traits/:id', authorize('admin'), updateTrait);
router.post('/traits/:id/activate', authorize('admin'), setTraitActive);
router.post('/traits/seed', authorize('admin'), seedTraits);

// ─── SEL Competency Config ────────────────────────────────────────────────────
router.get('/sel-competencies', getSelCompetencies);
router.post('/sel-competencies', authorize('admin'), createSelCompetency);
router.put('/sel-competencies/:id', authorize('admin'), updateSelCompetency);
router.post('/sel-competencies/seed', authorize('admin'), seedSelCompetenciesAction);

// ─── Character Theme Config ───────────────────────────────────────────────────
router.get('/character-themes', getCharacterThemes);
router.post('/character-themes', authorize('admin'), createCharacterTheme);
router.put('/character-themes/:id', authorize('admin'), updateCharacterTheme);
router.post('/character-themes/seed', authorize('admin'), seedCharacterThemesAction);

// ─── PLP V2 Cycles ────────────────────────────────────────────────────────────
router.get('/cycles', getCycles);
router.post('/cycles', authorize('admin'), createCycle);
router.put('/cycles/:id', authorize('admin'), updateCycle);
router.post('/cycles/:id/publish', authorize('admin'), publishCycle);
router.post('/cycles/:id/close', authorize('admin'), closeCycle);
router.delete('/cycles/:id', authorize('admin'), deleteCycle);

// ─── PLP V2 Goals ─────────────────────────────────────────────────────────────
router.get('/records/:id/goals', authorize('admin', 'teacher', 'department_principal'), getRecordGoals);
router.post('/records/:id/goals', authorize('teacher', 'admin'), createGoal);
router.put('/goals/:goalId', authorize('teacher', 'admin'), updateGoal);
router.post('/goals/:goalId/review', authorize('teacher', 'admin'), reviewGoalByTeacher);
router.get('/goals/review-queue', authorize('teacher', 'admin'), getPlpGoalReviewQueue);
router.get('/tasks/review-queue', authorize('teacher', 'admin'), getPlpTaskReviewQueue);
router.get('/email-consent', authorize('student', 'parent'), getPlpEmailConsent);
router.put('/email-consent', authorize('student', 'parent'), updatePlpEmailConsent);
router.get('/records/:recordId/progress-email-preview', authorize('teacher', 'admin'), getPlpProgressEmailPreview);
router.get('/records/:recordId/email-deliveries', authorize('teacher', 'admin'), getPlpEmailDeliveries);
router.post('/records/:recordId/progress-email', authorize('teacher', 'admin'), sendPlpProgressEmail);
router.delete('/goals/:goalId', authorize('teacher', 'admin'), deleteGoal);
router.get('/goals/:goalId/copy-destinations', authorize('teacher', 'admin'), getGoalCopyDestinations);
router.post('/goals/:goalId/copy', authorize('teacher', 'admin'), copyGoalToRecords);
router.get('/goals/:goalId/practice-candidates', authorize('teacher', 'admin'), getPlpGoalPracticeCandidates);
router.post('/goals/:goalId/practice-link-suggestions', authorize('teacher', 'admin'), suggestPlpGoalPracticeLinks);
router.put('/goals/:goalId/practice-links', authorize('teacher', 'admin'), updatePlpGoalPracticeLinks);

// ─── PLP Activities ─────────────────────────────────────────────────────────
router.get('/records/:id/activities', authorize('admin', 'teacher', 'department_principal'), getRecordActivities);
router.post('/records/:id/activities', authorize('teacher', 'admin'), createActivity);
router.put('/activities/:activityId', authorize('teacher', 'admin'), updateActivity);
router.delete('/activities/:activityId', authorize('teacher', 'admin'), deleteActivity);

// ─── PLP V2 Tasks ─────────────────────────────────────────────────────────────
router.get('/goals/:goalId/tasks', authorize('admin', 'teacher', 'department_principal'), getGoalTasks);
router.post('/goals/:goalId/tasks', authorize('teacher', 'admin'), createTask);
router.put('/tasks/:taskId', authorize('teacher', 'admin'), updateTask);
router.delete('/tasks/:taskId', authorize('teacher', 'admin'), deleteTask);
router.post('/tasks/:taskId/notifications/retry', authorize('teacher', 'admin'), retryTaskNotification);
router.get('/students/me/tasks', authorize('student'), getMyStudentTasks);
router.get('/students/me/records', authorize('student'), getMyStudentRecordHistory);
router.get('/students/me/records/:recordId', authorize('student'), getMyStudentRecordById);
router.get('/students/me/record', authorize('student'), getMyStudentRecord);
router.post('/tasks/:taskId/student-submit', authorize('student'), submitTaskByStudent);
router.post('/tasks/:taskId/teacher-review', authorize('teacher', 'admin'), reviewTaskByTeacher);

export default router;
