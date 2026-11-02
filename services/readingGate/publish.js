import ReadingAssignment from "../../models/ReadingAssignment.js";

const badRequest = (message) => Object.assign(new Error(message), {
  statusCode: 400,
  code: "READING_PUBLISH_INVALID"
});

const readRaw = (value) => (typeof value?.toObject === "function" ? value.toObject() : (value || {}));

/** Scheduled readings are locked until `publishAt`, even when they are published. */
export const isAssignmentLocked = (assignment, now = new Date()) => {
  const raw = readRaw(assignment);
  if (raw.isPublished === false) return true;
  if (!raw.publishAt) return false;
  const publishAt = new Date(raw.publishAt);
  return Number.isFinite(publishAt.getTime()) && publishAt.getTime() > now.getTime();
};

export const readingLockedError = () => Object.assign(
  new Error("This reading is not open yet."),
  { statusCode: 403, code: "READING_NOT_PUBLISHED" }
);

/** Create-time values: published unless the teacher says otherwise. */
export const sanitizePublishSettings = (input = {}) => {
  const raw = readRaw(input);
  const isPublished = raw.isPublished === undefined || raw.isPublished === null
    ? true
    : raw.isPublished;
  if (typeof isPublished !== "boolean") {
    throw badRequest("Publishing must be on or off.");
  }
  let publishAt = null;
  if (raw.publishAt !== undefined && raw.publishAt !== null && raw.publishAt !== "") {
    const date = new Date(raw.publishAt);
    if (!Number.isFinite(date.getTime())) {
      throw badRequest("Enter a valid publish date.");
    }
    publishAt = date;
  }
  return { isPublished, publishAt };
};

/** Patch-time values: only the fields the teacher actually changed. */
export const sanitizePublishPatch = (input = {}) => {
  const raw = readRaw(input);
  const patch = {};
  if (raw.isPublished !== undefined) {
    if (typeof raw.isPublished !== "boolean") {
      throw badRequest("Publishing must be on or off.");
    }
    patch.isPublished = raw.isPublished;
  }
  if (raw.publishAt !== undefined) {
    if (raw.publishAt === null || raw.publishAt === "") {
      patch.publishAt = null;
    } else {
      const date = new Date(raw.publishAt);
      if (!Number.isFinite(date.getTime())) {
        throw badRequest("Enter a valid publish date.");
      }
      patch.publishAt = date;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw badRequest("Choose whether to publish the reading or when it opens.");
  }
  return patch;
};

/** Throws 403 for unpublished or scheduled-future readings; returns null when absent. */
export async function assertReadingPublished({
  schoolId,
  studentId,
  assignmentId,
  academicYear = null
}) {
  const query = {
    _id: assignmentId,
    school: schoolId,
    students: studentId,
    isActive: true,
  };
  if (academicYear) query.academicYear = academicYear;
  const assignment = await ReadingAssignment.findOne(query)
    .select("_id isPublished publishAt")
    .lean();
  if (!assignment) return null;
  if (isAssignmentLocked(assignment)) throw readingLockedError();
  return assignment;
}

/**
 * One text can be assigned to a student more than once, so any open assignment
 * grants access; the explicit or newest one is returned for the caller's checks.
 */
export async function resolveOpenStudentAssignment({
  schoolId,
  studentId,
  textId = null,
  assignmentId = null,
  academicYear = null,
  select = "_id text isPublished publishAt"
}) {
  if (!assignmentId && !textId) {
    throw Object.assign(new Error("A reading is required."), {
      statusCode: 400,
      code: "READING_ASSIGNMENT_REQUIRED"
    });
  }
  const query = {
    school: schoolId,
    students: studentId,
    isActive: true,
  };
  if (academicYear) query.academicYear = academicYear;
  if (assignmentId) query._id = assignmentId;
  if (textId) query.text = textId;
  const assignments = await ReadingAssignment.find(query)
    .select(select)
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  if (!assignments.length) {
    throw Object.assign(new Error("Reading assignment not found"), {
      statusCode: 404,
      code: "READING_ASSIGNMENT_NOT_FOUND"
    });
  }
  const open = assignments.find((assignment) => !isAssignmentLocked(assignment));
  if (!open) throw readingLockedError();
  return open;
}
