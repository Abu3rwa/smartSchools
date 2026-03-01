export const TIMETABLE_DROPDOWN_LIMIT = 200; // Max items for teachers/classes/subjects dropdowns; add pagination if needed.

export const DAY_LABELS = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
];

export const ROOM_TYPES = [
    { value: 'classroom', label: 'Classroom' },
    { value: 'lab', label: 'Lab' },
    { value: 'lecture_hall', label: 'Lecture hall' },
    { value: 'gym', label: 'Gym' },
    { value: 'library', label: 'Library' },
    { value: 'office', label: 'Office' },
    { value: 'other', label: 'Other' }
];

export const ROOM_STATUSES = [
    { value: 'active', label: 'Active' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'renovation', label: 'Renovation' },
    { value: 'closed', label: 'Closed' }
];
