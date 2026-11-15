export const pick = (en, ar, arabic) => (arabic ? ar || en : en || ar);

export const isArabicLanguage = (language) => String(language || "").startsWith("ar");

export const initials = (name = "") =>
  String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();

export const monthLabel = (month, language) => {
  if (!month) return "";
  const date = new Date(2026, Number(month) - 1, 1);
  return new Intl.DateTimeFormat(isArabicLanguage(language) ? "ar-EG" : "en-GB", { month: "long" }).format(date);
};

export const dateLabel = (value, language) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(isArabicLanguage(language) ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

export const dueLabel = (value, language) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(isArabicLanguage(language) ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

export const isOverdue = (value) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
};

export const severityTone = (severity) => ({
  watch: "is-watch",
  support: "is-support",
  intensive: "is-intensive",
}[severity] || "is-support");

export const subjectLabel = (subjects = [], subjectId) => {
  if (!subjectId) return "";
  const found = subjects.find((row) => String(row.id) === String(subjectId));
  return found?.name || "";
};

export const errorText = (error, fallback) => (
  error?.response?.data?.message || fallback
);

export const revisionConflict = (error) => error?.response?.data?.code === "REVISION_CONFLICT";

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const statusTone = (status) => ({
  submitted: "is-done",
  opened: "is-open",
  sent: "is-waiting",
  draft: "is-waiting",
  preparing: "is-ready",
  issued: "is-open",
  completed: "is-done",
  cancelled: "is-muted",
  skipped: "is-muted",
  published: "is-live",
  approved: "is-ready",
  retired: "is-muted",
  superseded: "is-muted",
  closed: "is-muted",
  active: "is-open",
}[status] || "is-waiting");

export const deliveryLabelKey = (method) => ({
  email: "delivery.email",
  printed: "delivery.printed",
  assisted: "delivery.assisted",
  portal: "delivery.portal",
}[method] || "delivery.printed");
