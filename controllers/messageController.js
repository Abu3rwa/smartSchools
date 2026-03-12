import { asyncHandler } from '../middleware/errorHandler.js';
import { messagingThreadService } from '../services/messaging/messagingThreadService.js';

export const createMessageController = ({ threadService = messagingThreadService } = {}) => ({
    createMessageThreadController: asyncHandler(async (req, res) => {
        const data = await threadService.createMessageThread({ req });
        return res.status(201).json({ success: true, data });
    }),

    getMessageThreadsController: asyncHandler(async (req, res) => {
        const data = await threadService.getMessageThreads({ req });
        return res.status(200).json({ success: true, data });
    }),

    getMessageThreadByIdController: asyncHandler(async (req, res) => {
        const data = await threadService.getMessageThreadById({ req });
        return res.status(200).json({ success: true, data });
    }),

    replyToMessageThreadController: asyncHandler(async (req, res) => {
        const data = await threadService.replyToMessageThread({ req });
        return res.status(200).json({ success: true, data });
    }),

    markMessageThreadReadController: asyncHandler(async (req, res) => {
        const data = await threadService.markMessageThreadRead({ req });
        return res.status(200).json({ success: true, data });
    }),

    getMessageClassesForMessagingController: asyncHandler(async (req, res) => {
        const data = await threadService.getMessageClassesForMessaging({ req });
        return res.status(200).json({ success: true, data });
    }),

    getParentUsersForMessagingController: asyncHandler(async (req, res) => {
        const data = await threadService.getParentUsersForMessaging({ req });
        return res.status(200).json({ success: true, data });
    })
});

const messageController = createMessageController();

export const {
    createMessageThreadController,
    getMessageThreadsController,
    getMessageThreadByIdController,
    replyToMessageThreadController,
    markMessageThreadReadController,
    getParentUsersForMessagingController,
    getMessageClassesForMessagingController
} = messageController;
