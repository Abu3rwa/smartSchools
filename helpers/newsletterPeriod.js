import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

/**
 * Resolve the newsletter period boundaries for a given date based on
 * the school's configured frequency (with optional department override).
 *
 * @param {Object} options
 * @param {Object} options.school          - School document (or lean object with settings.newsletter)
 * @param {string} [options.departmentId]  - Department ObjectId string (optional)
 * @param {Date}   [options.date]          - Reference date (defaults to now)
 * @returns {{ periodStart: Date, periodEnd: Date, frequency: string }}
 */
export function resolveNewsletterPeriod({ school, departmentId, date } = {}) {
  const d = date ? new Date(date) : new Date();
  const newsletterSettings = school?.settings?.newsletter || {};

  // Check for department-level override
  let frequency = newsletterSettings.frequency || "weekly";
  if (departmentId && Array.isArray(newsletterSettings.departmentOverrides)) {
    const override = newsletterSettings.departmentOverrides.find(
      (o) => o.department?.toString() === departmentId.toString()
    );
    if (override?.frequency) {
      frequency = override.frequency;
    }
  }

  let periodStart;
  let periodEnd;

  switch (frequency) {
    case "monthly":
      periodStart = startOfMonth(d);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = endOfMonth(d);
      periodEnd.setHours(23, 59, 59, 999);
      break;

    case "biweekly": {
      // Align to the Monday of the current ISO week, then snap to even-week boundary.
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      // Use ISO week number to determine even/odd alignment
      const oneJan = new Date(weekStart.getFullYear(), 0, 1);
      const daysSinceJan1 = Math.floor((weekStart - oneJan) / 86400000);
      const weekNum = Math.ceil((daysSinceJan1 + oneJan.getDay() + 1) / 7);
      // If odd week, roll back one week to start the biweekly window
      if (weekNum % 2 !== 0) {
        weekStart.setDate(weekStart.getDate() - 7);
      }
      weekStart.setHours(0, 0, 0, 0);
      periodStart = weekStart;

      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 13); // 14 days - 1
      periodEnd.setHours(23, 59, 59, 999);
      break;
    }

    case "weekly":
    default:
      periodStart = startOfWeek(d, { weekStartsOn: 1 });
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = endOfWeek(d, { weekStartsOn: 1 });
      periodEnd.setHours(23, 59, 59, 999);
      break;
  }

  return { periodStart, periodEnd, frequency };
}

/**
 * Resolve AI word-count limits for a school + optional department.
 *
 * @param {Object} options
 * @param {Object} options.school         - School document
 * @param {string} [options.departmentId] - Department ObjectId string
 * @returns {{ minWords: number, maxWords: number }}
 */
export function resolveNewsletterWordLimits({ school, departmentId } = {}) {
  const newsletterSettings = school?.settings?.newsletter || {};
  let minWords = newsletterSettings.aiMinWords || 100;
  let maxWords = newsletterSettings.aiMaxWords || 120;

  if (departmentId && Array.isArray(newsletterSettings.departmentOverrides)) {
    const override = newsletterSettings.departmentOverrides.find(
      (o) => o.department?.toString() === departmentId.toString()
    );
    if (override?.aiMinWords) minWords = override.aiMinWords;
    if (override?.aiMaxWords) maxWords = override.aiMaxWords;
  }

  // Sanity: ensure min < max
  if (minWords >= maxWords) {
    maxWords = minWords + 20;
  }

  return { minWords, maxWords };
}
