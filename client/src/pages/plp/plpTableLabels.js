export const RECORD_STATUS_LABELS = {
    in_progress: 'In progress',
    submitted: 'Sent for review',
    locked: 'Locked',
};

export const AWARD_LABELS = {
    none: 'No decision',
    selected: 'Selected',
    not_selected: 'Not selected',
};

export const LEVEL_LABELS = {
    emerging: 'Emerging',
    developing: 'Developing',
    strong: 'Strong',
};

export const GOAL_TYPE_LABELS = {
    character: 'Character goal',
    academic: 'Academic goal',
};

export const GOAL_STATUS_LABELS = {
    active: 'Active',
    completed: 'Completed',
    carried_forward: 'Carried forward',
    archived: 'Archived',
};

export const MILESTONE_STATUS_LABELS = {
    pending: 'To do',
    achieved: 'Achieved',
    adjusted: 'Adjusted',
};

export const REVIEW_OUTCOME_LABELS = {
    continue: 'Keep going',
    revise: 'Revised',
    complete: 'Completed',
};

export const TASK_STATUS_LABELS = {
    assigned: 'Assigned',
    in_progress: 'In progress',
    submitted_by_student: 'Submitted',
    reviewed: 'Reviewed',
    completed: 'Completed',
    needs_revision: 'Needs revision',
};

export const EVIDENCE_TYPE_LABELS = {
    observation: 'Observation',
    positive_example: 'Positive example',
    reflection: 'Reflection',
    incident: 'Incident',
};

export const studentInitials = (student) => {
    const initials = `${student?.firstName?.[0] || ''}${student?.lastName?.[0] || ''}`.trim();
    return initials.toUpperCase() || '—';
};

export const plpLabel = (labels, value, fallback = '—') => (
    labels?.[value] || String(value || '').replace(/_/g, ' ') || fallback
);
