import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  boundFeedItems,
  buildFeedSearchText,
  compareFeedItems,
  isTerminalProgressState,
  matchesFeedState,
  paginateFeedItems,
  parseLimitParam,
  parsePageParam,
} from "../utils/studentAssignmentFeed.js";

test("page and limit params fall back and clamp to safe bounds", () => {
  assert.equal(parsePageParam(undefined), 1);
  assert.equal(parsePageParam("0"), 1);
  assert.equal(parsePageParam("-4"), 1);
  assert.equal(parsePageParam("abc"), 1);
  assert.equal(parsePageParam("3"), 3);

  assert.equal(parseLimitParam(undefined), DEFAULT_PAGE_LIMIT);
  assert.equal(parseLimitParam("0"), DEFAULT_PAGE_LIMIT);
  assert.equal(parseLimitParam("abc"), DEFAULT_PAGE_LIMIT);
  assert.equal(parseLimitParam("7"), 7);
  assert.equal(parseLimitParam("500"), MAX_PAGE_LIMIT);
});

test("pagination reports total, page count and hasMore", () => {
  const items = Array.from({ length: 23 }, (_, index) => ({ id: `item-${index}` }));

  const first = paginateFeedItems(items, 1, 10);
  assert.equal(first.items.length, 10);
  assert.deepEqual(first.pagination, {
    page: 1,
    limit: 10,
    total: 23,
    totalPages: 3,
    hasMore: true,
  });

  const last = paginateFeedItems(items, 3, 10);
  assert.equal(last.items.length, 3);
  assert.equal(last.pagination.hasMore, false);

  const empty = paginateFeedItems([], 1, 10);
  assert.equal(empty.pagination.totalPages, 0);
  assert.equal(empty.pagination.hasMore, false);
});

test("assigned-date order is newest first with a deterministic id tiebreak", () => {
  const rows = [
    { id: "b", title: "B", assignedDate: "2026-11-01T09:00:00.000Z" },
    { id: "a", title: "A", assignedDate: "2026-11-01T09:00:00.000Z" },
    { id: "c", title: "C", assignedDate: "2026-11-03T09:00:00.000Z" },
  ];

  const sorted = [...rows].sort((a, b) => compareFeedItems(a, b, "assignedDate"));
  assert.deepEqual(sorted.map((row) => row.id), ["c", "b", "a"]);

  const reversedInput = [...rows].reverse();
  const sortedAgain = [...reversedInput].sort((a, b) => compareFeedItems(a, b, "assignedDate"));
  assert.deepEqual(sortedAgain.map((row) => row.id), ["c", "b", "a"]);
});

test("due-date order keeps items without a due date last", () => {
  const rows = [
    { id: "none", title: "No due" },
    { id: "late", title: "Later", dueDate: "2026-12-01T00:00:00.000Z" },
    { id: "soon", title: "Sooner", dueDate: "2026-11-10T00:00:00.000Z" },
  ];

  const sorted = [...rows].sort((a, b) => compareFeedItems(a, b, "dueDate"));
  assert.deepEqual(sorted.map((row) => row.id), ["soon", "late", "none"]);
});

test("state filters match completed, review, upcoming and active items", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const future = "2026-11-20T00:00:00.000Z";
  const past = "2026-11-01T00:00:00.000Z";

  assert.equal(isTerminalProgressState("graded"), true);
  assert.equal(isTerminalProgressState("in_progress"), false);

  assert.equal(matchesFeedState({ state: "graded" }, "completed", now), true);
  assert.equal(matchesFeedState({ state: "awaiting_review" }, "needs_review", now), true);
  assert.equal(matchesFeedState({ state: "in_progress", dueDate: future }, "upcoming", now), true);
  assert.equal(matchesFeedState({ state: "in_progress", dueDate: past }, "active", now), true);
  assert.equal(matchesFeedState({ state: "mastered", dueDate: future }, "upcoming", now), false);
  assert.equal(matchesFeedState({ state: "in_progress" }, "active", now), true);
  assert.equal(matchesFeedState({ state: "in_progress" }, "", now), true);
});

test("search text covers title, subject, standard code and standard name", () => {
  const text = buildFeedSearchText({
    title: "Water Cycle Quiz",
    subject: { name: "Science" },
    standard: { code: "5-ESS2-1", name: "Earth Systems" },
  });

  assert.match(text, /water cycle quiz/);
  assert.match(text, /science/);
  assert.match(text, /5-ess2-1/);
  assert.match(text, /earth systems/);
});

test("bounded recent feed keeps the newest items and ignores invalid limits", () => {
  const items = [
    { id: "old", assignedDate: "2026-10-01T00:00:00.000Z" },
    { id: "newest", assignedDate: "2026-11-07T00:00:00.000Z" },
    { id: "middle", assignedDate: "2026-10-20T00:00:00.000Z" },
  ];

  assert.deepEqual(
    boundFeedItems(items, 2).map((item) => item.id),
    ["newest", "middle"],
  );
  assert.equal(boundFeedItems(items, 10).length, 3);
  assert.equal(boundFeedItems(items, undefined).length, 3);
  assert.equal(boundFeedItems(items, "abc").length, 3);
  assert.equal(boundFeedItems(items, 0).length, 3);
  assert.equal(boundFeedItems(items, 500).length, 3);
  assert.equal(boundFeedItems([], 5).length, 0);
});
