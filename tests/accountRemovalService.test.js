import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildStudentAccountRemovalUpdate,
    buildTeacherAccountRemovalUpdate,
} from '../services/accountRemovalService.js';

test('student account removal anonymizes profile PII while retaining school record identifiers', () => {
    const update = buildStudentAccountRemovalUpdate();

    assert.deepEqual(update.$unset, { email: 1, studentEmail: 1 });
    assert.equal(update.$set.user, null);
    assert.equal(update.$set.firstName, 'Former');
    assert.equal(update.$set.lastName, 'Student');
    assert.equal(update.$set.status, 'inactive');
    assert.deepEqual(update.$set.parentInfo, {});
    assert.deepEqual(update.$set.medicalInfo, {});
    assert.deepEqual(update.$set.enrolledClasses, []);
    assert.equal(update.$set.currentClass, null);
});

test('teacher account removal anonymizes the profile and removes active assignments', () => {
    const update = buildTeacherAccountRemovalUpdate('teacher-1');

    assert.equal(update.$set.employeeId, 'FORMER-teacher-1');
    assert.equal(update.$set.isActive, false);
    assert.deepEqual(update.$set.assignedClasses, []);
    assert.deepEqual(update.$set.address, {});
    assert.deepEqual(update.$set.emergencyContact, {});
});
