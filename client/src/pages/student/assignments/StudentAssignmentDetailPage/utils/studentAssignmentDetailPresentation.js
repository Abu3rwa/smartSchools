export const formatDateTime = (value) => {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not specified';

  return parsed.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const getValidLessonPlans = (assignment) => {
  if (!Array.isArray(assignment?.lessonPlans)) return [];
  return assignment.lessonPlans.filter((item) => item && (item.title || item.date));
};
