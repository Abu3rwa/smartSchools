export const CALENDAR_FILTER_OPTIONS = [
    { labelKey: 'calendar:filters.all', value: 'ALL' },
    { labelKey: 'calendar:filters.event', value: 'EVENT' },
    { labelKey: 'calendar:filters.holiday', value: 'HOLIDAY' },
    { labelKey: 'calendar:filters.meeting', value: 'MEETING' },
    { labelKey: 'calendar:filters.exam', value: 'EXAM' }
];

export const CALENDAR_CATEGORY_STYLES = {
    EVENT: { labelKey: 'calendar:categories.event', paletteKey: 'primary' },
    HOLIDAY: { labelKey: 'calendar:categories.holiday', paletteKey: 'warning' },
    MEETING: { labelKey: 'calendar:categories.meeting', paletteKey: 'success' },
    EXAM: { labelKey: 'calendar:categories.exam', paletteKey: 'secondary' }
};

export const CALENDAR_VISIBILITY_OPTIONS = [
    { labelKey: 'calendar:visibility.schoolWide', value: 'SCHOOL_WIDE' },
    { labelKey: 'calendar:visibility.teachersOnly', value: 'TEACHERS_ONLY' },
    { labelKey: 'calendar:visibility.parentsOnly', value: 'PARENTS_ONLY' },
    { labelKey: 'calendar:visibility.custom', value: 'CUSTOM' }
];

export const CALENDAR_WEEKDAY_LABELS = [
    'calendar:weekdays.short.sun',
    'calendar:weekdays.short.mon',
    'calendar:weekdays.short.tue',
    'calendar:weekdays.short.wed',
    'calendar:weekdays.short.thu',
    'calendar:weekdays.short.fri',
    'calendar:weekdays.short.sat'
];

export const CALENDAR_RECURRENCE_FREQUENCY_OPTIONS = [
    { value: 'DAILY', labelKey: 'calendar:recurrence.frequency.daily' },
    { value: 'WEEKLY', labelKey: 'calendar:recurrence.frequency.weekly' },
    { value: 'MONTHLY', labelKey: 'calendar:recurrence.frequency.monthly' }
];

export const CALENDAR_RECURRENCE_WEEKDAY_OPTIONS = [
    { value: 0, labelKey: 'calendar:weekdays.short.sun' },
    { value: 1, labelKey: 'calendar:weekdays.short.mon' },
    { value: 2, labelKey: 'calendar:weekdays.short.tue' },
    { value: 3, labelKey: 'calendar:weekdays.short.wed' },
    { value: 4, labelKey: 'calendar:weekdays.short.thu' },
    { value: 5, labelKey: 'calendar:weekdays.short.fri' },
    { value: 6, labelKey: 'calendar:weekdays.short.sat' }
];

export const CALENDAR_OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
