export const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export const formatTime = (value) => {
    if (value == null || value === '') return '—';

    const stringValue = typeof value === 'string' ? value : String(value);
    if (stringValue === 'Invalid Date' || stringValue === 'undefined' || stringValue === 'null') return '—';

    const hhmm = stringValue.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
        const hour = Number(hhmm[1]);
        const minute = Number(hhmm[2]);
        const period = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
    }

    try {
        const dateValue = new Date(value);
        if (Number.isNaN(dateValue.getTime())) return '—';
        const formatted = dateValue.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return formatted.includes('Invalid') ? '—' : formatted;
    } catch {
        return '—';
    }
};

export const buildTodaySchedule = (timetable = { periods: [], assignments: [] }) => {
    const dayOfWeek = new Date().getDay();
    const assignments = (timetable.assignments || []).filter((assignment) => {
        const days = assignment.daysOfWeek;
        if (!days || !Array.isArray(days) || days.length === 0) return true;
        return days.includes(dayOfWeek);
    });

    const periodsMap = new Map((timetable.periods || []).map((period) => [period._id, period]));

    return assignments
        .map((assignment) => {
            const periodObject =
                (assignment.period && typeof assignment.period === 'object' ? assignment.period : null) ||
                periodsMap.get(assignment.period) ||
                null;

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

export const getTodayLabel = () => {
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(new Date());
};
