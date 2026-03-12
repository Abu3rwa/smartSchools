import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRequestSchema } from '../middleware/schemaValidator.js';
import {
    messageClassesQuerySchema,
    messageParentsQuerySchema,
    messageReplyBodySchema,
    messageThreadCreateBodySchema,
    messageThreadsQuerySchema
} from '../validators/messageValidators.js';

test('messageThreadCreateBodySchema accepts valid messaging compose payload', () => {
    const parsed = messageThreadCreateBodySchema.parse({
        subject: 'Family update',
        body: 'Please review the notice.',
        recipientUserIds: ['507f1f77bcf86cd799439011'],
        classIds: ['507f1f77bcf86cd799439012'],
        includeParents: true,
        includeStudents: false
    });

    assert.equal(parsed.subject, 'Family update');
    assert.equal(parsed.body, 'Please review the notice.');
    assert.equal(parsed.recipientUserIds.length, 1);
});

test('messageReplyBodySchema rejects empty reply body', () => {
    assert.throws(
        () => messageReplyBodySchema.parse({ body: '   ' }),
        /body is required/i
    );
});

test('messageThreadsQuerySchema coerces pagination values', () => {
    const parsed = messageThreadsQuerySchema.parse({
        page: '3',
        limit: '15',
        unreadOnly: 'true'
    });

    assert.equal(parsed.page, 3);
    assert.equal(parsed.limit, 15);
    assert.equal(parsed.unreadOnly, 'true');
});

test('messageClassesQuerySchema enforces classes query boundaries', () => {
    const parsed = messageClassesQuerySchema.parse({
        search: 'grade 5',
        limit: '120'
    });

    assert.equal(parsed.search, 'grade 5');
    assert.equal(parsed.limit, 120);

    assert.throws(
        () => messageClassesQuerySchema.parse({ limit: '900' }),
        /limit must be between 1 and 500/i
    );
});

test('messageParentsQuerySchema supports optional search and pagination', () => {
    const parsed = messageParentsQuerySchema.parse({
        search: 'ali',
        page: '2',
        limit: '10'
    });

    assert.equal(parsed.search, 'ali');
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, 10);
});

test('validateRequestSchema with messageThreadCreateBodySchema returns standardized error payload', async () => {
    const middleware = validateRequestSchema({ bodySchema: messageThreadCreateBodySchema });
    const req = {
        body: {
            subject: '',
            body: ''
        }
    };

    let nextError = null;
    await new Promise((resolve) => {
        middleware(req, {}, (error) => {
            nextError = error || null;
            resolve();
        });
    });

    assert.equal(nextError.statusCode, 400);
    assert.equal(nextError.code, 'VALIDATION_ERROR');
    assert.equal(Array.isArray(nextError.details), true);
    assert.ok(nextError.details.some((entry) => entry.field === 'subject'));
});
