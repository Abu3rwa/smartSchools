import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../middleware/auth.js';

const run = (middleware, user) => {
    const res = {
        statusCode: null,
        status(code) { this.statusCode = code; return this; },
        json() { return this; }
    };
    let nextCalled = false;
    middleware({ user }, res, () => { nextCalled = true; });
    return { nextCalled, statusCode: res.statusCode };
};

const adminOnly = () => authorize('admin', 'super_admin');

test('an admin-only route refuses an account acting as a teacher even when admin is assigned', () => {
    const result = run(adminOnly(), { role: 'teacher', roles: ['teacher', 'admin'] });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
});

test('an admin-only route allows the account acting as admin', () => {
    assert.equal(run(adminOnly(), { role: 'admin', roles: ['admin', 'teacher'] }).nextCalled, true);
    assert.equal(run(adminOnly(), { role: 'super_admin', roles: [] }).nextCalled, true);
});

test('an admin-only route follows the acting role, not the assigned list', () => {
    const result = run(adminOnly(), { role: 'staff', roles: ['staff', 'admin'] });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
});

test('a route that also allows teachers keeps the assigned-role fallback', () => {
    const shared = authorize('admin', 'department_principal', 'teacher');
    assert.equal(run(shared, { role: 'department_principal', roles: ['department_principal'] }).nextCalled, true);
    assert.equal(run(shared, { role: 'teacher', roles: ['teacher', 'department_principal'] }).nextCalled, true);
});

test('student-only routes still block staff accounts', () => {
    assert.equal(run(authorize('student'), { role: 'teacher', roles: ['teacher'] }).statusCode, 403);
});
