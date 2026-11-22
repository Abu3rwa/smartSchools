import test from 'node:test';
import assert from 'node:assert/strict';
import { actsAsAdmin, isAdminOnly } from './adminAccess.js';

test('an admin-only list is one whose every role is admin or super admin', () => {
  assert.equal(isAdminOnly(['admin']), true);
  assert.equal(isAdminOnly(['admin', 'super_admin']), true);
  assert.equal(isAdminOnly(['admin', 'teacher']), false);
  assert.equal(isAdminOnly([]), false);
  assert.equal(isAdminOnly(undefined), false);
});

test('administration follows the acting role, not the assigned role list', () => {
  assert.equal(actsAsAdmin({ role: 'admin', roles: ['admin', 'teacher'] }), true);
  assert.equal(actsAsAdmin({ role: 'teacher', roles: ['teacher', 'admin'] }), false);
  assert.equal(actsAsAdmin({ role: 'super_admin' }), true);
  assert.equal(actsAsAdmin(null), false);
});
