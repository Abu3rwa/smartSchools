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
    .filter((t) => t.user?.firstName || t.user?.lastName)
    .map((t) => {
      const first = t.user?.firstName || '';
      const last = t.user?.lastName || '';
      const name = `${first} ${last}`.trim() || t.employeeId || 'Unknown';
      return {
        id: t.user?._id,
        label: name,
        name
      };
    });

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