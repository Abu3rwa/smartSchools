import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import mongoose from 'mongoose';

import AiCreditAccount from '../models/AiCreditAccount.js';
import AiCreditEntry from '../models/AiCreditEntry.js';
import AiCreditSetting from '../models/AiCreditSetting.js';
import Class from '../models/Class.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import InboxDeadline from '../models/InboxDeadline.js';
import InboxEmail from '../models/InboxEmail.js';
import InboxReplyDraft from '../models/InboxReplyDraft.js';
import LessonPlan from '../models/LessonPlan.js';
import Notification from '../models/Notification.js';
import Teacher from '../models/Teacher.js';
import User from '../models/User.js';
import gmailOAuthService from '../services/gmailOAuthService.js';
import { buildClassifyPrompt, normalizeClassification } from '../services/inbox/inboxAiService.js';
import { buildSubjectSummaries } from '../services/inbox/inboxNewsletterSummaryService.js';
import {
    composeNewsletterReplyBody,
    deadlineWindow,
    runNewsletterAutoReplyForUser,
    senderFirstNameOf
} from '../services/inbox/inboxNewsletterAutoReplyService.js';
import {
    effectiveDeliveryMode,
    isCheckTimeNow,
    normalizeCheckTimes,
    normalizeNewsletterAutoReply
} from '../services/inbox/inboxNewsletterSettings.js';
import { updateSettings } from '../controllers/inboxAssistantController.js';
import { runInboxNewsletterAutoReplyJob } from '../jobs/inboxNewsletterAutoReplyJob.js';

const HOUR_MS = 60 * 60 * 1000;
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
        session: () => query,
        lean: async () => value
    };
    return query;
};

/* ---------------------------------------------------------------- */
/* OpenAI + credit plumbing                                         */
/* ---------------------------------------------------------------- */

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_VISION_MODEL', 'OPENAI_FALLBACK_MODEL', 'OPENAI_BASE_URL'];

const withOpenAiEnv = (t) => {
    const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.OPENAI_API_KEY = 'sk-test';
    t.after(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });
};

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const openAiReply = (text) => ({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 500, completion_tokens: 120, total_tokens: 620 }
});

/** Funded account + inert ledger writes, so metered AI calls run without a DB. */
const mockCredit = (t) => {
    t.mock.method(mongoose.connection, 'transaction', async (callback) => callback(null));
    t.mock.method(AiCreditAccount, 'findOne', () => chain({
        _id: 'account-1', balanceCents: 100000, schoolCents: 100000, paused: false
    }));
    t.mock.method(AiCreditAccount, 'findOneAndUpdate', () => chain({
        _id: 'account-1', balanceCents: 99000, schoolCents: 99000
    }));
    t.mock.method(AiCreditAccount, 'updateOne', async () => ({ modifiedCount: 0 }));
    t.mock.method(AiCreditEntry, 'create', async (rows) => (
        (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row, _id: new mongoose.Types.ObjectId() }))
    ));
    t.mock.method(AiCreditEntry, 'updateOne', async () => ({ modifiedCount: 1 }));
    t.mock.method(AiCreditSetting, 'findOne', () => chain(null));
};

const PLANS = [
    { subject: { _id: 'subj-a', name: 'Science' }, topic: 'States of matter', summary: 'Solids, liquids and gases compared.' },
    { subject: { _id: 'subj-b', name: 'Math' }, topic: 'Fractions', summary: 'Adding fractions with like denominators.' }
];

/** Teacher subjects + lesson plans + one shaped-JSON AI reply. */
const mockSummaries = (t, { plans = PLANS, replyText, assignedSubjects = ['subj-a', 'subj-b'] } = {}) => {
    withOpenAiEnv(t);
    mockCredit(t);
    t.mock.method(Teacher, 'findById', () => ({
        select: async () => ({ assignedClasses: assignedSubjects.map((subject) => ({ subject })) })
    }));
    t.mock.method(Class, 'find', () => ({ select: async () => [] }));
    t.mock.method(LessonPlan, 'find', () => chain(plans));
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(replyText)));
    return fetchMock;
};

const summariesReply = () => JSON.stringify({
    summaries: [
        { subjectId: 'subj-a', summary: 'Over the past two weeks, we covered the three states of matter and how particles behave in each.' },
        { subjectId: 'subj-b', summary: 'Over the past two weeks, we covered adding fractions with like denominators using visual models.' },
        { subjectId: 'not-a-subject', summary: 'Invented subject that must be dropped.' }
    ]
});

/* ---------------------------------------------------------------- */
/* Stage 1 — classification carries a newsletter category           */
/* ---------------------------------------------------------------- */

const classifyEmail = {
    id: 'msg-1',
    receivedAt: NOW,
    bodyText: 'Please send your class newsletter summary by Friday 14 November so we can publish on Sunday.'
};

const classifyEntry = (category) => ({
    emails: [{
        index: 0,
        priority: 'fyi',
        summary: 'Newsletter content request.',
        language: 'en',
        deadlines: [{
            title: 'Newsletter summary',
            dueDate: '2026-11-13',
            dueTime: null,
            quote: 'send your class newsletter summary by Friday 14 November',
            ...(category === undefined ? {} : { category })
        }]
    }]
});

test('the classify prompt asks for a newsletter category', () => {
    const prompt = buildClassifyPrompt({ emails: [classifyEmail] });
    assert.match(prompt, /"category": "newsletter"/);
    assert.match(prompt, /do not guess/);
});

test('a newsletter deadline keeps its category', () => {
    const { results } = normalizeClassification(classifyEntry('newsletter'), [classifyEmail]);
    assert.equal(results[0].deadlines.length, 1);
    assert.equal(results[0].deadlines[0].category, 'newsletter');
});

test('anything else is stored as other, never guessed', () => {
    for (const category of ['other', undefined, 'Newsletter', 'sports']) {
        const { results } = normalizeClassification(classifyEntry(category), [classifyEmail]);
        assert.equal(results[0].deadlines[0].category, 'other', `category ${category}`);
    }
});

/* ---------------------------------------------------------------- */
/* Stage 2 — per-subject summaries from the last two weeks          */
/* ---------------------------------------------------------------- */

test('one summary per taught subject, unknown ids dropped', async (t) => {
    const fetchMock = mockSummaries(t, { replyText: summariesReply() });

    const summaries = await buildSubjectSummaries({ teacherId: TEACHER_DOC_ID, userId: USER_ID, schoolId: SCHOOL, now: NOW });
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(summaries.length, 2);
    assert.deepEqual(summaries.map((s) => s.subjectName), ['Science', 'Math']);
    for (const summary of summaries) {
        assert.ok(summary.summary.startsWith('Over the past two weeks, we covered'));
        assert.ok(summary.wordCount > 0);
    }

    const prompt = JSON.parse(fetchMock.mock.calls[0].arguments[1].body).messages[0].content;
    assert.match(prompt, /<<<SUBJECT id=subj-a name="Science">>>/);
    assert.match(prompt, /<<<SUBJECT id=subj-b name="Math">>>/);
    assert.match(prompt, /Never mention students by name/);
});

test('the plan query is bounded to the last 14 days and the teacher user', async (t) => {
    mockSummaries(t, { replyText: summariesReply() });
    let filter = null;
    t.mock.method(LessonPlan, 'find', (query) => {
        filter = query;
        return chain(PLANS);
    });

    await buildSubjectSummaries({ teacherId: TEACHER_DOC_ID, userId: USER_ID, schoolId: SCHOOL, now: NOW });
    assert.equal(filter.school, SCHOOL);
    assert.equal(filter.teacher, USER_ID);
    assert.deepEqual(filter.subject, { $in: ['subj-a', 'subj-b'] });
    assert.equal(filter.date.$gte.toISOString(), new Date(NOW.getTime() - 14 * 24 * HOUR_MS).toISOString());
    assert.equal(filter.date.$lte.toISOString(), NOW.toISOString());
});

test('no subjects or no plans means no AI call at all', async (t) => {
    const noSubjects = mockSummaries(t, { assignedSubjects: [], replyText: summariesReply() });
    assert.deepEqual(await buildSubjectSummaries({ teacherId: TEACHER_DOC_ID, userId: USER_ID, schoolId: SCHOOL, now: NOW }), []);
    assert.equal(noSubjects.mock.callCount(), 0);

    const noPlans = mockSummaries(t, { plans: [], replyText: summariesReply() });
    assert.deepEqual(await buildSubjectSummaries({ teacherId: TEACHER_DOC_ID, userId: USER_ID, schoolId: SCHOOL, now: NOW }), []);
    assert.equal(noPlans.mock.callCount(), 0);
});

test('two unusable replies fail once, after a single retry', async (t) => {
    const fetchMock = mockSummaries(t, { replyText: 'Sorry, I cannot help with that.' });

    await assert.rejects(
        () => buildSubjectSummaries({ teacherId: TEACHER_DOC_ID, userId: USER_ID, schoolId: SCHOOL, now: NOW }),
        (error) => error.statusCode === 502
    );
    assert.equal(fetchMock.mock.callCount(), 2);
});

/* ---------------------------------------------------------------- */
/* Stage 3 — window, persona, and the guarded auto-reply            */
/* ---------------------------------------------------------------- */

test('the deadline window measures hours in the teacher time zone', () => {
    const due = (iso, extra = {}) => deadlineWindow({ dueAt: new Date(iso), timeZone: 'UTC', ...extra }, NOW);

    assert.equal(due('2026-11-04T12:00:00.000Z').hoursUntilDue, 2);
    assert.equal(due('2026-11-04T12:00:00.000Z').isDueToday, true);
    assert.equal(due('2026-11-04T15:00:00.000Z').hoursUntilDue, 5);
    assert.equal(due('2026-11-04T09:00:00.000Z').hoursUntilDue, -1);
    assert.equal(due('2026-11-05T12:00:00.000Z').isDueToday, false);

    // A date-only deadline is due at the end of its day, not at midnight.
    const dateOnly = due('2026-11-04T00:00:00.000Z', { dueDateOnly: true });
    assert.ok(dateOnly.hoursUntilDue > 13.9 && dateOnly.hoursUntilDue < 14);

    const dubai = deadlineWindow(
        { dueAt: new Date('2026-11-04T18:00:00.000Z'), timeZone: 'Asia/Dubai' },
        new Date('2026-11-04T16:00:00.000Z')
    );
    assert.equal(dubai.isDueToday, true);
    assert.equal(dubai.hoursUntilDue, 2);
});

test('the sender first name falls back politely', () => {
    assert.equal(senderFirstNameOf({ fromName: 'Sarah Jones' }), 'Sarah');
    assert.equal(senderFirstNameOf({ fromEmail: 'sarah.jones@school.test' }), 'Sarah');
    assert.equal(senderFirstNameOf({ fromEmail: 'm_ahmed@school.test' }), 'M');
    assert.equal(senderFirstNameOf({}), 'there');
});

test('the English reply matches the approved persona template exactly', () => {
    const summaries = [
        { subjectName: 'Science', summary: 'Over the past two weeks, we covered states of matter.' },
        { subjectName: 'Math', summary: 'Over the past two weeks, we covered fractions.' }
    ];
    const body = composeNewsletterReplyBody({ senderFirstName: 'Sarah', teacherFirstName: 'Omar', summaries });
    assert.equal(body, [
        'Hello Sarah,',
        "This is Omar's Assistant. Omar hasn't seen this email yet, but based on his lesson plans, here are the subject summaries you can use in your newsletter sections until he has a chance to review your message himself:",
        'Science: Over the past two weeks, we covered states of matter.\nMath: Over the past two weeks, we covered fractions.',
        "I'm also emailing Omar directly as his assistant to remind him about your message.",
        "— Omar's Assistant"
    ].join('\n\n'));

    const arabic = composeNewsletterReplyBody({ senderFirstName: 'سارة', teacherFirstName: 'عمر', summaries, language: 'ar' });
    assert.match(arabic, /^مرحبًا سارة،/);
    assert.match(arabic, /— مساعد عمر$/);
});

/* ---------------------------------------------------------------- */
/* Stage 3 — runNewsletterAutoReplyForUser                          */
/* ---------------------------------------------------------------- */

const EMAIL_DOC = {
    _id: 'em-1',
    fromName: 'Sarah Jones',
    fromEmail: 'sarah@school.test',
    subject: 'Newsletter content due Friday',
    language: 'en',
    threadId: 'thread-1',
    messageIdHeader: '<msg-1@school.test>',
    referencesHeader: ''
};

const deadlineDoc = (hoursFromNow, extra = {}) => ({
    _id: `dl-${hoursFromNow}`,
    dueAt: new Date(NOW.getTime() + hoursFromNow * HOUR_MS),
    dueDateOnly: false,
    timeZone: 'UTC',
    state: 'proposed',
    email: EMAIL_DOC,
    ...extra
});

const enabledSettings = (extra = {}) => ({
    newsletterAutoReply: {
        enabled: true,
        confirmedRisk: true,
        hoursBeforeDeadline: 3,
        deliveryMode: 'draft_only',
        checkTimes: ['07:00'],
        ...extra
    }
});

/**
 * Wires the draft_only happy path: claim succeeds, no existing draft, one
 * subject summary comes back from the mocked AI, Gmail draft creation is inert.
 */
const mockDraftPath = (t, { deadlines = [deadlineDoc(2)], claim = true, existingDraft = null, gmailError = null } = {}) => {
    const calls = { claims: [], createdDrafts: [], gmailDrafts: [], sentMail: [], notices: [], pushes: [], deadlineUpdates: [], emailUpdates: [] };
    const createdById = new Map();
    const claimedIds = new Set();

    t.mock.method(InboxDeadline, 'find', () => chain(deadlines));
    t.mock.method(InboxDeadline, 'findOneAndUpdate', (filter, update) => {
        calls.claims.push({ filter, update });
        const id = String(filter._id);
        if (!claim || claimedIds.has(id)) return chain(null);
        claimedIds.add(id);
        return chain({ ...deadlines.find((d) => String(d._id) === id), autoReplySentAt: NOW });
    });
    t.mock.method(InboxDeadline, 'updateOne', async (filter, update) => {
        calls.deadlineUpdates.push({ filter, update });
        return { modifiedCount: 1 };
    });
    t.mock.method(Teacher, 'findOne', async () => ({ _id: TEACHER_DOC_ID, user: USER_ID }));
    mockSummaries(t, { replyText: summariesReply() });

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
    t.mock.method(InboxEmail, 'findOne', () => chain(EMAIL_DOC));
    t.mock.method(InboxEmail, 'updateOne', async (filter, update) => {
        calls.emailUpdates.push({ filter, update });
        return { modifiedCount: 1 };
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

test('a deadline due in 2 hours with a 3-hour window is drafted, never sent', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);

    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 1, skipped: 0, failed: 0 });

    assert.equal(calls.claims.length, 1);
    assert.equal(calls.claims[0].filter.autoReplySentAt, null);
    assert.equal(calls.createdDrafts.length, 1);
    const draft = calls.createdDrafts[0];
    assert.equal(draft.source, 'auto');
    assert.equal(draft.replyType, 'newsletter_auto');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.subject, 'Re: Newsletter content due Friday');
    assert.deepEqual(draft.to, ['sarah@school.test']);
    assert.match(draft.body, /^Hello Sarah,/);
    assert.match(draft.body, /This is Omar's Assistant\./);
    assert.match(draft.body, /Science: Over the past two weeks, we covered/);

    assert.equal(calls.gmailDrafts.length, 1);
    assert.equal(calls.sentMail.length, 0);
    assert.equal(calls.deadlineUpdates.length, 0);
    assert.equal(calls.emailUpdates.length, 0);
    assert.equal(calls.notices.length, 1);
    assert.equal(calls.notices[0].type, 'inbox_newsletter_autoreply_sent');
    assert.match(calls.notices[0].subject, /Gmail Drafts/);
    assert.equal(calls.pushes.length, 1);
});

test('the send delivery mode really sends when the teacher chose send', async (t) => {
    assert.equal(effectiveDeliveryMode('send'), 'send');
    const { calls, pushSender } = mockDraftPath(t);

    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings({ deliveryMode: 'send' }), { now: NOW, pushSender });
    assert.equal(result.sent, 1);
    assert.equal(result.drafted, 0);
    assert.equal(calls.sentMail.length, 1);
    assert.equal(calls.gmailDrafts.length, 0);
    assert.equal(calls.createdDrafts[0].status, 'sent');
    assert.equal(calls.deadlineUpdates.length, 1);
    assert.equal(calls.emailUpdates.length, 1);
});

test('a deadline due in 5 hours is left alone with a 3-hour window', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { deadlines: [deadlineDoc(5)] });
    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.claims.length, 0);
    assert.equal(calls.notices.length, 0);
});

test('a past-due deadline and a tomorrow deadline are both left alone', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { deadlines: [deadlineDoc(-1), deadlineDoc(26)] });
    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.claims.length, 0);
});

test('a lost claim means another tick already handled it: no second reply', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { claim: false });
    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.claims.length, 1);
    assert.equal(calls.createdDrafts.length, 0);
    assert.equal(calls.gmailDrafts.length, 0);
    assert.equal(calls.notices.length, 0);
});

test('no recent lesson plans means the teacher is asked to reply instead', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    t.mock.method(Teacher, 'findById', () => ({ select: async () => ({ assignedClasses: [] }) }));

    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.createdDrafts.length, 0);
    assert.equal(calls.gmailDrafts.length, 0);
    assert.equal(calls.notices.length, 1);
    assert.equal(calls.notices[0].subject, 'Newsletter deadline needs you');
});

test('an existing draft for the email is never duplicated', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { existingDraft: { _id: 'draft-existing' } });
    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 1, failed: 0 });
    assert.equal(calls.createdDrafts.length, 0);
    assert.equal(calls.notices[0].subject, 'Newsletter reply already drafted');
});

test('a Gmail reauth failure notifies once and never retries the deadline', async (t) => {
    const error = Object.assign(new Error('Google access expired'), { code: 'GMAIL_REAUTH_REQUIRED' });
    const { calls, pushSender } = mockDraftPath(t, { gmailError: error });

    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 1 });
    assert.equal(calls.claims.length, 1);
    assert.equal(calls.notices.length, 1);
    assert.match(calls.notices[0].subject, /Reconnect Google/);

    // The claim stays set, so a second tick finds nothing to do.
    const second = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.deepEqual(second, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    assert.equal(calls.createdDrafts.length, 1);
    assert.equal(calls.notices.length, 1);
});

test('disabled or unconfirmed settings do nothing at all', async (t) => {
    const { calls, pushSender } = mockDraftPath(t);
    for (const settings of [
        enabledSettings({ enabled: false }),
        enabledSettings({ confirmedRisk: false }),
        { newsletterAutoReply: null },
        {}
    ]) {
        const result = await runNewsletterAutoReplyForUser(USER, settings, { now: NOW, pushSender });
        assert.deepEqual(result, { sent: 0, drafted: 0, skipped: 0, failed: 0 });
    }
    assert.equal(calls.claims.length, 0);
    assert.equal(calls.notices.length, 0);
});

test('two eligible deadlines are handled one after the other', async (t) => {
    const { calls, pushSender } = mockDraftPath(t, { deadlines: [deadlineDoc(1), deadlineDoc(2)] });
    const result = await runNewsletterAutoReplyForUser(USER, enabledSettings(), { now: NOW, pushSender });
    assert.equal(result.drafted, 2);
    assert.equal(calls.createdDrafts.length, 2);
    assert.equal(calls.gmailDrafts.length, 2);
    assert.equal(calls.notices.length, 2);
});

/* ---------------------------------------------------------------- */
/* Stage 4 — settings validation                                    */
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
            newsletterAutoReply: update.$set.newsletterAutoReply || current?.newsletterAutoReply || null,
            lastScanAt: null
        });
    });
    return writes;
};

const settingsReq = (newsletterAutoReply) => ({
    user: { _id: USER_ID, school: SCHOOL },
    body: { newsletterAutoReply }
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
    assert.equal(writes[0].newsletterAutoReply.enabled, true);
    assert.equal(writes[0].newsletterAutoReply.confirmedRisk, true);
    assert.equal(response.body.newsletterAutoReply.sendAvailable, true);
});

test('a send request is stored as send while the gate is open', async (t) => {
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ deliveryMode: 'send' }));
    assert.equal(writes[0].newsletterAutoReply.deliveryMode, 'send');
});

test('withdrawing the risk confirmation switches the feature off', async (t) => {
    const current = { newsletterAutoReply: { enabled: true, confirmedRisk: true } };
    const writes = mockSettingsStore(t, current);
    await invoke(updateSettings, settingsReq({ confirmedRisk: false }));
    assert.equal(writes[0].newsletterAutoReply.confirmedRisk, false);
    assert.equal(writes[0].newsletterAutoReply.enabled, false);
});

test('hours outside 0-24 or fractional are refused', async (t) => {
    mockSettingsStore(t);
    for (const hours of [-1, 25, 2.5, 'soon']) {
        await assert.rejects(
            () => invoke(updateSettings, settingsReq({ hoursBeforeDeadline: hours })),
            (error) => error.statusCode === 400,
            `hours ${hours}`
        );
    }
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ hoursBeforeDeadline: 0 }));
    assert.equal(writes[0].newsletterAutoReply.hoursBeforeDeadline, 0);
});

test('check times must be 1-12 valid HH:MM values, stored sorted and unique', async (t) => {
    mockSettingsStore(t);
    for (const checkTimes of [[], ['25:00'], ['7:00'], ['07:60'], Array(13).fill('07:00'), '07:00']) {
        await assert.rejects(
            () => invoke(updateSettings, settingsReq({ checkTimes })),
            (error) => error.statusCode === 400,
            `checkTimes ${JSON.stringify(checkTimes)}`
        );
    }
    const writes = mockSettingsStore(t);
    await invoke(updateSettings, settingsReq({ checkTimes: ['18:00', '07:00', '18:00'] }));
    assert.deepEqual(writes[0].newsletterAutoReply.checkTimes, ['07:00', '18:00']);
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

/* ---------------------------------------------------------------- */
/* Stage 6 — check times and the scheduler gate                     */
/* ---------------------------------------------------------------- */

test('a tick counts as a check time within 10 minutes, wrapping midnight', () => {
    assert.equal(isCheckTimeNow(['07:00'], 7 * 60), true);
    assert.equal(isCheckTimeNow(['07:00'], 7 * 60 + 10), true);
    assert.equal(isCheckTimeNow(['07:00'], 7 * 60 + 11), false);
    assert.equal(isCheckTimeNow(['00:00'], 23 * 60 + 55), true);
    assert.equal(isCheckTimeNow(['00:00'], 5), true);
    assert.equal(isCheckTimeNow(['00:00'], 15), false);
});

test('normalizers keep defaults and drop invalid times', () => {
    const defaults = normalizeNewsletterAutoReply(null);
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.confirmedRisk, false);
    assert.equal(defaults.hoursBeforeDeadline, 3);
    assert.equal(defaults.deliveryMode, 'draft_only');
    assert.deepEqual(defaults.checkTimes, ['00:00', '07:00', '18:00']);
    assert.deepEqual(normalizeCheckTimes(['18:00', 'bad', '07:00', '18:00']), ['07:00', '18:00']);
});

test('the env kill switch stops the job before any query', async (t) => {
    t.mock.method(InboxAssistantSettings, 'find', () => {
        throw new Error('must not query when disabled');
    });
    const result = await runInboxNewsletterAutoReplyJob(NOW, {
        env: { RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB: 'false' }
    });
    assert.deepEqual(result, { skipped: true, teachers: 0, sent: 0, drafted: 0, failed: 0 });
});

test('the job only runs a teacher near their own check time', async (t) => {
    const settingsRow = {
        school: SCHOOL,
        user: USER_ID,
        optedIn: true,
        newsletterAutoReply: { enabled: true, confirmedRisk: true, checkTimes: ['10:00'] }
    };
    t.mock.method(InboxAssistantSettings, 'find', () => chain([settingsRow]));
    t.mock.method(User, 'findOne', () => chain(USER));
    t.mock.method(InboxDeadline, 'findOne', () => chain({ timeZone: 'UTC' }));
    const findMock = t.mock.method(InboxDeadline, 'find', () => chain([]));

    const onTime = await runInboxNewsletterAutoReplyJob(NOW, { env: {}, pushSender: async () => {} });
    assert.equal(onTime.teachers, 1);
    assert.equal(findMock.mock.callCount(), 1);

    const offTime = await runInboxNewsletterAutoReplyJob(new Date('2026-11-04T12:00:00.000Z'), { env: {}, pushSender: async () => {} });
    assert.equal(offTime.teachers, 0);
    assert.equal(findMock.mock.callCount(), 1);
});