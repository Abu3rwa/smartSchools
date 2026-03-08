import assert from 'node:assert/strict';
import test from 'node:test';

import { PERMISSIONS } from '../config/permissions.js';
import { buildCommunicationAccess, readPermissionScope } from '../services/communicationScopeService.js';

const buildUser = ({ role, permissions = [], permissionScopes = null, department = null }) => ({
    role,
    permissions,
    permissionScopes: permissionScopes || new Map(),
    department
});

test('teacher gets own class/student-parent communication scope by default role mapping', () => {
    const user = buildUser({ role: 'teacher' });
    const access = buildCommunicationAccess({
        user,
        teacherClassIds: ['class-1', 'class-2'],
        teacherDepartmentId: 'dept-1',
        requestDepartmentId: null,
        allDepartmentIds: ['dept-1', 'dept-2']
    });

    assert.equal(access.canCompose, true);
    assert.deepEqual([...access.studentClassIds].sort(), ['class-1', 'class-2']);
    assert.deepEqual([...access.parentClassIds].sort(), ['class-1', 'class-2']);
    assert.equal(access.schoolStudents, false);
    assert.equal(access.schoolParents, false);
    assert.equal(access.schoolTeachers, false);
});

test('department principal is scoped to department-wide audiences by default role mapping', () => {
    const user = buildUser({ role: 'department_principal', department: 'dept-9' });
    const access = buildCommunicationAccess({
        user,
        teacherClassIds: [],
        teacherDepartmentId: null,
        requestDepartmentId: 'dept-9',
        allDepartmentIds: ['dept-9', 'dept-10']
    });

    assert.equal(access.canCompose, true);
    assert.ok(access.studentDepartmentIds.has('dept-9'));
    assert.ok(access.parentDepartmentIds.has('dept-9'));
    assert.ok(access.teacherDepartmentIds.has('dept-9'));
    assert.ok(access.everyoneDepartmentIds.has('dept-9'));
});

test('staff can receive delegated class/department communication scope via permission scopes', () => {
    const permissionScopes = new Map([
        [PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE, {
            classIds: ['class-77'],
            departmentIds: ['dept-42']
        }]
    ]);
    const user = buildUser({
        role: 'staff',
        permissions: [
            PERMISSIONS.SEND_COMMUNICATION_EMAILS,
            PERMISSIONS.DELEGATED_COMMUNICATION_SCOPE
        ],
        permissionScopes
    });

    const access = buildCommunicationAccess({
        user,
        teacherClassIds: [],
        teacherDepartmentId: null,
        requestDepartmentId: null,
        allDepartmentIds: ['dept-42']
    });

    assert.equal(access.canCompose, true);
    assert.ok(access.studentClassIds.has('class-77'));
    assert.ok(access.parentClassIds.has('class-77'));
    assert.ok(access.studentDepartmentIds.has('dept-42'));
    assert.ok(access.parentDepartmentIds.has('dept-42'));
    assert.ok(access.teacherDepartmentIds.has('dept-42'));
});

test('admin is school-wide for all communication audiences', () => {
    const user = buildUser({ role: 'admin' });
    const access = buildCommunicationAccess({
        user,
        teacherClassIds: [],
        teacherDepartmentId: null,
        requestDepartmentId: null,
        allDepartmentIds: ['dept-1']
    });

    assert.equal(access.canCompose, true);
    assert.equal(access.schoolStudents, true);
    assert.equal(access.schoolParents, true);
    assert.equal(access.schoolTeachers, true);
    assert.equal(access.schoolEveryone, true);
});

test('expired permission scope is ignored', () => {
    const expiredDate = new Date(Date.now() - 3600_000);
    const user = buildUser({
        role: 'staff',
        permissions: [PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS],
        permissionScopes: new Map([
            [PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS, {
                departmentIds: ['dept-1'],
                expiresAt: expiredDate
            }]
        ])
    });

    const scope = readPermissionScope(user, PERMISSIONS.MESSAGE_DEPARTMENT_STUDENTS);
    assert.equal(scope, null);
});

