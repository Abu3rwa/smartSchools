import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlpAccessService, isHomeroomSubject } from '../services/plpAccessService.js';

const query = (value) => ({
    select() { return this; },
    lean: async () => value,
});

const buildAccessService = ({
    classIds = ['class-1'],
    assignment = null,
    studentProfile = null,
} = {}) => createPlpAccessService({
    TeacherModel: { findOne: () => query({ _id: 'teacher-profile' }) },
    SubjectModel: { find: () => ({ select: () => ({ lean: async () => [{ _id: 'homeroom', name: 'Homeroom' }] }) }) },
    ClassModel: { find: () => ({ select: () => ({ lean: async () => classIds.map((_id) => ({ _id })) }) }) },
    SupervisorAssignmentModel: { findOne: () => query(assignment) },
    StudentModel: {
        findOne: (criteria) => query(
            studentProfile
            && String(studentProfile._id) === String(criteria._id)
            && String(studentProfile.user) === String(criteria.user)
            && String(studentProfile.school) === String(criteria.school)
            && studentProfile.status === criteria.status
                ? studentProfile
                : null
        ),
    },
});

test('homeroom scope recognizes configured homeroom/advisory subjects only', () => {
    assert.equal(isHomeroomSubject({ name: 'Homeroom', code: 'HR' }), true);
    assert.equal(isHomeroomSubject({ name: 'Mathematics', code: 'MATH' }), false);
});

test('teacher write access is limited to homeroom classes', async () => {
    const access = buildAccessService();
    const user = { _id: 'teacher-user', school: 'school-1', role: 'teacher' };

    await access.assertTeacherRecordWriteAccess(user, { class: 'class-1', academicYear: '2026-2027' });
    await assert.rejects(
        access.assertTeacherRecordWriteAccess(user, { class: 'class-2', academicYear: '2026-2027' }),
        (error) => error.statusCode === 403
    );
});

test('admins can write school records while supervisors remain read-only and assigned-scope only', async () => {
    const access = buildAccessService({ assignment: { _id: 'assignment-id' } });
    const admin = { _id: 'admin-id', school: 'school-1', role: 'admin' };
    const supervisor = { _id: 'supervisor-id', school: 'school-1', role: 'department_principal' };
    const record = { class: 'class-2', teacher: 'teacher-id', academicYear: '2026-2027' };

    await access.assertTeacherRecordWriteAccess(admin, record);
    await access.assertRecordAccess(supervisor, record);
    await assert.rejects(access.assertTeacherRecordWriteAccess(supervisor, record), (error) => error.statusCode === 403);
});

test('students may read only records linked to their active profile', async () => {
    const access = buildAccessService({
        studentProfile: { _id: 'student-1', user: 'student-user', school: 'school-1', status: 'active' },
    });
    const user = { _id: 'student-user', school: 'school-1', role: 'student' };

    await access.assertRecordAccess(user, { student: 'student-1', teacher: 'teacher-id' });
    await assert.rejects(
        access.assertRecordAccess(user, { student: 'student-2', teacher: 'teacher-id' }),
        (error) => error.statusCode === 403
    );
});
