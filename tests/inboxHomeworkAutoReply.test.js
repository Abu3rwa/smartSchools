import test from 'node:test';
import assert from 'node:assert/strict';

import Assignment from '../models/Assignment.js';
import AiCreditSetting from '../models/AiCreditSetting.js';
import Class from '../models/Class.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import InboxEmail from '../models/InboxEmail.js';
import InboxReplyDraft from '../models/InboxReplyDraft.js';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import homeworkService, {
    runHomeworkAutoReplyForUser,
    senderFirstNameOf
} from '../services/inbox/inboxHomeworkAutoReplyService.js';
import {
    effectiveHomeworkDeliveryMode,
    normalizeHomeworkAutoReply
} from '../services/inbox/inboxHomeworkSettings.js';
import { updateSettings } from '../controllers/inboxAssistantController.js';
import { runInboxHomeworkAutoReplyJob } from '../jobs/inboxHomeworkAutoReplyJob.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-04T10:00:00.000Z');
const SCHOOL = 'school-1';
const USER_ID = 'user-1';
const TEACHER_DOC_ID = 'teacher-doc-1';
const USER = { _id: USER_ID, school: SCHOOL, email: 'teacher@school.test', firstName: 'Omar' };

const chain = (value) => {
    const query = {
        select: () => query,
        sort: () => query,
        limit: () => query,
        populate: () => query,
        lean: async () => value
    };
    return query;
};

const EMAIL_DOC = {
    _id: 'em-1',
    fromName: 'Sarah Jones',
    fromEmail: 'sarah@parent.test',
    subject: "What's the homework this week?",
    bodyText: 'Could you tell me what is due for the class this week? Thank you.',
    language: 'en',
    status: 'open',
    priority: 'needs_reply',
    senderRole: 'parent',
    receivedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    threadId: 'thread-1',
    messageIdHeader: '<msg-1@parent.test>',
    referencesHeader: ''
};

const ASSIGNMENTS = [
    { _id: 'as-2', title: 'Read chapter 4', subject: { _id: 'subj-e', name: 'English' }, dueDate: new Date(NOW.getTime() + DAY_MS), scope: 'class' },
    { _id: 'as-1', title: 'Fractions worksheet', subject: { _id: 'subj-m', name: 'Math' }, dueDate: new Date(NOW.getTime() + 2 * DAY_MS), scope: 'class' }
];

const enabledSettings = (extra = {}) => ({
    homeworkAutoReply: {
        enabled: true,
        confirmedRisk: true,
        scope: 'own_subject',
        daysAhead: 7,
        deliveryMode: 'draft_only',
        ...extra
    }
});

/**
 * Wires the draft_only happy path: one linked child, two published assignments,
 * claim succeeds, Gmail draft creation is inert.
 */
const mockDraftPath = (t, {
    emails = [EMAIL_DOC],
    students = [{ _id: 'stu-1', currentClass: 'class-1' }],
    assignments = ASSIGNMENTS,
    claim = true,
    existingDraft = null,
    gmailError = null
} = {}) => {
    const calls = {
        emailQueries: [], assignmentQueries: [], studentQueries: [], claims: [],
        createdDrafts: [], gmailDrafts: [], sentMail: [], notices: [], pushes: [], emailUpdates: []
    };
    const createdById = new Map();
    const claimedIds = new Set();

    t.mock.method(InboxEmail, 'find', (filter) => {
        calls.emailQueries.push(filter);
        return chain(emails);
    });
    t.mock.method(InboxEmail, 'findOneAndUpdate', (filter, update) => {
        calls.claims.push({ filter, update });
        const id = String(filter._id);
        if (!claim || claimedIds.has(id)) return chain(null);
        claimedIds.add(id);
        return chain({ ...emails.find((e) => String(e._id) === id), homeworkAutoReplySentAt: NOW });
    });
    t.mock.method(InboxEmail, 'updateOne', async (filter, update) => {
        calls.emailUpdates.push({ filter, update });
        return { modifiedCount: 1 };
    });
    t.mock.method(InboxEmail, 'findOne', () => chain(EMAIL_DOC));
    t.mock.method(Teacher, 'findOne', async () => ({ _id: TEACHER_DOC_ID, user: USER_ID }));
    t.mock.method(Student, 'find', (filter) => {
        calls.studentQueries.push(filter);
        return chain(students);
    });
    t.mock.method(Assignment, 'find', (filter) => {
        calls.assignmentQueries.push(filter);
        return chain(assignments);
    });
    t.mock.method(Class, 'findById', () => chain({ name: 'Grade 5A' }));

    t.mock.method(InboxReplyDraft, 'findOne', (filter) => {
        if (filter.email) return chain(existingDraft);
        return chain(createdById.get(String(filter._id)) || null);
    });
    t.mock.method(InboxReplyDraft, 'create', async (fields) => {
        const row = { ...fields, _id: `draft-${calls.createdDrafts.length + 1}` };
        calls.createdDrafts.push(row);
        createdById.set(String(row._id), row);
        return row;
    });
    t.mock.method(InboxReplyDraft, 'findOneAndUpdate', (filter, update) => {
        const row = createdById.get(String(filter._id));
        return chain(row ? { ...row, ...update.$set } : null);
    });
    t.mock.method(gmailOAuthService, 'createGmailDraft', async (userId, mailOptions) => {
        if (gmailError) throw gmailError;
        calls.gmailDrafts.push({ userId, mailOptions });
        return { draftId: `gd-${calls.gmailDrafts.length}` };
    });
    t.mock.method(gmailOAuthService, 'sendEmail', async (userId, mailOptions) => {
        calls.sentMail.push({ userId, mailOptions });
        return { messageId: 'sent-1', threadId: 'thread-1' };
    });
    t.mock.method(Notification, 'create', async (notice) => {
        calls.notices.push(notice);
        return notice;
    });

    return { calls, pushSender: async (payload) => calls.pushes.push(payload) };
};

/* ---------------------------------------------------------------- */
/* Service — the plan's test checklist                              */
/* ---------------------------------------------------------------- */

test('a linked parent gets both assignments, one line per subject', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);

    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 1, skipped: 0, failed: 0 });

    assert.equal(calls.createdDrafts.length, 1);
    const draft = calls.createdDrafts[0];
    assert.equal(draft.source, 'auto');
    assert.equal(draft.replyType, 'homework_auto');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.subject, "Re: What's the homework this week?");
    assert.deepEqual(draft.to, ['sarah@parent.test']);
    assert.match(draft.body, /^Hello Sarah,/);
    assert.match(draft.body, /This is Omar's Assistant\. Here is what's currently assigned and due soon for Grade 5A:/);
    assert.match(draft.body, /- English: Read chapter 4 — due Nov 5/);
    assert.match(draft.body, /- Math: Fractions worksheet — due Nov 6/);
    assert.match(draft.body, /Omar will follow up personally if anything changes\./);
    assert.match(draft.body, /— Omar's Assistant$/);

    assert.equal(calls.gmailDrafts.length, 1);
    assert.equal(calls.sentMail.length, 0);
    assert.equal(calls.notices.length, 1);
    assert.equal(calls.notices[0].type, 'inbox_homework_autoreply_sent');
    assert.match(calls.notices[0].subject, /Gmail Drafts/);
    assert.equal(calls.pushes.length, 1);
});

test('the assignment query is published, class-scoped, due today through the window', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });

    const query = calls.assignmentQueries[0];
    assert.equal(query.school, SCHOOL);
    assert.equal(query.class, 'class-1');
    assert.equal(query.status, 'published');
    assert.equal(query.dueDate.$gte.toISOString(), '2026-11-04T00:00:00.000Z');
    assert.equal(query.dueDate.$lte.toISOString(), new Date(NOW.getTime() + 7 * DAY_MS).toISOString());
    // own_subject: only this teacher's assignments.
    assert.equal(query.teacher, TEACHER_DOC_ID);
    // selected_students rows only when the asking parent's child is in them.
    assert.deepEqual(query.$or, [
        { scope: 'class' },
        { scope: 'selected_students', studentIds: { $in: ['stu-1'] } }
    ]);
});

test('whole_class scope drops the teacher filter', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    await runHomeworkAutoReplyForUser(USER, enabledSettings({ scope: 'whole_class' }), { now: NOW, pushSender });
    assert.equal(calls.assignmentQueries[0].teacher, undefined);
});

test('a due date earlier today is listed as due today, not dropped', async (t) => {
    const dueEarlierToday = [{ ...ASSIGNMENTS[0], dueDate: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) }];
    const { calls, pushSender } = mockDraftPath(t, { assignments: dueEarlierToday });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.equal(result.drafted, 1);
    assert.match(calls.createdDrafts[0].body, /- English: Read chapter 4 — due today/);
});

test('no assignments in the window means no auto-reply at all', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { assignments: [] });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.createdDrafts.length, 0);
    assert.equal(calls.gmailDrafts.length, 0);
    assert.equal(calls.notices.length, 0);
});

test('a sender linked to no student gets no reply and no data lookup', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { students: [] });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.assignmentQueries.length, 0);
    assert.equal(calls.createdDrafts.length, 0);
});

test('children in different classes are ambiguous and fall back to manual', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, {
        students: [
            { _id: 'stu-1', currentClass: 'class-1' },
            { _id: 'stu-2', currentClass: 'class-2' }
        ]
    });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.assignmentQueries.length, 0);
});

test('twins in the same class proceed normally', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, {
        students: [
            { _id: 'stu-1', currentClass: 'class-1' },
            { _id: 'stu-2', currentClass: 'class-1' }
        ]
    });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.equal(result.drafted, 1);
    assert.deepEqual(calls.assignmentQueries[0].$or[1].studentIds.$in, ['stu-1', 'stu-2']);
});

test('a student sender is matched by their own email, not parentInfo', async (t) => {
    const studentEmail = { ...EMAIL_DOC, senderRole: 'student', fromEmail: 'kid@school.test' };
    const { calls, pushSender } = mockDraftPath(t, { emails: [studentEmail] });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.equal(result.drafted, 1);
    assert.equal(calls.studentQueries[0].email, 'kid@school.test');
    assert.equal(calls.studentQueries[0].$or, undefined);
});

test('parent senders are matched through parentInfo emails, case-insensitively', async (t) => {
    const upperEmail = { ...EMAIL_DOC, fromEmail: 'Sarah@Parent.test' };
    const { calls, pushSender } = mockDraftPath(t, { emails: [upperEmail] });
    await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    const query = calls.studentQueries[0];
    assert.deepEqual(query.$or, [
        { 'parentInfo.fatherEmail': 'sarah@parent.test' },
        { 'parentInfo.motherEmail': 'sarah@parent.test' },
        { 'parentInfo.guardianEmail': 'sarah@parent.test' }
    ]);
});

test('an email that is not a homework question is never touched', async (t) => {
    const offTopic = { ...EMAIL_DOC, subject: 'Trip permission slip', bodyText: 'Please find the signed form attached.' };
    const { calls, pushSender } = mockDraftPath(t, { emails: [offTopic] });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.claims.length, 0);
});

test('Arabic homework keywords are recognized', async (t) => {
    const arabic = { ...EMAIL_DOC, subject: 'ما هو الواجب هذا الأسبوع؟', bodyText: '', language: 'ar' };
    const { calls, pushSender } = mockDraftPath(t, { emails: [arabic] });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.equal(result.drafted, 1);
    assert.match(calls.createdDrafts[0].body, /^مرحبًا Sarah،/);
    assert.equal(calls.createdDrafts[0].language, 'ar');
});

test('a lost claim means another tick already handled it: no second reply', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { claim: false });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.createdDrafts.length, 0);
    assert.equal(calls.notices.length, 0);
});

test('re-running after a successful draft does nothing new', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    const second = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(second, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.createdDrafts.length, 1);
    assert.equal(calls.notices.length, 1);
});

test('an existing draft for the email is never duplicated', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { existingDraft: { _id: 'draft-existing' } });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.createdDrafts.length, 0);
});

test('a Gmail reauth failure notifies once and never retries the email', async (t) => {
    const error = Object.assign(new Error('Google access expired'), { code: 'GMAIL_REAUTH_REQUIRED' });
    const { calls, pushSender } = mockDraftPath(t, { gmailError: error });
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 1 });
    assert.equal(calls.notices.length, 1);
    assert.match(calls.notices[0].subject, /Reconnect Google/);

    const second = await runHomeworkAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(second, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.createdDrafts.length, 1);
});

test('disabled or unconfirmed settings do nothing at all', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    for (const settings of [
        enabledSettings({ enabled: false }),
        enabledSettings({ confirmedRisk: false }),
        { homeworkAutoReply: null },
        {}
    ]) {
        const result = await runHomeworkAutoReplyForUser(USER, settings, { now: NOW, pushSender });
        assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    }
    assert.equal(calls.emailQueries.length, 0);
});

test('the send delivery mode is forced to drafts during rollout', async (t) => {
    assert.equal(effectiveHomeworkDeliveryMode('send'), 'draft_only');
    const { calls, pushSender } = mockDraftPath(t);
    const result = await runHomeworkAutoReplyForUser(USER, enabledSettings({ deliveryMode: 'send' }), { now: NOW, pushSender });
    assert.equal(result.drafted, 1);
    assert.equal(result.sent, 0);
    assert.equal(calls.sentMail.length, 0);
});

test('the persona template matches the approved wording exactly', () => {
    const body = homeworkService.composeHomeworkReplyBody({
        senderFirstName: 'Sarah',
        teacherFirstName: 'Omar',
        className: 'Grade 5A',
        lines: '- Math: Fractions worksheet — due Nov 6',
        language: 'en'
    });
    assert.equal(body, [
        'Hello Sarah,',
        "This is Omar's Assistant. Here is what's currently assigned and due soon for Grade 5A:",
        '- Math: Fractions worksheet — due Nov 6',
        'Omar will follow up personally if anything changes.',
        "— Omar's Assistant"
    ].join('\n\n'));

    assert.equal(senderFirstNameOf({ fromName: 'Sarah Jones' }), 'Sarah');
    assert.equal(senderFirstNameOf({ fromEmail: 'sarah.jones@parent.test' }), 'Sarah');
    assert.equal(senderFirstNameOf({}), 'there');
});

/* ---------------------------------------------------------------- */
/* Controller — settings validation                                 */
/* ---------------------------------------------------------------- */

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveResponse;
    let rejectResponse;
    const responseDone = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    response.status = function setStatus(code) {
        this.statusCode = code;
        return this;
    };
    response.json = function sendJson(body) {
        this.body = body;
        resolveResponse();
        return this;
    };
    return { response, responseDone, rejectResponse };
};

const invoke = async (handler, req) => {
    const { response, responseDone, rejectResponse } = makeResponse();
    await handler(req, response, (error) => rejectResponse(error));
    await responseDone;
    return response;
};

const mockSettingsStore = (t, current = null) => {
    const writes = [];
    t.mock.method(AiCreditSetting, 'findOne', () => chain({ inbox: {} }));
    t.mock.method(InboxAssistantSettings, 'findOne', () => chain(current));
    t.mock.method(InboxAssistantSettings, 'findOneAndUpdate', (filter, update) => {
        writes.push(update.$set);
        return chain({
            optedIn: true,
            scanSize: 25,
            tone: 'professional',
            signature: '',
            includeCcByDefault: false,
            nudgeAfterDays: 2,
            customReplyTypes: [],
            calendar: null,
            newsletterAutoReply: null,
            homeworkAutoReply: update.$set.homeworkAutoReply || current?.homeworkAutoReply || null,
            lastScanAt: null
        });
    });
    return writes;
};

const settingsReq = (homeworkAutoReply) => ({
    user: { _id: USER_ID, school: SCHOOL },
    body: { homeworkAutoReply }
});

test('enabling without the risk tick in the same request is a 400', async (t) => {
    mockSettingsStore(t);
    await assert.rejects(
        () => invoke(updateSettings, settingsReq({ enabled: true })),
        (error) => error.statusCode === 400 && /confirmation/i.test(error.message)
    );
});

test('enabling with the risk tick persists both', async (t) => {
    const writes = mockSettingsStore(t);
    const response = await invoke(updateSettings, settingsReq({ enabled: true, confirmedRisk: true }));
    assert.equal(writes[0].homeworkAutoReply.enabled, true);
    assert.equal(writes[0].homeworkAutoReply.confirmedRisk, true);
    assert.equal(response.body.homeworkAutoReply.sendAvailable, false);
    assert.equal(response.body.homeworkAutoReply.scope, 'own_subject');
});

test('a send request is stored as draft_only during rollout', async (t) => {
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ deliveryMode: 'send' }));
    assert.equal(writes[0].homeworkAutoReply.deliveryMode, 'draft_only');
});

test('withdrawing the risk confirmation switches the feature off', async (t) => {
    const current = { homeworkAutoReply: { enabled: true, confirmedRisk: true } };
    const writes = mockSettingsStore(t, current);
    await invoke(updateSettings, settingsReq({ confirmedRisk: false }));
    assert.equal(writes[0].homeworkAutoReply.confirmedRisk, false);
    assert.equal(writes[0].homeworkAutoReply.enabled, false);
});

test('scope must be one of the two listed choices', async (t) => {
    mockSettingsStore(t);
    await assert.rejects(
        () => invoke(updateSettings, settingsReq({ scope: 'everything' })),
        (error) => error.statusCode === 400
    );
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ scope: 'whole_class' }));
    assert.equal(writes[0].homeworkAutoReply.scope, 'whole_class');
});

test('daysAhead outside 1-14 or fractional is refused', async (t) => {
    mockSettingsStore(t);
    for (const days of [0, 15, 2.5, 'soon']) {
        await assert.rejects(
            () => invoke(updateSettings, settingsReq({ daysAhead: days })),
            (error) => error.statusCode === 400,
            `days ${days}`
        );
    }
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ daysAhead: 14 }));
    assert.equal(writes[0].homeworkAutoReply.daysAhead, 14);
});

test('non-boolean flags and non-object patches are refused', async (t) => {
    mockSettingsStore(t);
    for (const patch of [{ enabled: 'yes' }, { confirmedRisk: 1 }, 'on', []]) {
        await assert.rejects(
            () => invoke(updateSettings, settingsReq(patch)),
            (error) => error.statusCode === 400
        );
    }
});

test('normalizers keep the safe defaults', () => {
    const defaults = normalizeHomeworkAutoReply(null);
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.confirmedRisk, false);
    assert.equal(defaults.scope, 'own_subject');
    assert.equal(defaults.daysAhead, 7);
    assert.equal(defaults.deliveryMode, 'draft_only');
    assert.equal(normalizeHomeworkAutoReply({ scope: 'bogus' }).scope, 'own_subject');
});

/* ---------------------------------------------------------------- */
/* Job — env gate and per-teacher run                               */
/* ---------------------------------------------------------------- */

test('the env kill switch stops the job before any query', async (t) => {
    t.mock.method(InboxAssistantSettings, 'find', () => {
        throw new Error('must not query when disabled');
    });
    const result = await runInboxHomeworkAutoReplyJob(NOW, {
        env: { RUN_INBOX_HOMEWORK_AUTOREPLY_JOB: 'false' }
    });
    assert.deepEqual(result, { skipped: true, teachers: 0, sent: 0, drafted: 0, failed: 0 });
});

test('the job runs only opted-in, enabled, confirmed teachers', async (t) => {
    const settingsRow = {
        school: SCHOOL,
        user: USER_ID,
        optedIn: true,
        homeworkAutoReply: { enabled: true, confirmedRisk: true }
    };
    let settingsFilter = null;
    t.mock.method(InboxAssistantSettings, 'find', (filter) => {
        settingsFilter = filter;
        return chain([settingsRow]);
    });
    t.mock.method(User, 'findOne', () => chain(USER));
    const emailFind = t.mock.method(InboxEmail, 'find', () => chain([]));

    const result = await runInboxHomeworkAutoReplyJob(NOW, { env: {}, pushSender: async () => {} });
    assert.deepEqual(settingsFilter, {
        optedIn: true,
        'homeworkAutoReply.enabled': true,
        'homeworkAutoReply.confirmedRisk': true
    });
    assert.equal(result.teachers, 1);
    assert.equal(emailFind.mock.callCount(), 1);
});