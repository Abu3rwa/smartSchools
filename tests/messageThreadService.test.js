import assert from 'node:assert/strict';
import test from 'node:test';

import { createMessagingThreadService } from '../services/messaging/messagingThreadService.js';

const buildReq = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    schoolId: 'school-1',
    user: {
        _id: 'actor-1',
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@school.test'
    },
    ...overrides
});

const buildThread = ({ threadId = 'thread-1', recipientUserId = 'parent-1' } = {}) => {
    const thread = {
        _id: threadId,
        subject: 'Subject',
        participants: [
            {
                user: 'actor-1',
                role: 'admin',
                displayName: 'Admin User',
                unreadCount: 0,
                lastReadAt: new Date('2026-03-01T08:00:00.000Z')
            },
            {
                user: recipientUserId,
                role: 'parent',
                displayName: 'Parent One',
                unreadCount: 1,
                lastReadAt: null
            }
        ],
        messages: [
            {
                _id: 'message-1',
                sender: 'actor-1',
                senderRole: 'admin',
                body: 'Hello',
                createdAt: new Date('2026-03-01T08:00:00.000Z'),
                deliveryReceipts: [
                    {
                        user: recipientUserId,
                        deliveredAt: new Date('2026-03-01T08:00:00.000Z'),
                        readAt: null
                    }
                ]
            }
        ],
        isClosed: false,
        lastMessageAt: new Date('2026-03-01T08:00:00.000Z'),
        createdAt: new Date('2026-03-01T08:00:00.000Z'),
        updatedAt: new Date('2026-03-01T08:00:00.000Z'),
        save: async function save() {
            return this;
        }
    };

    return thread;
};

test('createMessageThread returns thread summary contract for manual recipients', async () => {
    const emittedEvents = [];

    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findManualRecipientUsers: async () => ([
                {
                    _id: '507f1f77bcf86cd799439011',
                    role: 'parent',
                    firstName: 'Parent',
                    lastName: 'One',
                    email: 'parent1@school.test'
                }
            ]),
            insertThreads: async (payloads) => payloads.map((payload, index) => ({
                _id: `thread-${index + 1}`,
                ...payload,
                messages: payload.messages.map((message, messageIndex) => ({
                    _id: `message-${messageIndex + 1}`,
                    ...message
                }))
            }))
        },
        realtimeService: {
            appendMessageToThread: () => {
                throw new Error('not needed');
            },
            applyReadReceiptsForUser: () => {
                throw new Error('not needed');
            },
            emitMessageThreadEvent: async (payload) => {
                emittedEvents.push(payload);
            }
        }
    });

    const data = await service.createMessageThread({
        req: buildReq({
            body: {
                subject: 'Family update',
                body: 'Please check the latest notice.',
                recipientUserIds: ['507f1f77bcf86cd799439011']
            }
        })
    });

    assert.equal(data.threadId, 'thread-1');
    assert.equal(data.messageId, 'message-1');
    assert.equal(data.recipientCount, 1);
    assert.equal(data.recipientBreakdown.parents, 1);
    assert.equal(data.recipientBreakdown.students, 0);
    assert.equal(data.threads.length, 1);
    assert.equal(emittedEvents.length, 1);
});

test('createMessageThread rejects when class audience toggles are both disabled', async () => {
    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findManualRecipientUsers: async () => [],
            insertThreads: async () => []
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    await assert.rejects(
        () => service.createMessageThread({
            req: buildReq({
                body: {
                    subject: 'Reminder',
                    body: 'Body',
                        classIds: ['507f1f77bcf86cd799439011'],
                    includeParents: false,
                    includeStudents: false
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 400);
            assert.match(error.message, /Enable at least one class audience/i);
            return true;
        }
    );
});

test('createMessageThread enforces teacher scoped manual recipients', async () => {
    let classAudienceCalls = 0;

    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: ['class-1'],
                deniedClassIds: [],
                allAccessibleClassIds: ['class-1']
            }),
            resolveRecipientUsersForClasses: async () => {
                classAudienceCalls += 1;
                return {
                    recipientUsers: [
                        {
                            _id: '507f1f77bcf86cd799439014',
                            role: 'parent',
                            firstName: 'Allowed',
                            lastName: 'Parent',
                            email: 'allowed@school.test'
                        }
                    ],
                    classStats: new Map()
                };
            }
        },
        repository: {
            findManualRecipientUsers: async () => ([
                {
                    _id: '507f1f77bcf86cd799439012',
                    role: 'parent',
                    firstName: 'Other',
                    lastName: 'Parent',
                    email: 'other@school.test'
                }
            ]),
            insertThreads: async () => []
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    await assert.rejects(
        () => service.createMessageThread({
            req: buildReq({
                user: {
                    _id: 'teacher-1',
                    role: 'teacher',
                    firstName: 'Teacher',
                    lastName: 'One',
                    email: 'teacher@school.test'
                },
                body: {
                    subject: 'Message',
                    body: 'Body',
                    recipientUserIds: ['507f1f77bcf86cd799439012']
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.match(error.message, /assigned classes/i);
            return true;
        }
    );

    assert.equal(classAudienceCalls, 1);
});

test('createMessageThread returns deniedClassIds data when class authorization fails', async () => {
    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: ['class-denied'],
                allAccessibleClassIds: ['class-1']
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findManualRecipientUsers: async () => [],
            insertThreads: async () => []
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    await assert.rejects(
        () => service.createMessageThread({
            req: buildReq({
                body: {
                    subject: 'Message',
                    body: 'Body',
                    classIds: ['507f1f77bcf86cd799439013'],
                    includeParents: true,
                    includeStudents: false
                }
            })
        }),
        (error) => {
            assert.equal(error.statusCode, 403);
            assert.deepEqual(error.data, { deniedClassIds: ['class-denied'] });
            return true;
        }
    );
});

test('getMessageThreads preserves paging contract and school scoping', async () => {
    const capturedArgs = [];

    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findThreadsForUser: async (args) => {
                capturedArgs.push(args);
                return [[buildThread()], 1];
            }
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    const data = await service.getMessageThreads({
        req: buildReq({
            query: {
                page: '2',
                limit: '5',
                unreadOnly: 'true'
            }
        })
    });

    assert.equal(capturedArgs.length, 1);
    assert.equal(capturedArgs[0].schoolId, 'school-1');
    assert.equal(capturedArgs[0].page, 2);
    assert.equal(capturedArgs[0].limit, 5);
    assert.equal(capturedArgs[0].unreadOnly, true);
    assert.equal(data.items.length, 1);
    assert.equal(data.pagination.page, 2);
    assert.equal(data.pagination.total, 1);
    assert.equal(data.unreadCount, 0);
});

test('replyToMessageThread returns message contract', async () => {
    const thread = buildThread();

    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findThreadForUser: async () => thread
        },
        realtimeService: {
            appendMessageToThread: ({ thread: targetThread, senderUser, body, createdAt }) => {
                const message = {
                    _id: 'message-2',
                    body,
                    senderRole: senderUser.role,
                    createdAt,
                    deliveryReceipts: []
                };
                targetThread.messages.push(message);
                return message;
            },
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    const data = await service.replyToMessageThread({
        req: buildReq({
            params: { threadId: 'thread-1' },
            body: { body: 'Reply body' }
        })
    });

    assert.equal(data.threadId, 'thread-1');
    assert.equal(data.message.id, 'message-2');
    assert.equal(data.message.body, 'Reply body');
    assert.equal(data.message.isMine, true);
});

test('markMessageThreadRead updates read receipts and returns unreadCount zero', async () => {
    const thread = buildThread();
    let readReceiptCalls = 0;

    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findThreadForUser: async () => thread
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {
                readReceiptCalls += 1;
            },
            emitMessageThreadEvent: async () => {}
        }
    });

    const data = await service.markMessageThreadRead({
        req: buildReq({ params: { threadId: 'thread-1' } })
    });

    assert.equal(readReceiptCalls, 1);
    assert.equal(data.threadId, 'thread-1');
    assert.equal(data.unreadCount, 0);
    assert.equal(thread.participants[0].unreadCount, 0);
});

test('getParentUsersForMessaging returns empty teacher scope when no classes are assigned', async () => {
    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findParentScopeStudents: async () => [],
            findParents: async () => [[], 0],
            findParentsByEmails: async () => [],
            findStudentsByParentEmails: async () => []
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    const data = await service.getParentUsersForMessaging({
        req: buildReq({
            user: {
                _id: 'teacher-1',
                role: 'teacher',
                firstName: 'Teacher',
                lastName: 'One',
                email: 'teacher@school.test'
            }
        })
    });

    assert.deepEqual(data.parents, []);
    assert.equal(data.pagination.total, 0);
    assert.equal(data.pagination.totalPages, 1);
});

test('getMessageThreadById throws not found when thread is missing', async () => {
    const service = createMessagingThreadService({
        audienceService: {
            resolveClassScopeForMessaging: async () => ({
                allowedClassIds: [],
                deniedClassIds: [],
                allAccessibleClassIds: []
            }),
            resolveRecipientUsersForClasses: async () => ({ recipientUsers: [], classStats: new Map() })
        },
        repository: {
            findThreadForUser: async () => null
        },
        realtimeService: {
            appendMessageToThread: () => ({}),
            applyReadReceiptsForUser: () => {},
            emitMessageThreadEvent: async () => {}
        }
    });

    await assert.rejects(
        () => service.getMessageThreadById({
            req: buildReq({ params: { threadId: 'missing-thread' } })
        }),
        (error) => {
            assert.equal(error.statusCode, 404);
            assert.equal(error.message, 'Thread not found');
            return true;
        }
    );
});
