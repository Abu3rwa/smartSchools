import AcademicExcellenceNotificationPreference from '../models/AcademicExcellenceNotificationPreference.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /academic-excellence/notification-preferences
 * Returns the current user's AE notification preferences (or school defaults).
 */
export const getAcademicExcellenceNotificationPreferences = asyncHandler(async (req, res) => {
    let prefs = await AcademicExcellenceNotificationPreference.findOne({
        school: req.schoolId,
        user: req.user._id
    }).lean();

    if (!prefs) {
        // Return school-level defaults
        prefs = await AcademicExcellenceNotificationPreference.findOne({
            school: req.schoolId,
            user: { $exists: false }
        }).lean();
    }

    res.json({ success: true, data: prefs || {} });
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
        { school: req.schoolId, user: req.user._id },
        { $set: update },
        { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: prefs });
});
