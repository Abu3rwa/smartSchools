/**
 * The voice prompt privacy rules: no name, email or phone number reaches the
 * model. The student's own words are scrubbed where they enter the prompt; what
 * is stored and shown on the board stays exactly as the student said it.
 */
import Student from "../models/Student.js";
import { scrubForPrompt } from "./aiPromptSafety.js";

const ROSTER_TTL_MS = 10 * 60 * 1000;
const ROSTER_MAX_ENTRIES = 200;
const ROSTER_LIMIT = 200;
const rosterCache = new Map();

const nameOf = (student) =>
  [student?.firstName, student?.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");

/** A test seam: the roster cache is process-wide and time based. */
export const clearVoiceRosterCache = () => rosterCache.clear();

/**
 * The class roster, read once per class per 10 minutes. A failed read is never
 * cached, so the next turn simply tries again.
 */
export const classRoster = async ({ schoolId, classId }) => {
  if (!schoolId || !classId) return [];
  const key = `${schoolId}|${classId}`;
  const hit = rosterCache.get(key);
  if (hit) {
    if (Date.now() - hit.at <= ROSTER_TTL_MS) return hit.names;
    rosterCache.delete(key);
  }
  const rows = await Student.find({ school: schoolId, currentClass: classId })
    .select("firstName lastName")
    .limit(ROSTER_LIMIT)
    .lean();
  const names = rows
    .map((row) => nameOf(row))
    .filter(Boolean);
  rosterCache.set(key, { at: Date.now(), names });
  while (rosterCache.size > ROSTER_MAX_ENTRIES) {
    rosterCache.delete(rosterCache.keys().next().value);
  }
  return names;
};

/**
 * The transcript and every earlier student message are the only places a
 * student's own words enter the prompt. Tutor messages are model output.
 */
export const scrubVoiceTurn = ({ transcript = "", prior = [], student, roster = [] } = {}) => {
  const name = nameOf(student);
  const scrub = (value) => scrubForPrompt(value, { name, roster });
  return {
    transcript: scrub(transcript),
    prior: prior.map((message) =>
      message.role === "student"
        ? { ...message, text: scrub(message.text) }
        : message
    )
  };
};
