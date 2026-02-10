import ClassModel from "../models/Class.js";
import NewsletterSection from "../models/NewsletterSection.js";
import Subject from "../models/Subject.js";

export async function getExpectedSubjectIdsForClass(classId) {
  const cls = await ClassModel.findById(classId).select("subjects.subject").lean();
  const ids = (cls?.subjects || [])
    .map((s) => s?.subject?.toString?.())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

export async function getExpectedSubjectsForClass(classId) {
  const ids = await getExpectedSubjectIdsForClass(classId);
  if (ids.length === 0) return [];
  const subjects = await Subject.find({ _id: { $in: ids } })
    .select("name code")
    .lean();
  // Preserve class order if possible
  const byId = new Map(subjects.map((s) => [s._id.toString(), s]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function getSectionsForIssue(issueId) {
  return NewsletterSection.find({ issue: issueId })
    .populate("subject", "name code")
    .populate("teacherUser", "firstName lastName email")
    .sort({ updatedAt: -1 })
    .lean();
}

export function computeIssueReadiness({ expectedSubjectIds, sections, excludedSubjectIds }) {
  const expected = new Set((expectedSubjectIds || []).map((x) => x.toString()));
  const excluded = new Set((excludedSubjectIds || []).map((x) => x.toString()));

  const approved = new Set(
    (sections || [])
      .filter((s) => s.status === "approved")
      .map((s) => s.subject?._id?.toString?.() || s.subject?.toString?.())
      .filter(Boolean)
  );

  const missing = [];
  for (const id of expected) {
    if (excluded.has(id)) continue;
    if (approved.has(id)) continue;
    missing.push(id);
  }

  return {
    expectedCount: expected.size,
    approvedCount: approved.size,
    excludedCount: excluded.size,
    missingSubjectIds: missing,
    isSendEnabled: missing.length === 0,
  };
}

