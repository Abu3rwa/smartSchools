/**
 * F9/F11: class insight and the teacher's own review workload.
 *
 * Both answers come from rows the module already stores — the revision ledger,
 * section notes, rubric scores and teacher edits. Nothing here calls the AI, and
 * nothing ranks teachers: workload is the signed-in teacher's own numbers for
 * one task, shown so focus budgets can be tuned.
 */
import mongoose from "mongoose";

import WritingProject from "../models/WritingProject.js";
import WritingAssessment from "../models/WritingAssessment.js";
import { getAssignmentForTeacher } from "./writingAssistantService.js";

const objectId = (value) =>
  mongoose.isValidObjectId(String(value || "")) ? String(value) : null;

const round = (value) => Math.round(Number(value) || 0);

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const normalizedTask = (text) =>
  String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 160);

/** Projects for the task, one class at a time when asked. */
const loadProjects = (schoolId, assignmentId, classId) => {
  const filter = { school: schoolId, assignment: assignmentId };
  if (objectId(classId)) filter.class = classId;
  return WritingProject.find(filter)
    .select("latestAssessment revisionLedger class")
    .lean();
};

const loadLatestAssessments = async (schoolId, projects) => {
  const ids = projects
    .map((row) => objectId(row.latestAssessment))
    .filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await WritingAssessment.find({
    school: schoolId,
    _id: { $in: ids },
    kind: "feedback",
    aiStatus: "done",
  })
    .select(
      "sections scores metrics wordUseEvidence publish teacherEdits ranAt createdAt",
    )
    .lean();
  return new Map(rows.map((row) => [String(row._id), row]));
};

const topRows = (counts, limit = 3) =>
  [...counts.entries()]
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit);

/**
 * What to reteach tomorrow: the tasks students are still stuck on, the criteria
 * scoring lowest, the sections with notes but no anchored quote, and the words
 * students keep almost spelling.
 */
export const assignmentInsight = async ({
  schoolId,
  assignmentId,
  classId,
  userId,
  isAdmin = false,
}) => {
  const assignment = await getAssignmentForTeacher({
    schoolId,
    assignmentId,
    userId,
    isAdmin,
  });
  const projects = await loadProjects(schoolId, assignment._id, classId);
  const latest = await loadLatestAssessments(schoolId, projects);

  const taskCounts = new Map();
  let stalled = 0;
  for (const project of projects) {
    for (const row of project.revisionLedger || []) {
      if (row?.status === "stalled") stalled += 1;
      if (row?.status !== "open" && row?.status !== "stalled") continue;
      const label = normalizedTask(row.text);
      if (!label) continue;
      taskCounts.set(label, (taskCounts.get(label) || 0) + 1);
    }
  }

  const scoreTotals = new Map();
  const gapCounts = new Map();
  const spellingGaps = new Map();
  let assessed = 0;
  let packUse = 0;
  for (const project of projects) {
    const feedback = latest.get(String(project.latestAssessment || ""));
    if (!feedback) continue;
    assessed += 1;
    for (const row of feedback.scores || []) {
      if (row?.focusExcluded) continue;
      const maxScore = Number(row?.maxScore) || 0;
      const score = Number(row?.score);
      if (!maxScore || !Number.isFinite(score)) continue;
      const key = String(row?.key || row?.label || "");
      if (!key) continue;
      const bucket = scoreTotals.get(key) || {
        label: String(row?.label || row?.key || key),
        score: 0,
        max: 0,
        n: 0,
      };
      bucket.score += score;
      bucket.max += maxScore;
      bucket.n += 1;
      scoreTotals.set(key, bucket);
    }
    let citesFact = false;
    for (const section of feedback.sections || []) {
      const hasNotes =
        (section?.improvements || []).length ||
        (section?.strengths || []).length ||
        String(section?.nextStep || "").trim();
      if (hasNotes && !String(section?.evidence || "").trim()) {
        const label = String(section?.label || section?.key || "");
        if (label) gapCounts.set(label, (gapCounts.get(label) || 0) + 1);
      }
      if (section?.evidenceFact?.id || section?.evidenceFact?.text) {
        citesFact = true;
      }
    }
    if (citesFact) packUse += 1;
    for (const row of feedback.wordUseEvidence?.spelling || []) {
      if (!(row?.nearMisses || []).length) continue;
      const word = String(row?.word || "").trim();
      if (!word) continue;
      spellingGaps.set(word, (spellingGaps.get(word) || 0) + 1);
    }
  }

  const weakScores = [...scoreTotals.values()]
    .map((row) => ({
      label: row.label,
      percent: round((row.score / row.max) * 100),
      n: row.n,
    }))
    .sort((a, b) => a.percent - b.percent || b.n - a.n)
    .slice(0, 3);

  return {
    students: projects.length,
    assessed,
    stalled,
    commonTasks: topRows(taskCounts),
    weakScores,
    evidenceGaps: topRows(gapCounts),
    spellingGaps: topRows(spellingGaps),
    packUse,
  };
};

const reviewSecondsFor = (row) => {
  const from = row.ranAt || row.createdAt;
  const to = row.publish?.publishedAt;
  if (!from || !to) return null;
  const seconds = Math.round((new Date(to) - new Date(from)) / 1000);
  return seconds >= 0 ? seconds : null;
};

/**
 * The teacher's own numbers for one task: how many rounds they edited, how many
 * notes changed, and how long publication took after the AI finished. No
 * teacher names leave this function.
 */
export const assignmentWorkload = async ({
  schoolId,
  assignmentId,
  userId,
  isAdmin = false,
}) => {
  const assignment = await getAssignmentForTeacher({
    schoolId,
    assignmentId,
    userId,
    isAdmin,
  });
  const rows = await WritingAssessment.find({
    school: schoolId,
    assignment: assignment._id,
    kind: "feedback",
    aiStatus: "done",
  })
    .select("teacherEdits publish ranAt createdAt")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  let edited = 0;
  let published = 0;
  let notesEdited = 0;
  const durations = [];
  const recent = [];
  for (const row of rows) {
    const notes = (row.teacherEdits || []).reduce(
      (sum, edit) => sum + (edit.changedPaths || []).length,
      0,
    );
    if ((row.teacherEdits || []).length) edited += 1;
    notesEdited += notes;
    const isPublished = row.publish?.state === "published";
    if (isPublished) published += 1;
    const seconds = reviewSecondsFor(row);
    if (isPublished && seconds !== null) durations.push(seconds);
    if (recent.length < 20) {
      recent.push({
        notesEdited: notes,
        published: isPublished,
        reviewSeconds: seconds,
        publishedAt: isPublished ? row.publish?.publishedAt : null,
      });
    }
  }

  const average = durations.length
    ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;

  return {
    assessments: rows.length,
    published,
    edited,
    editRate: rows.length ? round((edited / rows.length) * 100) : 0,
    notesEdited,
    reviewSeconds: {
      average,
      median: median(durations),
    },
    recent,
  };
};
