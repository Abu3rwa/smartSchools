export const TIMETABLE_DROPDOWN_LIMIT = 200; // Max items for teachers/classes/subjects dropdowns; add pagination if needed.
export const DEFAULT_WEEK_WORKING_DAYS = [1, 2, 3, 4, 5];

export const DAY_LABELS = [
    { value: 0, labelKey: 'days.sun' },
    { value: 1, labelKey: 'days.mon' },
    { value: 2, labelKey: 'days.tue' },
    { value: 3, labelKey: 'days.wed' },
    { value: 4, labelKey: 'days.thu' },
    { value: 5, labelKey: 'days.fri' },
    { value: 6, labelKey: 'days.sat' }
];

export const ROOM_TYPES = [
    { value: 'classroom', labelKey: 'room.types.classroom' },
    { value: 'lab', labelKey: 'room.types.lab' },
    { value: 'lecture_hall', labelKey: 'room.types.lecture_hall' },
    { value: 'gym', labelKey: 'room.types.gym' },
    { value: 'library', labelKey: 'room.types.library' },
    { value: 'office', labelKey: 'room.types.office' },
    { value: 'other', labelKey: 'room.types.other' }
];

export const ROOM_STATUSES = [
    { value: 'active', labelKey: 'room.status.active' },
    { value: 'maintenance', labelKey: 'room.status.maintenance' },
    { value: 'renovation', labelKey: 'room.status.renovation' },
    { value: 'closed', labelKey: 'room.status.closed' }
];
