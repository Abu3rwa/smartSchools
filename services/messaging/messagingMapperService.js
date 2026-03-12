/* eslint-disable complexity */
import { toDisplayName, toId } from './messagingUtils.js';

const mapDeliveryReceipts = ({ message, participants }) => {
    const receipts = Array.isArray(message?.deliveryReceipts) ? message.deliveryReceipts : [];

    return receipts.map((receipt) => {
        const receiptUserId = toId(receipt?.user);
        const participant = participants.find((item) => toId(item.user) === receiptUserId);

        return {
            userId: receiptUserId,
            displayName: participant?.displayName || '',
            deliveredAt: receipt?.deliveredAt || null,
            readAt: receipt?.readAt || null
        };
    });
};

export const mapThreadSummary = ({ thread, currentUserId }) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);
    const unreadCount = currentParticipant?.unreadCount || 0;
    const lastMessage = Array.isArray(thread.messages) && thread.messages.length > 0
        ? thread.messages[thread.messages.length - 1]
        : null;

    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter(Boolean);

    return {
        id: thread._id,
        subject: (thread.subject || '').trim() || 'Conversation',
        preview: (lastMessage?.body || '').trim(),
        participantsLabel: participantNames.join(', '),
        lastMessageAt: thread.lastMessageAt || lastMessage?.createdAt || thread.updatedAt || thread.createdAt,
        unreadCount,
        isRead: unreadCount <= 0,
        isClosed: thread.isClosed === true
    };
};

const sortMessageByCreatedAt = (left, right) => {
    const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftTime - rightTime;
};

export const mapThreadDetail = ({ thread, currentUser }) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentUserId = toId(currentUser?._id);
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);

    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter(Boolean);

    const messageItems = Array.isArray(thread.messages) ? [...thread.messages] : [];
    messageItems.sort(sortMessageByCreatedAt);

    const messages = messageItems.map((message) => {
        const senderId = toId(message.sender);
        const senderParticipant = participants.find((item) => toId(item.user) === senderId);

        return {
            id: message._id,
            body: message.body || '',
            senderRole: message.senderRole || senderParticipant?.role || '',
            senderName: senderParticipant?.displayName || (senderId === currentUserId ? toDisplayName(currentUser) : 'School'),
            isMine: senderId === currentUserId,
            createdAt: message.createdAt || null,
            deliveryReceipts: mapDeliveryReceipts({ message, participants })
        };
    });

    return {
        thread: {
            id: thread._id,
            subject: (thread.subject || '').trim() || 'Conversation',
            participantsLabel: participantNames.join(', '),
            unreadCount: currentParticipant?.unreadCount || 0,
            isClosed: thread.isClosed === true
        },
        messages
    };
};
