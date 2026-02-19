import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import SchoolDayException from '../models/SchoolDayException.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import {
    DEFAULT_SCHOOL_TIMEZONE,
    resolveTimeZone,
    getSchoolDayRange,
    getDatePartsInTimeZone
} from '../utils/schoolTimezone.js';

function timeHHMMInTimeZone(date, timeZone) {
    const parts = getDatePartsInTimeZone(new Date(date), timeZone);
    const hh = String(parts.hour).padStart(2, '0');
    const mm = String(parts.minute).padStart(2, '0');
    return `${hh}:${mm}`;
}

export async function getSchoolCalendarContext(schoolId) {
    const config = await SchoolCalendarConfig.findOne({ school: schoolId, isActive: true })
        .select('timezone weekWorkingDays')
        .lean();

    return {
        config,
        timeZone: resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE,
        workingDays: Array.isArray(config?.weekWorkingDays) ? config.weekWorkingDays : []
    };
}

export async function getSchoolTimeZone(schoolId) {
    const { timeZone } = await getSchoolCalendarContext(schoolId);
    return timeZone;
}

export async function isWorkingDayForSchool(schoolId, date) {
    const { config, timeZone, workingDays } = await getSchoolCalendarContext(schoolId);
    const dayRange = getSchoolDayRange(date, timeZone);

    const exception = await SchoolDayException.findOne({
        school: schoolId,
        date: { $gte: dayRange.start, $lte: dayRange.end }
    });
    if (exception) return exception.isWorkingDay;

    if (!config) return true;

    const dayOfWeek = dayRange.weekday;

    return workingDays.includes(dayOfWeek);
}

export async function resolvePeriodForSchedule(schoolId, schedule) {
    const timeZone = await getSchoolTimeZone(schoolId);
    const periods = await TimetablePeriod.find({ school: schoolId, isActive: true }).sort({ order: 1, startTime: 1 });
    if (periods.length === 0) return null;

    const scheduleStart = timeHHMMInTimeZone(schedule.startTime, timeZone);
    const scheduleEnd = timeHHMMInTimeZone(schedule.endTime, timeZone);

    const match = periods.find(p => p.startTime === scheduleStart && p.endTime === scheduleEnd);
    return match || null;
}

export async function hasTeacherAssignmentForSchedule(schoolId, schedule, teacherId, periodId) {
    const timeZone = await getSchoolTimeZone(schoolId);
    const dayRange = getSchoolDayRange(schedule.startTime, timeZone);
    const dow = dayRange.weekday;

    const query = {
        school: schoolId,
        teacher: teacherId,
        period: periodId,
        isActive: true,
        startDate: { $lte: dayRange.end },
        endDate: { $gte: dayRange.start },
        daysOfWeek: dow
    };

    if (schedule.class) {
        query.class = schedule.class;
    }

    const assignment = await TeacherPeriodAssignment.findOne(query);
    return !!assignment;
}
