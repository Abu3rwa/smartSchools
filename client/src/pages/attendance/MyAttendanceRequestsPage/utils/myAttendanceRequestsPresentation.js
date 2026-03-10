export function formatDate(d, locale = undefined) {
  return d
    ? new Date(d).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

export function formatTimeRange(r, locale = undefined) {
  if (r.startDate && r.endDate) {
    return `${formatDate(r.startDate, locale)} – ${formatDate(r.endDate, locale)}`;
  }
  if (r.fromTime && r.toTime) return `${r.fromTime} – ${r.toTime}`;
  if (r.fromTime) return r.fromTime;
  if (r.toTime) return r.toTime;
  return "—";
}
