import test from 'node:test';
import assert from 'node:assert/strict';
import GmailAppSentMessage from '../models/GmailAppSentMessage.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import {
    moveMessagesToTrash,
    resolveCleanupDateRange
} from '../services/gmailSentCleanupService.js';

test('resolves a local calendar day across a daylight-saving transition', () => {
    const range = resolveCleanupDateRange(
        'today',
        'America/New_York',
        new Date('2026-03-08T16:00:00.000Z')
    );

    assert.equal(range.startAt.toISOString(), '2026-03-08T05:00:00.000Z');
    assert.equal(range.endAt.toISOString(), '2026-03-09T04:00:00.000Z');
});

test('uses Monday as the start of the current week in the device timezone', () => {
    const range = resolveCleanupDateRange(
        'this_week',
        'Europe/Paris',
        new Date('2026-10-15T12:00:00.000Z')
    );

    assert.equal(range.startAt.toISOString(), '2026-10-11T22:00:00.000Z');
    assert.equal(range.endAt.toISOString(), '2026-10-18T22:00:00.000Z');
});

test('computes the current month using local midnight boundaries', () => {
    const range = resolveCleanupDateRange(
        'this_month',
        'Europe/Paris',
        new Date('2026-10-15T12:00:00.000Z')
    );

    assert.equal(range.startAt.toISOString(), '2026-09-30T22:00:00.000Z');
    assert.equal(range.endAt.toISOString(), '2026-10-31T23:00:00.000Z');
});

test('uses the preview cutoff for all-time selection and rejects invalid input', () => {
    const now = new Date('2026-10-15T12:34:56.789Z');
    const range = resolveCleanupDateRange('all_time', 'UTC', now);

    assert.equal(range.startAt, null);
    assert.equal(range.endAt.toISOString(), '2026-10-15T12:34:56.000Z');
    assert.throws(() => resolveCleanupDateRange('forever', 'UTC', now), /valid cleanup period/);
    assert.throws(() => resolveCleanupDateRange('today', '', now), /valid browser\/device timezone/);
    assert.throws(() => resolveCleanupDateRange('today', 'Not/A_Timezone', now), /valid browser\/device timezone/);
});

test('indexes Gmail provider IDs returned by successful app sends', async () => {
    const originalUpdateOne = GmailAppSentMessage.updateOne;
    let indexed;
    GmailAppSentMessage.updateOne = async (...args) => {
        indexed = args;
        return { acknowledged: true };
    };

    try {
        const result = await gmailOAuthService.toSendResult(
            { data: { id: 'gmail-message-1', threadId: 'gmail-thread-1' } },
            'user-1',
            'teacher@example.com'
        );

        assert.equal(result.messageId, 'gmail-message-1');
        assert.equal(indexed[0].user, 'user-1');
        assert.equal(indexed[0].messageId, 'gmail-message-1');
        assert.equal(indexed[1].$setOnInsert.accountEmail, 'teacher@example.com');
    } finally {
        GmailAppSentMessage.updateOne = originalUpdateOne;
    }
});

test('moves matched messages to Trash with bounded concurrency and reports failures', async () => {
    const calls = [];
    const gmail = {
        users: {
            messages: {
                trash: async ({ id }) => {
                    calls.push(id);
                    if (id === 'message-3') throw new Error('Temporary Gmail failure');
                    return {};
                }
            }
        }
    };
    const logger = { warn() {} };

    const result = await moveMessagesToTrash(
        gmail,
        ['message-1', 'message-2', 'message-3', 'message-4', 'message-5', 'message-6', 'message-7'],
        logger
    );

    assert.deepEqual(calls, [
        'message-1', 'message-2', 'message-3', 'message-4', 'message-5', 'message-6', 'message-7'
    ]);
    assert.deepEqual(result, { trashedCount: 6, failedCount: 1 });
});
