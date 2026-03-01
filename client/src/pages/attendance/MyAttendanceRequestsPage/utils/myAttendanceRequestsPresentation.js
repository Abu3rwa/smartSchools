export function formatDate(d) {
  return d
    ? new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

export function formatTimeRange(r) {
  if (r.startDate && r.endDate) {
    return `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
  }
  if (r.fromTime && r.toTime) return `${r.fromTime} – ${r.toTime}`;
  if (r.fromTime) return r.fromTime;
  if (r.toTime) return r.toTime;
  return "—";
}
