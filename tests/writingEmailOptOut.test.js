import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import test from 'node:test';
import process from 'node:process';
import School from '../models/School.js';
import WritingEmailOptOut from '../models/WritingEmailOptOut.js';
import {
    buildOptOutPage,
    buildOptOutUrl,
    optOutPageFor,
    optOutToken,
    optedOutEmails,
    readOptOutToken,
    recordWritingEmailOptOut
} from '../services/writingEmailOptOutService.js';

const schoolId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const withSecret = (t, value = 'opt-out-test-secret-0123456789') => {
    const previous = process.env.WRITING_EMAIL_OPT_OUT_SECRET;
    process.env.WRITING_EMAIL_OPT_OUT_SECRET = value;
    t.after(() => {
        if (previous === undefined) delete process.env.WRITING_EMAIL_OPT_OUT_SECRET;
        else process.env.WRITING_EMAIL_OPT_OUT_SECRET = previous;
    });
};

const chain = (value) => ({
    select() { return this; },
    lean: async () => value
});

test('a token stands for one school and one address, in either direction', (t) => {
    withSecret(t);
    const token = optOutToken({ schoolId, email: ' Parent@Example.Test ' });
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(readOptOutToken(token), { schoolId, email: 'parent@example.test' });
    assert.equal(readOptOutToken(`${token}x`), null);
    assert.equal(readOptOutToken(''), null);
    assert.equal(readOptOutToken(undefined), null);
});

test('a token signed elsewhere or naming a bad school is refused', (t) => {
    const secret = 'opt-out-test-secret-0123456789';
    withSecret(t, secret);
    const token = optOutToken({ schoolId, email: 'parent@example.test' });
    assert.equal(
        readOptOutToken(token.replace(/.$/, (character) => (character === 'A' ? 'B' : 'A'))),
        null,
        'a changed signature is refused'
    );

    const sign = (body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const badSchool = Buffer.from('not-an-id:parent@example.test', 'utf8').toString('base64url');
    assert.equal(readOptOutToken(`${badSchool}.${sign(badSchool)}`), null);
    const badEmail = Buffer.from(`${schoolId}:no-at-sign`, 'utf8').toString('base64url');
    assert.equal(readOptOutToken(`${badEmail}.${sign(badEmail)}`), null);
});

test('without a signing secret no link is built at all', (t) => {
    const previous = process.env.WRITING_EMAIL_OPT_OUT_SECRET;
    const previousJwt = process.env.JWT_SECRET;
    delete process.env.WRITING_EMAIL_OPT_OUT_SECRET;
    delete process.env.JWT_SECRET;
    t.after(() => {
        if (previous !== undefined) process.env.WRITING_EMAIL_OPT_OUT_SECRET = previous;
        if (previousJwt !== undefined) process.env.JWT_SECRET = previousJwt;
    });
    assert.equal(optOutToken({ schoolId, email: 'parent@example.test' }), '');
    assert.equal(buildOptOutUrl({ baseUrl: 'https://api.example.com', schoolId, email: 'a@b.test' }), '');
});

test('the opt-out link points at the public API route', (t) => {
    withSecret(t);
    const url = buildOptOutUrl({ baseUrl: 'https://api.example.com/', schoolId, email: 'parent@example.test' });
    assert.match(url, /^https:\/\/api\.example\.com\/api\/public\/writing-email-opt-out\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('recording an opt-out is an upsert and never throws', async (t) => {
    const writes = [];
    let behavior = async () => ({ acknowledged: true });
    t.mock.method(WritingEmailOptOut, 'updateOne', (filter, update, options) => {
        writes.push({ filter, update, options });
        return behavior();
    });
    assert.equal(await recordWritingEmailOptOut({ schoolId, email: ' Parent@Example.Test ' }), true);
    assert.deepEqual(writes[0].filter, { school: schoolId, email: 'parent@example.test' });
    assert.equal(writes[0].options.upsert, true);
    assert.equal(writes[0].update.$setOnInsert.source, 'email-link');
    assert.ok(writes[0].update.$setOnInsert.optedOutAt instanceof Date);

    behavior = async () => {
        throw Object.assign(new Error('duplicate key'), { code: 11000 });
    };
    assert.equal(await recordWritingEmailOptOut({ schoolId, email: 'parent@example.test' }), true);

    behavior = async () => {
        throw new Error('database down');
    };
    assert.equal(await recordWritingEmailOptOut({ schoolId, email: 'parent@example.test' }), false);
});

test('only the school own rows suppress an address', async (t) => {
    const filters = [];
    t.mock.method(WritingEmailOptOut, 'find', (filter) => {
        filters.push(filter);
        return chain([{ email: 'parent@example.test' }]);
    });
    const stopped = await optedOutEmails({
        schoolId,
        emails: ['Parent@Example.Test', 'student@example.test', 'parent@example.test']
    });
    assert.deepEqual([...stopped], ['parent@example.test']);
    assert.equal(filters[0].school, schoolId);
    assert.deepEqual(filters[0].email.$in, ['parent@example.test', 'student@example.test']);

    filters.length = 0;
    const none = await optedOutEmails({ schoolId, emails: [] });
    assert.equal(none.size, 0);
    assert.equal(filters.length, 0, 'no addresses means no query');
});

test('the confirmation page asks before it records anything', () => {
    const page = buildOptOutPage({ language: 'en', email: 'parent@example.test', schoolName: 'Al Noor' });
    assert.match(page, /<form method="post" action="">/);
    assert.match(page, /Stop these emails<\/button>/);
    assert.match(page, /parent@example\.test/);
    assert.match(page, /Al Noor/);
    assert.match(page, /noindex/);
});

test('the confirmation page speaks the school language and escapes its input', () => {
    const arabic = buildOptOutPage({ language: 'ar', email: 'parent@example.test', schoolName: 'مدرسة' });
    assert.match(arabic, /dir="rtl"/);
    assert.match(arabic, /lang="ar"/);
    assert.match(arabic, /إيقاف هذه الرسائل/);

    const escaped = buildOptOutPage({ email: '<script>alert(1)</script>@x.test' });
    assert.equal(escaped.includes('<script>alert(1)'), false);
    assert.match(escaped, /&lt;script&gt;/);
});

test('the done and invalid pages say what happened without the button', () => {
    const done = buildOptOutPage({ email: 'parent@example.test', schoolName: 'Al Noor', done: true });
    assert.match(done, /You have been removed/);
    assert.equal(done.includes('<form'), false);

    const invalid = buildOptOutPage({ invalid: true });
    assert.match(invalid, /This link is not valid/);
    assert.equal(invalid.includes('<form'), false);
});

test('a bad token gets a 404 page and never a school lookup', async (t) => {
    withSecret(t);
    t.mock.method(School, 'findOne', () => assert.fail('an invalid token must not name a school'));
    const page = await optOutPageFor({ token: 'nonsense' });
    assert.equal(page.statusCode, 404);
    assert.match(page.html, /This link is not valid/);
});

test('a signed token opens the page for its school', async (t) => {
    withSecret(t);
    t.mock.method(School, 'findOne', () => chain({ name: 'Al Noor', reportSettings: { defaultLanguage: 'arabic' } }));
    const page = await optOutPageFor({ token: optOutToken({ schoolId, email: 'parent@example.test' }) });
    assert.equal(page.statusCode, 200);
    assert.match(page.html, /dir="rtl"/);
    assert.match(page.html, /Al Noor/);
});
