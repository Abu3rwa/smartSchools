import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

process.env.GOOGLE_CLASSROOM_ENABLED = 'true';
delete process.env.GOOGLE_CLASSROOM_SCHOOL_IDS;

const { syncAssignmentToClassroom } = await import('../services/classroomPublishService.js');
const { ClassroomSyncError } = await import('../services/classroomErrors.js');

const SCHOOL = 'school-1';
const TEACHER = { _id: 'teacher-user-1', role: 'teacher' };

const makeAssignment = (overrides = {}) => ({
    _id: 'assignment-1',
    school: SCHOOL,
    class: 'class-1',
    subject: 'subject-1',
    academicYear: '2026-2027',
    title: 'Fractions',
    instructions: 'Do it',
    maxMarks: 10,
    status: 'draft',
    scope: 'class',
    dueDate: null,
    links: [],
    ...overrides
});

const makeLink = (overrides = {}) => {
    const link = {
        _id: 'link-1',
        school: SCHOOL,
        assignment: 'assignment-1',
        createdBy: TEACHER._id,
        courseId: 'course-1',
        class: 'class-1',
        subject: 'subject-1',
        courseWorkId: null,
        alternateLink: '',
        syncState: 'pending',
        dueDateSynced: false,
        lastErrorCode: '',
        lastError: '',
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
        saves: 0,
        async save() { this.saves += 1; },
        ...overrides
    };
    return link;
};

const googleError = (status) => {
    const error = new Error(`status ${status}`);
    error.response = { status };
    return error;
};

const makeDeps = (state = {}) => {
    const calls = { create: [], patch: [], auth: 0, createLink: 0 };
    const store = { link: state.link || null };
    const deps = {
        calls,
        store,
        hasTeacherProfile: state.hasTeacherProfile || (async () => false),
        getAuthorizedClient: async () => { calls.auth += 1; return { auth: {} }; },
        createCourseWork: state.createCourseWork || (async (auth, courseId, body) => {
            calls.create.push({ courseId, body });
            return { id: 'cw-1', state: body.state, alternateLink: 'https://classroom.google.com/c/x' };
        }),
        patchCourseWork: state.patchCourseWork || (async (auth, courseId, id, patch) => {
            calls.patch.push({ courseId, id, patch });
            return { id, state: patch.requestBody.state || 'PUBLISHED' };
        }),
        findLink: async () => store.link,
        createLink: state.createLink || (async (data) => {
            calls.createLink += 1;
            store.link = makeLink({ ...data, _id: 'link-new', updatedAt: new Date() });
            return store.link;
        }),
        findMapping: state.findMapping || (async () => ({ courseId: 'course-1' })),
        getTimeZone: async () => 'UTC',
        now: () => new Date()
    };
    return deps;
};

test('does nothing for assignments that are not linked unless asked to create', async () => {
    const deps = makeDeps();
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: false, deps
    });
    assert.deepEqual(result, { skipped: true, reason: 'NO_LINK' });
    assert.equal(deps.calls.create.length, 0);
    assert.equal(deps.calls.auth, 0);
});

test('is skipped when the feature flag is off', async () => {
    process.env.GOOGLE_CLASSROOM_ENABLED = 'false';
    try {
        const deps = makeDeps();
        const result = await syncAssignmentToClassroom({
            assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
        });
        assert.deepEqual(result, { skipped: true, reason: 'DISABLED' });
        assert.equal(deps.calls.create.length, 0);
    } finally {
        process.env.GOOGLE_CLASSROOM_ENABLED = 'true';
    }
});

test('creates a Classroom draft for a draft app assignment and records the link', async () => {
    const deps = makeDeps();
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.ok, true);
    assert.equal(deps.calls.create.length, 1);
    assert.equal(deps.calls.create[0].courseId, 'course-1');
    assert.equal(deps.calls.create[0].body.state, 'DRAFT');
    assert.equal(deps.store.link.syncState, 'draft');
    assert.equal(deps.store.link.courseWorkId, 'cw-1');
    assert.equal(result.link.syncState, 'draft');
});

test('creates published coursework when the app assignment is already published', async () => {
    const deps = makeDeps();
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ status: 'published' }), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.ok, true);
    assert.equal(deps.calls.create[0].body.state, 'PUBLISHED');
    assert.equal(result.link.syncState, 'published');
});

test('promotes the linked Classroom draft when the app assignment is published', async () => {
    const link = makeLink({ courseWorkId: 'cw-1', syncState: 'draft' });
    const deps = makeDeps({ link });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ status: 'published' }), actor: TEACHER, createIfMissing: false, deps
    });
    assert.equal(result.ok, true);
    assert.equal(deps.calls.create.length, 0);
    assert.equal(deps.calls.patch.length, 1);
    assert.equal(deps.calls.patch[0].id, 'cw-1');
    assert.match(deps.calls.patch[0].patch.updateMask, /state/);
    assert.equal(link.syncState, 'published');
});

test('does not call Google when no course is mapped', async () => {
    const deps = makeDeps({ findMapping: async () => null });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MAPPING_NOT_FOUND');
    assert.equal(deps.calls.create.length, 0);
    assert.equal(deps.calls.createLink, 0);
});

test('rejects selected-student assignments instead of posting to the whole course', async () => {
    const deps = makeDeps();
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ scope: 'selected_students' }),
        actor: TEACHER,
        createIfMissing: true,
        deps
    });
    assert.equal(result.code, 'UNSUPPORTED_SCOPE');
    assert.equal(deps.calls.create.length, 0);
});

test('only teachers can create a Classroom post', async () => {
    const deps = makeDeps();
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: { _id: 'admin-1', role: 'admin' }, createIfMissing: true, deps
    });
    assert.equal(result.code, 'TEACHER_ONLY');
    assert.equal(deps.calls.create.length, 0);
});

test('admins with a teacher profile can create a Classroom post', async () => {
    const deps = makeDeps({ hasTeacherProfile: async () => true });
    const adminTeacher = { _id: 'admin-teacher-user-1', role: 'admin', school: SCHOOL };
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: adminTeacher, createIfMissing: true, deps
    });

    assert.equal(result.ok, true);
    assert.equal(deps.calls.create.length, 1);
});

test('a failed create is recorded and a retry creates exactly one coursework', async () => {
    let attempts = 0;
    const deps = makeDeps({
        createCourseWork: async (auth, courseId, body) => {
            attempts += 1;
            if (attempts === 1) throw googleError(503);
            return { id: 'cw-2', state: body.state };
        }
    });

    const first = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(first.ok, false);
    assert.equal(first.code, 'UNAVAILABLE');
    assert.equal(deps.store.link.syncState, 'failed');
    assert.equal(deps.store.link.lastErrorCode, 'UNAVAILABLE');
    // Let the failed link be retried immediately.
    deps.store.link.updatedAt = new Date(Date.now() - 10 * 60 * 1000);

    const retry = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(retry.ok, true);
    assert.equal(attempts, 2);
    assert.equal(deps.store.link.courseWorkId, 'cw-2');
    assert.equal(deps.store.link.lastError, '');
    assert.equal(deps.calls.createLink, 1, 'retry must reuse the existing link');

    // Repeated requests after success update the same coursework and never create another.
    const again = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(again.ok, true);
    assert.equal(attempts, 2);
    assert.equal(deps.calls.patch.length, 1);
});

test('a concurrent request that loses the unique-index race does not call Google', async () => {
    const deps = makeDeps({
        createLink: async () => {
            const error = new Error('duplicate key');
            error.code = 11000;
            throw error;
        }
    });
    deps.store.link = null;
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IN_PROGRESS');
    assert.equal(deps.calls.create.length, 0);
});

test('a fresh pending link is treated as in progress', async () => {
    const link = makeLink({ syncState: 'pending', updatedAt: new Date() });
    const deps = makeDeps({ link });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.code, 'IN_PROGRESS');
    assert.equal(deps.calls.create.length, 0);
});

test('edits by someone other than the poster are flagged instead of sent', async () => {
    const link = makeLink({ courseWorkId: 'cw-1', syncState: 'published' });
    const deps = makeDeps({ link });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ status: 'published' }),
        actor: { _id: 'admin-1', role: 'admin' },
        createIfMissing: false,
        deps
    });
    assert.equal(result.code, 'OUT_OF_SYNC');
    assert.equal(deps.calls.patch.length, 0);
    assert.equal(link.syncState, 'published', 'existing coursework keeps its state');
    assert.equal(link.lastErrorCode, 'OUT_OF_SYNC');
});

test('changing class or subject after posting does not patch the old course', async () => {
    const link = makeLink({ courseWorkId: 'cw-1', syncState: 'published' });
    const deps = makeDeps({ link });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ class: 'class-2', status: 'published' }),
        actor: TEACHER,
        createIfMissing: false,
        deps
    });
    assert.equal(result.code, 'CLASS_CHANGED');
    assert.equal(deps.calls.patch.length, 0);
});

test('a Google permission error on update is recorded without losing the existing state', async () => {
    const link = makeLink({ courseWorkId: 'cw-1', syncState: 'draft' });
    const deps = makeDeps({
        link,
        patchCourseWork: async () => { throw googleError(403); }
    });
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment({ status: 'published' }), actor: TEACHER, createIfMissing: false, deps
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PERMISSION_DENIED');
    assert.equal(link.syncState, 'draft');
    assert.equal(link.lastErrorCode, 'PERMISSION_DENIED');
});

test('an authorization failure while connecting is recorded and surfaced', async () => {
    const deps = makeDeps();
    deps.getAuthorizedClient = async () => {
        throw new ClassroomSyncError('NOT_CONNECTED', 'not connected');
    };
    const result = await syncAssignmentToClassroom({
        assignment: makeAssignment(), actor: TEACHER, createIfMissing: true, deps
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_CONNECTED');
    assert.equal(deps.calls.create.length, 0);
    assert.equal(deps.store.link.syncState, 'failed');
});
