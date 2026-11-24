import test from "node:test";
import assert from "node:assert/strict";

import { buildBoardParams, climbStatus, splitPodium } from "./skillpathBoard.js";

test("buildBoardParams sends the class id only in class scope", () => {
  assert.deepEqual(
    buildBoardParams({ scope: "class", period: "week", subjectKey: "all", classId: "abc" }),
    { scope: "class", window: "week", classId: "abc" }
  );
  assert.deepEqual(
    buildBoardParams({ scope: "school", period: "month", subjectKey: "all", classId: "abc" }),
    { scope: "school", window: "month" }
  );
});

test("buildBoardParams passes the subject filter except for all subjects", () => {
  assert.equal(buildBoardParams({ scope: "school", period: "all", subjectKey: "s1" }).subjectId, "s1");
  assert.equal("subjectId" in buildBoardParams({ scope: "school", period: "all", subjectKey: "all" }), false);
});

test("buildBoardParams includes the staff row limit only when given", () => {
  assert.equal(buildBoardParams({ scope: "class", period: "week", subjectKey: "all", classId: "c1", limit: 100 }).limit, 100);
  assert.equal("limit" in buildBoardParams({ scope: "class", period: "week", subjectKey: "all", classId: "c1" }), false);
});

test("splitPodium keeps the top three scorers and never puts zero XP on the podium", () => {
  const rows = [
    { studentId: "a", xp: 40 },
    { studentId: "b", xp: 30 },
    { studentId: "c", xp: 20 },
    { studentId: "d", xp: 0 }
  ];
  const { podium, rest } = splitPodium(rows);
  assert.deepEqual(podium.map((row) => row.studentId), ["a", "b", "c"]);
  assert.deepEqual(rest.map((row) => row.studentId), ["d"]);
});

test("splitPodium removes podium students from the list even with tied XP", () => {
  const rows = [
    { studentId: "a", xp: 10 },
    { studentId: "b", xp: 10 },
    { studentId: "c", xp: 10 },
    { studentId: "d", xp: 10 }
  ];
  const { podium, rest } = splitPodium(rows);
  assert.equal(podium.length, 3);
  assert.deepEqual(rest.map((row) => row.studentId), ["d"]);
});

test("splitPodium handles an empty board", () => {
  assert.deepEqual(splitPodium([]), { podium: [], rest: [] });
  assert.deepEqual(splitPodium(), { podium: [], rest: [] });
});

test("climbStatus reports the gap to the row above", () => {
  const rows = [
    { rank: 1, displayName: "Omar A.", xp: 400 },
    { rank: 2, displayName: "Sara M.", xp: 365 }
  ];
  assert.deepEqual(climbStatus(rows, { rank: 2, xp: 365 }), {
    kind: "gap",
    gap: 35,
    aboveName: "Omar A."
  });
});

test("climbStatus reports a tie at the same XP", () => {
  const rows = [
    { rank: 4, displayName: "Yousef A.", xp: 400 },
    { rank: 5, displayName: "Sara M.", xp: 400 }
  ];
  assert.equal(climbStatus(rows, { rank: 5, xp: 400 }).kind, "tie");
});

test("climbStatus handles the leader and unknown neighbours", () => {
  assert.deepEqual(climbStatus([], { rank: 1, xp: 400 }), { kind: "top" });
  assert.deepEqual(climbStatus([{ rank: 9, xp: 10 }], { rank: 12, xp: 5 }), { kind: "none" });
  assert.equal(climbStatus([], null), null);
});
