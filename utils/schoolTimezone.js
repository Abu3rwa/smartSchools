const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

export const DEFAULT_SCHOOL_TIMEZONE = resolveTimeZone(process.env.DEFAULT_SCHOOL_TIMEZONE);

function twoDigit(value) {
  return String(value).padStart(2, "0");
}

export function ymdKey({ year, month, day }) {
  return `${year}-${twoDigit(month)}-${twoDigit(day)}`;
}

export function getDatePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const valueByType = {};
  for (const part of parts) {
    if (part.type !== "literal") valueByType[part.type] = part.value;
  }
  const weekday = WEEKDAY_MAP[valueByType.weekday] ?? 0;
  return {
    year: Number(valueByType.year),
    month: Number(valueByType.month),
    day: Number(valueByType.day),
    hour: Number(valueByType.hour),
    minute: Number(valueByType.minute),
    second: Number(valueByType.second),
    weekday,
  };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const name = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+0";
  const match = name.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

export function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone);
    const adjusted = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMinutes * 60 * 1000;
    if (adjusted === utcMillis) break;
    utcMillis = adjusted;
  }
  return new Date(utcMillis);
}

export function shiftLocalYmd(ymd, deltaDays) {
  const base = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    weekday: base.getUTCDay(),
  };
}

export function localYmdToServerMidnightDate({ year, month, day }) {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getSchoolDayRangeFromLocalYmd(localYmd, timeZone) {
  return {
    key: ymdKey(localYmd),
    localYmd,
    weekday: localYmd.weekday,
    start: zonedDateTimeToUtc(
      {
        year: localYmd.year,
        month: localYmd.month,
        day: localYmd.day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      },
      timeZone
    ),
    end: zonedDateTimeToUtc(
      {
        year: localYmd.year,
        month: localYmd.month,
        day: localYmd.day,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999,
      },
      timeZone
    ),
  };
}

export function getSchoolDayRange(date, timeZone) {
  const local = getDatePartsInTimeZone(new Date(date), timeZone);
  return getSchoolDayRangeFromLocalYmd(local, timeZone);
}

function parseInputDateToLocalYmd(input, timeZone, fallbackDate) {
  if (!input) {
    return getDatePartsInTimeZone(fallbackDate || new Date(), timeZone);
  }

  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      return { year, month, day, weekday };
    }
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return getDatePartsInTimeZone(fallbackDate || new Date(), timeZone);
  }
  return getDatePartsInTimeZone(parsed, timeZone);
}

export function getViewRangeInTimeZone({ viewMode = "today", startDate, endDate, now = new Date(), timeZone }) {
  const current = getDatePartsInTimeZone(now, timeZone);

  if (viewMode === "today") {
    return getSchoolDayRangeFromLocalYmd(current, timeZone);
  }

  if (viewMode === "week") {
    const weekStart = shiftLocalYmd(current, -current.weekday);
    const weekEnd = shiftLocalYmd(weekStart, 6);
    return {
      ...getSchoolDayRangeFromLocalYmd(weekStart, timeZone),
      end: getSchoolDayRangeFromLocalYmd(weekEnd, timeZone).end,
    };
  }

  if (viewMode === "month") {
    const startLocal = { year: current.year, month: current.month, day: 1, weekday: new Date(Date.UTC(current.year, current.month - 1, 1)).getUTCDay() };
    const monthEndDay = new Date(Date.UTC(current.year, current.month, 0)).getUTCDate();
    const endLocal = {
      year: current.year,
      month: current.month,
      day: monthEndDay,
      weekday: new Date(Date.UTC(current.year, current.month - 1, monthEndDay)).getUTCDay(),
    };
    return {
      ...getSchoolDayRangeFromLocalYmd(startLocal, timeZone),
      end: getSchoolDayRangeFromLocalYmd(endLocal, timeZone).end,
    };
  }

  const startLocal = parseInputDateToLocalYmd(startDate, timeZone, now);
  const endLocal = parseInputDateToLocalYmd(endDate || startDate, timeZone, now);
  return {
    ...getSchoolDayRangeFromLocalYmd(startLocal, timeZone),
    end: getSchoolDayRangeFromLocalYmd(endLocal, timeZone).end,
  };
}