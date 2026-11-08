import test from 'node:test';
import assert from 'node:assert/strict';

import { EmailReport } from '../models/EmailReport.js';
import { ReportDraft } from '../models/ReportDraft.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import Notification from '../models/Notification.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import emailService from '../services/emailService.js';
import {
    approveReportDraft,
    sendReportDraft
} from '../controllers/advancedReportingController.js';

const SCHOOL_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TEACHER_1 = 'cccccccccccccccccccccccc';
const STUDENT_1 = 'eeeeeeeeeeeeeeeeeeeeeeee';
const DRAFT_1 = '111111111111111111111111';

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        skip: () => q,
        populate: () => q,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
};

const makeRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    return res;
};


// asyncHandler does not return the handler promise; let its microtasks finish.
const invoke = async (handler, req, res) => {
    handler(req, res, (err) => { res.error = err; });
    await new Promise((resolve) => setImmediate(resolve));
};

const teacherUser = () => ({
    _id: TEACHER_1,
    role: 'teacher',
    roles: ['teacher'],
    school: { _id: SCHOOL_A }
});

const studentData = (overrides = {}) => ({
    _id: STUDENT_1,
    firstName: 'Test',
    lastName: 'Student',
    school: { _id: SCHOOL_A, name: 'School A' },
    currentClass: { name: 'Grade 5' },
    parentInfo: {
        motherEmail: 'mother@family.test',
        motherName: 'Mom',
        fatherEmail: 'father@family.test',
        fatherName: 'Dad'
    },
    studentEmail: 'student@family.test',
    ...overrides
});

const teacher = { _id: TEACHER_1, firstName: 'Test', lastName: 'Teacher', email: 'teacher@school.test' };

const baseSendOptions = (overrides = {}) => ({
    reportId: DRAFT_1,
    studentData: studentData(),
    reportContent: '<p>Report body</p>',
    language: 'english',
    requestedLanguages: ['en'],
    recipients: { student: true, mother: true, father: true, guardian: true, teacher: false },
    teacher,
    teacherRemark: '',
    period: 'November 2026',
    dateRange: { startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30') },
    evidenceSnapshot: null,
    ...overrides
});

/* ------------------------------------------------------------------ */
/* Shared stub plumbing                                                */
/* ------------------------------------------------------------------ */

const state = {
    gmailCalls: [],
    createdRecords: [],
    updates: [],
    failSentUpdate: false,
    sendImpl: null,
    tokenUsageUpdates: []
};

EmailReport.prototype.save = async function () {
    state.createdRecords.push(this);
    return this;
};
EmailReport.find = (query) => {
    state.lastFindQuery = query;
    return chain(state.findResults || []);
};
EmailReport.findByIdAndUpdate = async (id, update) => {
    const status = update?.status || update?.$set?.status;
    if (state.failSentUpdate && status === 'sent') {
        throw new Error('simulated persistence failure after provider acceptance');
    }
    state.updates.push({ id, update });
    return { _id: id, ...update };
};
AITokenUsage.findByIdAndUpdate = async (id, update) => {
    state.tokenUsageUpdates.push({ id, update });
    return null;
};
Notification.prototype.save = async function () { return this; };
Notification.prototype.markAsSent = async function () { return this; };
gmailOAuthService.hasValidTokens = async () => true;
gmailOAuthService.getTokenStatus = async () => ({ connected: true, email: 'teacher@gmail.test' });
gmailOAuthService.sendEmail = async (userId, mailOptions) => {
    state.gmailCalls.push({ userId, mailOptions });
    if (state.sendImpl) return state.sendImpl(userId, mailOptions);
    return { messageId: `msg-${state.gmailCalls.length}`, threadId: 'thread-1' };
};

const resetState = () => {
    state.gmailCalls = [];
    state.createdRecords = [];
    state.updates = [];
    state.failSentUpdate = false;
    state.sendImpl = null;
    state.tokenUsageUpdates = [];
    state.findResults = [];
    state.lastFindQuery = null;
};

/* ------------------------------------------------------------------ */
/* Provider acceptance vs persistence failure                          */
/* ------------------------------------------------------------------ */

test('provider-accepted email is never recorded as a retryable failure when bookkeeping fails', async () => {
    resetState();
    state.failSentUpdate = true;
    const result = await emailService.sendReportEmails(baseSendOptions());
    assert.equal(result.success, false);
    assert.equal(result.unknown, 3, 'every accepted-but-unpersisted delivery must be unknown');
    assert.equal(result.failed, 0, 'none may be classified as a definite failure');
    assert.ok(result.results?.every((r) => r.status !== 'failed'));
    assert.ok(
        !state.createdRecords.some((r) => r.status === 'failed'),
        'no failed record may exist for an accepted message'
    );
});

/* ------------------------------------------------------------------ */
/* Recipient privacy and flags                                         */
/* ------------------------------------------------------------------ */

test('each family address receives its own message, never a shared To list', async () => {
    resetState();
    const result = await emailService.sendReportEmails(baseSendOptions());
    assert.equal(result.success, true);
    assert.equal(state.gmailCalls.length, 3, 'mother, father and student each get one message');
    for (const call of state.gmailCalls) {
        assert.ok(!String(call.mailOptions.to).includes(','), `To must be a single address: ${call.mailOptions.to}`);
    }
    const addressed = state.gmailCalls.map((c) => c.mailOptions.to).sort();
    assert.deepEqual(addressed, ['father@family.test', 'mother@family.test', 'student@family.test']);
});

test('a checked student role keeps a shared address even when the parent role is unchecked', async () => {
    resetState();
    const result = await emailService.sendReportEmails(baseSendOptions({
        studentData: studentData({
            parentInfo: { fatherEmail: 'shared@family.test', fatherName: 'Dad' },
            studentEmail: 'shared@family.test'
        }),
        recipients: { student: true, mother: false, father: false, guardian: false, teacher: false }
    }));
    assert.equal(result.success, true);
    assert.equal(state.gmailCalls.length, 1);
    assert.equal(state.gmailCalls[0].mailOptions.to, 'shared@family.test');
});

test('unchecked roles never receive mail', async () => {
    resetState();
    const result = await emailService.sendReportEmails(baseSendOptions({
        recipients: { student: false, mother: true, father: false, guardian: false, teacher: false }
    }));
    assert.equal(result.success, true);
    assert.equal(state.gmailCalls.length, 1);
    assert.equal(state.gmailCalls[0].mailOptions.to, 'mother@family.test');
});

test('teacher-only delivery is rejected without contacting the provider', async () => {
    resetState();
    const result = await emailService.sendReportEmails(baseSendOptions({
        recipients: { student: false, mother: false, father: false, guardian: false, teacher: true }
    }));
    assert.equal(result.success, false);
    assert.equal(state.gmailCalls.length, 0);
});

test('no recipients means no provider call and no success', async () => {
    resetState();
    const result = await emailService.sendReportEmails(baseSendOptions({
        studentData: studentData({ parentInfo: {}, studentEmail: '' }),
        recipients: { student: true, mother: true, father: true, guardian: true, teacher: false }
    }));
    assert.equal(result.success, false);
    assert.equal(state.gmailCalls.length, 0);
});

/* ------------------------------------------------------------------ */
/* Retry semantics                                                     */
/* ------------------------------------------------------------------ */

test('retry only selects definitely-failed records and uses the draft teacher transport', async () => {
    resetState();
    state.findResults = [{
        _id: '222222222222222222222222',
        email: 'mother@family.test',
        subject: 'Progress Report',
        content: '<p>body</p>',
        retryCount: 0
    }];
    ReportDraft.findById = () => chain({ teacher: TEACHER_1 });
    const results = await emailService.retryFailedEmails(DRAFT_1);
    assert.equal(state.lastFindQuery.status, 'failed');
    assert.equal(results.successful, 1);
    assert.equal(state.gmailCalls.length, 1);
    assert.equal(state.gmailCalls[0].userId, TEACHER_1);
});

test('an uncertain retry outcome is marked unknown, not left retryable', async () => {
    resetState();
    state.findResults = [{
        _id: '222222222222222222222222',
        email: 'mother@family.test',
        subject: 'Progress Report',
        content: '<p>body</p>',
        retryCount: 0
    }];
    ReportDraft.findById = () => chain({ teacher: TEACHER_1 });
    state.sendImpl = () => {
        const err = new Error('socket hang up');
        err.code = 'ECONNRESET';
        throw err;
    };
    await emailService.retryFailedEmails(DRAFT_1);
    const update = state.updates.find((u) => String(u.id) === '222222222222222222222222');
    const status = update?.update?.status || update?.update?.$set?.status;
    assert.equal(status, 'unknown', 'network-uncertain retry must not stay failed/retryable');
});

/* ------------------------------------------------------------------ */
/* Approval freeze + truthful draft send state                         */
/* ------------------------------------------------------------------ */

const draftDoc = (overrides = {}) => ({
    _id: DRAFT_1,
    school: SCHOOL_A,
    teacher,
    student: studentData(),
    status: 'draft',
    revision: 0,
    content: '<p>Report body</p>',
    language: 'english',
    requestedLanguages: ['en'],
    period: 'November 2026',
    dateRange: { startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30') },
    recipients: { student: true, mother: true, father: true, guardian: true, teacher: false },
    teacherRemark: '',
    evidenceSnapshot: null,
    sendAttempts: 0,
    save: async function () { return this; },
    ...overrides
});

test('approval freezes the rendered email and the resolved recipients', async () => {
    resetState();
    const draft = draftDoc();
    ReportDraft.findById = () => chain(draft);
    const req = { user: teacherUser(), params: { id: DRAFT_1 }, body: {}, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(approveReportDraft, req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(draft.status, 'approved');
    assert.ok(draft.approvedSnapshot?.html, 'approval must store the rendered HTML snapshot');
    assert.ok(draft.approvedSnapshot?.subject);
    assert.ok(Array.isArray(draft.approvedSnapshot?.recipients) && draft.approvedSnapshot.recipients.length > 0);
});

test('send delivers the frozen snapshot, not a fresh render of live data', async () => {
    resetState();
    const frozen = {
        subject: 'Frozen subject',
        html: '<p>frozen body</p>',
        text: 'frozen body',
        recipients: [{ email: 'mother@family.test', name: 'Mom', type: 'mother' }],
        revision: 0
    };
    const draft = draftDoc({ status: 'approved', approvedSnapshot: frozen });
    ReportDraft.findById = () => chain(draft);
    ReportDraft.findOneAndUpdate = async () => ({ ...draft, status: 'sending', sendAttempts: 1 });
    let captured = null;
    emailService.sendReportEmails = async (options) => {
        captured = options;
        return { success: true, sent: 1, failed: 0, unknown: 0, results: [{ email: 'mother@family.test', status: 'sent' }] };
    };
    const req = { user: teacherUser(), params: { id: DRAFT_1 }, body: {}, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(sendReportDraft, req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(captured?.frozen?.html, '<p>frozen body</p>', 'send must use the approved snapshot');
    assert.equal(draft.status, 'sent');
});

test('a partially delivered draft is marked partial, not failed', async () => {
    resetState();
    const draft = draftDoc({ status: 'approved' });
    ReportDraft.findById = () => chain(draft);
    ReportDraft.findOneAndUpdate = async () => ({ ...draft, status: 'sending', sendAttempts: 1 });
    emailService.sendReportEmails = async () => ({
        success: false, sent: 1, failed: 1, unknown: 0,
        results: [
            { email: 'mother@family.test', status: 'sent' },
            { email: 'father@family.test', status: 'failed', error: 'mailbox unavailable' }
        ]
    });
    const req = { user: teacherUser(), params: { id: DRAFT_1 }, body: {}, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(sendReportDraft, req, res);
    assert.equal(draft.status, 'partial');
});

test('an uncertain delivery is marked unknown and never presented as retryable failure', async () => {
    resetState();
    const draft = draftDoc({ status: 'approved' });
    ReportDraft.findById = () => chain(draft);
    ReportDraft.findOneAndUpdate = async () => ({ ...draft, status: 'sending', sendAttempts: 1 });
    emailService.sendReportEmails = async () => ({
        success: false, sent: 0, failed: 0, unknown: 1,
        results: [{ email: 'mother@family.test', status: 'unknown', messageId: 'msg-1' }]
    });
    const req = { user: teacherUser(), params: { id: DRAFT_1 }, body: {}, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(sendReportDraft, req, res);
    assert.equal(draft.status, 'unknown');
});