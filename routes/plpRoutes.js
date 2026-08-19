import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { authorize } from '../middleware/auth.js';
import {
    getMonthConfigs, getMonthConfig, createMonthConfig, updateMonthConfig,
    publishMonthConfig, closeMonthConfig,
    getRecords, getLeaderboard, getRecord, createRecord, updateRecord, submitRecord,
    getEvidence, getTraitScoreSuggestions, createEvidence, deleteEvidence,
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
    getCycles, createCycle, updateCycle, publishCycle, closeCycle,
    getRecordGoals, createGoal, updateGoal,
    getGoalTasks, createTask, updateTask,
    getMyStudentTasks, submitTaskByStudent, reviewTaskByTeacher,
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
router.route('/records').get(getRecords).post(createRecord);
router.get('/leaderboard', getLeaderboard);
router.route('/records/:id').get(getRecord).put(updateRecord);
router.post('/records/:id/submit', submitRecord);
router.get('/records/:id/trait-score-suggestions', getTraitScoreSuggestions);
router.get('/records/:id/interactions', getRecordInteractions);
router.post('/records/:id/supervisor-note', authorize('department_principal'), addSupervisorNote);

// ─── Evidence ─────────────────────────────────────────────────────────────────────
router.get('/records/:id/evidence', getEvidence);
router.post('/records/:id/evidence', createEvidence);
router.delete('/evidence/:id', deleteEvidence);
router.post('/observations/classify', authorize('teacher', 'admin'), classifyObservationDraft);
router.post('/observations', authorize('teacher', 'admin'), createQuickObservation);
router.get('/observations/needs-review', authorize('teacher', 'admin'), getNeedsReviewObservations);

// ─── Awards ───────────────────────────────────────────────────────────────────────
router.get('/awards/candidates', getAwardCandidates);
router.post('/awards/decision', setAwardDecision);

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

// ─── PLP V2 Goals ─────────────────────────────────────────────────────────────
router.get('/records/:id/goals', getRecordGoals);
router.post('/records/:id/goals', authorize('teacher', 'admin'), createGoal);
router.put('/goals/:goalId', authorize('teacher', 'admin'), updateGoal);

// ─── PLP V2 Tasks ─────────────────────────────────────────────────────────────
router.get('/goals/:goalId/tasks', getGoalTasks);
router.post('/goals/:goalId/tasks', authorize('teacher', 'admin'), createTask);
router.put('/tasks/:taskId', authorize('teacher', 'admin'), updateTask);
router.get('/students/me/tasks', authorize('student'), getMyStudentTasks);
router.post('/tasks/:taskId/student-submit', authorize('student'), submitTaskByStudent);
router.post('/tasks/:taskId/teacher-review', authorize('teacher', 'admin'), reviewTaskByTeacher);

export default router;
