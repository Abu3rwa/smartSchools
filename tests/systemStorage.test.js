import assert from 'node:assert/strict';
import test from 'node:test';
import { getStorageStats, cleanStorage } from '../controllers/systemStorageController.js';

test('systemStorageController exports required handler functions', () => {
    assert.equal(typeof getStorageStats, 'function');
    assert.equal(typeof cleanStorage, 'function');
});

test('cleanStorage requires at least one cleanup target', async () => {
    let statusCode = 200;
    let jsonResponse = null;

    const req = {
        body: { targets: [] }
    };
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            jsonResponse = data;
            return this;
        }
    };

    await cleanStorage(req, res, () => {});

    assert.equal(statusCode, 400);
    assert.equal(jsonResponse?.success, false);
    assert.match(jsonResponse?.message, /specify at least one cleanup target/i);
});
