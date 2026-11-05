import { asyncHandler } from '../middleware/errorHandler.js';
import {
    addEventToCalendarForUser,
    createEventForUser,
    decideEventChangeForUser,
    deleteEventForUser,
    listEventsForUser,
    removeEventFromCalendarForUser,
    updateEventForUser
} from '../services/inbox/inboxEventsService.js';

export const listEvents = asyncHandler(async (req, res) => {
    const events = await listEventsForUser(req.user, req.query || {});
    res.json({ events });
});

export const createEvent = asyncHandler(async (req, res) => {
    const event = await createEventForUser(req.user, req.body || {});
    res.status(201).json(event);
});

export const updateEvent = asyncHandler(async (req, res) => {
    const event = await updateEventForUser(req.user, req.params.id, req.body || {});
    res.json(event);
});

export const deleteEvent = asyncHandler(async (req, res) => {
    res.json(await deleteEventForUser(req.user, req.params.id));
});

export const addEventToCalendar = asyncHandler(async (req, res) => {
    res.json(await addEventToCalendarForUser(req.user, req.params.id));
});

export const removeEventFromCalendar = asyncHandler(async (req, res) => {
    const event = await removeEventFromCalendarForUser(req.user, req.params.id, {
        dismiss: req.query.dismiss === 'true'
    });
    res.json(event);
});

export const decideEventChange = asyncHandler(async (req, res) => {
    res.json(await decideEventChangeForUser(req.user, req.params.id, req.body || {}));
});
