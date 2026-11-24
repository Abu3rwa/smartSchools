export const PODIUM_SIZE = 3;

export const buildBoardParams = ({ scope, period, subjectKey, classId, limit }) => {
  const params = { scope, window: period };
  if (scope === "class" && classId) params.classId = classId;
  if (subjectKey !== "all") params.subjectId = subjectKey;
  if (limit) params.limit = limit;
  return params;
};

// What the student needs to pass the row directly above them. The row above
// can be missing when the viewer is outside the returned slice.
export const climbStatus = (rows = [], myRow) => {
  if (!myRow) return null;
  if (myRow.rank === 1) return { kind: "top" };
  const above = rows.find((row) => row.rank === myRow.rank - 1);
  if (!above) return { kind: "none" };
  const gap = Math.max(0, (above.xp || 0) - (myRow.xp || 0));
  return {
    kind: gap > 0 ? "gap" : "tie",
    gap,
    aboveName: above.displayName
  };
};

export const splitPodium = (rows = []) => {
  const podium = rows.filter((row) => row.xp > 0).slice(0, PODIUM_SIZE);
  const podiumIds = new Set(podium.map((row) => String(row.studentId)));
  return {
    podium,
    rest: rows.filter((row) => !podiumIds.has(String(row.studentId)))
  };
};
