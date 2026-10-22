import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getPortalOverview,
    getPortalIncident,
    getPortalTasks,
    assertPortalSubmitter
} from '../services/behavior/portalService.js';
import { submitBehaviorTask } from '../services/behavior/taskService.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/**
 * @desc    Released incidents, open tasks and return status for the family
 * @route   GET /api/behavior/portal/overview
 * @access  Private (student, parent)
 */
export const getBehaviorPortalOverview = asyncHandler(async (req, res) => {
    const overview = await getPortalOverview({ req, limit: req.query.limit });
    return ok(res, overview);
});

/**
 * @desc    Tasks owed by the family's students
 * @route   GET /api/behavior/portal/tasks
 * @access  Private (student, parent)
 */
export const getBehaviorPortalTasks = asyncHandler(async (req, res) => {
    const result = await getPortalTasks({
        req,
        status: req.query.status,
        limit: req.query.limit
    });
    return ok(res, result);
});

/**
 * @desc    One released incident with its consequences
 * @route   GET /api/behavior/portal/incidents/:id
 * @access  Private (student, parent)
 */
export const getBehaviorPortalIncident = asyncHandler(async (req, res) => {
    const detail = await getPortalIncident({ req, incidentId: req.params.id });
    return ok(res, detail);
});

/**
 * @desc    Student answers a written consequence; the word minimum is enforced
 *          here, not only in the browser
 * @route   POST /api/behavior/portal/tasks/:id/submit
 * @access  Private (student)
 */
export const submitBehaviorPortalTask = asyncHandler(async (req, res) => {
    const linkedStudentId = await assertPortalSubmitter(req);
    const task = await submitBehaviorTask({
        req,
        taskId: req.params.id,
        text: req.body.text,
        answers: req.body.answers,
        linkedStudentId
    });

    return ok(res, { task }, 201);
});
