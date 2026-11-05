import { asyncHandler } from '../middleware/errorHandler.js';
import {
    addToCalendarForUser,
    createDeadlineForUser,
    decideDeadlineChangeForUser,
    deleteDeadlineForUser,
    getSummaryForUser,
    listDeadlinesForUser,
    removeFromCalendarForUser,
    updateDeadlineForUser
} from '../services/inbox/inboxDeadlinesService.js';

export const listDeadlines = asyncHandler(async (req, res) => {
    const deadlines = await listDeadlinesForUser(req.user, req.query || {});
    res.json({ deadlines });
});

export const createDeadline = asyncHandler(async (req, res) => {
    const deadline = await createDeadlineForUser(req.user, req.body || {});
    res.status(201).json(deadline);
});

export const updateDeadline = asyncHandler(async (req, res) => {
    const deadline = await updateDeadlineForUser(req.user, req.params.id, req.body || {});
    res.json(deadline);
});

export const deleteDeadline = asyncHandler(async (req, res) => {
    res.json(await deleteDeadlineForUser(req.user, req.params.id));
});

export const addDeadlineToCalendar = asyncHandler(async (req, res) => {
    res.json(await addToCalendarForUser(req.user, req.params.id, req.body || {}));
});

export const removeDeadlineFromCalendar = asyncHandler(async (req, res) => {
    const deadline = await removeFromCalendarForUser(req.user, req.params.id, {
        dismiss: req.query.dismiss === 'true'
    });
    res.json(deadline);
});

export const decideDeadlineChange = asyncHandler(async (req, res) => {
    res.json(await decideDeadlineChangeForUser(req.user, req.params.id, req.body || {}));
});

export const getSummary = asyncHandler(async (req, res) => {
    res.json(await getSummaryForUser(req.user));
});
