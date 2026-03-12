import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMessageToThread,
  applyReadReceiptsForUser,
  buildMessageDeliveryReceipts,
  emitMessageThreadEvent,
} from '../services/messageRealtimeService.js';

test('buildMessageDeliveryReceipts excludes sender and deduplicates participants', () => {
  const now = new Date('2026-02-22T10:00:00.000Z');
  const receipts = buildMessageDeliveryReceipts({
    participants: [
      { user: 'u1' },
      { user: 'u2' },
      { user: 'u2' },
      { user: 'u3' },
    ],
    senderUserId: 'u1',
    deliveredAt: now,
  });

  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts.map((item) => item.user).sort(), ['u2', 'u3']);
  assert.ok(receipts.every((item) => item.deliveredAt === now));
});

test('appendMessageToThread increments unread counters and creates delivery receipts', () => {
  const now = new Date('2026-02-22T10:30:00.000Z');
  const thread = {
    participants: [
      { user: 'parent-1', unreadCount: 0, lastReadAt: now },
      { user: 'teacher-1', unreadCount: 0, lastReadAt: now },
    ],
    messages: [],
    lastMessageAt: null,
  };
  const sender = { _id: 'teacher-1', role: 'teacher', firstName: 'Tina', lastName: 'Teacher' };

  const message = appendMessageToThread({
    thread,
    senderUser: sender,
    body: 'Please review tonight homework.',
    createdAt: now,
  });

  assert.equal(thread.messages.length, 1);
  assert.equal(message.body, 'Please review tonight homework.');
  assert.equal(thread.participants[0].unreadCount, 1);
  assert.equal(thread.participants[1].unreadCount, 0);
  assert.equal(message.deliveryReceipts.length, 1);
  assert.equal(String(message.deliveryReceipts[0].user), 'parent-1');
});

test('applyReadReceiptsForUser marks unread messages as read for participant', () => {
  const createdAt = new Date('2026-02-22T11:00:00.000Z');
  const readAt = new Date('2026-02-22T11:05:00.000Z');
  const thread = {
    participants: [
      { user: 'parent-1', unreadCount: 1, lastReadAt: null },
      { user: 'teacher-1', unreadCount: 0, lastReadAt: createdAt },
    ],
    messages: [
      {
        sender: 'teacher-1',
        body: 'Message body',
        createdAt,
        deliveryReceipts: [
          { user: 'parent-1', deliveredAt: createdAt, readAt: null },
        ],
      },
    ],
  };

  applyReadReceiptsForUser({
    thread,
    readerUserId: 'parent-1',
    readAt,
  });

  const receipt = thread.messages[0].deliveryReceipts[0];
  assert.equal(String(receipt.user), 'parent-1');
  assert.equal(receipt.readAt.getTime(), readAt.getTime());
});

test('emitMessageThreadEvent emits realtime and push payloads for message events', async () => {
  const realtimeCalls = [];
  const pushCalls = [];
  const loggerCalls = [];

  await emitMessageThreadEvent({
    thread: {
      _id: 'thread-1',
      school: 'school-1',
      subject: 'Important',
      participants: [{ user: 'teacher-1' }, { user: 'parent-1' }],
    },
    actorUser: {
      _id: 'teacher-1',
      firstName: 'Teacher',
      lastName: 'One',
    },
    event: 'message',
    message: {
      _id: 'message-2',
      body: 'Please review this update.',
    },
    includePush: true,
    emitRealtimeEvent: (payload) => realtimeCalls.push(payload),
    sendPush: async (payload) => {
      pushCalls.push(payload);
      return { sent: 1, failed: 0 };
    },
    loggerRef: {
      warn: (name, payload) => loggerCalls.push({ level: 'warn', name, payload }),
      error: (name, payload) => loggerCalls.push({ level: 'error', name, payload }),
    },
  });

  assert.equal(realtimeCalls.length, 1);
  assert.equal(realtimeCalls[0].event, 'message.thread.message');
  assert.equal(realtimeCalls[0].data.threadId, 'thread-1');
  assert.equal(pushCalls.length, 1);
  assert.deepEqual(pushCalls[0].userIds, ['parent-1']);
  assert.equal(loggerCalls.length, 0);
});

test('emitMessageThreadEvent logs push dispatch failures without throwing', async () => {
  const loggerCalls = [];

  await emitMessageThreadEvent({
    thread: {
      _id: 'thread-2',
      school: 'school-2',
      subject: 'Alert',
      participants: [{ user: 'teacher-1' }, { user: 'parent-1' }],
    },
    actorUser: {
      _id: 'teacher-1',
      firstName: 'Teacher',
      lastName: 'One',
    },
    event: 'message',
    message: {
      _id: 'message-3',
      body: 'Push failure simulation',
    },
    includePush: true,
    emitRealtimeEvent: () => {},
    sendPush: async () => {
      throw new Error('push failed');
    },
    loggerRef: {
      warn: () => {},
      error: (name, payload) => loggerCalls.push({ name, payload }),
    },
  });

  assert.equal(loggerCalls.length, 1);
  assert.equal(loggerCalls[0].name, 'message_push_dispatch_failed');
  assert.match(String(loggerCalls[0].payload.error), /push failed/i);
});

