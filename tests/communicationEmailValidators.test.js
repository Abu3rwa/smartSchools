import assert from 'node:assert/strict';
import test from 'node:test';

import {
    communicationEmailSendBodySchema,
    communicationEmailSuggestionsQuerySchema
} from '../validators/communicationEmailValidators.js';

test('communicationEmailSendBodySchema accepts a valid payload', () => {
    const parsed = communicationEmailSendBodySchema.parse({
        subject: 'Weekly update',
        bodyHtml: '<p>Hello</p>',
        toParents: [{ key: 'grp:parents:school' }],
        attachmentIds: ['507f1f77bcf86cd799439011']
    });

    assert.equal(parsed.subject, 'Weekly update');
    assert.equal(parsed.attachmentIds.length, 1);
});

test('communicationEmailSuggestionsQuerySchema enforces allowed fields', () => {
    assert.throws(
        () => communicationEmailSuggestionsQuerySchema.parse({
            field: 'unknown',
            page: 1,
            limit: 20
        }),
        /parents|teachers|students/
    );
});
