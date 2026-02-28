export const getStatusCategory = (status) => {
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  return 'pending';
};

export const getTypeLabel = (type) => (type || 'notification').replace('_', ' ');
