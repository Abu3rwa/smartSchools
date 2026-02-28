export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : '—';

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : '—';

export const getPersonName = (person) => {
  if (!person) return '—';
  if (typeof person === 'object') {
    const first = person.firstName || '';
    const last = person.lastName || '';
    return `${first} ${last}`.trim() || person.email || '—';
  }
  return '—';
};

export const getCoverageLabel = (coverageType) =>
  coverageType === 'SINGLE_TEACHER_ALL_PERIODS' ? 'Single teacher' : 'Per period';

export const formatTime12 = (value) => {
  if (!value || typeof value !== 'string') return value || '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

export const formatTimeRange12 = (start, end) => {
  if (!start || !end) return '';
  return `${formatTime12(start)} - ${formatTime12(end)}`;
};

export const getPeriodTitle = (period) => {
  const periodRef = period?.periodId;
  if (!periodRef) return '—';
  if (typeof periodRef === 'object') {
    const name = periodRef.name || 'Period';
    const start = period?.startTime || periodRef.startTime;
    const end = period?.endTime || periodRef.endTime;
    return start && end ? `${name} (${formatTimeRange12(start, end)})` : name;
  }
  return '—';
};

export const getEntityName = (value, fallback = '—') => {
  if (!value) return fallback;
  if (typeof value === 'object') return value.name || fallback;
  return fallback;
};