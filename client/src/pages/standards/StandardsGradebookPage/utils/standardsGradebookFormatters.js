export const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${numeric.toFixed(1)}%`;
};

export const formatDateTime = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
};

export const getStudentDisplayName = (student = {}) => {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return student.studentId || '--';
};
