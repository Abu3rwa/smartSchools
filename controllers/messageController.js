import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import ParentMessageThread from '../models/ParentMessageThread.js';

const toDisplayName = (user) => {
    const firstName = user?.firstName || '';
    const lastName = user?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.email || 'User';
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
    const participants = [
        {
            user: req.user._id,
            role: req.user.role,
            displayName: senderDisplayName,
            unreadCount: 0,
            lastReadAt: now
        },
        ...parentUsers.map((parentUser) => ({
            user: parentUser._id,
            role: parentUser.role,
            displayName: toDisplayName(parentUser),
            unreadCount: 1,
            lastReadAt: null
        }))
    ];

    const thread = await ParentMessageThread.create({
        school: req.schoolId,
        subject,
        participants,
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
    });

    const firstMessage = thread.messages[0];
    res.status(201).json({
        success: true,
        data: {
            threadId: thread._id,
            messageId: firstMessage?._id || null,
            recipientCount: parentUsers.length
        }
    });
});

