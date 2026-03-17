/**
 * attendanceUtils.js
 * Pure helper functions for the Teacher Attendance page.
 * No React imports — safe to test in isolation.
 */

export function getDateRange(currentDate, viewMode) {
  const base = new Date(currentDate);
  if (viewMode === "today") {
    const start = new Date(base); start.setHours(0, 0, 0, 0);
    const end   = new Date(base); end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }
  if (viewMode === "week") {
    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - base.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return { startDate: startOfWeek, endDate: endOfWeek };
  }
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  return { startDate: monthStart, endDate: monthEnd };
}

export function getDateRangeText(currentDate, viewMode) {
  const base = new Date(currentDate);
  if (viewMode === "today") {
    return base.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  if (viewMode === "week") {
    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - base.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
  }
  return base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function buildSelectOptions(items, idKey, labelKey) {
  const options = new Map();
  items.forEach((item) => { if (item[idKey]) options.set(item[idKey], item[labelKey]); });
  return [...options.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function getRoomLabel(room) {
  if (!room) return "";
  if (typeof room === "string") return room;
  return room.name || "";
}

export function getStudentName(student) {
  if (!student) return "Student";
  if (typeof student === "string") return student;
  const firstName = student.firstName || student.user?.firstName || "";
  const lastName  = student.lastName  || student.user?.lastName  || "";
  return `${firstName} ${lastName}`.trim() || "Student";
}

export function formatDateTime(date) {
  if (!date) return "--";
  return new Date(date).toLocaleString();
}

export function formatTime(date) {
  if (!date) return "--";
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getStatusClassName(status) {
  if (status === "present") return "present";
  if (status === "absent" || status === "absent_excused") return "absent";
  return "late";
}

export function getRecordTitle(record) {
  const className   = record.class?.name   || record.schedule?.class?.name   || "";
  const subjectName = record.subject?.name || record.schedule?.subject?.name || record.period?.name || "";
  return record.schedule?.title || [className, subjectName].filter(Boolean).join(" • ") || "Attendance Record";
}
