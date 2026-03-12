import assert from 'node:assert/strict';
import test from 'node:test';

import { mapThreadDetail, mapThreadSummary } from '../services/messaging/messagingMapperService.js';
import {
    buildClassLabel,
    normalizeObjectIdArray,
    parseBoolean,
    parsePositiveInt,
    toDisplayName
} from '../services/messaging/messagingUtils.js';

test('mapThreadSummary returns stable thread summary shape', () => {
    const summary = mapThreadSummary({
        currentUserId: 'user-1',
        thread: {
            _id: 'thread-1',
            subject: 'Homework follow-up',
            participants: [
                { user: 'user-1', displayName: 'Teacher One', unreadCount: 0 },
                { user: 'user-2', displayName: 'Parent One', unreadCount: 1 }
            ],
            messages: [
                { body: 'Latest message', createdAt: new Date('2026-03-01T10:00:00.000Z') }
            ],
            lastMessageAt: new Date('2026-03-01T10:00:00.000Z'),
            isClosed: false
        }
    });

    assert.equal(summary.id, 'thread-1');
    assert.equal(summary.preview, 'Latest message');
    assert.equal(summary.unreadCount, 0);
    assert.equal(summary.isRead, true);
});

test('mapThreadDetail maps sorted messages and delivery receipts', () => {
    const detail = mapThreadDetail({
        currentUser: { _id: 'user-1', firstName: 'Teacher', lastName: 'One' },
        thread: {
            _id: 'thread-1',
            subject: 'Subject',
            participants: [
                { user: 'user-1', displayName: 'Teacher One', unreadCount: 0 },
                { user: 'user-2', displayName: 'Parent One', unreadCount: 2 }
            ],
            messages: [
                {
                    _id: 'message-2',
                    sender: 'user-2',
                    senderRole: 'parent',
                    body: 'Later message',
                    createdAt: new Date('2026-03-01T11:00:00.000Z'),
                    deliveryReceipts: [{ user: 'user-1', deliveredAt: null, readAt: null }]
                },
                {
                    _id: 'message-1',
                    sender: 'user-1',
                    senderRole: 'teacher',
                    body: 'Earlier message',
                    createdAt: new Date('2026-03-01T10:00:00.000Z'),
                    deliveryReceipts: []
                }
            ],
            isClosed: true
        }
    });

    assert.equal(detail.thread.id, 'thread-1');
    assert.equal(detail.thread.isClosed, true);
    assert.equal(detail.messages[0].id, 'message-1');
    assert.equal(detail.messages[1].id, 'message-2');
    assert.equal(detail.messages[0].isMine, true);
    assert.equal(detail.messages[1].deliveryReceipts.length, 1);
});

test('messagingUtils normalize and parse helpers preserve expected behavior', () => {
    const ids = normalizeObjectIdArray([
        '507f1f77bcf86cd799439011',
        'bad-id',
        '507f1f77bcf86cd799439011'
    ]);

    assert.deepEqual(ids, ['507f1f77bcf86cd799439011']);
    assert.equal(parseBoolean('true', false), true);
    assert.equal(parseBoolean('0', true), false);
    assert.equal(parsePositiveInt('7', 1, 10), 7);
    assert.equal(parsePositiveInt('999', 1, 10), 10);
    assert.equal(parsePositiveInt('bad', 3, 10), 3);
});

test('messagingUtils display name and class label helpers use fallbacks', () => {
    assert.equal(
        toDisplayName({ firstName: 'Ali', lastName: 'Teacher', email: 'ali@school.test' }),
        'Ali Teacher'
    );
    assert.equal(
        toDisplayName({ firstName: '', lastName: '', email: 'fallback@school.test' }),
        'fallback@school.test'
    );

    assert.equal(
        buildClassLabel({ name: 'Blue', grade: 5, section: 'A' }),
        'Blue · Grade 5 · A'
    );
    assert.equal(buildClassLabel({}), 'Class');
});
