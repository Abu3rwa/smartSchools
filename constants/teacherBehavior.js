/**
 * Teacher-safe vocabulary for the classroom behavior log.
 *
 * The teacher log writes to the existing StudentBehavior collection, so the
 * stored values must stay inside that model's enums. This file is the only
 * place where the teacher-facing three-level model and the stored four-level
 * model meet.
 */

export const TEACHER_BEHAVIOR_CATEGORIES = [
    { key: 'disruptive', label: 'Disruptive', incidentType: 'minor_infraction' },
    { key: 'disrespectful', label: 'Disrespectful', incidentType: 'minor_infraction' },
    { key: 'tardiness', label: 'Tardiness', incidentType: 'attendance_issue' },
    { key: 'truancy', label: 'Truancy', incidentType: 'attendance_issue' },
    { key: 'academic_dishonesty', label: 'Academic dishonesty', incidentType: 'academic_concern' },
    { key: 'bullying', label: 'Bullying', incidentType: 'safety_concern' },
    { key: 'technology_misuse', label: 'Technology misuse', incidentType: 'minor_infraction' },
    { key: 'dress_code', label: 'Dress code', incidentType: 'minor_infraction' },
    { key: 'other', label: 'Other', incidentType: 'minor_infraction' }
];

export const TEACHER_BEHAVIOR_CATEGORY_KEYS = TEACHER_BEHAVIOR_CATEGORIES.map((row) => row.key);

export const TEACHER_BEHAVIOR_SEVERITIES = ['minor', 'moderate', 'serious'];

export const SEVERITY_TO_STORED = {
    minor: 'low',
    moderate: 'medium',
    serious: 'high'
};

export const STORED_SEVERITY_TO_TEACHER = {
    low: 'minor',
    medium: 'moderate',
    high: 'serious',
    critical: 'serious'
};

export const STORED_SEVERITIES_FOR_FILTER = {
    minor: ['low'],
    moderate: ['medium'],
    serious: ['high', 'critical']
};

export const TEACHER_BEHAVIOR_FOLLOW_UPS = [
    'warning_reflection',
    'parent_contact',
    'detention',
    'conversation',
    'counseling_referral',
    'admin_review'
];

export const TEACHER_BEHAVIOR_RANGES = ['today', 'week', 'all'];

// The legacy model requires a description. Teachers may leave the note empty,
// so the service stores this marker and maps it back to '' on the way out.
export const NO_NOTE_PLACEHOLDER = 'No note added.';

export const categoryByKey = (key) => TEACHER_BEHAVIOR_CATEGORIES
    .find((row) => row.key === key) || null;
