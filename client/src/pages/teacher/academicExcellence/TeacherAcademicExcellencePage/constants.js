export const TABS = [
  { key: "overview",      label: "Class Overview" },
  { key: "students",      label: "Student Monitor" },
  { key: "tasks",         label: "Task Queue" },
  { key: "exclusions",    label: "Controls & Exclusions" },
  { key: "notifications", label: "Notification Settings" },
];

export const PAGE_SIZE = 10;

export const labelFromMastery = (value) =>
  String(value || "")
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
