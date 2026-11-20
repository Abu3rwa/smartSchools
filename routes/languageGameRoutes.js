import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    archivePack,
    closeAssignment,
    commitImport,
    createAssignment,
    createPack,
    createSkill,
    deletePack,
    deleteSkill,
    getPack,
    giveReward,
    importPrompt,
    importTemplate,
    listAssignments,
    listClassRewards,
    listPacks,
    listQuestionPools,
    listSkills,
    myRewards,
    packReport,
    previewImport,
    previewPoolImport,
    publishPack,
    updatePack,
    updateSkill
} from '../controllers/languageGameTeacherController.js';
import {
    answerSession,
    completeSession,
    getHome,
    getProgress,
    getSession,
    myClasses,
    startSession
} from '../controllers/languageGameStudentController.js';
import { getLeaderboard, setClassLeaderboard } from '../controllers/languageGameLeaderboardController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

const staff = authorize('teacher', 'admin', 'super_admin');

// Teacher authoring
router.get('/skills', staff, listSkills);
router.post('/skills', staff, createSkill);
router.patch('/skills/:id', staff, updateSkill);
router.delete('/skills/:id', staff, deleteSkill);

router.get('/packs', staff, listPacks);
router.post('/packs', staff, createPack);
router.get('/packs/:id', staff, getPack);
router.patch('/packs/:id', staff, updatePack);
router.post('/packs/:id/publish', staff, publishPack);
router.post('/packs/:id/archive', staff, archivePack);
router.delete('/packs/:id', staff, deletePack);
router.get('/packs/:id/report', staff, packReport);

router.get('/import/templates/:type', staff, importTemplate);
router.get('/import/prompt/:type', staff, importPrompt);
router.post('/import/preview', staff, previewImport);
router.post('/import/commit', staff, commitImport);
router.get('/question-pools', staff, listQuestionPools);
router.post('/import/pool-preview', staff, previewPoolImport);

// Teacher reward notes (no XP; recognition only)
router.post('/classes/:classId/rewards', staff, giveReward);
router.get('/classes/:classId/rewards', staff, listClassRewards);
router.get('/rewards/mine', authorize('student'), myRewards);

router.get('/assignments', staff, listAssignments);
router.post('/assignments', staff, createAssignment);
router.post('/assignments/:id/close', staff, closeAssignment);

// Student practice
router.get('/student/home', authorize('student'), getHome);
router.get('/student/classes', authorize('student'), myClasses);
router.post('/student/sessions', authorize('student'), startSession);
router.get('/student/sessions/:id', authorize('student'), getSession);
router.post('/student/sessions/:id/answer', authorize('student'), answerSession);
router.post('/student/sessions/:id/complete', authorize('student'), completeSession);
router.get('/student/progress', authorize('student'), getProgress);

// Leaderboards (students see masked names; staff see full names)
router.get('/leaderboard', authorize('student', 'teacher', 'admin', 'super_admin'), getLeaderboard);
router.put('/classes/:classId/leaderboard-setting', staff, setClassLeaderboard);

export default router;
