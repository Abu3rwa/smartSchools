export const getStatusCategory = (status) => {
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  return 'pending';
};

const humanize = (value) => (value || '')
  .replace(/_/g, ' ')
  .trim();

export const getTypeLabel = (type, t) => {
  const normalizedType = String(type || 'notification').toLowerCase();
  return t(`notifications:types.${normalizedType}`, {
    defaultValue: humanize(normalizedType)
  });
};

export const getStatusLabel = (status, t) => {
  const normalizedStatus = getStatusCategory(status);
  return t(`notifications:status.${normalizedStatus}`, {
    defaultValue: humanize(normalizedStatus)
  });
};
