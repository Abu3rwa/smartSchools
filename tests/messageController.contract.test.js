import assert from 'node:assert/strict';
import test from 'node:test';

import { createMessageController } from '../controllers/messageController.js';

const runController = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({ statusCode: this.statusCode, payload, error: null });
            return this;
        }
    };

    handler(req, res, (error) => {
        resolve({ statusCode: res.statusCode, payload: null, error });
    });
});

const buildReq = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    schoolId: 'school-1',
    user: { _id: 'actor-1', role: 'admin' },
    ...overrides
});

test('POST /messages/threads controller contract is stable', async () => {
    const controller = createMessageController({
        threadService: {
            createMessageThread: async () => ({ threadId: 'thread-1', messageId: 'message-1', recipientCount: 1 })
        }
    });

    const result = await runController(controller.createMessageThreadController, buildReq());

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 201);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.threadId, 'thread-1');
});

test('GET /messages/threads controller contract is stable', async () => {
    const controller = createMessageController({
        threadService: {
            getMessageThreads: async () => ({
                items: [{ id: 'thread-1' }],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
                unreadCount: 0
            })
        }
    });

    const result = await runController(controller.getMessageThreadsController, buildReq());

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(Array.isArray(result.payload.data.items), true);
    assert.equal(result.payload.data.pagination.total, 1);
});

test('GET /messages/parents controller contract is stable', async () => {
    const controller = createMessageController({
        threadService: {
            getParentUsersForMessaging: async () => ({
                parents: [{ id: 'parent-1', displayName: 'Parent One', email: 'p@school.test', studentNames: [] }],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
            })
        }
    });

    const result = await runController(controller.getParentUsersForMessagingController, buildReq());

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.parents[0].id, 'parent-1');
});

test('POST /messages/threads/:threadId/replies controller contract is stable', async () => {
    const controller = createMessageController({
        threadService: {
            replyToMessageThread: async () => ({
                threadId: 'thread-1',
                message: {
                    id: 'message-2',
                    body: 'Reply',
                    senderRole: 'admin',
                    senderName: 'Admin User',
                    isMine: true,
                    createdAt: '2026-03-12T19:00:00.000Z'
                }
            })
        }
    });

    const result = await runController(controller.replyToMessageThreadController, buildReq({ params: { threadId: 'thread-1' } }));

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.message.id, 'message-2');
});

test('PATCH /messages/threads/:threadId/read controller contract is stable', async () => {
    const controller = createMessageController({
        threadService: {
            markMessageThreadRead: async () => ({ threadId: 'thread-1', unreadCount: 0 })
        }
    });

    const result = await runController(controller.markMessageThreadReadController, buildReq({ params: { threadId: 'thread-1' } }));

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.unreadCount, 0);
});

test('controller forwards service errors to shared error middleware path', async () => {
    const expectedError = new Error('Thread not found');
    expectedError.statusCode = 404;

    const controller = createMessageController({
        threadService: {
            getMessageThreadById: async () => {
                throw expectedError;
            }
        }
    });

    const result = await runController(controller.getMessageThreadByIdController, buildReq({ params: { threadId: 'missing' } }));

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload, null);
    assert.equal(result.error, expectedError);
});
