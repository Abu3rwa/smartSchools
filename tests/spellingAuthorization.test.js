import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const runMiddleware = (middleware, user, schoolId) => {
    const req = { user, schoolId };
    const response = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
    let nextCalled = false;
    middleware(req, response, () => { nextCalled = true; });
    return { response, nextCalled };
};

test('spelling staff authorization allows teachers and blocks students', () => {
    const middleware = authorize('admin', 'department_principal', 'teacher');
    assert.equal(runMiddleware(middleware, { role: 'teacher' }, 'school-1').nextCalled, true);
    const denied = runMiddleware(middleware, { role: 'student' }, 'school-1');
    assert.equal(denied.nextCalled, false);
    assert.equal(denied.response.statusCode, 403);
});

test('spelling session authorization allows students but requires school context', () => {
    const middleware = authorize('admin', 'department_principal', 'teacher', 'student');
    assert.equal(runMiddleware(middleware, { role: 'student' }, 'school-1').nextCalled, true);
    const missingContext = runMiddleware(requireSchoolContext, { role: 'student' }, null);
    assert.equal(missingContext.nextCalled, false);
    assert.equal(missingContext.response.statusCode, 400);
});
