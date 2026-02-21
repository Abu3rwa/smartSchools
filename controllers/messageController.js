import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import ParentMessageThread from '../models/ParentMessageThread.js';
import Student from '../models/Student.js';

const parsePositiveInt = (raw, fallback, max = 100) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
};

const toId = (value) => (value == null ? '' : String(value));

const toDisplayName = (user) => {
    const firstName = user?.firstName || '';
    const lastName = user?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.email || 'User';
};

const mapThreadSummary = (thread, currentUserId) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);
    const unreadCount = currentParticipant?.unreadCount || 0;
    const lastMessage = Array.isArray(thread.messages) && thread.messages.length > 0
        ? thread.messages[thread.messages.length - 1]
        : null;
    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter((value) => value.length > 0);

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

const mapThreadDetail = (thread, currentUser) => {
    const participants = Array.isArray(thread.participants) ? thread.participants : [];
    const currentUserId = toId(currentUser?._id);
    const currentParticipant = participants.find((item) => toId(item.user) === currentUserId);
    const participantNames = participants
        .filter((item) => toId(item.user) !== currentUserId)
        .map((item) => (item.displayName || '').trim())
        .filter((value) => value.length > 0);

    const messageItems = Array.isArray(thread.messages) ? [...thread.messages] : [];
    messageItems.sort((left, right) => {
        const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
        return leftTime - rightTime;
    });

    const messages = messageItems.map((message) => {
        const senderId = toId(message.sender);
        const senderParticipant = participants.find((item) => toId(item.user) === senderId);
        return {
            id: message._id,
            body: message.body || '',
            senderRole: message.senderRole || senderParticipant?.role || '',
            senderName: senderParticipant?.displayName || (senderId === currentUserId ? toDisplayName(currentUser) : 'School'),
            isMine: senderId === currentUserId,
            createdAt: message.createdAt || null
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

const addReplyToThread = ({ thread, senderUser, body }) => {
    const now = new Date();
    thread.messages.push({
        sender: senderUser._id,
        senderRole: senderUser.role,
        body,
        createdAt: now
    });
    thread.lastMessageAt = now;

    const currentUserId = toId(senderUser._id);
    let hasCurrentParticipant = false;
    for (const participant of thread.participants) {
        if (toId(participant.user) === currentUserId) {
            participant.unreadCount = 0;
            participant.lastReadAt = now;
            if (!participant.displayName) {
                participant.displayName = toDisplayName(senderUser);
            }
            hasCurrentParticipant = true;
        } else {
            participant.unreadCount = (participant.unreadCount || 0) + 1;
        }
    }

    if (!hasCurrentParticipant) {
        thread.participants.push({
            user: senderUser._id,
            role: senderUser.role,
            displayName: toDisplayName(senderUser),
            unreadCount: 0,
            lastReadAt: now
        });
    }

    return now;
};

/**
 * @desc    Create a new message thread from staff to one or more parent users
 * @route   POST /api/messages/threads
 * @access  Private (teacher/admin/staff)
 */
export const createMessageThreadController = asyncHandler(async (req, res) => {
    const subject = (req.body?.subject || '').toString().trim();
    const body = (req.body?.body || '').toString().trim();
    const recipientUserIdsRaw = Array.isArray(req.body?.recipientUserIds) ? req.body.recipientUserIds : [];

    if (!subject) {
        return res.status(400).json({
            success: false,
            message: 'subject is required'
        });
    }
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'body is required'
        });
    }

    const uniqueRecipientIds = [...new Set(recipientUserIdsRaw.map((id) => String(id).trim()).filter(Boolean))]
        .filter((id) => id !== String(req.user._id));
    if (uniqueRecipientIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'At least one recipientUserId is required'
        });
    }

    const parentUsers = await User.find({
        _id: { $in: uniqueRecipientIds },
        role: 'parent'
    }).setOptions({ schoolId: req.schoolId });

    if (parentUsers.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No valid parent recipients found'
        });
    }

    const now = new Date();
    const senderDisplayName = toDisplayName(req.user);
    const threadPayloads = parentUsers.map((parentUser) => ({
        school: req.schoolId,
        subject,
        participants: [
            {
                user: req.user._id,
                role: req.user.role,
                displayName: senderDisplayName,
                unreadCount: 0,
                lastReadAt: now
            },
            {
                user: parentUser._id,
                role: parentUser.role,
                displayName: toDisplayName(parentUser),
                unreadCount: 1,
                lastReadAt: null
            }
        ],
        createdBy: req.user._id,
        lastMessageAt: now,
        messages: [
            {
                sender: req.user._id,
                senderRole: req.user.role,
                body,
                createdAt: now
            }
        ]
    }));

    const createdThreads = await ParentMessageThread.insertMany(threadPayloads);
    const threadSummaries = createdThreads.map((thread, index) => ({
        threadId: thread._id,
        messageId: thread.messages?.[0]?._id || null,
        recipientUserId: parentUsers[index]?._id || null
    }));

    const firstThread = createdThreads[0] || null;
    const firstMessage = firstThread?.messages?.[0] || null;
    res.status(201).json({
        success: true,
        data: {
            threadId: firstThread?._id || null,
            messageId: firstMessage?._id || null,
            recipientCount: parentUsers.length,
            threads: threadSummaries
        }
    });
});

/**
 * @desc    Get message threads for staff (paginated)
 * @route   GET /api/messages/threads
 * @access  Private (teacher/admin/staff)
 */
export const getMessageThreadsController = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const baseFilter = { school: req.schoolId };
    const participantFilter = unreadOnly
        ? { participants: { $elemMatch: { user: req.user._id, unreadCount: { $gt: 0 } } } }
        : { 'participants.user': req.user._id };
    const filter = { ...baseFilter, ...participantFilter };

    const [threads, total] = await Promise.all([
        ParentMessageThread.find(filter)
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit),
        ParentMessageThread.countDocuments(filter)
    ]);

    const currentUserId = toId(req.user._id);
    const items = threads.map((thread) => mapThreadSummary(thread, currentUserId));
    const unreadCount = items.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            },
            unreadCount
        }
    });
});

/**
 * @desc    Get one message thread detail for staff
 * @route   GET /api/messages/threads/:threadId
 * @access  Private (teacher/admin/staff)
 */
export const getMessageThreadByIdController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    res.status(200).json({
        success: true,
        data: mapThreadDetail(thread, req.user)
    });
});

/**
 * @desc    Reply to a message thread as staff
 * @route   POST /api/messages/threads/:threadId/replies
 * @access  Private (teacher/admin/staff)
 */
export const replyToMessageThreadController = asyncHandler(async (req, res) => {
    const body = (req.body?.body || '').toString().trim();
    if (!body) {
        return res.status(400).json({
            success: false,
            message: 'Reply body is required'
        });
    }

    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    if (thread.isClosed === true) {
        return res.status(400).json({
            success: false,
            message: 'This conversation is closed'
        });
    }

    const now = addReplyToThread({ thread, senderUser: req.user, body });
    await thread.save();

    const lastMessage = thread.messages[thread.messages.length - 1];
    res.status(200).json({
        success: true,
        data: {
            threadId: thread._id,
            message: {
                id: lastMessage._id,
                body: lastMessage.body,
                senderRole: lastMessage.senderRole || req.user.role,
                senderName: toDisplayName(req.user),
                isMine: true,
                createdAt: lastMessage.createdAt || now
            }
        }
    });
});

/**
 * @desc    Mark a message thread as read for staff
 * @route   PATCH /api/messages/threads/:threadId/read
 * @access  Private (teacher/admin/staff)
 */
export const markMessageThreadReadController = asyncHandler(async (req, res) => {
    const thread = await ParentMessageThread.findOne({
        _id: req.params.threadId,
        school: req.schoolId,
        'participants.user': req.user._id
    });

    if (!thread) {
        return res.status(404).json({
            success: false,
            message: 'Thread not found'
        });
    }

    const currentUserId = toId(req.user._id);
    const participant = thread.participants.find((item) => toId(item.user) === currentUserId);
    if (participant) {
        participant.unreadCount = 0;
        participant.lastReadAt = new Date();
    }

    await thread.save();

    res.status(200).json({
        success: true,
        data: {
            threadId: thread._id,
            unreadCount: 0
        }
    });
});

/**
 * @desc    Get parent users to start new message threads
 * @route   GET /api/messages/parents
 * @access  Private (teacher/admin/staff)
 */
export const getParentUsersForMessagingController = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const search = (req.query.search || '').toString().trim();

    const filter = {
        school: req.schoolId,
        role: 'parent'
    };

    let searchRegex = null;
    if (search) {
        searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex }
        ];
    }

    const studentParentEmails = new Set();
    if (searchRegex) {
        const students = await Student.find({
            school: req.schoolId,
            $or: [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { studentId: searchRegex }
            ]
        }).select('parentInfo');

        for (const student of students) {
            const parentInfo = student.parentInfo || {};
            [parentInfo.fatherEmail, parentInfo.motherEmail, parentInfo.guardianEmail]
                .filter(Boolean)
                .forEach((email) => studentParentEmails.add(String(email).trim().toLowerCase()));
        }
    }

    const [parentsBySearch, total, parentsByStudent] = await Promise.all([
        User.find(filter)
            .sort({ firstName: 1, lastName: 1, email: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        User.countDocuments(filter),
        studentParentEmails.size > 0
            ? User.find({
                school: req.schoolId,
                role: 'parent',
                email: { $in: [...studentParentEmails] }
            })
            : []
    ]);

    const mergedParents = new Map();
    for (const parent of parentsBySearch) {
        mergedParents.set(toId(parent._id), parent);
    }
    for (const parent of parentsByStudent) {
        mergedParents.set(toId(parent._id), parent);
    }

    const items = [...mergedParents.values()]
        .map((parent) => ({
            id: parent._id,
            displayName: toDisplayName(parent),
            email: parent.email || ''
        }));
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.status(200).json({
        success: true,
        data: {
            parents: items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        }
    });
});

