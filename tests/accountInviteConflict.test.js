import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountInviteConflictError } from '../services/accountInviteService.js';

test('account invite email conflicts are explicit client errors, not server failures', () => {
    const error = createAccountInviteConflictError(
        'Email is linked to another school account.',
        'ACCOUNT_EMAIL_LINKED_TO_ANOTHER_SCHOOL',
    );

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, 'ACCOUNT_EMAIL_LINKED_TO_ANOTHER_SCHOOL');
    assert.match(error.message, /another school account/);
});
