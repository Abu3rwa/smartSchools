// Pure helpers for the student assignment feed. Kept separate from the
// controller so pagination, filtering and ordering stay testable without a
// database.

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 50;

export const TERMINAL_PROGRESS_STATES = new Set([
  "completed",
  "mastered",
  "graded",
  "released",
  "submitted",
  "late",
  "excused",
]);

const REVIEW_PROGRESS_STATES = new Set([
  "awaiting_review",
  "needs_review",
  "sync_failed",
  "awaiting_release",
]);

export const parsePageParam = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
};

export const parseLimitParam = (value, fallback = DEFAULT_PAGE_LIMIT) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_PAGE_LIMIT);
};

export const isTerminalProgressState = (state) =>
  TERMINAL_PROGRESS_STATES.has(String(state || ""));

const timeOf = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export const matchesFeedState = (
  { state, dueDate },
  filter,
  now = new Date(),
) => {
  if (!filter) return true;
  const normalized = String(filter).toLowerCase();
  if (normalized === "completed") return isTerminalProgressState(state);
  if (normalized === "needs_review")
    return REVIEW_PROGRESS_STATES.has(String(state || ""));
  if (normalized === "upcoming") {
    if (isTerminalProgressState(state)) return false;
    const due = timeOf(dueDate);
    return due !== null && due > now.getTime();
  }
  if (normalized === "active") {
    if (isTerminalProgressState(state)) return false;
    const due = timeOf(dueDate);
    return due === null || due <= now.getTime();
  }
  return true;
};

export const buildFeedSearchText = (item = {}) =>
  [
    item.title,
    item.subject?.name,
    item.standard?.code,
    item.standard?.name,
    item.assignmentType?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const compareFeedItems = (a, b, sort = "assignedDate") => {
  if (sort === "title") {
    const byTitle = String(a.title || "").localeCompare(
      String(b.title || ""),
      "en",
      { sensitivity: "base" },
    );
    if (byTitle !== 0) return byTitle;
  } else if (sort === "dueDate") {
    const dueA = timeOf(a.dueDate);
    const dueB = timeOf(b.dueDate);
    if (dueA !== dueB) {
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA - dueB;
    }
  } else {
    const assignedA = timeOf(a.assignedDate);
    const assignedB = timeOf(b.assignedDate);
    if (assignedA !== assignedB) {
      if (assignedA === null) return 1;
      if (assignedB === null) return -1;
      return assignedB - assignedA;
    }
    const dueA = timeOf(a.dueDate);
    const dueB = timeOf(b.dueDate);
    if (dueA !== dueB) {
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA - dueB;
    }
  }

  // Deterministic tiebreaker so page boundaries never duplicate or skip a row.
  return String(b.id || "").localeCompare(String(a.id || ""));
};

// Used by the dashboard's "recent assignments" request so it never pulls the
// whole year. Newest assigned first, with the same deterministic tiebreak.
export const boundFeedItems = (items = [], limit) => {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed >= items.length) {
    return items;
  }
  return [...items]
    .sort((a, b) => compareFeedItems(a, b, "assignedDate"))
    .slice(0, Math.min(parsed, MAX_PAGE_LIMIT));
};

export const paginateFeedItems = (items = [], page = 1, limit = DEFAULT_PAGE_LIMIT) => {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page * limit < total,
    },
  };
};
