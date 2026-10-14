export const formatDueDate = (value) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No due date';
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const getStatusMeta = (assignment) => {
  const rawStatus = String(assignment?.status || '').toLowerCase();
  if (rawStatus === 'published') {
    return { label: 'Published', className: 'published' };
  }
  if (rawStatus === 'closed') {
    return { label: 'Closed', className: 'closed' };
  }
  if (rawStatus === 'archived') {
    return { label: 'Archived', className: 'archived' };
  }
  return { label: 'Assigned', className: 'assigned' };
};

export const orderAssignments = (assignments = []) => {
  return [...assignments].sort((a, b) => {
    const assignedA = a?.assignedDate || a?.publishedAt || a?.createdAt;
    const assignedB = b?.assignedDate || b?.publishedAt || b?.createdAt;
    const assignedTimeA = assignedA ? new Date(assignedA).getTime() : 0;
    const assignedTimeB = assignedB ? new Date(assignedB).getTime() : 0;
    if (assignedTimeA !== assignedTimeB) return assignedTimeB - assignedTimeA;

    const dueA = a?.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b?.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return dueA - dueB;
  });
};
