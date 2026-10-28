import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSessionBillingStatementEmail,
    filterStatementRecipients,
    getStatementEmailAttempt,
    normalizeSessionBillingEmailLanguage
} from '../services/sessionBillingStatementEmail.js';

const statement = (overrides = {}) => ({
    currency: 'USD',
    totals: { balance: -120, charged: 173.33, paid: 100, minutes: 105, sessions: 2 },
    entries: [
        {
            kind: 'charge',
            occurredAt: new Date('2026-10-01T10:00:00Z'),
            minutes: 60,
            hourlyRate: 40,
            amount: 40,
            status: 'active',
            source: 'auto',
            sessionTitle: 'Fractions, decimals'
        },
        {
            kind: 'payment',
            occurredAt: new Date('2026-10-03T10:00:00Z'),
            amount: 100,
            status: 'active',
            method: 'cash'
        },
        {
            kind: 'charge',
            occurredAt: new Date('2026-10-10T10:00:00Z'),
            minutes: 45,
            hourlyRate: 40,
            amount: 33.33,
            status: 'void',
            source: 'manual',
            sessionTitle: 'Off-platform lesson'
        }
    ],
    ...overrides
});

const period = {
    from: new Date('2026-10-01T00:00:00Z'),
    to: new Date('2026-10-31T23:59:59Z')
};

const build = (options = {}) => buildSessionBillingStatementEmail({
    studentName: 'Ruvan Alhaj',
    statement: statement(),
    period,
    school: { name: 'AMLY' },
    sentAt: new Date('2026-10-27T08:00:00Z'),
    ...options
});

test('english statement names the debt and this period totals', () => {
    const email = build();
    assert.equal(email.subject, 'Ruvan Alhaj: lesson account statement');
    assert.match(email.text, /Current balance due: 120\.00 USD\./);
    assert.match(email.text, /Charged this period: 40\.00 USD/);
    assert.match(email.text, /Paid this period: 100\.00 USD/);
    assert.match(email.text, /Recent activity/);
    assert.match(email.text, /Fractions, decimals/);
    assert.match(email.html, /AMLY/);
    assert.match(email.html, /dir="ltr"/);
});

test('a voided lesson is listed but never counted in the period totals', () => {
    const email = build();
    assert.match(email.text, /Off-platform lesson/);
    assert.match(email.text, /Voided/);
    // 33.33 + 40 would be 73.33 if the voided charge leaked into the total.
    assert.doesNotMatch(email.text, /Charged this period: 73\.33/);
});

test('a credit balance is described as credit, not debt', () => {
    const email = build({
        statement: statement({ totals: { balance: 25.5, charged: 0, paid: 0, minutes: 0, sessions: 0 } })
    });
    assert.match(email.text, /Current credit on the account: 25\.50 USD\./);
    assert.match(email.text, /25\.50 USD credit/);
});

test('a zero balance reads as settled', () => {
    const email = build({
        statement: statement({ totals: { balance: 0, charged: 0, paid: 0, minutes: 0, sessions: 0 } })
    });
    assert.match(email.text, /The lesson account is settled\./);
    assert.match(email.text, /Balance: Settled/);
});

test('arabic statement is right to left and keeps latin digits', () => {
    const email = build({ language: 'ar' });
    assert.equal(email.subject, 'كشف حساب دروس Ruvan Alhaj');
    assert.match(email.text, /المبلغ المستحق حاليًا: 120\.00 USD/);
    assert.match(email.text, /المستحق عن هذه الفترة: 40\.00 USD/);
    assert.match(email.html, /dir="rtl"/);
    assert.match(email.html, /lang="ar"/);
});

test('both languages are one message with two sections', () => {
    const email = build({ language: 'both' });
    assert.match(email.subject, /lesson account statement/);
    assert.match(email.subject, /كشف حساب دروس/);
    assert.match(email.text, /Dear family/);
    assert.match(email.text, /أسرة الطالب/);
    assert.equal((email.html.match(/lang="ar"/g) || []).length, 1);
});

test('student names are escaped in the html body', () => {
    const email = build({ studentName: '<b>Ruvan</b>' });
    assert.match(email.html, /&lt;b&gt;Ruvan&lt;\/b&gt;/);
    assert.doesNotMatch(email.html, /<b>Ruvan<\/b>/);
});

test('an empty ledger says so instead of rendering a blank list', () => {
    const email = build({
        statement: statement({ totals: { balance: 0 }, entries: [] })
    });
    assert.match(email.text, /No lesson time or payments have been recorded yet\./);
});

test('recipient filter removes duplicates, blank addresses and opt-outs', () => {
    const recipients = filterStatementRecipients([
        { email: 'Mother@Example.com ', type: 'mother', name: 'Maha' },
        { email: 'mother@example.com', type: 'guardian', name: '' },
        { email: 'dad@example.com', type: 'father', name: 'Samir' },
        { email: 'off@example.com', type: 'student', name: 'Ruvan' },
        { email: '', type: 'student', name: 'Ruvan' }
    ], ['OFF@example.com']);
    assert.deepEqual(recipients, [
        { email: 'mother@example.com', type: 'mother', name: 'Maha' },
        { email: 'dad@example.com', type: 'father', name: 'Samir' }
    ]);
});

test('delivery attempts block duplicates but allow an explicit resend', () => {
    const sent = { status: 'sent', attempt: 1, startedAt: new Date('2026-10-01T10:00:00Z') };
    assert.deepEqual(getStatementEmailAttempt(sent), {
        blocked: true,
        reason: 'duplicate_blocked',
        attempt: 1
    });
    assert.deepEqual(getStatementEmailAttempt(sent, { resend: true }), {
        blocked: false,
        reason: '',
        attempt: 2
    });

    const sending = { status: 'sending', attempt: 2, startedAt: new Date('2026-10-01T10:00:00Z') };
    const now = new Date('2026-10-01T10:05:00Z').getTime();
    assert.equal(getStatementEmailAttempt(sending, { now }).reason, 'sending');

    const stale = { status: 'sending', attempt: 2, startedAt: new Date('2026-10-01T09:00:00Z') };
    assert.deepEqual(getStatementEmailAttempt(stale, { now }), {
        blocked: false,
        reason: '',
        attempt: 3
    });
});

test('language normalisation accepts en, ar, both and defaults to english', () => {
    assert.equal(normalizeSessionBillingEmailLanguage('AR'), 'ar');
    assert.equal(normalizeSessionBillingEmailLanguage('both'), 'both');
    assert.equal(normalizeSessionBillingEmailLanguage('fr'), 'en');
    assert.equal(normalizeSessionBillingEmailLanguage(undefined), 'en');
});
