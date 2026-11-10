import SchoolCalendarConfig from '../../models/SchoolCalendarConfig.js';
import TimetablePeriod from '../../models/TimetablePeriod.js';
import TeacherPeriodAssignment from '../../models/TeacherPeriodAssignment.js';
import { getTeacherHomeroomClassIds } from '../plpAccessService.js';
import {
    DEFAULT_WEEK_WORKING_DAYS,
    normalizeWeekWorkingDays,
} from '../../utils/schoolWeekWorkingDays.js';

// A lesson stays open for observation a little before it starts and after it ends,
// so a note taken at the bell still lands in the lesson it belongs to.
export const CAPTURE_WINDOW_MINUTES = Object.freeze({ before: 10, after: 15 });

const MAX_TZ_OFFSET_MINUTES = 14 * 60;

const toMinutes = (value) => {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    return hours * 60 + minutes;
};

const forbidden = (message) => Object.assign(new Error(message), { statusCode: 403 });

// The server may run in a different timezone than the school, so the teacher's
// browser offset is used for the clock and day-of-week. It only selects which
// lesson is open; the assignment itself is still verified against the timetable.
export const resolveLocalClock = (at, tzOffsetMinutes) => {
    const parsedOffset = Number(tzOffsetMinutes);
    const offset = Number.isFinite(parsedOffset) && Math.abs(parsedOffset) <= MAX_TZ_OFFSET_MINUTES
        ? parsedOffset
        : new Date().getTimezoneOffset();
    const shifted = new Date(at.getTime() - offset * 60 * 1000);
    return {
        dayOfWeek: shifted.getUTCDay(),
        minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
};

export const isWithinCaptureWindow = (nowMinutes, startMinutes, endMinutes) => (
    nowMinutes >= startMinutes - CAPTURE_WINDOW_MINUTES.before
    && nowMinutes <= endMinutes + CAPTURE_WINDOW_MINUTES.after
);

const buildDayFilter = (dayOfWeek, workingDays) => {
    const filter = [{ daysOfWeek: dayOfWeek }];
    // An empty daysOfWeek means "every school working day" in the assignment model.
    if (workingDays.includes(dayOfWeek)) {
        filter.push({ daysOfWeek: { $size: 0 } }, { daysOfWeek: { $exists: false } });
    }
    return filter;
};

const serializePeriod = (period) => (period ? {
    _id: period._id,
    name: period.name,
    startTime: period.startTime,
    endTime: period.endTime,
    order: period.order,
} : null);

const serializeAssignment = (assignment) => (assignment ? {
    _id: assignment._id,
    grade: assignment.grade,
    period: serializePeriod(assignment.period),
    class: assignment.class || null,
    subject: assignment.subject || null,
    room: assignment.room || null,
} : null);

export const createTimetableCurrentPeriodService = ({
    PeriodModel,
    AssignmentModel,
    CalendarModel,
    getHomeroomClassIds,
}) => {
    const resolveWorkingDays = async (schoolId) => {
        const calendar = await CalendarModel.findOne({ school: schoolId, isActive: true })
            .select('weekWorkingDays')
            .lean();
        return normalizeWeekWorkingDays(calendar?.weekWorkingDays, DEFAULT_WEEK_WORKING_DAYS);
    };

    const resolveSlot = async ({ schoolId, teacherId, at = new Date(), tzOffset }) => {
        const workingDays = await resolveWorkingDays(schoolId);
        const { dayOfWeek, minutes } = resolveLocalClock(at, tzOffset);
        const periods = await PeriodModel.find({ school: schoolId, isActive: true })
            .sort({ order: 1 })
            .lean();

        const base = {
            now: at.toISOString(),
            dayOfWeek,
            workingDays,
            period: null,
            assignment: null,
            class: null,
            subject: null,
            room: null,
            nextPeriod: null,
            captureOpen: false,
        };

        if (!workingDays.includes(dayOfWeek)) {
            return { ...base, status: 'off-day' };
        }

        const startOfDay = new Date(at);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(at);
        endOfDay.setHours(23, 59, 59, 999);

        const assignments = await AssignmentModel.find({
            school: schoolId,
            teacher: teacherId,
            isActive: true,
            startDate: { $lte: endOfDay },
            endDate: { $gte: startOfDay },
            $or: buildDayFilter(dayOfWeek, workingDays),
        })
            .populate('period', 'name startTime endTime order')
            .populate('class', 'name grade section')
            .populate('subject', 'name code')
            .populate('room', 'name')
            .lean();

        const scheduled = assignments.filter((assignment) => assignment.period?._id);
        const currentPeriod = periods.find((period) => {
            const start = toMinutes(period.startTime);
            const end = toMinutes(period.endTime);
            return start !== null && end !== null && minutes >= start && minutes < end;
        }) || null;

        const currentAssignment = currentPeriod
            ? scheduled.find((assignment) => String(assignment.period._id) === String(currentPeriod._id))
            : null;
        const nextAssignment = scheduled
            .filter((assignment) => {
                const start = toMinutes(assignment.period.startTime);
                return start !== null && start > minutes;
            })
            .sort((left, right) => toMinutes(left.period.startTime) - toMinutes(right.period.startTime))[0]
            || null;

        const startMinutes = currentPeriod ? toMinutes(currentPeriod.startTime) : null;
        const endMinutes = currentPeriod ? toMinutes(currentPeriod.endTime) : null;

        return {
            ...base,
            status: currentAssignment ? 'in-class' : 'free-period',
            period: serializePeriod(currentPeriod),
            assignment: serializeAssignment(currentAssignment),
            class: currentAssignment?.class || null,
            subject: currentAssignment?.subject || null,
            room: currentAssignment?.room || null,
            nextPeriod: serializeAssignment(nextAssignment),
            captureOpen: Boolean(
                currentAssignment
                && startMinutes !== null
                && endMinutes !== null
                && isWithinCaptureWindow(minutes, startMinutes, endMinutes)
            ),
        };
    };

    // Homeroom teachers keep their existing class-wide access. Other teachers may
    // capture only for a class they are actually scheduled to teach, and only
    // while that lesson is running.
    const assertCanCapture = async ({ user, classId, periodId, at = new Date(), tzOffset }) => {
        if (!user) throw Object.assign(new Error('Not authenticated'), { statusCode: 401 });
        if (user.role === 'admin') return { via: 'admin' };
        if (user.role !== 'teacher') throw forbidden('Only teachers and admins can log observations');

        const normalizedClassId = String(classId?._id || classId || '');
        if (!normalizedClassId) throw Object.assign(new Error('Class context is missing'), { statusCode: 400 });

        const homeroomClassIds = await getHomeroomClassIds(user.school, user._id, null);
        if (homeroomClassIds.includes(normalizedClassId)) {
            return { via: 'homeroom' };
        }

        if (!periodId) throw forbidden('Observations for this class are only available during your scheduled lesson');

        const workingDays = await resolveWorkingDays(user.school);
        const { dayOfWeek, minutes } = resolveLocalClock(at, tzOffset);
        if (!workingDays.includes(dayOfWeek)) throw forbidden('No lessons are scheduled today');

        const startOfDay = new Date(at);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(at);
        endOfDay.setHours(23, 59, 59, 999);

        const assignment = await AssignmentModel.findOne({
            school: user.school,
            teacher: user._id,
            class: normalizedClassId,
            period: periodId,
            isActive: true,
            startDate: { $lte: endOfDay },
            endDate: { $gte: startOfDay },
            $or: buildDayFilter(dayOfWeek, workingDays),
        })
            .populate('period', 'name startTime endTime order')
            .populate('subject', 'name code')
            .lean();

        if (!assignment) throw forbidden('You are not scheduled to teach this class in this period');

        const startMinutes = toMinutes(assignment.period?.startTime);
        const endMinutes = toMinutes(assignment.period?.endTime);
        if (startMinutes === null || endMinutes === null || !isWithinCaptureWindow(minutes, startMinutes, endMinutes)) {
            throw forbidden('This lesson is not in session right now');
        }

        return {
            via: 'timetable',
            assignment,
            period: assignment.period,
            subject: assignment.subject,
        };
    };

    return { resolveSlot, assertCanCapture };
};

export const {
    resolveSlot: resolveTeacherCurrentPeriod,
    assertCanCapture: assertTeacherCanCaptureClass,
} = createTimetableCurrentPeriodService({
    PeriodModel: TimetablePeriod,
    AssignmentModel: TeacherPeriodAssignment,
    CalendarModel: SchoolCalendarConfig,
    getHomeroomClassIds: getTeacherHomeroomClassIds,
});
