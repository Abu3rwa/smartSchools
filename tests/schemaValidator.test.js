import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

import { validateRequestSchema } from '../middleware/schemaValidator.js';

test('validateRequestSchema attaches parsed values to request', async () => {
    const middleware = validateRequestSchema({
        querySchema: z.object({ page: z.coerce.number().int().min(1) })
    });

    const req = { query: { page: '2' } };
    let nextError = null;

    await new Promise((resolve) => {
        middleware(req, {}, (error) => {
            nextError = error || null;
            resolve();
        });
    });

    assert.equal(nextError, null);
    assert.equal(req.query.page, 2);
});

test('validateRequestSchema forwards standardized validation errors', async () => {
    const middleware = validateRequestSchema({
        querySchema: z.object({ page: z.coerce.number().int().min(1) })
    });

    const req = { query: { page: '0' } };
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
    assert.equal(nextError.details[0].field, 'page');
});
