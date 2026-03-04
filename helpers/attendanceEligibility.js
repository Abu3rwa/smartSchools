import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import SchoolDayException from '../models/SchoolDayException.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import SubstitutionRequest from '../models/SubstitutionRequest.js';

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

/**
 * Check if a teacher is a confirmed substitute for a given period/class/date.
 * Returns the matching period info { subjectId, roomId, subRequestId } if found,
 * or null if the teacher has no confirmed sub assignment.
 */
export async function hasSubstituteAssignmentForPeriod(schoolId, teacherId, periodId, classId, targetDate) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const request = await SubstitutionRequest.findOne({
        school: schoolId,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['SUBMITTED', 'CONFIRMED'] },
        assignments: {
            $elemMatch: {
                substituteTeacherId: teacherId,
                status: 'CONFIRMED'
            }
        }
    }).populate('periods.roomId', 'name').lean();

    if (!request) return null;

    // Verify the assignment with CONFIRMED status exists for this teacher
    const myAssignment = request.assignments.find(
        (a) => a.substituteTeacherId?.toString() === teacherId.toString() && a.status === 'CONFIRMED'
    );
    if (!myAssignment) return null;

    // Find the period entry that matches both periodId AND classId
    const periodInfo = request.periods.find(
        (p) =>
            p.periodId?.toString() === periodId.toString() &&
            p.classId?.toString() === classId.toString()
    );
    if (!periodInfo) return null;

    return {
        subjectId: periodInfo.subjectId || null,
        roomId: periodInfo.roomId || null,
        subRequestId: request._id
    };
}

/**
 * Resolve confirmed substitute coverage for a class+period on a day.
 * Returns { substituteTeacherId, subRequestId } or null if no confirmed coverage.
 */
export async function getConfirmedSubstituteCoverageForPeriod(schoolId, periodId, classId, targetDate) {
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const request = await SubstitutionRequest.findOne({
        school: schoolId,
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['SUBMITTED', 'CONFIRMED'] },
        periods: {
            $elemMatch: {
                periodId,
                classId
            }
        },
        assignments: {
            $elemMatch: {
                periodId,
                status: 'CONFIRMED'
            }
        }
    }).select('_id assignments').lean();

    if (!request) return null;

    const assignment = (request.assignments || []).find(
        (a) => a.periodId?.toString() === periodId.toString() && a.status === 'CONFIRMED' && a.substituteTeacherId
    );
    if (!assignment?.substituteTeacherId) return null;

    return {
        substituteTeacherId: assignment.substituteTeacherId,
        subRequestId: request._id
    };
}
