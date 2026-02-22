import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMessageToThread,
  applyReadReceiptsForUser,
  buildMessageDeliveryReceipts,
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

