/**
 * Shared vocabulary for the Behavior & Consequence module.
 * The module is additive: none of these values are used by the legacy
 * StudentBehavior incident tracker.
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

// Only these two never count as an occurrence of the behaviour.
export const NON_COUNTED_STATUSES = ['voided', 'merged'];

// Single source of truth for the state machine; anything not listed here is
// rejected by incidentService.transition().
export const BEHAVIOR_TRANSITIONS = {
    logged: ['pending_approval', 'approved', 'in_progress', 'closed', 'consequence_rejected', 'voided', 'merged'],
    pending_approval: ['approved', 'consequence_rejected', 'voided', 'merged'],
    approved: ['notified', 'in_progress', 'voided', 'merged'],
    notified: ['in_progress', 'closed', 'voided', 'merged'],
    in_progress: ['closed', 'voided', 'merged'],
    closed: ['voided', 'merged'],
    consequence_rejected: ['voided', 'merged'],
    voided: [],
    merged: []
};

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

// Task types the student answers in the portal, so word counts apply.
export const SUBMITTABLE_BEHAVIOR_TASK_TYPES = [
    'written_warning',
    'apology_letter',
    'fix_it_plan',
    'coming_back_plan',
    're_entry_plan'
];

// Until these are done the student is not cleared to return.
export const RETURN_GATING_TASK_TYPES = ['suspension', 'coming_back_plan', 're_entry_plan'];

export const BEHAVIOR_TASK_STATUSES = [
    'assigned',
    'submitted',
    'needs_revision',
    'completed',
    'overdue',
    'waived'
];

export const BEHAVIOR_COUNTING_MODES = ['rolling_days', 'term', 'school_year', 'manual'];

export const BEHAVIOR_OVERFLOW_BEHAVIORS = ['repeat_last', 'flag_for_admin'];

export const BEHAVIOR_VERIFIER_RULES = [
    'logging-staff',
    'admin-only',
    'admin-or-counselor',
    'specific-role'
];

export const BEHAVIOR_SEVERITY_LEVELS = [1, 2, 3, 4];

export const BEHAVIOR_NOTIFICATION_CHANNELS = ['email', 'portal'];

// 'sending' is a short claim lease held by one worker; 'sent' means the transport
// accepted the message. 'visible' is the portal equivalent of 'sent'.
export const BEHAVIOR_NOTIFICATION_STATUSES = ['draft', 'sending', 'sent', 'suppressed', 'visible', 'failed'];

// Any staff member who may log, mirroring the legacy tracker's access rules.
export const BEHAVIOR_STAFF_ROLES = [
    'super_admin',
    'admin',
    'staff',
    'teacher',
    'department_principal',
    'behavior_manager'
];

export const BEHAVIOR_APPROVER_ROLES = ['admin', 'department_principal', 'behavior_manager'];

export const BEHAVIOR_COMING_BACK_PLAN_QUESTIONS = [
    'What happened?',
    'Who was affected and how?',
    'What is your plan so it doesn\'t happen again?'
];
