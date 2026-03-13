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

export const getTodayLabel = (locale) => {
    return new Intl.DateTimeFormat(locale || undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }).format(new Date());
};
