import {
    addDays,
    addHours,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    startOfDay,
    startOfMonth,
    startOfWeek
} from 'date-fns';
import { alpha } from '@mui/material/styles';
import {
    HiOutlineCalendar,
    HiOutlineClipboardCheck,
    HiOutlineUsers
} from 'react-icons/hi';
import {
    CALENDAR_CATEGORY_STYLES,
    CALENDAR_WEEKDAY_LABELS
} from '../constants';

export const toDateInputValue = (value) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return format(date, "yyyy-MM-dd'T'HH:mm");
};

export const createDefaultCalendarEventForm = (baseDate = new Date()) => {
    const start = startOfDay(baseDate);
    const end = addHours(start, 1);
    return {
        title: '',
        description: '',
        category: 'EVENT',
        startAt: toDateInputValue(start),
        endAt: toDateInputValue(end),
        allDay: true,
        location: '',
        visibility: 'SCHOOL_WIDE',
        audienceUsers: [],
        isRecurring: false,
        recurrenceFrequency: 'WEEKLY',
        recurrenceInterval: 1,
        recurrenceWeekDays: [start.getDay()],
        recurrenceUntil: ''
    };
};

export const getCategoryIconComponent = (category) => {
    switch (category) {
        case 'MEETING':
            return HiOutlineUsers;
        case 'EXAM':
            return HiOutlineClipboardCheck;
        default:
            return HiOutlineCalendar;
    }
};

export const formatCalendarEventDateRange = (event) => {
    const startAt = new Date(event.startAt);
    const endAt = new Date(event.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return '';
    }

    if (event.allDay) {
        if (isSameDay(startAt, endAt)) {
            return format(startAt, 'EEE, MMM d, yyyy');
        }
        return `${format(startAt, 'MMM d')} - ${format(endAt, 'MMM d, yyyy')}`;
    }

    if (isSameDay(startAt, endAt)) {
        return `${format(startAt, 'EEE, MMM d, yyyy h:mm a')} - ${format(endAt, 'h:mm a')}`;
    }
    return `${format(startAt, 'MMM d, yyyy h:mm a')} - ${format(endAt, 'MMM d, yyyy h:mm a')}`;
};

export const formatCalendarRecurrenceSummary = (event) => {
    const recurrence = event?.recurrence;
    if (!recurrence || recurrence.isRecurring !== true) return '';
    const interval = Math.max(1, Number.parseInt(recurrence.interval, 10) || 1);
    const frequency = String(recurrence.frequency || '').toUpperCase();

    if (frequency === 'DAILY') {
        return interval === 1 ? 'Repeats daily' : `Repeats every ${interval} days`;
    }
    if (frequency === 'MONTHLY') {
        return interval === 1 ? 'Repeats monthly' : `Repeats every ${interval} months`;
    }

    const days = Array.isArray(recurrence.weekDays)
        ? recurrence.weekDays
            .map((value) => Number.parseInt(value, 10))
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
            .sort((left, right) => left - right)
            .map((value) => CALENDAR_WEEKDAY_LABELS[value])
        : [];

    if (days.length === 0) {
        return interval === 1 ? 'Repeats weekly' : `Repeats every ${interval} weeks`;
    }

    return interval === 1
        ? `Repeats weekly on ${days.join(', ')}`
        : `Repeats every ${interval} weeks on ${days.join(', ')}`;
};

export const toAudienceOption = (user = {}) => {
    const id = String(user.id || user._id || '').trim();
    const firstName = String(user.firstName || '').trim();
    const lastName = String(user.lastName || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const name = `${firstName} ${lastName}`.trim() || email || 'User';
    return {
        id,
        firstName,
        lastName,
        email,
        role: String(user.role || '').trim(),
        label: email ? `${name} (${email})` : name
    };
};

const getAudienceOptionKey = (option = {}) => {
    const id = String(option.id || '').trim();
    if (id) return `id:${id}`;
    const email = String(option.email || '').trim().toLowerCase();
    if (email) return `email:${email}`;
    return `label:${String(option.label || '').trim()}`;
};

export const mergeAudienceOptions = (base = [], extras = []) => {
    const map = new Map();
    [...base, ...extras].forEach((option) => {
        const normalized = toAudienceOption(option);
        map.set(getAudienceOptionKey(normalized), normalized);
    });
    return [...map.values()];
};

export const buildCalendarMonthGrid = (monthDate) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const cells = [];
    let cursor = gridStart;

    while (cursor <= gridEnd) {
        cells.push(cursor);
        cursor = addDays(cursor, 1);
    }

    return cells;
};

export const calendarEventIntersectsDay = (day, event) => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();
    return eventStart <= dayEnd && eventEnd >= dayStart;
};

export const canUserManageCalendar = (user) => {
    if (!user) return false;
    if (['admin', 'super_admin', 'department_principal'].includes(user.role)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes('manage_events');
};

export const resolveCalendarCategoryStyles = (theme) => {
    const buildStyle = ({ label, paletteKey }) => {
        const palette = theme.palette[paletteKey] || theme.palette.primary;
        const color = palette.main;
        return {
            label,
            color,
            bg: alpha(color, 0.14),
            dayBg: alpha(color, 0.16),
            dayBorder: alpha(color, 0.45)
        };
    };

    return {
        EVENT: buildStyle(CALENDAR_CATEGORY_STYLES.EVENT),
        HOLIDAY: buildStyle(CALENDAR_CATEGORY_STYLES.HOLIDAY),
        MEETING: buildStyle(CALENDAR_CATEGORY_STYLES.MEETING),
        EXAM: buildStyle(CALENDAR_CATEGORY_STYLES.EXAM)
    };
};
