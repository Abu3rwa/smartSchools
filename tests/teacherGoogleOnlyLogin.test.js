import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-with-more-than-twenty-chars';

const User = (await import('../models/User.js')).default;
const {
    login,
    isTeacherOnlyAccount,
    googleSignInIssue
} = await import('../controllers/authenticationController.js');
const { buildInviteEmailContent } = await import('../services/accountInviteService.js');

const teacherAccount = {
    _id: 'user-teacher',
    email: 'teacher@school.test',
    role: 'teacher',
    roles: ['teacher'],
    isActive: true,
    school: 'school-1',
    comparePassword: async () => false
};

const adminTeacherAccount = {
    ...teacherAccount,
    _id: 'user-admin-teacher',
    role: 'admin',
    roles: ['admin', 'teacher']
};

const invokeLogin = async ({ user, body = { email: 'teacher@school.test', password: 'wrong' } }) => {
    const originalFindOne = User.findOne;
    User.findOne = () => ({
        select: () => ({
            setOptions: () => ({
                populate: async () => user
            })
        })
    });
    const res = {
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
    const failure = { error: null };
    const next = (error) => { failure.error = error; };
    try {
        // asyncHandler does not return the handler's promise, so wait for the
        // response instead of awaiting the call.
        login({ body }, res, next);
        for (let attempt = 0; attempt < 100 && !res.body && !failure.error; attempt += 1) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    } finally {
        User.findOne = originalFindOne;
    }
    if (failure.error) throw failure.error;
    return { response: res, body: res.body };
};

test('a teacher-only account is recognised without admin roles', () => {
    assert.equal(isTeacherOnlyAccount(teacherAccount), true);
    assert.equal(isTeacherOnlyAccount(adminTeacherAccount), false);
    assert.equal(isTeacherOnlyAccount({ role: 'student', roles: ['student'] }), false);
    assert.equal(isTeacherOnlyAccount({ role: 'super_admin', roles: ['super_admin', 'teacher'] }), false);
});

test('a teacher password login is refused while the Google-only flag is on', async () => {
    process.env.TEACHER_GOOGLE_ONLY = 'true';
    try {
        const { body } = await invokeLogin({ user: teacherAccount });
        assert.equal(body.success, false);
        assert.equal(body.code, 'TEACHER_GOOGLE_ONLY');
    } finally {
        delete process.env.TEACHER_GOOGLE_ONLY;
    }
});

test('an admin who also teaches keeps password login with the flag on', async () => {
    process.env.TEACHER_GOOGLE_ONLY = 'true';
    try {
        const { body } = await invokeLogin({ user: adminTeacherAccount });
        assert.equal(body.success, false);
        assert.equal(body.code, undefined);
    } finally {
        delete process.env.TEACHER_GOOGLE_ONLY;
    }
});

test('a teacher password login still works while the flag is off', async () => {
    delete process.env.TEACHER_GOOGLE_ONLY;
    const { body } = await invokeLogin({ user: teacherAccount });
    assert.equal(body.code, undefined);
});

test('Google sign-in refuses a deactivated account', () => {
    const user = { ...teacherAccount, isActive: false };
    assert.equal(googleSignInIssue({ user, schoolId: 'school-1', role: 'teacher' }), 'account_inactive');
});

test('the teacher door refuses a Google account that is not a teacher', () => {
    const user = { ...teacherAccount, role: 'student', roles: ['student'] };
    assert.equal(googleSignInIssue({ user, schoolId: 'school-1', role: 'teacher' }), 'not_teacher');
    assert.equal(googleSignInIssue({ user, schoolId: 'school-1', role: '' }), '');
});

test('a Google account from another school is refused', () => {
    assert.equal(
        googleSignInIssue({ user: teacherAccount, schoolId: 'school-2', role: 'teacher' }),
        'school_mismatch'
    );
    assert.equal(
        googleSignInIssue({ user: teacherAccount, schoolId: 'school-1', role: 'teacher' }),
        ''
    );
});

test('Google sign-in never creates an account from the public login page', () => {
    assert.equal(googleSignInIssue({ user: null, schoolId: null, role: '' }), 'no_account');
    assert.equal(googleSignInIssue({ user: null, schoolId: 'school-1', role: 'teacher' }), '');
});

test('a teacher invite carries the Google door and no temporary password', () => {
    const content = buildInviteEmailContent({
        schoolName: 'Springfield',
        recipientName: 'Sam Teacher',
        recipientEmail: 'sam@school.test',
        tempPassword: 'TempPass123',
        role: 'teacher'
    });
    const text = `${content.subject}\n${content.message}\n${content.htmlContent}`;
    assert.match(text, /Sign in with Google/i);
    assert.ok(!text.includes('TempPass123'), 'the invite must not carry a temporary password');
    assert.ok(!/temporary password/i.test(text), 'the invite must not promise a temporary password');
});

test('a non-teacher invite still carries the temporary password', () => {
    const content = buildInviteEmailContent({
        schoolName: 'Springfield',
        recipientName: 'Sam Student',
        recipientEmail: 'sam@school.test',
        tempPassword: 'TempPass123',
        role: 'student'
    });
    assert.ok(content.message.includes('TempPass123'));
});
