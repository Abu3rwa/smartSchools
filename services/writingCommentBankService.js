/**
 * The teacher's comment bank (F2): notes they saved for reuse, ranked for the
 * section they are editing. No AI runs here and nothing is billed.
 *
 * Notes are private to the teacher who saved them unless the note is shared
 * with the school (Q10). A note keeps the section and criteria it was written
 * for, so suggestions put the closest notes first; reuse count breaks ties.
 */
import mongoose from "mongoose";

import WritingCommentBank, {
  COMMENT_SKILLS,
} from "../models/WritingCommentBank.js";
import { inspectGeneratedText } from "./aiPromptSafety.js";

export { COMMENT_SKILLS };
/** A bank note must fit every note field it can be inserted into. */
export const MAX_BANK_NOTE_CHARS = 260;
export const MAX_BANK_SUGGESTIONS = 30;
const MAX_BANK_SCAN = 400;
const MAX_SECTION_KEYS = 4;
const MAX_CRITERION_KEYS = 6;

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) =>
  Object.assign(new Error(message), { statusCode: 404 });

const validId = (value) => mongoose.isValidObjectId(String(value || ""));

/**
 * A note is child-facing prose, so it passes the same content check as an
 * edited assessment field — but a note the teacher typed is refused, never
 * quietly reworded. The message names the offending terms so it can be fixed
 * in one step.
 */
const bankText = (value) => {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BANK_NOTE_CHARS);
  if (!raw) throw badRequest("Write the note before saving it to your bank.");
  const { problems } = inspectGeneratedText(raw, { allowToken: true });
  if (!problems.length) return raw;
  const terms = problems
    .map((problem) => problem.split(":").slice(1).join(":"))
    .filter(Boolean);
  throw badRequest(
    terms.length
      ? `This wording cannot be sent to a child. Please remove: ${terms.join(", ")}.`
      : "This wording cannot be sent to a child. Please reword it and save again.",
  );
};

const cleanKeys = (value, max) => {
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set();
  for (const entry of list) {
    const key = String(entry || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (key) seen.add(key);
    if (seen.size >= max) break;
  }
  return [...seen];
};

const sectionKeysOf = (payload = {}) =>
  cleanKeys(payload.sectionKeys ?? payload.sectionKey, MAX_SECTION_KEYS).map(
    (key) => key.toLowerCase(),
  );

const noteShape = (note, userId) => ({
  id: String(note._id),
  text: note.text,
  skill: note.skill,
  sectionKeys: note.sectionKeys || [],
  criterionKeys: note.criterionKeys || [],
  usageCount: Number(note.usageCount) || 0,
  sharedWithSchool: Boolean(note.sharedWithSchool),
  mine: String(note.teacher) === String(userId),
  lastUsedAt: note.lastUsedAt || null,
});

const normalise = (value) => String(value || "").trim().toLowerCase();
const recency = (note) => new Date(note.lastUsedAt || note.createdAt || 0).getTime() || 0;

/** A note written for this section beats one that only shares its criteria. */
const suggestionScore = (note, { sectionKey, criteria } = {}) => {
  let score = 0;
  const section = normalise(sectionKey);
  if (
    section &&
    (note.sectionKeys || []).some((key) => normalise(key) === section)
  )
    score += 2;
  const wanted = new Set((criteria || []).map(normalise).filter(Boolean));
  if (
    wanted.size &&
    (note.criterionKeys || []).some((key) => wanted.has(normalise(key)))
  )
    score += 1;
  return score;
};

/**
 * Suggestions for the section on screen: its own notes first, then notes that
 * match one of its criteria, then the notes the teacher reuses most. The sort
 * is stable, so equal notes keep the newest-first order they arrived in.
 */
export const rankBankNotes = (notes = [], context = {}) =>
  [...(notes || [])]
    .map((note) => ({ note, score: suggestionScore(note, context) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (Number(b.note.usageCount) || 0) - (Number(a.note.usageCount) || 0) ||
        recency(b.note) - recency(a.note),
    )
    .map((entry) => entry.note);

export const listComments = async ({
  schoolId,
  userId,
  sectionKey = "",
  criteria = [],
  skill = "",
} = {}) => {
  // Only a teacher's own notes and the ones explicitly shared with the school.
  const query = {
    school: schoolId,
    $or: [{ teacher: userId }, { sharedWithSchool: true }],
  };
  if (COMMENT_SKILLS.includes(skill)) query.skill = skill;
  const rows = await WritingCommentBank.find(query)
    .sort({ usageCount: -1, lastUsedAt: -1, updatedAt: -1 })
    .limit(MAX_BANK_SCAN)
    .lean();
  return {
    notes: rankBankNotes(rows, { sectionKey, criteria })
      .slice(0, MAX_BANK_SUGGESTIONS)
      .map((note) => noteShape(note, userId)),
    skills: COMMENT_SKILLS,
  };
};

/** Saving the same sentence twice refreshes its tags instead of duplicating it. */
export const saveComment = async ({ schoolId, userId, payload = {} } = {}) => {
  const fields = {
    text: bankText(payload.text),
    skill: COMMENT_SKILLS.includes(payload.skill) ? payload.skill : "other",
    sectionKeys: sectionKeysOf(payload),
    criterionKeys: cleanKeys(
      payload.criterionKeys ?? payload.criteria,
      MAX_CRITERION_KEYS,
    ),
    sharedWithSchool: payload.sharedWithSchool === true,
  };
  try {
    const created = await WritingCommentBank.create({
      school: schoolId,
      teacher: userId,
      ...fields,
    });
    return { note: noteShape(created.toObject(), userId), created: true };
  } catch (error) {
    // The unique index is the race-safe path for a double click.
    if (error?.code !== 11000) throw error;
    const existing = await WritingCommentBank.findOneAndUpdate(
      { school: schoolId, teacher: userId, text: fields.text },
      { $set: fields },
      { new: true },
    ).lean();
    if (!existing) throw error;
    return { note: noteShape(existing, userId), created: false };
  }
};

/** Only the teacher who saved a note can delete it, admins included. */
export const deleteComment = async ({ schoolId, userId, commentId } = {}) => {
  if (!validId(commentId))
    throw notFound("That note is not in your comment bank.");
  const deleted = await WritingCommentBank.findOneAndDelete({
    school: schoolId,
    _id: commentId,
    teacher: userId,
  }).lean();
  if (!deleted) throw notFound("That note is not in your comment bank.");
  return { id: String(commentId), deleted: true };
};

/** Usage is counted on insert so the bank learns the teacher's favourites. */
export const markCommentUsed = async ({ schoolId, userId, commentId } = {}) => {
  if (!validId(commentId))
    throw notFound("That note is not in your comment bank.");
  const updated = await WritingCommentBank.findOneAndUpdate(
    {
      school: schoolId,
      _id: commentId,
      $or: [{ teacher: userId }, { sharedWithSchool: true }],
    },
    { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw notFound("That note is not in your comment bank.");
  return { note: noteShape(updated, userId) };
};
