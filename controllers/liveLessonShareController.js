import { asyncHandler } from "../middleware/errorHandler.js";
import {
  acceptShareInvitation,
  createShareInvitation,
  listIncomingShareInvitations,
  listOutgoingShareInvitations,
  listShareableTeachers,
  LiveLessonShareError,
  transitionShareInvitation,
} from "../services/liveLessonShareService.js";

const handleShareError = (error, res) => {
  if (!(error instanceof LiveLessonShareError)) throw error;
  return res.status(error.statusCode).json({ success: false, message: error.message });
};

export const createLiveLessonShare = asyncHandler(async (req, res) => {
  try {
    const invitation = await createShareInvitation({
      schoolId: req.schoolId,
      senderId: req.user._id,
      sourceLessonId: req.params.lessonId,
      recipientId: req.body?.recipientId,
    });
    return res.status(201).json({ success: true, data: { invitation } });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const createLiveLessonShares = asyncHandler(async (req, res) => {
  const lessonIds = req.body?.lessonIds;
  if (!Array.isArray(lessonIds) || lessonIds.length < 1 || lessonIds.length > 100 ||
    lessonIds.some((id) => typeof id !== "string") || new Set(lessonIds).size !== lessonIds.length) {
    return res.status(400).json({
      success: false,
      message: "Choose between 1 and 100 unique lessons to share.",
    });
  }

  const results = await Promise.all(lessonIds.map(async (lessonId) => {
    try {
      const invitation = await createShareInvitation({
        schoolId: req.schoolId,
        senderId: req.user._id,
        sourceLessonId: lessonId,
        recipientId: req.body?.recipientId,
      });
      return { lessonId, invitation };
    } catch (error) {
      if (!(error instanceof LiveLessonShareError)) throw error;
      return { lessonId, error: error.message };
    }
  }));
  const invitations = results.filter((result) => result.invitation).map((result) => result.invitation);
  const failures = results.filter((result) => result.error).map(({ lessonId, error }) => ({ lessonId, message: error }));
  return res.json({
    success: true,
    data: { invitations, failures },
    message: `${invitations.length} lesson${invitations.length === 1 ? "" : "s"} shared; ${failures.length} could not be shared.`,
  });
});

export const listIncomingLiveLessonShares = asyncHandler(async (req, res) => {
  try {
    const invitations = await listIncomingShareInvitations({
      schoolId: req.schoolId,
      recipientId: req.user._id,
      status: req.query.status || "pending",
    });
    return res.json({ success: true, data: { invitations } });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const listLiveLessonShareTeachers = asyncHandler(async (req, res) => {
  try {
    const teachers = await listShareableTeachers({
      schoolId: req.schoolId,
      requesterId: req.user._id,
    });
    return res.json({ success: true, data: { teachers } });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const listOutgoingLiveLessonShares = asyncHandler(async (req, res) => {
  try {
    const invitations = await listOutgoingShareInvitations({
      schoolId: req.schoolId,
      senderId: req.user._id,
      status: req.query.status || "pending",
    });
    return res.json({ success: true, data: { invitations } });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const acceptLiveLessonShare = asyncHandler(async (req, res) => {
  try {
    const result = await acceptShareInvitation({
      schoolId: req.schoolId,
      recipientId: req.user._id,
      invitationId: req.params.invitationId,
    });
    return res.status(result.alreadyAccepted ? 200 : 201).json({
      success: true,
      data: { invitation: result.invitation, lesson: result.lesson },
    });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const declineLiveLessonShare = asyncHandler(async (req, res) => {
  try {
    const invitation = await transitionShareInvitation({
      schoolId: req.schoolId,
      actorId: req.user._id,
      invitationId: req.params.invitationId,
      actor: "recipient",
      status: "declined",
    });
    return res.json({ success: true, data: { invitation } });
  } catch (error) {
    return handleShareError(error, res);
  }
});

export const respondToLiveLessonShares = asyncHandler(async (req, res) => {
  const { invitationIds, action } = req.body || {};
  if (!Array.isArray(invitationIds) || invitationIds.length < 1 || invitationIds.length > 100
    || invitationIds.some((id) => typeof id !== "string") || new Set(invitationIds).size !== invitationIds.length
    || !["accept", "decline"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Choose between 1 and 100 unique invitations and an accept or decline action.",
    });
  }

  const completedIds = [];
  const failures = [];
  for (const invitationId of invitationIds) {
    try {
      if (action === "accept") {
        await acceptShareInvitation({
          schoolId: req.schoolId,
          recipientId: req.user._id,
          invitationId,
        });
      } else {
        await transitionShareInvitation({
          schoolId: req.schoolId,
          actorId: req.user._id,
          invitationId,
          actor: "recipient",
          status: "declined",
        });
      }
      completedIds.push(invitationId);
    } catch (error) {
      if (!(error instanceof LiveLessonShareError)) throw error;
      failures.push({ invitationId, statusCode: error.statusCode, message: error.message });
    }
  }
  return res.json({
    success: true,
    data: { action, completedIds, failures },
    message: `${completedIds.length} invitation${completedIds.length === 1 ? "" : "s"} ${action === "accept" ? "accepted" : "declined"}; ${failures.length} could not be processed.`,
  });
});

export const revokeLiveLessonShare = asyncHandler(async (req, res) => {
  try {
    const invitation = await transitionShareInvitation({
      schoolId: req.schoolId,
      actorId: req.user._id,
      invitationId: req.params.invitationId,
      actor: "sender",
      status: "revoked",
    });
    return res.json({ success: true, data: { invitation } });
  } catch (error) {
    return handleShareError(error, res);
  }
});
