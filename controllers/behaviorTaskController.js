import { asyncHandler } from '../middleware/errorHandler.js';
import {
    listTasksForActor,
    verifyBehaviorTask,
    getBehaviorReturnStatus
} from '../services/behavior/taskService.js';
import { getBehaviorSettings } from '../services/behavior/settingsService.js';

const ok = (res, data) => res.json({ success: true, data });

/**
 * @desc    Consequence work a staff member has to verify
 * @route   GET /api/behavior/tasks
 * @access  Private (behavior staff)
 */
export const getBehaviorTasks = asyncHandler(async (req, res) => {
    const { items, total } = await listTasksForActor({
        req,
        status: req.query.status,
        limit: req.query.limit,
        skip: req.query.skip
    });

    return ok(res, {
        items,
        pagination: {
            limit: Number(req.query.limit) || 50,
            skip: Number(req.query.skip) || 0,
            total
        }
    });
});

/**
 * @desc    Mark a task completed, ask for a revision, or waive it
 * @route   POST /api/behavior/tasks/:id/verify
 * @access  Private (assigned verifier)
 */
export const verifyBehaviorTaskController = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const task = await verifyBehaviorTask({
        req,
        taskId: req.params.id,
        decision: req.body.decision,
        comment: req.body.comment,
        settings
    });

    return ok(res, { task });
});

/**
 * @desc    Whether a student still owes return-clearance work. Informational:
 *          attendance and timetabling are never changed by this module.
 * @route   GET /api/behavior/students/:studentId/return-status
 * @access  Private (behavior staff)
 */
export const getStudentReturnStatusController = asyncHandler(async (req, res) => {
    const status = await getBehaviorReturnStatus({
        schoolId: req.schoolId,
        studentId: req.params.studentId
    });
    return ok(res, status);
});
