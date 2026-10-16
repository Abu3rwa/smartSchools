import assert from 'node:assert/strict';
import test from 'node:test';
import { GOOGLE_SUITE_SCOPES } from '../config/googleSuiteOAuthScopes.js';

test('shared Google consent includes Classroom, Forms, Gmail sending, and mailbox cleanup scopes', () => {
    assert.equal(new Set(GOOGLE_SUITE_SCOPES).size, GOOGLE_SUITE_SCOPES.length);
    for (const scope of [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students',
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/forms.responses.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email'
    ]) {
        assert.ok(GOOGLE_SUITE_SCOPES.includes(scope), `missing OAuth scope ${scope}`);
    }
});
