import mongoose from "mongoose";
import LiveLesson from "../models/LiveLesson.js";
import LiveLessonShareInvitation from "../models/LiveLessonShareInvitation.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";

export class LiveLessonShareError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

const isActiveSharingUser = async (userId, schoolId) => {
  const user = await User.findOne({
    _id: userId,
    school: schoolId,
    role: { $in: ["teacher", "admin"] },
    isActive: true,
  }).select("_id role").lean();
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(await Teacher.findOne({
    user: userId,
    school: schoolId,
    isActive: true,
  }).select("_id").lean());
};

const getLessonSnapshot = (lesson) => ({
  title: lesson.title,
  description: lesson.description || "",
  subject: lesson.subject || "",
  grade: lesson.grade || "",
  language: lesson.language || "en",
  source: lesson.source || "csv",
  slides: lesson.slides.map((slide) => {
    const value = typeof slide.toObject === "function" ? slide.toObject() : slide;
    return {
      order: value.order,
      type: value.type,
      title: value.title || "",
      body: value.body || "",
      html: value.html || "",
      examples: Array.isArray(value.examples) ? [...value.examples] : [],
      imageUrl: value.imageUrl || "",
      speakerNotes: value.speakerNotes || "",
      ...(value.question
        ? {
            question: {
              kind: value.question.kind,
              prompt: value.question.prompt,
              options: (value.question.options || []).map((option) => ({
                id: option.id,
                text: option.text,
              })),
              correctOptionId: value.question.correctOptionId,
              explanation: value.question.explanation || "",
            },
          }
        : {}),
    };
  }),
});

const invitationSummary = (invitation) => ({
  _id: invitation._id,
  sourceLessonId: invitation.sourceLessonId,
  sender: invitation.senderId,
  status: invitation.status,
  lesson: {
    title: invitation.lessonSnapshot.title,
    subject: invitation.lessonSnapshot.subject || "",
    grade: invitation.lessonSnapshot.grade || "",
    description: invitation.lessonSnapshot.description || "",
  },
  acceptedLessonId: invitation.acceptedLessonId,
  createdAt: invitation.createdAt,
  respondedAt: invitation.respondedAt,
});

export const createShareInvitation = async ({ schoolId, senderId, sourceLessonId, recipientId }) => {
  if (!validId(sourceLessonId) || !validId(recipientId)) {
    throw new LiveLessonShareError("Choose a valid lesson and teacher.", 400);
  }
  if (String(senderId) === String(recipientId)) {
    throw new LiveLessonShareError("You cannot share a lesson with yourself.", 400);
  }
  const [senderCanShare, recipientCanReceive, lesson] = await Promise.all([
    isActiveSharingUser(senderId, schoolId),
    isActiveSharingUser(recipientId, schoolId),
    LiveLesson.findOne({ _id: sourceLessonId, school: schoolId, ownerId: senderId }),
  ]);
  if (!senderCanShare) throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  if (!recipientCanReceive) throw new LiveLessonShareError("Recipient must be an active teacher or admin in your school.", 400);
  if (!lesson) throw new LiveLessonShareError("Lesson not found or not owned by you.", 404);

  try {
    const invitation = await LiveLessonShareInvitation.create({
      school: schoolId,
      sourceLessonId: lesson._id,
      senderId,
      recipientId,
      lessonSnapshot: getLessonSnapshot(lesson),
      status: "pending",
    });
    return invitationSummary(invitation);
  } catch (error) {
    if (error?.code === 11000) {
      throw new LiveLessonShareError("A pending invitation already exists for this teacher and lesson.", 409);
    }
    throw error;
  }
};

export const listIncomingShareInvitations = async ({ schoolId, recipientId, status = "pending" }) => {
  if (!["pending", "accepted", "declined", "revoked", "all"].includes(status)) {
    throw new LiveLessonShareError("Invalid invitation status.", 400);
  }
  if (!(await isActiveSharingUser(recipientId, schoolId))) {
    throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  }
  const filter = { school: schoolId, recipientId };
  if (status !== "all") filter.status = status;
  const invitations = await LiveLessonShareInvitation.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .populate("senderId", "firstName lastName")
    .lean();
  return invitations.map(invitationSummary);
};

export const listShareableTeachers = async ({ schoolId, requesterId }) => {
  if (!(await isActiveSharingUser(requesterId, schoolId))) {
    throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  }
  const teachers = await Teacher.find({
    school: schoolId,
    isActive: true,
    user: { $ne: requesterId },
  })
    .select("user")
    .populate("user", "firstName lastName")
    .sort({ _id: 1 })
    .lean();
  return teachers
    .filter((teacher) => teacher.user)
    .map((teacher) => ({
      _id: teacher.user._id,
      firstName: teacher.user.firstName || "",
      lastName: teacher.user.lastName || "",
    }));
};

export const listOutgoingShareInvitations = async ({ schoolId, senderId, status = "pending" }) => {
  if (!["pending", "all"].includes(status)) {
    throw new LiveLessonShareError("Invalid invitation status.", 400);
  }
  if (!(await isActiveSharingUser(senderId, schoolId))) {
    throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  }
  const filter = { school: schoolId, senderId };
  if (status !== "all") filter.status = "pending";
  const invitations = await LiveLessonShareInvitation.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .populate("recipientId", "firstName lastName")
    .lean();
  return invitations.map((invitation) => ({
    _id: invitation._id,
    sourceLessonId: invitation.sourceLessonId,
    recipient: invitation.recipientId,
    status: invitation.status,
    lesson: {
      title: invitation.lessonSnapshot.title,
      subject: invitation.lessonSnapshot.subject || "",
      grade: invitation.lessonSnapshot.grade || "",
      description: invitation.lessonSnapshot.description || "",
    },
    acceptedLessonId: invitation.acceptedLessonId,
    createdAt: invitation.createdAt,
    respondedAt: invitation.respondedAt,
  }));
};

export const acceptShareInvitation = async ({ schoolId, recipientId, invitationId }) => {
  if (!validId(invitationId)) throw new LiveLessonShareError("Invalid invitation ID.", 400);
  if (!(await isActiveSharingUser(recipientId, schoolId))) {
    throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const invitation = await LiveLessonShareInvitation.findOne({
        _id: invitationId,
        school: schoolId,
        recipientId,
        status: "pending",
      }).session(session);
      if (!invitation) {
        const previous = await LiveLessonShareInvitation.findOne({
          _id: invitationId,
          school: schoolId,
          recipientId,
        }).session(session);
        if (previous?.status === "accepted" && previous.acceptedLessonId) {
          const acceptedLesson = await LiveLesson.findOne({
            _id: previous.acceptedLessonId,
            school: schoolId,
            ownerId: recipientId,
          }).session(session);
          if (acceptedLesson) {
            result = { invitation: invitationSummary(previous), lesson: acceptedLesson, alreadyAccepted: true };
            return;
          }
        }
        throw new LiveLessonShareError("Pending invitation not found.", 404);
      }

      const acceptedLessonId = new mongoose.Types.ObjectId();
      const accepted = await LiveLessonShareInvitation.findOneAndUpdate(
        { _id: invitation._id, school: schoolId, recipientId, status: "pending" },
        { $set: { status: "accepted", acceptedLessonId, respondedAt: new Date() } },
        { new: true, session },
      );
      if (!accepted) throw new LiveLessonShareError("Pending invitation not found.", 404);
      const snapshot = accepted.lessonSnapshot;
      const [copy] = await LiveLesson.create(
        [{
          _id: acceptedLessonId,
          school: schoolId,
          ownerId: recipientId,
          title: snapshot.title,
          description: snapshot.description,
          subject: snapshot.subject,
          grade: snapshot.grade,
          language: snapshot.language,
          source: snapshot.source,
          slides: snapshot.slides,
          originLessonId: accepted.sourceLessonId,
          originOwnerId: accepted.senderId,
          originShareInvitationId: accepted._id,
        }],
        { session },
      );
      result = { invitation: invitationSummary(accepted), lesson: copy, alreadyAccepted: false };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

export const transitionShareInvitation = async ({ schoolId, actorId, invitationId, actor: actorType, status }) => {
  if (!validId(invitationId)) throw new LiveLessonShareError("Invalid invitation ID.", 400);
  if (!(await isActiveSharingUser(actorId, schoolId))) {
    throw new LiveLessonShareError("An active teacher or admin account is required.", 403);
  }
  const actorField = actorType === "sender" ? "senderId" : "recipientId";
  const invitation = await LiveLessonShareInvitation.findOneAndUpdate(
    { _id: invitationId, school: schoolId, [actorField]: actorId, status: "pending" },
    { $set: { status, respondedAt: new Date() } },
    { new: true },
  );
  if (!invitation) throw new LiveLessonShareError("Pending invitation not found.", 404);
  return invitationSummary(invitation);
};

export { getLessonSnapshot };
