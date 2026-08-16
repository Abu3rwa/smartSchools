export const getTomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
};

export const isPastDate = (dateValue) => {
  if (!dateValue) return false;
  const target = new Date(dateValue);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
};

export const buildTeacherOptions = (teachers) =>
  teachers
    .filter((t) => {
      const user = t.user;
      if (typeof user === 'string') return Boolean(user);
      return Boolean(user?.firstName || user?.lastName || user?._id);
    })
    .map((t) => {
      const user = t.user;
      const first = typeof user === 'object' ? user?.firstName || '' : '';
      const last = typeof user === 'object' ? user?.lastName || '' : '';
      const name = `${first} ${last}`.trim() || t.employeeId || 'Unknown';
      const id = typeof user === 'string' ? user : user?._id;
      return {
        id,
        label: name,
        name
      };
    })
    .filter((option) => Boolean(option.id));

export const getPeriodLabel = (period, fallback) => {
  if (!period) return fallback;
  return period.name || fallback;
};

export const getTimeLabel = (period, fallback = '—') => {
  if (!period?.startTime || !period?.endTime) return fallback;
  return `${period.startTime}–${period.endTime}`;
};

export const getGradeClassLabel = (period) => {
  if (!period) return '—';
  if (period._grade) {
    const className = period._className || period.classId?.name || '—';
    return `${className} (Grade ${period._grade})`;
  }
  return period._className || period.classId?.name || '—';
};

export const getSubjectLabel = (period) => period?._subjectName || period?.subjectId?.name || '—';

export const getRoomLabel = (period) => period?._roomName || period?.roomId?.name || '—';