import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDemoRequestPayload } from '../services/demoRequestService.js';

const validPayload = {
    name: 'Layla Hassan',
    schoolName: 'Bright Future School',
    email: 'layla@brightfuture.edu',
    phone: '+971 50 123 4567',
    role: 'Principal',
    message: 'We would like a walkthrough for grades 4–6.'
};

test('a complete demo request is accepted and normalized', () => {
    const result = validateDemoRequestPayload({ ...validPayload, email: '  Layla@BrightFuture.EDU ', name: '  Layla Hassan  ' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.value.email, 'layla@brightfuture.edu');
    assert.equal(result.value.name, 'Layla Hassan');
});

test('name, school and a valid email are required', () => {
    const result = validateDemoRequestPayload({});
    assert.equal(result.valid, false);
    assert.deepEqual([...result.errors].sort(), ['email', 'name', 'schoolName']);
});

test('an email without a domain dot is rejected', () => {
    const result = validateDemoRequestPayload({ ...validPayload, email: 'layla@brightfuture' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('email'));
});

test('long fields are rejected instead of silently truncated', () => {
    const result = validateDemoRequestPayload({
        ...validPayload,
        message: 'x'.repeat(2001),
        phone: '1'.repeat(41),
        role: 'r'.repeat(81)
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('message'));
    assert.ok(result.errors.includes('phone'));
    assert.ok(result.errors.includes('role'));
});

test('optional fields may be omitted', () => {
    const result = validateDemoRequestPayload({
        name: 'Omar',
        schoolName: 'Al Noor',
        email: 'omar@alnoor.sch.ae'
    });
    assert.equal(result.valid, true);
    assert.equal(result.value.phone, '');
    assert.equal(result.value.role, '');
    assert.equal(result.value.message, '');
});
