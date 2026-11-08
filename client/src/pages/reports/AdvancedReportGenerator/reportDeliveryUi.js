import { DRAFT_STATUSES } from './constants.js';

// What the delivery status means for the teacher, in one place: the wording
// must never claim a family got the email when the provider answer is unknown.
export const statusChip = (status) => {
  switch (status) {
    case DRAFT_STATUSES.DRAFT:    return { cls: 'is-draft',    label: 'Draft' };
    case DRAFT_STATUSES.APPROVED: return { cls: 'is-approved', label: 'Approved' };
    case DRAFT_STATUSES.SENT:     return { cls: 'is-sent',     label: 'Sent' };
    case DRAFT_STATUSES.SENDING:  return { cls: 'is-sending',  label: 'Sending…' };
    case DRAFT_STATUSES.PARTIAL:  return { cls: 'is-failed',   label: 'Partially sent' };
    case DRAFT_STATUSES.UNKNOWN:  return { cls: 'is-sending',  label: 'Delivery unconfirmed' };
    case DRAFT_STATUSES.FAILED:   return { cls: 'is-failed',   label: 'Delivery failed' };
    case DRAFT_STATUSES.CANCELLED: return { cls: 'is-draft',   label: 'Cancelled' };
    default: return null;
  }
};

// Mirrors the server's send guards: approved/failed resend the whole frozen
// email, partial resends only the failed addresses, unknown is never resent.
export const actionsFor = (status) => ({
  canApprove: status === DRAFT_STATUSES.DRAFT,
  canSend: status === DRAFT_STATUSES.APPROVED || status === DRAFT_STATUSES.FAILED,
  canReopen: [DRAFT_STATUSES.APPROVED, DRAFT_STATUSES.FAILED, DRAFT_STATUSES.PARTIAL].includes(status),
  canRetryFailed: status === DRAFT_STATUSES.PARTIAL,
  canCheckDelivery: status === DRAFT_STATUSES.UNKNOWN || status === DRAFT_STATUSES.PARTIAL,
  isSent: status === DRAFT_STATUSES.SENT
});

// The send returns { results }, the status endpoint returns { details }.
export const deliveryRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload) return [];
  return payload.details || payload.results || [];
};

export const deliveryRowCopy = (row) => {
  switch (row?.status) {
    case 'sent': return 'Delivered';
    case 'failed': return `Not delivered — ${row.error || 'delivery failed'}`;
    case 'unknown': return `Unconfirmed — ${row.error || 'check with the provider'}`;
    case 'bounced': return `Bounced — ${row.error || 'the address rejected the message'}`;
    default: return 'Pending';
  }
};

export const deliveryRowDot = (row) => (
  row?.status === 'sent' ? 'is-green'
    : row?.status === 'failed' || row?.status === 'bounced' ? 'is-red'
    : row?.status === 'unknown' ? 'is-grey'
    : 'is-amber'
);

// School-wide templates would silently change other teachers' reports.
export const canUseSchoolScope = (user) => {
  const adminRoles = ['admin', 'super_admin'];
  return adminRoles.includes(user?.role) ||
    (Array.isArray(user?.roles) && user.roles.some((r) => adminRoles.includes(r)));
};

export const RECIPIENT_ROLES = [
  { key: 'student', label: 'Student' },
  { key: 'mother', label: 'Mother' },
  { key: 'father', label: 'Father' },
  { key: 'guardian', label: 'Guardian' },
  { key: 'teacher', label: 'Teacher' }
];

export const hasFamilyRecipient = (recipients) =>
  ['student', 'mother', 'father', 'guardian'].some((k) => recipients?.[k] !== false);
