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

test('audio editing endpoints are admin-only and curriculum word editing is available to spelling staff', async () => {
    const { default: router } = await import('../routes/spellingRoutes.js');
    const getRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/search' && layer.route.methods.get)?.route;
    const deleteRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/examples' && layer.route.methods.delete)?.route;
    const patchExampleRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/examples' && layer.route.methods.patch)?.route;
    const patchPronunciationRoute = router.stack.find((layer) => layer.route?.path === '/word-audio/pronunciation' && layer.route.methods.patch)?.route;
    const patchWordRoute = router.stack.find((layer) => layer.route?.path === '/word-lists/:wordId' && layer.route.methods.patch)?.route;
    assert.ok(getRoute);
    assert.ok(deleteRoute);
    assert.ok(patchExampleRoute);
    assert.ok(patchPronunciationRoute);
    assert.ok(patchWordRoute);
    for (const route of [getRoute, deleteRoute, patchExampleRoute, patchPronunciationRoute]) {
        const guardIndex = route.stack.length - 2;
        assert.equal(runMiddleware(route.stack[guardIndex].handle, { role: 'admin' }, 'school-1').nextCalled, true);
        assert.equal(runMiddleware(route.stack[guardIndex].handle, { role: 'teacher' }, 'school-1').response.statusCode, 403);
        assert.equal(runMiddleware(route.stack[guardIndex].handle, { role: 'student' }, 'school-1').response.statusCode, 403);
    }
    const wordGuard = patchWordRoute.stack[1].handle;
    assert.equal(runMiddleware(wordGuard, { role: 'teacher' }, 'school-1').nextCalled, true);
    assert.equal(runMiddleware(wordGuard, { role: 'student' }, 'school-1').response.statusCode, 403);
});
