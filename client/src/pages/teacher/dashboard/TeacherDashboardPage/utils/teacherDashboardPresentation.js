export const SCHOOL_WEEK_DAYS = [0, 1, 2, 3, 4];
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const getGreeting = (t) => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard:teacherDashboard.greetings.morning');
    if (hour < 17) return t('dashboard:teacherDashboard.greetings.afternoon');
    return t('dashboard:teacherDashboard.greetings.evening');
};

export const formatTime = (value, locale) => {
    if (value == null || value === '') return '—';

    const stringValue = typeof value === 'string' ? value : String(value);
    if (stringValue === 'Invalid Date' || stringValue === 'undefined' || stringValue === 'null') return '—';

    const hhmm = stringValue.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
        const hour = Number(hhmm[1]);
        const minute = Number(hhmm[2]);
        const dateValue = new Date();
        dateValue.setHours(hour, minute, 0, 0);

        return new Intl.DateTimeFormat(locale || undefined, {
            hour: 'numeric',
            minute: '2-digit'
        }).format(dateValue);
    }

    try {
        const dateValue = new Date(value);
        if (Number.isNaN(dateValue.getTime())) return '—';
        const formatted = dateValue.toLocaleTimeString(locale || undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });
        return formatted.includes('Invalid') ? '—' : formatted;
    } catch {
        return '—';
    }
};

export const toMinutes = (value) => {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
};

export const getNowMinutes = (date = new Date()) => date.getHours() * 60 + date.getMinutes();

const resolvePeriod = (assignment, periodsMap) =>
    (assignment.period && typeof assignment.period === 'object' ? assignment.period : null) ||
    periodsMap.get(assignment.period) ||
    null;

export const buildDaySchedule = (timetable = { periods: [], assignments: [] }, dayOfWeek) => {
    const assignments = (timetable.assignments || []).filter((assignment) => {
        const days = assignment.daysOfWeek;
        if (!days || !Array.isArray(days) || days.length === 0) return true;
        return days.includes(dayOfWeek);
    });

    const periodsMap = new Map((timetable.periods || []).map((period) => [period._id, period]));

    return assignments
        .map((assignment) => {
            const periodObject = resolvePeriod(assignment, periodsMap);

            return {
                ...assignment,
                order: periodObject?.order ?? 0,
                startTime: periodObject?.startTime ?? null,
                endTime: periodObject?.endTime ?? null,
                _periodObj: periodObject
            };
        })
        .sort((a, b) => a.order - b.order);
};

export const buildTodaySchedule = (timetable) => buildDaySchedule(timetable, new Date().getDay());

/** Sun–Thu always; Fri/Sat only when the timetable actually uses them. */
export const buildWeekSchedule = (timetable) => {
    const days = [...SCHOOL_WEEK_DAYS];
    [5, 6].forEach((day) => {
        if (buildDaySchedule(timetable, day).length > 0) days.push(day);
    });
    return days.map((day) => ({ day, rows: buildDaySchedule(timetable, day) }));
};

export const getSlotState = (row, nowMinutes) => {
    const start = toMinutes(row?.startTime);
    const end = toMinutes(row?.endTime);
    if (start === null || end === null) return 'upcoming';
    if (nowMinutes >= end) return 'past';
    if (nowMinutes >= start) return 'now';
    return 'upcoming';
};

/**
 * The next thing on the timetable. Periods without times cannot be counted down,
 * so the first of them is offered without a "starts in" badge rather than dropped.
 */
export const getNextClass = (rows = [], nowMinutes) => {
    const timed = rows.filter((row) => toMinutes(row.startTime) !== null && toMinutes(row.endTime) !== null);

    if (timed.length === 0) {
        return rows.length > 0 ? { row: rows[0], live: false, minutesUntil: null } : null;
    }

    const upcoming = timed.find((row) => toMinutes(row.endTime) > nowMinutes);
    if (!upcoming) return null;

    const start = toMinutes(upcoming.startTime);
    return {
        row: upcoming,
        live: nowMinutes >= start,
        minutesUntil: Math.max(0, start - nowMinutes)
    };
};

export const buildClassChips = (assignedClasses = [], limit = 4) => {
    const seen = new Set();
    const chips = [];

    assignedClasses.forEach((assignment) => {
        const className = assignment?.class?.name;
        if (!className) return;
        const subjectName = assignment?.subject?.name || '';
        const key = `${className}::${subjectName}`;
        if (seen.has(key)) return;
        seen.add(key);
        chips.push({ key, className, subjectName });
    });

    return chips.slice(0, limit);
};

export const getPerformanceTone = (value) => {
    const pct = Number(value) || 0;
    if (pct >= 75) return 'emerald';
    if (pct >= 60) return 'teal';
    return 'amber';
};

/** Rounds the axis up to a multiple of three so the four gridline labels stay whole. */
export const getWorkloadCeiling = (counts = []) => {
    const max = counts.reduce((acc, value) => Math.max(acc, Number(value) || 0), 0);
    return Math.max(6, Math.ceil(max / 3) * 3);
};

export const getInitial = (name) => {
    const trimmed = String(name || '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '—';
};

export const getTodayLabel = (locale) => {
    return new Intl.DateTimeFormat(locale || undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(new Date());
};