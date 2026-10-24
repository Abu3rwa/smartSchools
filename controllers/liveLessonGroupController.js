import mongoose from "mongoose";
import LiveGroup from "../models/LiveGroup.js";
import LiveLesson from "../models/LiveLesson.js";
import Student from "../models/Student.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { canAccessStaffClass } from "../helpers/liveLessonAccess.js";
import { listClassStudents } from "../services/liveLessonService.js";

const MAX_GROUP_NAME_LENGTH = 60;

const reply = (res, message, status = 400) =>
  res.status(status).json({ success: false, message });

const objectId = (value) => {
  const id = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

/** The class must exist for this staff member, or they have no business with its groups. */
const authorizedClass = async (req, classId) => {
  const id = objectId(classId);
  if (!id) return { error: "Invalid class ID.", status: 400 };
  const access = await canAccessStaffClass(req.user, req.schoolId, id);
  if (!access) return { error: "You are not authorized to access this class.", status: 403 };
  return { classId: id };
};

const uniqueStudentIds = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => objectId(value)).filter(Boolean))];

/** Group membership is by user id, which is the identity every live payload already uses. */
const enrolledStudentIds = async (classId, studentIds) => {
  if (!studentIds.length) return new Set();
  const students = await Student.find({
    user: { $in: studentIds },
    $or: [{ currentClass: classId }, { enrolledClasses: classId }],
  }).select("user").lean();
  return new Set(students.map((student) => String(student.user)));
};

const notEnrolled = (studentIds, enrolled) =>
  studentIds.filter((studentId) => !enrolled.has(String(studentId)));

/** One student belongs to one group, because a levelled slide sends each student one question. */
const findGroupClaims = async ({ schoolId, classId, enrolled, excludeGroupId }) => {
  const groups = await LiveGroup.find({
    school: schoolId,
    classId,
    ...(excludeGroupId ? { _id: { $ne: excludeGroupId } } : {}),
  }).select("name studentIds").lean();
  for (const group of groups) {
    const clash = (group.studentIds || []).find((memberId) => enrolled.has(String(memberId)));
    if (clash) return { groupName: group.name };
  }
  return null;
};

const groupPayload = (group) => ({
  _id: String(group._id),
  name: group.name,
  order: group.order || 0,
  studentIds: (group.studentIds || []).map((studentId) => String(studentId)),
});

const nameError = (name) => {
  if (!name) return "A group needs a name.";
  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return `Group names must be ${MAX_GROUP_NAME_LENGTH} characters or fewer.`;
  }
  return "";
};

const readGroupName = (raw) => String(raw || "").trim();

const nextOrder = async ({ schoolId, classId }) => {
  const top = await LiveGroup.findOne({ school: schoolId, classId }).sort({ order: -1 }).lean();
  return (top?.order || 0) + 1;
};

export const listLiveGroups = asyncHandler(async (req, res) => {
  const { classId, error, status } = await authorizedClass(req, req.query.classId);
  if (error) return reply(res, error, status);
  const [groups, roster] = await Promise.all([
    LiveGroup.find({ school: req.schoolId, classId }).sort({ order: 1, name: 1 }).lean(),
    listClassStudents(classId),
  ]);
  return res.json({
    success: true,
    data: {
      groups: groups.map(groupPayload),
      students: roster
        .map((student) => ({
          id: String(student.user?._id || ""),
          name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Student",
        }))
        .filter((student) => student.id),
    },
  });
});

export const createLiveGroup = asyncHandler(async (req, res) => {
  const { classId, error, status } = await authorizedClass(req, req.body?.classId);
  if (error) return reply(res, error, status);
  const name = readGroupName(req.body?.name);
  const invalidName = nameError(name);
  if (invalidName) return reply(res, invalidName);
  if (await LiveGroup.exists({ school: req.schoolId, classId, name })) {
    return reply(res, `This class already has a group called ${name}.`, 409);
  }
  const studentIds = uniqueStudentIds(req.body?.studentIds);
  const enrolled = await enrolledStudentIds(classId, studentIds);
  if (notEnrolled(studentIds, enrolled).length) {
    return reply(res, "Every student in a group must be enrolled in this class.");
  }
  const clash = await findGroupClaims({ schoolId: req.schoolId, classId, enrolled });
  if (clash) return reply(res, `One of those students is already in ${clash.groupName}. Remove them there first.`);
  const requestedOrder = Number(req.body?.order);
  const order = Number.isFinite(requestedOrder) && requestedOrder >= 0
    ? requestedOrder
    : await nextOrder({ schoolId: req.schoolId, classId });
  const group = await LiveGroup.create({
    school: req.schoolId,
    classId,
    ownerId: req.user._id,
    name,
    studentIds,
    order,
  });
  return res.status(201).json({ success: true, data: { group: groupPayload(group) } });
});

const findEditableGroup = async (req) => {
  const id = objectId(req.params.groupId);
  if (!id) return { error: "Invalid group ID." };
  const group = await LiveGroup.findOne({ _id: id, school: req.schoolId });
  if (!group) return { error: "Group not found.", status: 404 };
  const access = await canAccessStaffClass(req.user, req.schoolId, group.classId);
  if (!access) return { error: "You are not authorized to access this class.", status: 403 };
  return { group };
};

export const updateLiveGroup = asyncHandler(async (req, res) => {
  const { group, error, status } = await findEditableGroup(req);
  if (!group) return reply(res, error, status || 400);
  const name = req.body?.name === undefined ? group.name : readGroupName(req.body.name);
  const invalidName = nameError(name);
  if (invalidName) return reply(res, invalidName);
  if (name !== group.name && await LiveGroup.exists({ school: req.schoolId, classId: group.classId, name })) {
    return reply(res, `This class already has a group called ${name}.`, 409);
  }

  group.name = name;
  if (req.body?.studentIds !== undefined) {
    const studentIds = uniqueStudentIds(req.body.studentIds);
    const enrolled = await enrolledStudentIds(group.classId, studentIds);
    if (notEnrolled(studentIds, enrolled).length) {
      return reply(res, "Every student in a group must be enrolled in this class.");
    }
    const clash = await findGroupClaims({
      schoolId: req.schoolId,
      classId: group.classId,
      enrolled,
      excludeGroupId: group._id,
    });
    if (clash) return reply(res, `One of those students is already in ${clash.groupName}. Remove them there first.`);
    group.studentIds = studentIds;
  }
  if (req.body?.order !== undefined) {
    const order = Number(req.body.order);
    if (Number.isFinite(order) && order >= 0) group.order = order;
  }
  await group.save();
  return res.json({ success: true, data: { group: groupPayload(group) } });
});

export const deleteLiveGroup = asyncHandler(async (req, res) => {
  const { group, error, status } = await findEditableGroup(req);
  if (!group) return reply(res, error, status || 400);
  const lesson = await LiveLesson.findOne({
    school: req.schoolId,
    classId: group.classId,
    "slides.variants.groupId": group._id,
  }).select("title").lean();
  if (lesson) {
    return reply(res, `"${lesson.title}" still sends a question to this group. Remove that level first.`);
  }
  await group.deleteOne();
  return res.json({ success: true });
});
