import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import SchoolDayException from '../models/SchoolDayException.js';
import TimetablePeriod from '../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';

function normalizeDateOnly(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function timeHHMM(date) {
    const d = new Date(date);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

export async function isWorkingDayForSchool(schoolId, date) {
    const normalized = normalizeDateOnly(date);

    const exception = await SchoolDayException.findOne({ school: schoolId, date: normalized });
    if (exception) return exception.isWorkingDay;

    const config = await SchoolCalendarConfig.findOne({ school: schoolId, isActive: true });
    if (!config) return true;

    const dayOfWeek = normalized.getDay();
    const workingDays = Array.isArray(config.weekWorkingDays) ? config.weekWorkingDays : [];

    return workingDays.includes(dayOfWeek);
}

export async function resolvePeriodForSchedule(schoolId, schedule) {
    const periods = await TimetablePeriod.find({ school: schoolId, isActive: true }).sort({ order: 1, startTime: 1 });
    if (periods.length === 0) return null;

    const scheduleStart = timeHHMM(schedule.startTime);
    const scheduleEnd = timeHHMM(schedule.endTime);

    const match = periods.find(p => p.startTime === scheduleStart && p.endTime === scheduleEnd);
    return match || null;
}

export async function hasTeacherAssignmentForSchedule(schoolId, schedule, teacherId, periodId) {
    const date = normalizeDateOnly(schedule.startTime);
    const dow = date.getDay();

    const query = {
        school: schoolId,
        teacher: teacherId,
        period: periodId,
        isActive: true,
        startDate: { $lte: date },
        endDate: { $gte: date },
        daysOfWeek: dow
    };

    if (schedule.class) {
        query.class = schedule.class;
    }

    const assignment = await TeacherPeriodAssignment.findOne(query);
    return !!assignment;
}
