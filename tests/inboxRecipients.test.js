import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidAddress, resolveRecipients } from '../services/inbox/inboxRecipients.js';

const email = (overrides = {}) => ({
    fromEmail: 'sender@school.org',
    replyToEmail: '',
    toEmails: ['teacher@school.org'],
    ccEmails: [],
    ...overrides
});

test('a valid Reply-To wins over the sender', () => {
    const result = resolveRecipients(email({ replyToEmail: 'office@school.org' }));
    assert.deepEqual(result.to, ['office@school.org']);
});

test('an invalid Reply-To falls back to the sender', () => {
    assert.deepEqual(resolveRecipients(email({ replyToEmail: 'not-an-address' })).to, ['sender@school.org']);
});

test('no valid sender leaves the reply without a recipient', () => {
    assert.deepEqual(resolveRecipients(email({ fromEmail: 'broken@' })).to, []);
});

test('cc is empty unless the teacher asked for it', () => {
    const result = resolveRecipients(email({ ccEmails: ['a@school.org'] }), { includeCc: false });
    assert.deepEqual(result.cc, []);
});

test('cc joins Cc and To, minus the teacher and the primary recipient', () => {
    const result = resolveRecipients(email({
        ccEmails: ['a@school.org', 'teacher@school.org', 'SENDER@school.org'],
        toEmails: ['b@school.org', 'a@school.org', 'broken']
    }), { includeCc: true, selfAddress: 'Teacher@school.org' });

    assert.deepEqual(result.to, ['sender@school.org']);
    assert.deepEqual(result.cc, ['a@school.org', 'b@school.org']);
});

test('cc stops at ten valid addresses', () => {
    const ccEmails = Array.from({ length: 14 }, (_, index) => `person${index}@school.org`);
    const result = resolveRecipients(email({ ccEmails }), { includeCc: true });
    assert.equal(result.cc.length, 10);
});

test('addresses are checked strictly', () => {
    assert.equal(isValidAddress('name@school.org'), true);
    assert.equal(isValidAddress(' name@school.org '), true);
    assert.equal(isValidAddress('name@school'), false);
    assert.equal(isValidAddress('name school.org'), false);
    assert.equal(isValidAddress('a@b@school.org'), false);
    assert.equal(isValidAddress(''), false);
});
