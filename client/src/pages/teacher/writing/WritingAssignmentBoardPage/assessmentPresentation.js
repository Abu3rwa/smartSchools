/** Presentation helpers for the teacher assessment drawer. No React, no requests. */

export const splitLines = (value) => String(value || "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

export const joinLines = (value) => (Array.isArray(value) ? value.join("\n") : "");

/** The newest assessment of one kind for a draft. History arrives newest first. */
export const latestForDraft = (assessments, draftId, kind) => (
  (assessments || []).find(
    (row) => String(row.draft) === String(draftId) && row.kind === kind,
  ) || null
);

export const publishedFeedbackForEmail = (assessments = []) => {
  const drafts = new Set();
  return assessments.filter((row) => {
    if (row.kind !== "feedback" || row.aiStatus !== "done" || row.publish?.state !== "published") return false;
    const draft = String(row.draft);
    if (drafts.has(draft)) return false;
    drafts.add(draft);
    return true;
  });
};

export const formFromAssessment = (assessment) => {
  if (!assessment) return null;
  const overall = assessment.overall || {};
  const priorities = Array.isArray(overall.nextPriorities) ? overall.nextPriorities : [];
  const comparison = assessment.comparison || {};
  return {
    summary: overall.summary || "",
    priorities: [priorities[0] || "", priorities[1] || "", priorities[2] || ""],
    organisation: overall.organisation || "",
    centralIdea: overall.centralIdea || "",
    flow: overall.flow || "",
    repetition: overall.repetition || "",
    requirements: overall.requirements || "",
    sections: (assessment.sections || []).map((row) => ({
      key: row.key,
      index: Number(row.index) || 0,
      label: row.label || row.key,
      strengthsText: joinLines(row.strengths),
      improvementsText: joinLines(row.improvements),
      evidence: row.evidence || "",
      why: row.why || "",
      nextStep: row.nextStep || "",
      score: Number(row.score) || 0,
      maxScore: Number(row.maxScore) || 0,
    })),
    scores: (assessment.scores || []).map((row) => ({
      key: row.key,
      label: row.label || row.key,
      score: Number(row.score) || 0,
      maxScore: Number(row.maxScore) || 0,
      explanation: row.explanation || "",
    })),
    path: assessment.recommendation?.path === "notebook" ? "notebook" : "revise",
    reason: assessment.recommendation?.reason || "",
    comparison: {
      encouragement: comparison.encouragement || "",
      improvedText: joinLines(comparison.criteriaImproved),
      unresolvedText: joinLines(comparison.criteriaUnresolved),
      newIssuesText: joinLines(comparison.newIssues),
      changedBySection: (comparison.changedBySection || []).map((row) => ({
        key: row.key,
        index: Number(row.index) || 0,
        label: row.label || row.key,
        summary: row.summary || "",
        meaningful: row.meaningful === true,
        kind: row.kind || "changed",
      })),
      feedbackApplied: (comparison.feedbackApplied || []).map((row) => ({
        key: row.key,
        index: Number(row.index) || 0,
        note: row.note || "",
        applied: row.applied === true,
      })),
      wordDelta: Number(comparison.wordDelta) || 0,
    },
    note: "",
  };
};

export const payloadFromForm = (form) => {
  if (!form) return {};
  return {
    note: form.note || "",
    overall: {
      summary: form.summary,
      organisation: form.organisation,
      centralIdea: form.centralIdea,
      flow: form.flow,
      repetition: form.repetition,
      requirements: form.requirements,
      nextPriorities: form.priorities.map((row) => String(row || "").trim()).filter(Boolean),
    },
    sections: (form.sections || []).map((row) => ({
      key: row.key,
      index: row.index,
      strengths: splitLines(row.strengthsText),
      improvements: splitLines(row.improvementsText),
      evidence: row.evidence,
      why: row.why,
      nextStep: row.nextStep,
      score: Number(row.score) || 0,
    })),
    scores: (form.scores || []).map((row) => ({
      key: row.key,
      score: Number(row.score) || 0,
      explanation: row.explanation,
    })),
    recommendation: {
      path: form.path,
      reason: form.reason,
    },
    comparison: {
      encouragement: form.comparison?.encouragement || "",
      criteriaImproved: splitLines(form.comparison?.improvedText),
      criteriaUnresolved: splitLines(form.comparison?.unresolvedText),
      newIssues: splitLines(form.comparison?.newIssuesText),
      changedBySection: (form.comparison?.changedBySection || []).map((row) => ({
        key: row.key,
        index: row.index,
        summary: row.summary,
      })),
      feedbackApplied: (form.comparison?.feedbackApplied || []).map((row) => ({
        key: row.key,
        index: row.index,
        applied: row.applied === true,
      })),
    },
  };
};
