import { emitRealtimeEventToUsers } from '../realtime/realtimeGateway.js';
import logger from '../utils/logger.js';
import { sendPushToUsers } from './pushNotificationService.js';

const toId = (value) => (value == null ? '' : String(value));

const buildSenderName = (user) => {
  const firstName = (user?.firstName || '').toString().trim();
  const lastName = (user?.lastName || '').toString().trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user?.email || 'User';
};

export const buildMessageDeliveryReceipts = ({
  participants = [],
  senderUserId,
  deliveredAt = new Date(),
}) => {
  const senderId = toId(senderUserId);
  const seen = new Set();
  const receipts = [];

  for (const participant of participants) {
    const participantUserId = toId(participant?.user);
    if (!participantUserId || participantUserId === senderId || seen.has(participantUserId)) {
      continue;
    }
    seen.add(participantUserId);
    receipts.push({
      user: participantUserId,
      deliveredAt,
      readAt: null,
    });
  }

  return receipts;
};

export const applyReadReceiptsForUser = ({
  thread,
  readerUserId,
  readAt = new Date(),
}) => {
  const readerId = toId(readerUserId);
  if (!thread || !readerId) return;

  for (const message of thread.messages || []) {
    const senderId = toId(message?.sender);
    if (senderId === readerId) continue;

    if (!Array.isArray(message.deliveryReceipts)) {
      message.deliveryReceipts = [];
    }

    let receipt = message.deliveryReceipts.find((item) => toId(item.user) === readerId);
    if (!receipt) {
      message.deliveryReceipts.push({
        user: readerId,
        deliveredAt: message.createdAt || readAt,
        readAt,
      });
      continue;
    }

    if (!receipt.deliveredAt) {
      receipt.deliveredAt = message.createdAt || readAt;
    }
    if (!receipt.readAt || new Date(receipt.readAt).getTime() < readAt.getTime()) {
      receipt.readAt = readAt;
    }
  }
};

export const appendMessageToThread = ({
  thread,
  senderUser,
  body,
  createdAt = new Date(),
}) => {
  const senderUserId = toId(senderUser?._id);
  const senderDisplayName = buildSenderName(senderUser);

  thread.messages.push({
    sender: senderUser?._id,
    senderRole: senderUser?.role || '',
    body,
    createdAt,
    deliveryReceipts: buildMessageDeliveryReceipts({
      participants: thread.participants || [],
      senderUserId,
      deliveredAt: createdAt,
    }),
  });

  thread.lastMessageAt = createdAt;

  let hasSenderParticipant = false;
  for (const participant of thread.participants || []) {
    const participantId = toId(participant.user);
    if (participantId === senderUserId) {
      participant.unreadCount = 0;
      participant.lastReadAt = createdAt;
      if (!participant.displayName) {
        participant.displayName = senderDisplayName;
      }
      hasSenderParticipant = true;
    } else {
      participant.unreadCount = (participant.unreadCount || 0) + 1;
    }
  }

  if (!hasSenderParticipant) {
    thread.participants.push({
      user: senderUser?._id,
      role: senderUser?.role || '',
      displayName: senderDisplayName,
      unreadCount: 0,
      lastReadAt: createdAt,
    });
  }

  return thread.messages[thread.messages.length - 1];
};

export const emitMessageThreadEvent = async ({
  thread,
  actorUser,
  event,
  message = null,
  includePush = false,
}) => {
  if (!thread || !actorUser || !event) return;

  const actorUserId = toId(actorUser._id);
  const participantUserIds = [...new Set(
    (thread.participants || [])
      .map((participant) => toId(participant?.user))
      .filter(Boolean)
  )];

  const realtimePayload = {
    threadId: toId(thread._id),
    actorUserId,
    event,
    messageId: message ? toId(message._id) : null,
    preview: message?.body ? String(message.body).slice(0, 240) : '',
    unreadByUser: (thread.participants || []).map((participant) => ({
      userId: toId(participant.user),
      unreadCount: participant.unreadCount || 0,
      lastReadAt: participant.lastReadAt || null,
    })),
    occurredAt: new Date().toISOString(),
  };

  emitRealtimeEventToUsers({
    userIds: participantUserIds,
    event: `message.thread.${event}`,
    data: realtimePayload,
  });

  if (!includePush || !message?.body) return;

  const pushRecipients = participantUserIds.filter((userId) => userId !== actorUserId);
  if (pushRecipients.length === 0) return;

  try {
    await sendPushToUsers({
      schoolId: thread.school,
      userIds: pushRecipients,
      title: `New message: ${(thread.subject || 'Conversation').toString().trim() || 'Conversation'}`,
      body: String(message.body).trim().slice(0, 180),
      data: {
        type: 'message',
        threadId: toId(thread._id),
        messageId: toId(message._id),
      },
      collapseKey: `thread_${toId(thread._id)}`,
    });
  } catch (error) {
    logger.error('message_push_dispatch_failed', {
      threadId: toId(thread._id),
      error: error?.message || String(error),
    });
  }
};

