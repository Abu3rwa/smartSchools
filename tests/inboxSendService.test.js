import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';

import InboxEmail from '../models/InboxEmail.js';
import InboxReplyDraft from '../models/InboxReplyDraft.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import {
    buildReplyHtml,
    clearSent,
    deleteSent,
    sendDraft
} from '../services/inbox/inboxSendService.js';

const USER = { _id: '507f1f77bcf86cd799439011', school: '507f1f77bcf86cd799439010' };
const DRAFT_ID = '507f1f77bcf86cd799439012';
const EMAIL_ID = '507f1f77bcf86cd799439013';

const query = (value) => {
    const wrapper = {
        select: () => wrapper,
        sort: () => wrapper,
        limit: () => wrapper,
        skip: () => wrapper,
        lean: async () => value
    };
    return wrapper;
};

const draft = (overrides = {}) => ({
    _id: DRAFT_ID,
    school: USER.school,
    user: USER._id,
    email: EMAIL_ID,
    status: 'draft',
    subject: 'Re: Term report',
    body: 'Hello Ali,\n\nNoted.\n\nSamir',
    language: 'en',
    to: ['sender@school.org'],
    cc: [],
    gmailDraftId: null,
    threadId: null,
    sentAt: null,
    ...overrides
});

const email = {
    _id: EMAIL_ID,
    school: USER.school,
    user: USER._id,
    threadId: 'thread-1',
    messageIdHeader: '<m1@school.org>',
    referencesHeader: '<r0@school.org>'
};

const originals = {
    draftFindOne: InboxReplyDraft.findOne,
    draftFindOneAndUpdate: InboxReplyDraft.findOneAndUpdate,
    draftUpdateOne: InboxReplyDraft.updateOne,
    draftFindOneAndDelete: InboxReplyDraft.findOneAndDelete,
    draftDeleteMany: InboxReplyDraft.deleteMany,
    emailFindOne: InboxEmail.findOne,
    emailUpdateOne: InboxEmail.updateOne,
    sendEmail: gmailOAuthService.sendEmail,
    deleteGmailDraft: gmailOAuthService.deleteGmailDraft,
    getTokenStatus: gmailOAuthService.getTokenStatus
};

let state;

const install = () => {
    state = {
        draft: draft(),
        email,
        sendCalls: [],
        deleteCalls: [],
        emailUpdates: [],
        draftUpdates: [],
        claims: 0,
        fail: null,
        deleted: null,
        deleteManyFilter: null
    };

    InboxReplyDraft.findOne = () => query(state.draft);
    InboxReplyDraft.findOneAndUpdate = (filter, update) => {
        if (filter.status === 'draft') {
            state.claims += 1;
            if (state.claims > 1) return query(null);
            return query({ ...state.draft, ...update.$set, status: 'sending' });
        }
        return query({ ...state.draft, ...update.$set, status: 'sent' });
    };
    InboxReplyDraft.updateOne = async (filter, update) => {
        state.draftUpdates.push({ filter, update });
        return {};
    };
    InboxReplyDraft.findOneAndDelete = (filter) => {
        state.deleteManyFilter = filter;
        return query(state.deleted);
    };
    InboxReplyDraft.deleteMany = async (filter) => {
        state.deleteManyFilter = filter;
        return { deletedCount: 2 };
    };
    InboxEmail.findOne = () => query(state.email);
    InboxEmail.updateOne = async (filter, update) => {
        state.emailUpdates.push({ filter, update });
        return {};
    };
    gmailOAuthService.sendEmail = async (userId, options) => {
        state.sendCalls.push({ userId, options });
        if (state.fail) throw state.fail;
        return { messageId: 'm-sent', threadId: 'thread-1' };
    };
    gmailOAuthService.deleteGmailDraft = async (userId, draftId) => {
        state.deleteCalls.push({ userId, draftId });
        return true;
    };
    gmailOAuthService.getTokenStatus = async () => ({ email: 'teacher@school.com' });
};

const restore = () => {
    InboxReplyDraft.findOne = originals.draftFindOne;
    InboxReplyDraft.findOneAndUpdate = originals.draftFindOneAndUpdate;
    InboxReplyDraft.updateOne = originals.draftUpdateOne;
    InboxReplyDraft.findOneAndDelete = originals.draftFindOneAndDelete;
    InboxReplyDraft.deleteMany = originals.draftDeleteMany;
    InboxEmail.findOne = originals.emailFindOne;
    InboxEmail.updateOne = originals.emailUpdateOne;
    gmailOAuthService.sendEmail = originals.sendEmail;
    gmailOAuthService.deleteGmailDraft = originals.deleteGmailDraft;
    gmailOAuthService.getTokenStatus = originals.getTokenStatus;
};

beforeEach(install);
after(restore);

test('the HTML body escapes markup and points Arabic right', () => {
    const html = buildReplyHtml('<script>alert("x")</script> & more', 'en');
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; more/);
    assert.doesNotMatch(html, /<script>/);

    const arabic = buildReplyHtml('مرحبا', 'ar');
    assert.match(arabic, /^<div dir="rtl">/);
});

test('send requires an explicit confirmation', async () => {
    await assert.rejects(
        sendDraft(USER, DRAFT_ID, {}),
        (error) => error.statusCode === 400
    );
    assert.equal(state.sendCalls.length, 0);
});

test('placeholders block the send before Gmail is touched', async () => {
    state.draft = draft({ body: 'Hello,\n\nMeet on [[DATE]].\n\nSamir' });

    await assert.rejects(
        sendDraft(USER, DRAFT_ID, { confirm: true }),
        (error) => error.statusCode === 422
            && error.code === 'DRAFT_PLACEHOLDERS'
            && error.data.placeholders.includes('[[DATE]]')
    );
    assert.equal(state.sendCalls.length, 0);
});

test('two simultaneous sends produce one Gmail send', async () => {
    const results = await Promise.allSettled([
        sendDraft(USER, DRAFT_ID, { confirm: true }),
        sendDraft(USER, DRAFT_ID, { confirm: true })
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(state.sendCalls.length, 1);
});

test('a successful send threads the reply and marks the email answered', async () => {
    state.draft = draft({ gmailDraftId: 'gmail-draft-1' });

    const sent = await sendDraft(USER, DRAFT_ID, { confirm: true });

    assert.equal(state.sendCalls.length, 1);
    const options = state.sendCalls[0].options;
    assert.equal(options.to, 'sender@school.org');
    assert.equal(options.inReplyTo, '<m1@school.org>');
    assert.equal(options.references, '<r0@school.org> <m1@school.org>');
    assert.equal(options.threadId, 'thread-1');
    assert.match(options.html, /<p>/);

    assert.equal(state.emailUpdates.length, 1);
    assert.equal(state.emailUpdates[0].update.$set.status, 'replied');
    assert.deepEqual(state.deleteCalls.map((call) => call.draftId), ['gmail-draft-1']);
    assert.equal(sent.threadId, 'thread-1');
    assert.ok(sent.sentAt instanceof Date);
});

test('a Gmail failure puts the draft back and keeps the message', async () => {
    state.fail = new Error('upstream failed');

    await assert.rejects(
        sendDraft(USER, DRAFT_ID, { confirm: true }),
        (error) => error.statusCode === 502 && /Could not send the reply/.test(error.message)
    );

    const reset = state.draftUpdates.find((entry) => entry.update.$set.status === 'draft');
    assert.ok(reset);
    assert.equal(state.emailUpdates.length, 0);
});

test('a reauthentication failure keeps its code', async () => {
    state.fail = Object.assign(new Error('Reconnect Google and grant Gmail sending access.'), {
        statusCode: 401,
        code: 'GMAIL_REAUTH_REQUIRED'
    });

    await assert.rejects(
        sendDraft(USER, DRAFT_ID, { confirm: true }),
        (error) => error.code === 'GMAIL_REAUTH_REQUIRED'
    );
});

test('emptying the sent list never calls Gmail', async () => {
    const result = await clearSent(USER, { confirm: true });

    assert.equal(result.removed, 2);
    assert.deepEqual(state.deleteManyFilter, {
        school: USER.school,
        user: USER._id,
        status: 'sent'
    });
    assert.equal(state.sendCalls.length, 0);
    assert.equal(state.deleteCalls.length, 0);
    assert.equal(state.emailUpdates.length, 0);
});

test('emptying the sent list needs a confirmation', async () => {
    await assert.rejects(clearSent(USER, {}), (error) => error.statusCode === 400);
    assert.equal(state.deleteManyFilter, null);
});

test('deleting one sent entry is scoped to the user and the sent state', async () => {
    state.deleted = { _id: 'sent-1' };
    const result = await deleteSent(USER, 'sent-1');

    assert.equal(result.removed, 1);
    assert.equal(state.deleteManyFilter.status, 'sent');
    assert.equal(state.deleteManyFilter.user, USER._id);
    assert.equal(state.deleteManyFilter.school, USER.school);
    assert.equal(state.deleteCalls.length, 0);
});

test('deleting a missing sent entry is a 404', async () => {
    state.deleted = null;
    await assert.rejects(deleteSent(USER, 'missing'), (error) => error.statusCode === 404);
});
