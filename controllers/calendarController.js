import { asyncHandler } from '../middleware/errorHandler.js';
import {
    cancelCalendarEvent,
    createCalendarEvent,
    getCalendarEventById,
    searchCalendarAudienceUsers,
    getCalendarNotificationPreferences,
    listCalendarEvents,
    listUpcomingCalendarEvents,
    updateCalendarEvent,
    updateCalendarNotificationPreferences
} from '../services/calendarService.js';

const normalizeError = (error) => ({
    status: Number(error?.statusCode) || 500,
    message: error?.message || 'Server error'
});

export const createCalendarEventController = asyncHandler(async (req, res) => {
    try {
        const event = await createCalendarEvent({
            schoolId: req.schoolId,
            user: req.user,
            payload: req.body
        });
        return res.status(201).json({
            success: true,
            data: { event }
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const updateCalendarEventController = asyncHandler(async (req, res) => {
    try {
        const event = await updateCalendarEvent({
            schoolId: req.schoolId,
            user: req.user,
            eventId: req.params.id,
            payload: req.body
        });
        return res.status(200).json({
            success: true,
            data: { event }
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const cancelCalendarEventController = asyncHandler(async (req, res) => {
    try {
        const event = await cancelCalendarEvent({
            schoolId: req.schoolId,
            user: req.user,
            eventId: req.params.id
        });
        return res.status(200).json({
            success: true,
            data: { event }
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const getCalendarEventByIdController = asyncHandler(async (req, res) => {
    const event = await getCalendarEventById({
        schoolId: req.schoolId,
        user: req.user,
        academicYear: req.academicYear,
        eventId: req.params.id
    });

    if (!event) {
        return res.status(404).json({
            success: false,
            message: 'Calendar event not found'
        });
    }

    return res.status(200).json({
        success: true,
        data: { event }
    });
});

export const listCalendarEventsController = asyncHandler(async (req, res) => {
    try {
        const data = await listCalendarEvents({
            schoolId: req.schoolId,
            user: req.user,
            academicYear: req.academicYear,
            filters: req.query
        });
        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const listUpcomingCalendarEventsController = asyncHandler(async (req, res) => {
    try {
        const data = await listUpcomingCalendarEvents({
            schoolId: req.schoolId,
            user: req.user,
            academicYear: req.academicYear,
            filters: req.query
        });
        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const searchCalendarAudienceUsersController = asyncHandler(async (req, res) => {
    try {
        const data = await searchCalendarAudienceUsers({
            schoolId: req.schoolId,
            user: req.user,
            filters: req.query
        });
        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});

export const getCalendarNotificationPreferencesController = asyncHandler(async (req, res) => {
    const preferences = await getCalendarNotificationPreferences({
        schoolId: req.schoolId,
        userId: req.user._id
    });

    return res.status(200).json({
        success: true,
        data: { preferences }
    });
});

export const updateCalendarNotificationPreferencesController = asyncHandler(async (req, res) => {
    try {
        const preferences = await updateCalendarNotificationPreferences({
            schoolId: req.schoolId,
            userId: req.user._id,
            payload: req.body
        });

        return res.status(200).json({
            success: true,
            data: { preferences }
        });
    } catch (error) {
        const normalized = normalizeError(error);
        return res.status(normalized.status).json({
            success: false,
            message: normalized.message
        });
    }
});
