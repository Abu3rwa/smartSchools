import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterAndSortAssignments,
  getAssignmentDuePresentation,
  getAssignmentMetrics,
} from "./assignmentListPresentation.js";

const t = (key, values = {}) => `${key}:${values.count ?? values.date ?? ""}`;

const daysAgo = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

test("completed published assignment is not presented as overdue", () => {
  const assignment = {
    status: "published",
    dueDate: daysAgo(4),
    progress: { studentCount: 3, gradedCount: 3 },
  };

  const due = getAssignmentDuePresentation(assignment, { language: "en", t });

  assert.notEqual(due.tone, "overdue");
  assert.notEqual(due.main, "assignments:due.overdueByDays:4");
});

test("published assignment with pending students remains overdue", () => {
  const assignment = {
    status: "published",
    dueDate: daysAgo(4),
    progress: { studentCount: 3, gradedCount: 2 },
  };

  const due = getAssignmentDuePresentation(assignment, { language: "en", t });

  assert.equal(due.main, "assignments:due.overdueByDays:4");
  assert.equal(due.tone, "overdue");
});

test("overdue summary excludes completed assignments", () => {
  const overdue = getAssignmentMetrics([
    {
      status: "published",
      dueDate: daysAgo(4),
      progress: { studentCount: 3, gradedCount: 3 },
    },
    {
      status: "published",
      dueDate: daysAgo(4),
      progress: { studentCount: 3, gradedCount: 2 },
    },
  ]).overdue;

  assert.equal(overdue, 1);
});

const monthRows = [
  { id: "november", dueDate: new Date(2026, 10, 10) },
  { id: "december", dueDate: new Date(2026, 11, 2) },
  { id: "undated", assignedDate: new Date(2026, 10, 1) },
];

const idsFor = (month) =>
  filterAndSortAssignments({ assignments: monthRows, month }).map(
    (assignment) => assignment.id,
  );

test("month filter keeps rows due in that month", () => {
  assert.deepEqual([...idsFor(12)].sort(), ["december"]);
});

test("month filter falls back to the assigned date when there is no due date", () => {
  assert.deepEqual([...idsFor(11)].sort(), ["november", "undated"]);
});

test("no month selection keeps every assignment", () => {
  assert.equal(idsFor("").length, monthRows.length);
});
