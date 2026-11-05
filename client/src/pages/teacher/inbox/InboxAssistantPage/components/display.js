const DAY_MS = 24 * 60 * 60 * 1000;

export const localeFor = (language) => (
  String(language || "").startsWith("ar") ? "ar" : "en-GB"
);

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const AVATAR_TONES = ["rose", "blue", "teal", "amber", "slate"];

/** Stable colour for a sender's avatar, so the same person keeps the same tone. */
export const avatarTone = (value) => {
  const source = String(value || "");
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash + source.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
};

export const initialsFor = (name, email = "") => {
  const source = String(name || email || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => part[0]).join("");
  return (letters || source[0]).toUpperCase();
};

/** Same-day time, then Yesterday, weekday, or day+month, like the mock. */
export const formatEmailTime = (value, { language = "en", yesterday = "" } = {}) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = localeFor(language);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (diffDays <= 0) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
  }
  if (diffDays === 1 && yesterday) return yesterday;
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
};

export const datePillParts = (value, language = "en") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const locale = localeFor(language);
  return {
    day: new Intl.DateTimeFormat(locale, { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: "short" }).format(date),
  };
};

export const formatClock = (value, language = "en") => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(localeFor(language), { timeStyle: "short" }).format(date);
};

/** One line for an event's date and time; an all-day event has no clock to show. */
export const eventRangeText = (event, language = "en") => {
  const start = new Date(event?.startAt);
  if (Number.isNaN(start.getTime())) return "";
  const locale = localeFor(language);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(start);
  if (event?.allDay) return day;
  const end = new Date(event?.endAt);
  const from = formatClock(start, language);
  if (Number.isNaN(end.getTime())) return `${day} · ${from}`;
  return `${day} · ${from} – ${formatClock(end, language)}`;
};

/**
 * The short "12 Nov 10:00" used in a change banner. Kept as two parts so the caller
 * can put each in its own bidi run instead of letting the arrow flip in Arabic.
 */
export const whenParts = (value, { language = "en", allDay = true } = {}) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: new Intl.DateTimeFormat(localeFor(language), { day: "numeric", month: "short" }).format(date),
    time: allDay ? "" : formatClock(date, language),
  };
};

/** "22 min ago" style text for the last scan. */
export const relativeScanTime = (value, { language = "en", justNow = "" } = {}) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return justNow;
  const formatter = new Intl.RelativeTimeFormat(localeFor(language), { numeric: "auto" });
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return formatter.format(-days, "day");
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: "medium" }).format(date);
};

export const waitingOverKey = (days) => {
  const n = Math.max(0, Math.round(Number(days) || 0));
  if (n === 1) return "stats.waitingOne";
  if (n === 2) return "stats.waitingTwo";
  if (n >= 3 && n <= 10) return "stats.waitingFew";
  return "stats.waitingMany";
};

export const countLabelKey = (base, count) => (
  Number(count) === 1 ? `${base}One` : `${base}Many`
);

export const scanOptionKey = (size) => {
  const n = Math.max(0, Math.round(Number(size) || 0));
  if (n === 1) return "toolbar.scanOptionOne";
  if (n === 2) return "toolbar.scanOptionTwo";
  if (n >= 3 && n <= 10) return "toolbar.scanOptionFew";
  return "toolbar.scanOptionMany";
};
