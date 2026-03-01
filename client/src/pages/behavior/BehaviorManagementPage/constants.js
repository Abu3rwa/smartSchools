export const INCIDENT_TYPES = [
    { value: 'positive', label: 'Positive' },
    { value: 'minor_infraction', label: 'Minor Infraction' },
    { value: 'major_infraction', label: 'Major Infraction' },
    { value: 'academic_concern', label: 'Academic Concern' },
    { value: 'attendance_issue', label: 'Attendance Issue' },
    { value: 'social_concern', label: 'Social Concern' },
    { value: 'safety_concern', label: 'Safety Concern' }
];

export const SEVERITY_LEVELS = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
];

export const STATUS_OPTIONS = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' }
];

export const LOCATIONS = [
    { value: 'classroom', label: 'Classroom' },
    { value: 'hallway', label: 'Hallway' },
    { value: 'cafeteria', label: 'Cafeteria' },
    { value: 'playground', label: 'Playground' },
    { value: 'gym', label: 'Gym' },
    { value: 'library', label: 'Library' },
    { value: 'bathroom', label: 'Bathroom' },
    { value: 'bus', label: 'Bus' },
    { value: 'parking_lot', label: 'Parking Lot' },
    { value: 'office', label: 'Office' },
    { value: 'auditorium', label: 'Auditorium' },
    { value: 'other', label: 'Other' }
];

export const ACTION_TAKEN_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'verbal_warning', label: 'Verbal Warning' },
    { value: 'written_warning', label: 'Written Warning' },
    { value: 'parent_contact', label: 'Parent Contact' },
    { value: 'detention', label: 'Detention' },
    { value: 'suspension', label: 'Suspension' },
    { value: 'counseling_referral', label: 'Counseling Referral' },
    { value: 'behavior_contract', label: 'Behavior Contract' },
    { value: 'positive_reinforcement', label: 'Positive Reinforcement' },
    { value: 'reward', label: 'Reward' },
    { value: 'other', label: 'Other' }
];

export const CATEGORIES = {
    positive: [
        { value: 'achievement', label: 'Achievement' },
        { value: 'leadership', label: 'Leadership' },
        { value: 'kindness', label: 'Kindness' },
        { value: 'participation', label: 'Participation' },
        { value: 'improvement', label: 'Improvement' }
    ],
    negative: [
        { value: 'disruptive', label: 'Disruptive' },
        { value: 'disrespectful', label: 'Disrespectful' },
        { value: 'academic_dishonesty', label: 'Academic Dishonesty' },
        { value: 'bullying', label: 'Bullying' },
        { value: 'fighting', label: 'Fighting' },
        { value: 'vandalism', label: 'Vandalism' },
        { value: 'technology_misuse', label: 'Technology Misuse' },
        { value: 'dress_code', label: 'Dress Code' },
        { value: 'tardiness', label: 'Tardiness' },
        { value: 'truancy', label: 'Truancy' },
        { value: 'other', label: 'Other' }
    ]
};

export const NOTIFICATION_METHODS = [
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email' },
    { value: 'in_person', label: 'In Person' },
    { value: 'letter', label: 'Letter' },
    { value: 'other', label: 'Other' }
];
