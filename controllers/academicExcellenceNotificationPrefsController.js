import AcademicExcellenceNotificationPreference from '../models/AcademicExcellenceNotificationPreference.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const DEFAULT_NOTIFICATION_PREFERENCES = {
    global: {
        enabled: true,
        onTaskCompleted: true,
        onObjectiveMastered: true,
        onStudentStruggling: true,
        onWeeklyDigest: true,
        channels: {
            inApp: true,
            email: false,
            push: false
        }
    },
    classOverrides: [],
    studentOverrides: []
};

const mergeWithDefaults = (prefs) => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(prefs || {}),
    global: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.global,
        ...(prefs?.global || {}),
        channels: {
            ...DEFAULT_NOTIFICATION_PREFERENCES.global.channels,
            ...(prefs?.global?.channels || {})
        }
    }
});

/**
 * GET /academic-excellence/notification-preferences
 * Returns the current user's AE notification preferences (or school defaults).
 */
export const getAcademicExcellenceNotificationPreferences = asyncHandler(async (req, res) => {
    let prefs = await AcademicExcellenceNotificationPreference.findOne({
        school: req.schoolId,
        teacher: req.user._id
    }).lean();

    res.json({ success: true, data: mergeWithDefaults(prefs) });
});

/**
 * PUT /academic-excellence/notification-preferences
 * Upsert the current user's AE notification preferences.
 */
export const updateAcademicExcellenceNotificationPreferences = asyncHandler(async (req, res) => {
    const { global, classOverrides, studentOverrides } = req.body;

    const update = {};
    if (global !== undefined) update.global = global;
    if (classOverrides !== undefined) update.classOverrides = classOverrides;
    if (studentOverrides !== undefined) update.studentOverrides = studentOverrides;

    const prefs = await AcademicExcellenceNotificationPreference.findOneAndUpdate(
        { school: req.schoolId, teacher: req.user._id },
        { $set: update },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: mergeWithDefaults(prefs) });
});
