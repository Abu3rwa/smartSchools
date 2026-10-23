import LiveSession from "../models/LiveSession.js";

export const lessonAcademicYear = (classDoc) =>
  String(classDoc?.academicYear || "").trim() || null;

/**
 * What a lesson's assignment fields become when it is re-pointed at `targetClass`.
 *
 * A lesson may only claim a subject its class actually teaches
 * (resolveLessonAssignment enforces that on every other write path), so a lesson
 * moved to a class that has not been given the subject yet drops the link and
 * keeps the free-text subject name the teacher sees in the library. Rollover
 * copies classes without subjects, so this is the normal case for a year move,
 * not an error.
 */
export const buildClassMovePatch = (lesson, targetClass) => {
  const patch = {
    classId: targetClass._id,
    academicYear: lessonAcademicYear(targetClass),
  };
  if (!lesson.subjectId) return { patch, subjectCleared: false };
  const targetSubjectIds = (targetClass.subjects || []).map(
    (entry) => String(entry.subject?._id || entry.subject),
  );
  if (targetSubjectIds.includes(String(lesson.subjectId))) {
    return { patch, subjectCleared: false };
  }
  patch.subjectId = null;
  return { patch, subjectCleared: true };
};

/**
 * A running or still-scheduled session belongs to the class it was created for;
 * moving the lesson underneath it would leave students looking at a lesson that
 * now points somewhere else. Ended sessions keep their own classId and snapshot,
 * so history is unaffected.
 */
export const findBlockingLiveSession = async (lessonId) =>
  LiveSession.findOne({ lessonId, status: { $in: ["waiting", "live"] } })
    .select("_id status")
    .lean();

/**
 * Shared by the per-lesson move endpoint and the academic-year rollover, so both
 * apply the same field rules. Returns null when the lesson cannot be moved.
 */
export const moveLiveLessonToClass = async ({ lesson, targetClass, save }) => {
  const blocking = await findBlockingLiveSession(lesson._id);
  if (blocking) {
    return {
      ok: false,
      reason: "open_session",
      message: "End or delete this lesson's scheduled or live session before moving it to another year.",
    };
  }
  const { patch, subjectCleared } = buildClassMovePatch(lesson, targetClass);
  if (save) await save(patch);
  return { ok: true, patch, subjectCleared };
};
