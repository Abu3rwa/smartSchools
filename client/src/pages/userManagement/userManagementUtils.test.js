import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSIONS } from '../../constants/permissions.js';
import {
  authorizationChanged,
  buildInitialDraft,
  canViewUserManagement,
  draftsEqual,
  emptyDraft,
  filterPermissionGroups,
  getAssignedRoles,
  isAuthorizationActor,
  normalizePermissions,
  permissionDeltas,
  validateDraft
} from './userManagementUtils.js';

test('normalizePermissions dedupes arrays and splits comma strings', () => {
  assert.deepEqual(normalizePermissions(['a', 'a', ' b ', '']), ['a', 'b']);
  assert.deepEqual(normalizePermissions('a, b ,a'), ['a', 'b']);
  assert.deepEqual(normalizePermissions(null), []);
  assert.deepEqual(normalizePermissions(undefined), []);
});

test('getAssignedRoles prefers roles[] and falls back to the active role', () => {
  assert.deepEqual(getAssignedRoles({ role: 'teacher', roles: ['teacher', 'staff', 'teacher'] }), ['teacher', 'staff']);
  assert.deepEqual(getAssignedRoles({ role: 'teacher', roles: [] }), ['teacher']);
  assert.deepEqual(getAssignedRoles({ role: 'teacher' }), ['teacher']);
  assert.deepEqual(getAssignedRoles(null), []);
});

test('authorization actor means assigned admin, not just the active role', () => {
  assert.equal(isAuthorizationActor({ role: 'admin' }), true);
  assert.equal(isAuthorizationActor({ role: 'super_admin' }), true);
  assert.equal(isAuthorizationActor({ role: 'teacher', roles: ['teacher', 'admin'] }), true);
  assert.equal(isAuthorizationActor({ role: 'teacher', roles: ['teacher'] }), false);
  assert.equal(isAuthorizationActor(null), false);
});

test('viewing matches the backend policy: admins or manage_users/manage_school_settings grants', () => {
  assert.equal(canViewUserManagement({ role: 'admin' }), true);
  assert.equal(canViewUserManagement({ role: 'teacher', roles: ['teacher', 'admin'] }), true);
  assert.equal(canViewUserManagement({ role: 'staff', permissions: [PERMISSIONS.MANAGE_USERS] }), true);
  assert.equal(canViewUserManagement({ role: 'staff', permissions: [PERMISSIONS.MANAGE_SCHOOL_SETTINGS] }), true);
  assert.equal(canViewUserManagement({ role: 'teacher', permissions: [] }), false);
  assert.equal(canViewUserManagement(null), false);
});

test('buildInitialDraft normalizes a populated user record', () => {
  const draft = buildInitialDraft({
    role: 'department_principal',
    roles: ['department_principal', 'teacher'],
    department: { _id: 'dept1', name: 'English' },
    permissions: ['manage_users', 'manage_users', ''],
    titles: [' Head of English ', 'Head of English', '']
  });
  assert.deepEqual(draft, {
    role: 'department_principal',
    roles: ['department_principal', 'teacher'],
    department: 'dept1',
    permissions: ['manage_users'],
    titles: ['Head of English']
  });
  assert.deepEqual(buildInitialDraft(null), emptyDraft());
  assert.equal(buildInitialDraft({ role: 'teacher', department: 'dept2' }).department, 'dept2');
});

test('validateDraft enforces nonempty roles, active-role membership, and title length', () => {
  assert.deepEqual(validateDraft({ role: 'teacher', roles: ['teacher'], titles: [] }), {});
  assert.equal(validateDraft({ role: 'teacher', roles: [], titles: [] }).roles, 'rolesRequired');
  assert.equal(validateDraft({ role: 'admin', roles: ['teacher'], titles: [] }).role, 'roleNotAssigned');
  assert.equal(validateDraft({ role: 'teacher', roles: ['teacher'], titles: ['x'.repeat(101)] }).titles, 'titleTooLong');
  assert.deepEqual(validateDraft({ role: 'teacher', roles: ['teacher'], titles: ['x'.repeat(100)] }), {});
});

test('draftsEqual ignores ordering of roles and permissions but not titles', () => {
  const a = { role: 'teacher', roles: ['teacher', 'staff'], department: '', permissions: ['p1', 'p2'], titles: ['A'] };
  const b = { role: 'teacher', roles: ['staff', 'teacher'], department: '', permissions: ['p2', 'p1'], titles: ['A'] };
  assert.equal(draftsEqual(a, b), true);
  assert.equal(draftsEqual(a, { ...b, titles: ['B'] }), false);
  assert.equal(draftsEqual(a, null), false);
});

test('authorizationChanged ignores title-only edits', () => {
  const initial = buildInitialDraft({ role: 'teacher', roles: ['teacher'], permissions: [], titles: ['A'] });
  assert.equal(authorizationChanged(initial, { ...initial, titles: ['A', 'B'] }), false);
  assert.equal(authorizationChanged(initial, { ...initial, roles: ['teacher', 'staff'] }), true);
  assert.equal(authorizationChanged(initial, { ...initial, permissions: ['manage_users'] }), true);
  assert.equal(authorizationChanged(initial, { ...initial, department: 'dept1' }), true);
});

test('permissionDeltas reports grants and revocations', () => {
  const initial = { permissions: ['p1', 'p2'] };
  const draft = { permissions: ['p2', 'p3'] };
  assert.deepEqual(permissionDeltas(initial, draft), { added: ['p3'], removed: ['p1'] });
  assert.deepEqual(permissionDeltas(null, null), { added: [], removed: [] });
});

test('filterPermissionGroups searches key, label, and description and honors selected-only', () => {
  const groups = {
    academic: [
      { key: 'manage_grades', label: 'Manage Grades', description: 'Enter and edit grades' },
      { key: 'view_reports', label: 'View Reports', description: 'See report cards' }
    ],
    admin: [
      { key: 'manage_users', label: 'Manage Users', description: 'Edit school users' }
    ]
  };
  assert.deepEqual(
    filterPermissionGroups(groups, { query: 'report', selected: [] }).map(([category]) => category),
    ['academic']
  );
  assert.deepEqual(
    filterPermissionGroups(groups, { query: 'MANAGE_USERS', selected: [] }),
    [['admin', [groups.admin[0]]]]
  );
  assert.deepEqual(
    filterPermissionGroups(groups, { query: '', selectedOnly: true, selected: ['manage_users'] }),
    [['admin', [groups.admin[0]]]]
  );
  assert.deepEqual(filterPermissionGroups(groups, { query: 'nothing-matches', selected: [] }), []);
  assert.deepEqual(filterPermissionGroups(groups, { query: 'grades edit', selected: [] }), []);
});