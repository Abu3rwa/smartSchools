import { startOfWeek, endOfWeek } from "date-fns";

/**
 * Normalize a date to the class-week boundaries.
 * We use Monday as week start to match common school reporting cycles.
 */
export function getWeekRange(dateLike = new Date()) {
  const d = new Date(dateLike);
  const weekStart = startOfWeek(d, { weekStartsOn: 1 });
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = endOfWeek(d, { weekStartsOn: 1 });
  weekEnd.setHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

export function normalizeWeekStart(dateLike) {
  const { weekStart } = getWeekRange(dateLike);
  return weekStart;
}

