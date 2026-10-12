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

test('spelling example-audio cleanup endpoints are available to teachers, not students', async () => {
    const { default: router } = await import('../routes/spellingRoutes.js');
    const getRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/examples' && layer.route.methods.get)?.route;
    const deleteRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/examples' && layer.route.methods.delete)?.route;
    const patchRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/examples' && layer.route.methods.patch)?.route;
    assert.ok(getRoute);
    assert.ok(deleteRoute);
    assert.ok(patchRoute);
    const getGuard = getRoute.stack[0].handle;
    const deleteGuard = deleteRoute.stack[1].handle;
    const patchGuard = patchRoute.stack[1].handle;
    assert.equal(runMiddleware(getGuard, { role: 'teacher' }, 'school-1').nextCalled, true);
    assert.equal(runMiddleware(deleteGuard, { role: 'teacher' }, 'school-1').nextCalled, true);
    assert.equal(runMiddleware(patchGuard, { role: 'teacher' }, 'school-1').nextCalled, true);
    assert.equal(runMiddleware(getGuard, { role: 'student' }, 'school-1').response.statusCode, 403);
    assert.equal(runMiddleware(deleteGuard, { role: 'student' }, 'school-1').response.statusCode, 403);
    assert.equal(runMiddleware(patchGuard, { role: 'student' }, 'school-1').response.statusCode, 403);
});
