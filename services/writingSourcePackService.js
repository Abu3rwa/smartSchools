/**
 * Source packs: teacher-supplied lesson facts, and the deterministic evidence
 * read from a draft.
 *
 * A pack is a school library item. Facts get stable ids (`f1`, `f2`, …) once,
 * when the pack is saved; a draft submitted later carries a snapshot of the
 * facts so editing the pack never changes feedback already given.
 *
 * Everything above the database reads is pure: no AI, no clock, no ORM objects.
 */
import mongoose from "mongoose";

import WritingSourcePack from "../models/WritingSourcePack.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingAssessment from "../models/WritingAssessment.js";
import WritingDraft from "../models/WritingDraft.js";
import { contentWordsOf, splitSentences } from "./writingDraftMetrics.js";

export const MAX_PACK_FACTS = 12;
/** Facts spend prompt tokens, so a big pack is ranked and capped. */
export const MAX_PROMPT_FACTS = 6;
export const MAX_FACT_CHARS = 240;
export const MAX_SOURCE_TEXT_CHARS = 12000;
export const MAX_PACK_TITLE_CHARS = 200;
const MAX_LISTED_PACKS = 100;

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message) =>
  Object.assign(new Error(message), { statusCode: 403 });

const validId = (value) => mongoose.isValidObjectId(String(value || ""));

/**
 * Lesson facts are opt-in per deployment. With the flag off, packs are not
 * listed, not attachable, and never enter a prompt.
 */
export const sourcePacksEnabled = () => process.env.WRITING_SOURCE_PACKS === "1";

/* ------------------------------------------------------------------ */
/* Saving a pack                                                       */
/* ------------------------------------------------------------------ */

/** Ids are positional and stable for the life of one version of a pack. */
const withFactIds = (texts = []) => {
  const seen = new Set();
  const facts = [];
  for (const raw of texts) {
    const text = String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      id: `f${facts.length + 1}`,
      text: text.slice(0, MAX_FACT_CHARS),
    });
    if (facts.length >= MAX_PACK_FACTS) break;
  }
  return facts;
};

/**
 * A pack is either a list of facts or a pasted lesson. A paste is split into
 * facts once, here, so every later prompt reads the same rows.
 */
export const normalizePackInput = (payload = {}) => {
  const title = String(payload.title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PACK_TITLE_CHARS);
  if (!title) throw badRequest("A lesson facts pack needs a title.");

  const sourceText = String(payload.sourceText || "")
    .trim()
    .slice(0, MAX_SOURCE_TEXT_CHARS);
  const supplied = (Array.isArray(payload.facts) ? payload.facts : [])
    .map((row) => String(row?.text ?? row ?? "").trim())
    .filter(Boolean);
  const candidates = supplied.length ? supplied : splitSentences(sourceText);
  const facts = withFactIds(candidates);
  if (!facts.length) {
    throw badRequest(
      "Add at least one lesson fact, or paste the lesson text they come from.",
    );
  }
  return {
    title,
    sourceText,
    facts,
    // The teacher is told, in the same response, when a cap dropped material.
    omittedFacts: Math.max(0, candidates.length - facts.length),
  };
};

const publicPack = (pack, extra = {}) => ({
  id: String(pack._id),
  title: pack.title,
  version: Number(pack.version) || 1,
  updatedAt: pack.updatedAt,
  facts: (pack.facts || []).map((row) => ({ id: row.id, text: row.text })),
  ...extra,
});

export const listSourcePacks = async ({ schoolId }) => {
  const packs = await WritingSourcePack.find({
    school: schoolId,
    isArchived: false,
  })
    .sort({ updatedAt: -1 })
    .limit(MAX_LISTED_PACKS)
    .select("title facts version updatedAt")
    .lean();
  return packs.map((row) => publicPack(row));
};

export const createSourcePack = async ({ schoolId, userId, payload = {} }) => {
  const input = normalizePackInput(payload);
  const pack = await WritingSourcePack.create({
    school: schoolId,
    title: input.title,
    sourceText: input.sourceText,
    facts: input.facts,
    version: 1,
    createdBy: userId,
    updatedBy: userId,
  });
  return publicPack(pack, { omittedFacts: input.omittedFacts });
};

export const updateSourcePack = async ({
  schoolId,
  packId,
  userId,
  payload = {},
}) => {
  if (!validId(packId)) throw notFound("Lesson facts pack not found.");
  const pack = await WritingSourcePack.findOne({
    school: schoolId,
    _id: packId,
    isArchived: false,
  });
  if (!pack) throw notFound("Lesson facts pack not found.");

  const hasNewFacts =
    Array.isArray(payload.facts) || String(payload.sourceText || "").trim();
  const input = normalizePackInput({
    title: String(payload.title || "").trim() || pack.title,
    facts: hasNewFacts
      ? payload.facts
      : (pack.facts || []).map((row) => row.text),
    sourceText: hasNewFacts ? payload.sourceText : pack.sourceText,
  });
  const before = JSON.stringify(
    (pack.facts || []).map((row) => ({ id: row.id, text: row.text })),
  );
  const after = JSON.stringify(input.facts);
  // A title-only edit does not change what a prompt would say, so it does not
  // bump the version a submitted draft is checked against.
  if (before !== after) pack.version = (Number(pack.version) || 1) + 1;
  pack.title = input.title;
  pack.sourceText = input.sourceText;
  pack.facts = input.facts;
  pack.updatedBy = userId;
  await pack.save();
  return publicPack(pack, { omittedFacts: input.omittedFacts });
};

/** The pack a create/update request points at, checked against this school. */
export const resolveAssignmentPack = async ({ schoolId, sourcePackId }) => {
  const raw = String(sourcePackId || "").trim();
  if (!raw) return null;
  if (!validId(raw)) throw badRequest("That lesson facts pack no longer exists.");
  const pack = await WritingSourcePack.findOne({
    school: schoolId,
    _id: raw,
    isArchived: false,
  })
    .select("_id")
    .lean();
  if (!pack) throw badRequest("That lesson facts pack no longer exists.");
  return pack._id;
};

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

const factIsUsed = (terms, words) => {
  if (!terms.length) return false;
  const hits = terms.filter((term) => words.has(term)).length;
  // Short facts need their one distinctive word; long facts need two, so a
  // single shared word cannot mark a whole fact as already used.
  return hits >= Math.min(2, terms.length);
};

const sectionId = (row) => `${row?.key}:${Number(row?.index) || 0}`;

/**
 * Which facts the draft already uses, overall and per section. A used fact is
 * never demanded again, and the prompt quotes this list instead of guessing.
 */
export const packCoverage = ({ facts = [], draft } = {}) => {
  const sections = (draft?.sections || []).map((row) => ({
    id: sectionId(row),
    words: new Set(contentWordsOf(row?.text)),
  }));
  const wholeDraft = new Set(sections.flatMap((row) => [...row.words]));
  const rows = (facts || []).map((fact) => {
    const terms = contentWordsOf(fact.text);
    const usedInSections = sections
      .filter((row) => factIsUsed(terms, row.words))
      .map((row) => row.id);
    return {
      id: fact.id,
      text: fact.text,
      terms,
      used: usedInSections.length > 0 || factIsUsed(terms, wholeDraft),
      usedInSections,
    };
  });
  return {
    facts: rows,
    usedIds: rows.filter((row) => row.used).map((row) => row.id),
    unusedIds: rows.filter((row) => !row.used).map((row) => row.id),
    bySection: Object.fromEntries(
      sections.map((section) => [
        section.id,
        rows
          .filter((row) => row.usedInSections.includes(section.id))
          .map((row) => row.id),
      ]),
    ),
  };
};

/** Facts worth offering beside one section's note, most useful first. */
export const rankedFactsForSection = ({
  coverage,
  sectionKey,
  index = 0,
  limit = 5,
} = {}) => {
  const id = `${sectionKey}:${Number(index) || 0}`;
  return (coverage?.facts || [])
    .filter((fact) => !fact.usedInSections.includes(id))
    .sort(
      (a, b) => Number(a.used) - Number(b.used) || a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((fact) => ({ id: fact.id, text: fact.text, usedInDraft: fact.used }));
};

/** The facts a prompt may carry: unused first, capped, with the rest counted. */
export const promptFacts = ({ coverage, limit = MAX_PROMPT_FACTS } = {}) => {
  const sorted = [...(coverage?.facts || [])].sort(
    (a, b) => Number(a.used) - Number(b.used) || a.id.localeCompare(b.id),
  );
  return {
    facts: sorted.slice(0, limit),
    omitted: Math.max(0, sorted.length - limit),
  };
};

export const factById = (facts = [], rawId) => {
  const id = String(rawId || "").trim().toLowerCase();
  if (!id) return null;
  return (
    (facts || []).find(
      (fact) => String(fact.id || "").toLowerCase() === id,
    ) || null
  );
};

/* ------------------------------------------------------------------ */
/* Database reads                                                      */
/* ------------------------------------------------------------------ */

/** The facts as they stand today for an assignment, or null with no pack. */
export const packSnapshotForAssignment = async ({ schoolId, assignment }) => {
  const id = assignment?.sourcePack;
  if (!id || !validId(id)) return null;
  const pack = await WritingSourcePack.findOne({
    school: schoolId,
    _id: id,
    isArchived: false,
  })
    .select("title facts version")
    .lean();
  if (!pack) return null;
  return {
    packId: String(pack._id),
    version: Number(pack.version) || 1,
    title: pack.title,
    facts: (pack.facts || []).map((row) => ({ id: row.id, text: row.text })),
  };
};

/**
 * Ranked facts for the teacher's evidence panel on one assessed section. The
 * draft's snapshot decides what "already used" means, so the list matches the
 * feedback the teacher is editing. A draft that predates the snapshot falls
 * back to the assignment's current pack.
 */
export const evidenceFactsForAssessment = async ({
  schoolId,
  assessmentId,
  sectionKey,
  index = 0,
  userId,
  isAdmin = false,
}) => {
  if (!validId(assessmentId)) throw notFound("Assessment not found.");
  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    _id: assessmentId,
  })
    .select("assignment draft")
    .lean();
  if (!assessment) throw notFound("Assessment not found.");
  const assignment = await WritingAssignment.findOne({
    school: schoolId,
    _id: assessment.assignment,
  })
    .select("assignedBy sourcePack")
    .lean();
  if (!assignment) throw notFound("Writing task not found.");
  if (!isAdmin && String(assignment.assignedBy || "") !== String(userId || "")) {
    throw forbidden(
      "Only the teacher who created this writing task or a school admin can see its lesson facts.",
    );
  }

  const draft = await WritingDraft.findOne({
    school: schoolId,
    _id: assessment.draft,
  })
    .select("sections configSnapshot")
    .lean();
  if (!draft) throw notFound("Draft not found.");

  const snapshot =
    draft.configSnapshot?.sourcePack ||
    (await packSnapshotForAssignment({ schoolId, assignment }));
  if (!snapshot?.facts?.length) {
    return {
      available: false,
      pack: null,
      facts: [],
      coverage: { usedIds: [], unusedIds: [] },
    };
  }

  const coverage = packCoverage({ facts: snapshot.facts, draft });
  return {
    available: true,
    pack: {
      id: snapshot.packId,
      title: snapshot.title,
      version: snapshot.version,
    },
    facts: rankedFactsForSection({ coverage, sectionKey, index }),
    coverage: { usedIds: coverage.usedIds, unusedIds: coverage.unusedIds },
  };
};
