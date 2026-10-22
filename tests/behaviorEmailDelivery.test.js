import test from 'node:test';
import assert from 'node:assert/strict';

import BehaviorNotification from '../models/BehaviorNotification.js';
import BehaviorAuditLog from '../models/BehaviorAuditLog.js';
import User from '../models/User.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import { deliverBehaviorEmails } from '../services/behavior/emailDeliveryService.js';
import { renderBehaviorEmailHtml } from '../services/behavior/emailHtml.js';

const originals = {
    count: BehaviorNotification.countDocuments,
    claim: BehaviorNotification.findOneAndUpdate,
    finalize: BehaviorNotification.updateOne,
    auditCreate: BehaviorAuditLog.create,
    userFind: User.find,
    hasValidTokens: gmailOAuthService.hasValidTokens,
    sendEmail: gmailOAuthService.sendEmail
};

const restore = () => {
    BehaviorNotification.countDocuments = originals.count;
    BehaviorNotification.findOneAndUpdate = originals.claim;
    BehaviorNotification.updateOne = originals.finalize;
    BehaviorAuditLog.create = originals.auditCreate;
    User.find = originals.userFind;
    gmailOAuthService.hasValidTokens = originals.hasValidTokens;
    gmailOAuthService.sendEmail = originals.sendEmail;
};

const SETTINGS_ON = { emailDelivery: { enabled: true, defaultLanguage: 'en' } };

const queuedRow = (overrides = {}) => ({
    _id: 'note-1',
    school: 'school-1',
    incident: 'inc-1',
    channel: 'email',
    language: 'en',
    status: 'draft',
    subject: 'About Sara: Phone use',
    body: 'Dear parent,\nSara was involved in an incident.',
    recipients: [
        { name: 'Mr Sara', email: 'father@example.test', relation: 'father' },
        { name: 'Mrs Sara', email: 'mother@example.test', relation: 'mother' }
    ],
    cc: [{ role: 'admin', name: 'Vice', email: 'vice@example.test' }],
    attempts: 1,
    ...overrides
});

const wiring = ({ row = queuedRow(), claim = true } = {}) => {
    const counts = [];
    const sent = [];
    const writes = [];
    let claimed = 0;

    BehaviorAuditLog.create = async (payload) => payload;
    BehaviorNotification.countDocuments = async (filter) => {
        counts.push(filter);
        return 1;
    };
    BehaviorNotification.findOneAndUpdate = async () => {
        claimed += 1;
        // Only the first pass claims; the loop must then stop.
        if (!claim || claimed > 1) return null;
        return row;
    };
    BehaviorNotification.updateOne = async (filter, update) => {
        writes.push({ filter, update: update.$set || update });
        return { modifiedCount: 1 };
    };
    User.find = () => ({
        select: () => ({ setOptions: () => ({ lean: async () => [{ _id: 'admin-1' }] }) })
    });
    gmailOAuthService.hasValidTokens = async () => true;
    gmailOAuthService.sendEmail = async (senderId, mailOptions) => {
        sent.push({ senderId, mailOptions });
        return { messageId: 'mid-1', threadId: 'tid-1' };
    };

    return { counts, sent, writes };
};

test('the dispatcher leaves the queue untouched while the deployment gate is off', async () => {
    const { sent, writes } = wiring();
    let claims = 0;
    BehaviorNotification.findOneAndUpdate = async () => {
        claims += 1;
        return null;
    };

    const summary = await deliverBehaviorEmails({
        schoolId: 'school-1',
        settings: SETTINGS_ON,
        deliver: false
    });

    assert.equal(summary.dryRun, true);
    assert.equal(summary.reason, 'DEPLOYMENT_GATE_OFF');
    assert.equal(summary.due, 1);
    assert.equal(claims, 0, 'nothing may be claimed in a dry run');
    assert.equal(sent.length, 0);
    assert.equal(writes.length, 0);
    restore();
});

test('a school that switched family email off is not scanned at all', async () => {
    const { counts } = wiring();
    let claims = 0;
    BehaviorNotification.findOneAndUpdate = async () => {
        claims += 1;
        return null;
    };

    const summary = await deliverBehaviorEmails({
        schoolId: 'school-1',
        settings: { emailDelivery: { enabled: false } },
        deliver: true
    });

    assert.equal(summary.reason, 'SCHOOL_SWITCH_OFF');
    assert.equal(claims, 0);
    assert.equal(counts.length, 0);
    restore();
});

test('an approved draft is mailed to both guardians and copied to the staff roles', async () => {
    const { sent, writes } = wiring();

    const summary = await deliverBehaviorEmails({
        schoolId: 'school-1',
        settings: SETTINGS_ON,
        school: { name: 'AMLY School', branding: { primaryColor: '#0f766e' } },
        deliver: true
    });

    assert.equal(summary.sent, 1);
    assert.equal(sent.length, 1, 'one message per household, not one per parent');
    const { senderId, mailOptions } = sent[0];
    assert.equal(senderId, 'admin-1', 'a family notice is sent from the school account');
    assert.equal(mailOptions.to, 'father@example.test, mother@example.test');
    assert.equal(mailOptions.cc, 'vice@example.test');
    assert.match(mailOptions.html, /Dear parent,<br \/>/);
    assert.match(mailOptions.html, /AMLY School/, 'the family should see which school wrote to them');
    assert.equal(writes[0].update.status, 'sent');
    assert.equal(writes[0].update.messageId, 'mid-1');
    assert.equal(writes[0].update.transport, 'admin_gmail_fallback');
    assert.equal(writes[0].update.blockedReason, null);
    restore();
});

test('a send failure is recorded on the row without leaking the address', async () => {
    const { writes } = wiring();
    gmailOAuthService.sendEmail = async () => {
        const error = new Error('Mailbox father@example.test rejected the message');
        error.code = 'GMAIL_SEND_FAILED';
        throw error;
    };

    const summary = await deliverBehaviorEmails({
        schoolId: 'school-1',
        settings: SETTINGS_ON,
        deliver: true
    });

    assert.equal(summary.failed, 1);
    assert.equal(summary.sent, 0);
    const update = writes[0].update;
    assert.equal(update.status, 'failed');
    assert.equal(update.error.includes('father@example.test'), false,
        'a parent address must not be stored or logged as an error string');
    assert.ok(update.nextAttemptAt instanceof Date);
    restore();
});

test('a row that used its attempts is not given a new deadline', async () => {
    const { writes } = wiring({ row: queuedRow({ attempts: 3, status: 'failed' }) });
    gmailOAuthService.sendEmail = async () => {
        throw new Error('rejected');
    };

    const summary = await deliverBehaviorEmails({
        schoolId: 'school-1',
        settings: SETTINGS_ON,
        deliver: true,
        limit: 1
    });

    assert.equal(summary.failed, 1);
    assert.equal(writes[0].update.nextAttemptAt, undefined,
        'retrying must be a deliberate act once the attempts are spent');
    restore();
});

test('only approved rows are eligible, and the claim is one row at a time', async () => {
    const { counts } = wiring();
    let claimed = 0;
    BehaviorNotification.findOneAndUpdate = async () => {
        claimed += 1;
        if (claimed === 1) return queuedRow();
        return null;
    };

    await deliverBehaviorEmails({ schoolId: 'school-1', settings: SETTINGS_ON, deliver: true });

    const dueFilter = counts[0].$or[0];
    assert.deepEqual(dueFilter.status.$in, ['draft', 'failed']);
    assert.equal(JSON.stringify(counts[0]).includes('suppressed'), false,
        'a row held for approval must never be picked up');
    restore();
});

test('template text is escaped before it becomes html', () => {
    const html = renderBehaviorEmailHtml({
        subject: 'About Sara',
        body: 'Sara said <script>alert(1)</script> and left'
    });
    assert.equal(html.includes('<script>'), false);
    assert.match(html, /&lt;script&gt;/);
});

test('an arabic notice reads right-to-left instead of as an ltr shell', () => {
    const arabic = renderBehaviorEmailHtml({
        subject: 'عن سارة',
        body: 'عزيزي ولي الأمر',
        language: 'ar'
    });
    assert.match(arabic, /<html dir="rtl" lang="ar">/);
    assert.match(arabic, /text-align:right/);
    assert.match(arabic, /إدارة المدرسة/, 'the chrome around the message is Arabic too');

    const english = renderBehaviorEmailHtml({ subject: 'About Sara', body: 'Dear parent' });
    assert.match(english, /<html dir="ltr" lang="en">/);
});

test('school branding reaches the email only when it is safe to inline', () => {
    const branded = renderBehaviorEmailHtml({
        subject: 'About Sara',
        body: 'Dear parent',
        school: {
            name: 'AMLY School',
            branding: { primaryColor: '#123456', logoUrl: 'https://cdn.test/logo.png' }
        }
    });
    assert.match(branded, /border-top:4px solid #123456/);
    assert.match(branded, /<img src="https:\/\/cdn\.test\/logo\.png"/);

    const hostile = renderBehaviorEmailHtml({
        subject: 'About Sara',
        body: 'Dear parent',
        school: {
            name: 'AMLY School',
            branding: { primaryColor: 'red} body{visibility:hidden', logoUrl: 'http://cdn.test/logo.png' }
        }
    });
    assert.match(hostile, /border-top:4px solid #0f766e/, 'a bad color must not reach a style attribute');
    assert.equal(hostile.includes('<img'), false, 'a non-https logo cannot be loaded by a mail client');
});
