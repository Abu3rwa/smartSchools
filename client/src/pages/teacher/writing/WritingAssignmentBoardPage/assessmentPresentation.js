/** Presentation helpers for the teacher assessment drawer. No React, no requests. */
import {
  draftParagraphs,
  evidenceQuoteFound,
  unfilledTokens,
} from "../../../../utils/writingPublishCheck.js";
import {
  canonicalSectionText,
  validateCorrection,
} from "../../../../utils/writingMechanics.js";

export const splitLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const joinLines = (value) =>
  Array.isArray(value) ? value.join("\n") : "";

/**
 * One stored correction as the editor holds it. Every persisted field survives;
 * legacy two-field pairs keep an empty category and no anchor, and are never
 * silently upgraded just because a panel was opened.
 */
export const mechanicsFormRows = (rows = []) =>
  (rows || []).map((row) => ({
    category: row?.category || "",
    original: row?.original || "",
    correction: String(row?.correction ?? ""),
    explanation: row?.explanation || "",
    anchor:
      Number.isInteger(row?.anchor?.start) && Number.isInteger(row?.anchor?.end)
        ? { start: row.anchor.start, end: row.anchor.end }
        : null,
    // A stored empty correction is an explicit deletion; a fresh row is not.
    deletion: String(row?.correction ?? "") === "",
  }));

/** One form row back to the stored shape; the deletion flag never persists. */
export const mechanicPayload = (row) => {
  const correction = row?.deletion ? "" : String(row?.correction ?? "");
  if (!row?.category) return { original: row?.original || "", correction };
  return {
    category: row.category,
    original: row.original || "",
    correction,
    explanation: row.explanation || "",
    ...(row.anchor ? { anchor: { start: row.anchor.start, end: row.anchor.end } } : {}),
  };
};

/** The newest assessment of one kind for a draft. History arrives newest first. */
export const latestForDraft = (assessments, draftId, kind) =>
  (assessments || []).find(
    (row) => String(row.draft) === String(draftId) && row.kind === kind,
  ) || null;

export const publishedFeedbackForEmail = (assessments = []) => {
  const drafts = new Set();
  return assessments.filter((row) => {
    if (
      row.kind !== "feedback" ||
      row.aiStatus !== "done" ||
      row.publish?.state !== "published"
    )
      return false;
    const draft = String(row.draft);
    if (drafts.has(draft)) return false;
    drafts.add(draft);
    return true;
  });
};

/** Same window as the server's stale-run reclaim: past this the run is dead. */
export const STALE_ASSESSMENT_MS = 5 * 60 * 1000;

export const isStaleAssessment = (assessment, now = Date.now()) => {
  if (!assessment || !["pending", "running"].includes(assessment.aiStatus))
    return false;
  const stamp = assessment.updatedAt || assessment.createdAt;
  if (!stamp) return false;
  return new Date(stamp).getTime() < now - STALE_ASSESSMENT_MS;
};

/**
 * Which block the panel shows for one draft: `none` (never assessed), `running`,
 * `stalled`, `failed`, or `done`. The four states render differently so a run
 * in flight can never look like a missing one.
 */
export const reviewStateOf = (assessment, now = Date.now()) => {
  if (!assessment) return "none";
  if (assessment.aiStatus === "done") return "done";
  if (assessment.aiStatus === "failed") return "failed";
  // A claimed run the server has not finished yet. An unknown status is treated
  // as in flight rather than spent, so the panel never offers a second run.
  return isStaleAssessment(assessment, now) ? "stalled" : "running";
};

/** G1: the default evidence list stops at eight rows; the rest is one click away. */
export const WORD_USE_DEFAULT_SHOWN = 8;

const wordUseRows = (assessment) => {
  const evidence = assessment.wordUseEvidence || {};
  const rows = [];
  for (const source of ["spelling", "vocabulary"]) {
    for (const row of evidence[source] || []) {
      rows.push({
        source,
        word: row.word || "",
        used: row.used === true,
        count: Number(row.count) || 0,
        nearMisses: row.nearMisses || [],
        decision: row.teacherDecision || "",
      });
    }
  }
  return rows;
};

/** Rows worth a decision (used or a near miss) vs. words simply never used. */
export const splitWordUse = (rows = []) => {
  const active = [];
  const unused = [];
  for (const row of rows || []) {
    if (row.used || (row.nearMisses || []).length) active.push(row);
    else unused.push(row);
  }
  return { active, unused };
};

export const formFromAssessment = (assessment) => {
  if (!assessment) return null;
  const overall = assessment.overall || {};
  const priorities = Array.isArray(overall.nextPriorities)
    ? overall.nextPriorities
    : [];
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
      mechanics: mechanicsFormRows(row.mechanics),
      intervention: row.intervention?.previous
        ? {
            previous: row.intervention.previous,
            kind: row.intervention.kind || "",
            repeat: row.intervention.repeat === true,
          }
        : null,
      score: Number(row.score) || 0,
      maxScore: Number(row.maxScore) || 0,
    })),
    scores: (assessment.scores || []).map((row) => ({
      key: row.key,
      label: row.label || row.key,
      score: Number(row.score) || 0,
      maxScore: Number(row.maxScore) || 0,
      explanation: row.explanation || "",
      evidence: row.evidence || "",
    })),
    path:
      assessment.recommendation?.path === "notebook" ? "notebook" : "revise",
    reason: assessment.recommendation?.reason || "",
    spellingTargets: (assessment.spellingTargets || []).map((row) => ({
      word: row.word || "",
      grade: row.grade || "",
      week: Number(row.week) || 0,
      // G4: the server says why this word; the chip shows it on hover.
      reason: row.reason || "",
    })),
    spellingWins: (assessment.spellingWins || [])
      .map((row) => row.word)
      .filter(Boolean),
    wordUse: wordUseRows(assessment),
    // Everything the child does not see: notes dropped by the focus budget and
    // priorities over the cap. Read-only here (A3, A7).
    teacherOnly: {
      notes: (assessment.teacherOnly?.notes || []).map((row) => ({
        label: row.label || row.key,
        text: row.text || "",
      })),
      priorities: (assessment.teacherOnly?.priorities || []).filter(Boolean),
    },
    focus: assessment.focus
      ? {
          tier: assessment.focus.tier || "",
          totalImprovements: Number(assessment.focus.totalImprovements) || 0,
          priorities: Number(assessment.focus.priorities) || 0,
          // Slot ids ("body:0") of the sections the child gets a note on.
          childSections: (assessment.focus.childSections || []).map(String),
        }
      : null,
    comparison: {
      encouragement: comparison.encouragement || "",
      improvedText: joinLines(comparison.criteriaImproved),
      // D3: the computed facts behind each "got stronger" claim.
      improvedFacts: (comparison.improvedFacts || []).map((row) => ({
        kind: row.kind || "",
        label: row.label || "",
        detail: row.detail || "",
      })),
      unresolvedText: joinLines(comparison.criteriaUnresolved),
      newIssuesText: joinLines(comparison.newIssues),
      // D4: evidence for each new issue; `verified` is a server quote check.
      newIssueChecks: (comparison.newIssueChecks || []).map((row) => ({
        text: row.text || "",
        evidence: row.evidence || "",
        verified: row.verified === true,
      })),
      // D6: the computed draft-to-draft story, read-only.
      changes: (comparison.changes || []).map((row) => ({
        kind: row.kind || "changed",
        key: row.key || "",
        index: Number(row.index) || 0,
        label: row.label || row.key || "",
        wordDelta: Number(row.wordDelta) || 0,
      })),
      mostlyReworded: comparison.mostlyReworded === true,
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
      taskResults: (comparison.taskResults || []).map((row) => ({
        id: row.id,
        text:
          row.text ||
          (assessment.tasks || []).find((task) => task.id === row.id)?.text ||
          row.id,
        note: row.note || "",
        applied: row.applied === true,
        // D5: under revision V2 the model's claim and the server's quote check
        // are kept apart, so a checked box never hides an unverified claim.
        claimed: row.claimed === true,
        verified: row.verified === true,
        quote: row.quote || "",
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
      nextPriorities: form.priorities
        .map((row) => String(row || "").trim())
        .filter(Boolean),
    },
    sections: (form.sections || []).map((row) => ({
      key: row.key,
      index: row.index,
      strengths: splitLines(row.strengthsText),
      improvements: splitLines(row.improvementsText),
      evidence: row.evidence,
      why: row.why,
      nextStep: row.nextStep,
      mechanics: (row.mechanics || [])
        .filter((item) => item.original)
        .map(mechanicPayload),
      score: Number(row.score) || 0,
    })),
    scores: (form.scores || []).map((row) => ({
      key: row.key,
      score: Number(row.score) || 0,
      explanation: row.explanation,
      evidence: row.evidence,
    })),
    recommendation: {
      path: form.path,
      reason: form.reason,
    },
    // The server keeps only the words it already approved; this list can shrink.
    spellingTargets: (form.spellingTargets || []).map((row) => ({
      word: row.word,
    })),
    wordUse: (form.wordUse || []).map((row) => ({
      source: row.source,
      word: row.word,
      decision: row.decision,
    })),
    comparison: {
      encouragement: form.comparison?.encouragement || "",
      criteriaImproved: splitLines(form.comparison?.improvedText),
      criteriaUnresolved: splitLines(form.comparison?.unresolvedText),
      newIssues: splitLines(form.comparison?.newIssuesText),
      changedBySection: (form.comparison?.changedBySection || []).map(
        (row) => ({
          key: row.key,
          index: row.index,
          summary: row.summary,
        }),
      ),
      feedbackApplied: (form.comparison?.feedbackApplied || []).map((row) => ({
        key: row.key,
        index: row.index,
        applied: row.applied === true,
      })),
      taskResults: (form.comparison?.taskResults || []).map((row) => ({
        id: row.id,
        applied: row.applied === true,
      })),
    },
  };
};

/**
 * F6: the one block shown before publishing. Lists what the child will receive
 * and everything that would stop the publish. The token and anchor rules match
 * `publishBlockers` on the server, so the teacher sees a blocker here instead
 * of meeting an unexplained refusal.
 */
export const publishCheck = ({
  form,
  assessment,
  latestDraft,
  email = { student: false, parents: false },
} = {}) => {
  const payload = payloadFromForm(form);
  // The teacher's private note never reaches the child, so it is not scanned.
  const scan = { ...payload };
  delete scan.note;

  const blockers = [];
  const stale =
    Boolean(assessment?.draft) &&
    String(assessment.draft) !== String(latestDraft?._id || "");
  if (stale) blockers.push({ kind: "stale", items: [] });
  const tokens = unfilledTokens(scan);
  if (tokens.length) blockers.push({ kind: "tokens", items: tokens });

  const paragraphs = draftParagraphs(latestDraft);
  const sections = form?.sections || [];
  const anchors =
    assessment?.kind === "comparison"
      ? []
      : sections
          .filter((row) => String(row?.evidence || "").trim())
          .filter((row) => !evidenceQuoteFound(paragraphs, row.evidence))
          .map((row) => row.label || row.key || "");
  if (anchors.length) blockers.push({ kind: "anchors", items: anchors });

  const draftSections = latestDraft?.sections || [];
  const mechanics =
    assessment?.kind === "comparison"
      ? []
      : sections
          .filter((row) =>
            (row?.mechanics || []).some((item) => {
              const stored = mechanicPayload(item);
              if (!stored.category) return false;
              const source = draftSections.find(
                (part) =>
                  part?.key === row.key &&
                  Number(part?.index) === Number(row.index),
              );
              if (!source) return false;
              return !validateCorrection(
                canonicalSectionText(source.text),
                stored,
              ).ok;
            }),
          )
          .map((row) => row.label || row.key || "");
  if (mechanics.length) blockers.push({ kind: "mechanics", items: mechanics });

  const notes = sections.reduce(
    (total, row) =>
      total +
      splitLines(row.strengthsText).length +
      splitLines(row.improvementsText).length,
    0,
  );
  const parts = sections.filter(
    (row) =>
      splitLines(row.strengthsText).length ||
      splitLines(row.improvementsText).length,
  ).length;

  return {
    blocked: blockers.length > 0,
    blockers,
    stale,
    parts,
    notes,
    path: form?.path === "notebook" ? "notebook" : "revise",
    targets: (form?.spellingTargets || []).filter((row) =>
      String(row?.word || "").trim(),
    ).length,
    email: {
      student: email.student === true,
      parents: email.parents === true,
    },
  };
};

