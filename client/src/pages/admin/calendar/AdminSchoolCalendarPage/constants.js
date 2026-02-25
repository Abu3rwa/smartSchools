export const CALENDAR_FILTER_OPTIONS = [
    { label: 'All', value: 'ALL' },
    { label: 'Events', value: 'EVENT' },
    { label: 'Holidays', value: 'HOLIDAY' },
    { label: 'Meetings', value: 'MEETING' },
    { label: 'Exams', value: 'EXAM' }
];

export const CALENDAR_CATEGORY_STYLES = {
    EVENT: { label: 'Event', paletteKey: 'primary' },
    HOLIDAY: { label: 'Holiday', paletteKey: 'warning' },
    MEETING: { label: 'Meeting', paletteKey: 'success' },
    EXAM: { label: 'Exam', paletteKey: 'secondary' }
};

export const CALENDAR_VISIBILITY_OPTIONS = [
    { label: 'School Wide', value: 'SCHOOL_WIDE' },
    { label: 'Teachers Only', value: 'TEACHERS_ONLY' },
    { label: 'Parents Only', value: 'PARENTS_ONLY' },
    { label: 'Custom (By Email)', value: 'CUSTOM' }
];

export const CALENDAR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CALENDAR_RECURRENCE_FREQUENCY_OPTIONS = [
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' }
];

export const CALENDAR_RECURRENCE_WEEKDAY_OPTIONS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
];

export const CALENDAR_OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
