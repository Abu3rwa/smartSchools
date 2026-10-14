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
