import assert from 'node:assert/strict';
import test from 'node:test';

import { authorize } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';

const runMiddleware = (middleware, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            resolve({ statusCode: this.statusCode, payload, nextCalled: false });
            return this;
        }
    };

    middleware(req, res, () => {
        resolve({ statusCode: 200, payload: null, nextCalled: true });
    });
});

test('superAdminOnly denies non-super-admin users', async () => {
    const result = await runMiddleware(superAdminOnly, {
        user: { role: 'admin' }
    });

    assert.equal(result.statusCode, 403);
    assert.equal(result.nextCalled, false);
});

test('superAdminOnly allows super_admin users', async () => {
    const result = await runMiddleware(superAdminOnly, {
        user: { role: 'super_admin' }
    });

    assert.equal(result.nextCalled, true);
});

test('authorize admin/department_principal allows school import-template readers', async () => {
    const middleware = authorize('admin', 'department_principal');

    const adminResult = await runMiddleware(middleware, { user: { role: 'admin' } });
    const principalResult = await runMiddleware(middleware, { user: { role: 'department_principal' } });
    const teacherResult = await runMiddleware(middleware, { user: { role: 'teacher' } });

    assert.equal(adminResult.nextCalled, true);
    assert.equal(principalResult.nextCalled, true);
    assert.equal(teacherResult.statusCode, 403);
});
