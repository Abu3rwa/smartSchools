import { asyncHandler } from '../middleware/errorHandler.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import SchoolDayException from '../models/SchoolDayException.js';

// @desc    Get school calendar config + exceptions for a date range
// @route   GET /api/school-calendar
// @access  Private (Admin)
export const getSchoolCalendar = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
// Get school calendar config by the school Id
    const config = await SchoolCalendarConfig.findOne({ school: req.schoolId });

    const query = { school: req.schoolId };
    if (startDate || endDate) {
        query.date = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(0, 0, 0, 0);
            query.date.$lte = end;
        }
    }

    const exceptions = await SchoolDayException.find(query).sort({ date: 1 });

    res.status(200).json({
        success: true,
        data: {
            config,
            exceptions
        }
    });
});

// @desc    Upsert school calendar config
// @route   PUT /api/school-calendar/config
// @access  Private (Admin)
export const upsertSchoolCalendarConfig = asyncHandler(async (req, res) => {
    const { timezone, weekWorkingDays, isActive } = req.body;

    const update = {
        ...(timezone !== undefined ? { timezone } : {}),
        ...(weekWorkingDays !== undefined ? { weekWorkingDays } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        lastModifiedBy: req.user._id
    };

    const config = await SchoolCalendarConfig.findOneAndUpdate(
        { school: req.schoolId },
        { $set: update, $setOnInsert: { school: req.schoolId } },
        { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
        success: true,
        data: { config }
    });
});

// @desc    Create or update a day exception
// @route   PUT /api/school-calendar/exceptions/:date
// @access  Private (Admin)
export const upsertSchoolDayException = asyncHandler(async (req, res) => {
    const { date } = req.params;
    const { isWorkingDay, reason } = req.body;

    if (typeof isWorkingDay !== 'boolean') {
        return res.status(400).json({ success: false, message: 'isWorkingDay must be boolean' });
    }

    const normalized = new Date(date);
    if (Number.isNaN(normalized.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
    }
    normalized.setHours(0, 0, 0, 0);

    const exception = await SchoolDayException.findOneAndUpdate(
        { school: req.schoolId, date: normalized },
        {
            $set: {
                isWorkingDay,
                reason
            },
            $setOnInsert: {
                school: req.schoolId,
                createdBy: req.user._id,
                date: normalized
            }
        },
        { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
        success: true,
        data: { exception }
    });
});

// @desc    Delete a day exception
// @route   DELETE /api/school-calendar/exceptions/:date
// @access  Private (Admin)
export const deleteSchoolDayException = asyncHandler(async (req, res) => {
    const { date } = req.params;

    const normalized = new Date(date);
    if (Number.isNaN(normalized.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
    }
    normalized.setHours(0, 0, 0, 0);

    const deleted = await SchoolDayException.findOneAndDelete({
        school: req.schoolId,
        date: normalized
    });

    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Exception not found' });
    }

    res.status(200).json({ success: true, message: 'Exception deleted' });
});
