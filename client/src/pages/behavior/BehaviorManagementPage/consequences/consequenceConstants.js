/**
 * Client mirror of the server's behavior vocabulary (constants/behavior.js).
 * Keep the two lists in step; the server validates every one of these values.
 */

export const BEHAVIOR_INCIDENT_STATUSES = [
    'logged',
    'pending_approval',
    'approved',
    'notified',
    'in_progress',
    'closed',
    'consequence_rejected',
    'voided',
    'merged'
];

export const BEHAVIOR_TASK_STATUSES = [
    'assigned',
    'submitted',
    'needs_revision',
    'completed',
    'overdue',
    'waived'
];

export const BEHAVIOR_TASK_TYPES = [
    'verbal_warning',
    'written_warning',
    'apology_letter',
    'detention',
    'fix_it_plan',
    'coming_back_plan',
    're_entry_plan',
    'family_meeting',
    'suspension',
    'damage_repair',
    'other'
];

// Only these ask the student for written work, so only these get a word minimum.
export const SUBMITTABLE_TASK_TYPES = [
    'written_warning',
    'apology_letter',
    'fix_it_plan',
    'coming_back_plan',
    're_entry_plan'
];

export const BEHAVIOR_VERIFIER_RULES = [
    'logging-staff',
    'admin-only',
    'admin-or-counselor',
    'specific-role'
];

export const BEHAVIOR_COUNTING_MODES = ['rolling_days', 'term', 'school_year', 'manual'];

export const BEHAVIOR_OVERFLOW_BEHAVIORS = ['repeat_last', 'flag_for_admin'];

export const BEHAVIOR_APPROVER_ROLES = ['admin', 'department_principal', 'behavior_manager'];

export const BEHAVIOR_ROLE_OPTIONS = [
    'admin',
    'department_principal',
    'behavior_manager',
    'counselor',
    'teacher',
    'staff'
];

export const BEHAVIOR_LEVELS = [1, 2, 3, 4];
