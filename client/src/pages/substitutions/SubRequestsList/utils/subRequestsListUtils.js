export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
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