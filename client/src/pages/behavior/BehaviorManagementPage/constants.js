export const INCIDENT_TYPES = [
    'positive',
    'minor_infraction',
    'major_infraction',
    'academic_concern',
    'attendance_issue',
    'social_concern',
    'safety_concern'
];

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

export const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];

export const LOCATIONS = [
    'classroom',
    'hallway',
    'cafeteria',
    'playground',
    'gym',
    'library',
    'bathroom',
    'bus',
    'parking_lot',
    'office',
    'auditorium',
    'other'
];

export const ACTION_TAKEN_OPTIONS = [
    'none',
    'verbal_warning',
    'written_warning',
    'parent_contact',
    'detention',
    'suspension',
    'counseling_referral',
    'behavior_contract',
    'positive_reinforcement',
    'reward',
    'other'
];

export const CATEGORIES = {
    positive: ['achievement', 'leadership', 'kindness', 'participation', 'improvement'],
    negative: [
        'disruptive',
        'disrespectful',
        'academic_dishonesty',
        'bullying',
        'fighting',
        'vandalism',
        'technology_misuse',
        'dress_code',
        'tardiness',
        'truancy',
        'other'
    ]
};

export const NOTIFICATION_METHODS = ['phone', 'email', 'in_person', 'letter', 'other'];
