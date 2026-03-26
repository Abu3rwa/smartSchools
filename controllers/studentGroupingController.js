import { asyncHandler } from '../middleware/errorHandler.js';
import studentGroupingService from '../services/studentGroupingService.js';

/* ─── GET /api/student-grouping/:classId/:standardId ─────────────────── */

export const getStudentGroups = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const academicYear = req.query.academicYear || '';

    const { groups, notStarted } = await studentGroupingService.computeGroups({
        classId,
        standardId,
        academicYear,
        schoolId: req.schoolId
    });

    // Fetch activities for each level
    const activitiesByLevel = {};
    for (const level of studentGroupingService.LEVELS_ORDERED) {
        activitiesByLevel[level] = await studentGroupingService.getActivitiesForLevel({
            standardId,
            level,
            schoolId: req.schoolId,
            userId: req.user._id
        });
    }

    const result = studentGroupingService.LEVELS_ORDERED.map((level) => ({
        level,
        label: studentGroupingService.LEVEL_LABELS[level],
        students: groups[level] || [],
        suggestedActivities: activitiesByLevel[level] || []
    }));

    res.json({
        success: true,
        data: {
            groups: result,
            notStarted
        }
    });
});

/* ─── PUT /api/student-grouping/:classId/:standardId/override ────────── */

export const saveGroupingOverride = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const { studentId, overrideLevel, reason } = req.body;
    const academicYear = req.body.academicYear || req.query.academicYear || '';

    if (!studentId || !overrideLevel) {
        const error = new Error('studentId and overrideLevel are required');
        error.statusCode = 400;
        throw error;
    }

    const validLevels = ['advanced', 'proficient', 'approaching', 'below'];
    if (!validLevels.includes(overrideLevel)) {
        const error = new Error('overrideLevel must be one of: advanced, proficient, approaching, below');
        error.statusCode = 400;
        throw error;
    }

    const override = await studentGroupingService.saveOverride({
        classId,
        standardId,
        studentId,
        overrideLevel,
        reason,
        teacherId: req.user._id,
        academicYear,
        schoolId: req.schoolId
    });

    res.json({
        success: true,
        data: { override }
    });
});

/* ─── GET /api/student-grouping/:classId/overview ────────────────────── */

export const getGroupingOverview = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const academicYear = req.query.academicYear || '';
    const subjectId = req.query.subjectId || '';

    const overview = await studentGroupingService.computeOverview({
        classId,
        academicYear,
        subjectId,
        schoolId: req.schoolId
    });

    res.json({
        success: true,
        data: { overview }
    });
});

/* ─── POST /api/student-grouping/:classId/:standardId/refresh-activities  */

export const refreshGroupActivities = asyncHandler(async (req, res) => {
    const { classId, standardId } = req.params;
    const level = req.body.level || req.query.level;

    const validLevels = ['advanced', 'proficient', 'approaching', 'below'];
    const levelsToRefresh = level && validLevels.includes(level) ? [level] : validLevels;

    const activitiesByLevel = {};
    for (const lvl of levelsToRefresh) {
        activitiesByLevel[lvl] = await studentGroupingService.getActivitiesForLevel({
            standardId,
            level: lvl,
            schoolId: req.schoolId,
            userId: req.user._id,
            forceRefresh: true
        });
    }

    res.json({
        success: true,
        data: { activities: activitiesByLevel }
    });
});
