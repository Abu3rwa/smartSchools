import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import Student from '../models/Student.js';
import School from '../models/School.js';
import User from '../models/User.js';
import WritingAssessment from '../models/WritingAssessment.js';
import WritingAssignment from '../models/WritingAssignment.js';
import WritingProject from '../models/WritingProject.js';
import WritingDraft from '../models/WritingDraft.js';
import gmailOAuthService from '../services/gmailOAuthService.js';

import {
    buildFeedbackEmail,
    emailChannels,
    formatDueDate,
    notifyFeedbackPublished,
    previewPublishedFeedbackEmail,
    publishChannels,
    resendPublishedFeedbackEmail,
    resolveRecipients,
    statusIndex
} from '../services/writingFeedbackEmailService.js';

const assignment = {
    title: 'Longer recess',
    topic: 'Should our school have a longer recess?',
    writingType: 'essay',
    dueDate: new Date('2026-11-12T00:00:00.000Z'),
    workflow: { maxDrafts: 3 }
};

const assessment = {
    kind: 'feedback',
    language: 'en',
    overall: {
        summary: 'The order of your paragraphs is clear. The ending repeats the introduction.',
        nextPriorities: ['Add one example.', 'Join paragraphs with linking words.', 'End with your own idea.', 'A fourth item that must not appear.']
    },
    scores: [{ key: 'ideas', score: 7, maxScore: 10 }]
};

const project = { stage: 'feedback_published', draftCount: 2 };
const draft = { number: 2, totalWords: 168 };

const build = (overrides = {}) => buildFeedbackEmail({
    role: 'student',
    language: 'en',
    studentFirstName: 'Areen',
    schoolName: 'Al Noor School',
    assignment,
    project,
    draft,
    assessment,
    url: 'https://portal.example.com/portal/writing/project/p1',
    ...overrides
});

test('email delivery is off unless the deploy turns it on', () => {
    assert.deepEqual(emailChannels({}), { students: false, parents: false });
    assert.deepEqual(emailChannels({ WRITING_EMAIL_DELIVERY: 'off' }), { students: false, parents: false });
    assert.deepEqual(emailChannels({ WRITING_EMAIL_DELIVERY: 'students' }), { students: true, parents: false });
    assert.deepEqual(emailChannels({ WRITING_EMAIL_DELIVERY: ' Parents ' }), { students: false, parents: true });
    assert.deepEqual(emailChannels({ WRITING_EMAIL_DELIVERY: 'both' }), { students: true, parents: true });
    assert.deepEqual(emailChannels({ WRITING_EMAIL_DELIVERY: 'everyone' }), { students: false, parents: false });
});

test('a teacher can narrow a channel but never widen it', () => {
    const both = { students: true, parents: true };
    assert.deepEqual(publishChannels(both, {}), { students: true, parents: true });
    assert.deepEqual(publishChannels(both, { student: false }), { students: false, parents: true });
    assert.deepEqual(publishChannels(both, { parents: false }), { students: true, parents: false });
    assert.deepEqual(publishChannels({ students: true, parents: false }, { parents: true }), { students: true, parents: false });
    assert.deepEqual(publishChannels(both, { student: false, parents: false }), { students: false, parents: false });
});

test('recipients skip duplicates and stay inside the enabled channels', () => {
    const student = {
        email: 'areen@school.example',
        user: { email: 'areen@school.example' },
        getAllContactEmailEntries: () => [
            { type: 'father', email: 'dad@home.example' },
            { type: 'mother', email: 'MUM@home.example' },
            { type: 'guardian', email: 'areen@school.example' },
            { type: 'student', email: 'areen@school.example' }
        ]
    };

    const all = resolveRecipients({ student, channels: { students: true, parents: true } });
    assert.deepEqual(all.studentEmails, ['areen@school.example']);
    assert.deepEqual(all.parentEmails, ['dad@home.example', 'mum@home.example']);

    const parentsOnly = resolveRecipients({ student, channels: { students: false, parents: true } });
    assert.deepEqual(parentsOnly.studentEmails, []);
    // A guardian address equal to the student's is only dropped when that channel is on.
    assert.deepEqual(parentsOnly.parentEmails, ['dad@home.example', 'mum@home.example', 'areen@school.example']);
});

test('the status strip maps every writing stage onto one of five stops', () => {
    assert.equal(statusIndex('drafting'), 1);
    assert.equal(statusIndex('submitted'), 1);
    assert.equal(statusIndex('feedback_published'), 2);
    assert.equal(statusIndex('compared'), 2);
    assert.equal(statusIndex('ready_for_notebook'), 3);
    assert.equal(statusIndex('awaiting_notebook_check'), 3);
    assert.equal(statusIndex('completed'), 4);
});

test('due dates follow the language of the feedback', () => {
    assert.equal(formatDueDate('2026-11-12T00:00:00.000Z', 'en'), '12 Nov');
    const arabic = formatDueDate('2026-11-12T00:00:00.000Z', 'ar');
    assert.ok(arabic.length > 0);
    assert.equal(formatDueDate('', 'en'), '');
    assert.equal(formatDueDate('not a date', 'en'), '');
});

test('a student email names the draft, the next step and the piece', () => {
    const message = build();
    assert.match(message.subject, /draft 2/i);
    assert.match(message.html, /Your feedback on draft 2 is ready/);
    assert.match(message.html, /Hello Areen/);
    assert.match(message.html, /Do these next/);
    assert.match(message.html, /Open my writing/);
    assert.match(message.html, /Al Noor School · Writing/);
    assert.match(message.html, /Draft 2 of 3 · 168 words/);
    assert.match(message.html, /due 12 Nov/);
    assert.match(message.text, /^Hello Areen,/);
    assert.match(message.text, /1\. Add one example\./);
});

test('the email carries three priorities at most and no scores', () => {
    const message = build();
    assert.equal((message.html.match(/Add one example\./g) || []).length, 1);
    assert.equal(message.html.includes('A fourth item'), false);
    assert.equal(/score|rubric/i.test(message.text), false);
    assert.equal(message.text.includes('10'), false, 'a rubric maximum must not leak into the email');
    assert.equal(message.text.includes('7'), false);
});

test('a parent email attributes the student-directed words instead of rewriting them', () => {
    const message = build({ role: 'parent' });
    assert.match(message.html, /Areen&#39;s feedback on draft 2 is ready/);
    assert.match(message.html, /The message Areen received/);
    assert.match(message.html, /Next steps the teacher asked for/);
    assert.match(message.html, /See the feedback/);
    assert.equal(message.html.includes('Do these next'), false);
});

test('arabic feedback gets an arabic, right-to-left message', () => {
    const message = build({ role: 'parent', language: 'ar', assessment: { ...assessment, language: 'ar' } });
    assert.match(message.html, /dir="rtl"/);
    assert.match(message.html, /lang="ar"/);
    assert.match(message.html, /ملاحظات Areen على المسودة 2 جاهزة/);
    assert.match(message.html, /الخطوات التالية التي طلبها المعلم/);
    assert.match(message.html, /عرض الملاحظات/);
    assert.match(message.subject, /المسودة 2/);
});

test('feedback text is escaped before it reaches the inbox', () => {
    const message = build({
        assessment: {
            ...assessment,
            overall: { summary: '<script>alert(1)</script> & "quotes"', nextPriorities: ['<b>bold</b>'] }
        }
    });
    assert.equal(message.html.includes('<script>'), false);
    assert.equal(message.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
    assert.equal(message.html.includes('&quot;quotes&quot;'), true);
    assert.equal(message.html.includes('<b>bold</b>'), false);
});

test('nothing is sent when the feedback is empty or there is no link', () => {
    assert.equal(build({ assessment: { ...assessment, overall: { summary: '', nextPriorities: [] } } }), null);
    const noLink = build({ url: '' });
    assert.equal(noLink.html.includes('<a href'), false);
    assert.equal(noLink.text.includes('http'), false);
});

const ids = {
    schoolId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    assessmentId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    userId: 'cccccccccccccccccccccccc'
};
const resendContext = {
    ...ids,
    notify: { student: true, parents: true },
    env: { WRITING_EMAIL_DELIVERY: 'both', CLIENT_URL: 'https://portal.example.com' }
};
const query = (value) => ({
    select() { return this; },
    populate() { return this; },
    setOptions() { return this; },
    lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
});

const stubDelivery = (t, overrides = {}) => {
    const sent = [];
    const records = {
        assessment: { ...assessment, _id: ids.assessmentId, aiStatus: 'done', publish: { state: 'published' }, project: 'project1', assignment: 'assignment1', draft: 'draft1', student: 'student1' },
        assignment: { ...assignment, _id: 'assignment1', assignedBy: ids.userId },
        project: { ...project, _id: 'project1', student: 'student1', latestDraft: 'newer-draft' },
        draft: { ...draft, _id: 'draft1' },
        student: { firstName: 'Areen', email: 'student@example.test', getAllContactEmailEntries: () => [{ type: 'mother', email: 'parent@example.test' }] },
        ...overrides
    };
    for (const [model, key] of [[WritingAssessment, 'assessment'], [WritingAssignment, 'assignment'], [WritingProject, 'project'], [WritingDraft, 'draft'], [Student, 'student']]) {
        t.mock.method(model, 'findOne', (filter) => {
            assert.equal(filter.school, ids.schoolId);
            const expectedId = { assessment: ids.assessmentId, assignment: 'assignment1', project: 'project1', draft: 'draft1', student: 'student1' }[key];
            assert.equal(filter._id, expectedId);
            if (key === 'project' || key === 'draft') {
                assert.equal(filter.assignment, 'assignment1');
                assert.equal(filter.student, 'student1');
            }
            if (key === 'draft') assert.equal(filter.project, 'project1');
            return query(records[key]);
        });
        t.mock.method(model.prototype, 'save', () => assert.fail('resend must not modify the writing workflow'));
    }
    t.mock.method(School, 'findOne', (filter) => {
        assert.equal(filter._id, ids.schoolId);
        return query({ name: 'Example School' });
    });
    t.mock.method(User, 'find', (filter) => {
        assert.equal(filter.school, ids.schoolId);
        return query([{ _id: 'mail-admin' }]);
    });
    t.mock.method(gmailOAuthService, 'hasValidTokens', async () => true);
    t.mock.method(gmailOAuthService, 'sendEmail', async (_sender, message) => {
        if (overrides.fail?.includes(message.to)) throw new Error('Test transport failure');
        sent.push(message);
        return { messageId: 'test-message' };
    });
    for (const key of ['SMTP_HOST', 'EMAIL_HOST', 'SMTP_USER', 'EMAIL_USER', 'SMTP_PASS', 'EMAIL_PASS']) {
        const previous = process.env[key];
        delete process.env[key];
        t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
    t.mock.method(globalThis, 'fetch', () => assert.fail('no network or AI request is allowed'));
    return { sent, records };
};

for (const [name, notify, recipients] of [
    ['student only', { student: true, parents: false }, ['student@example.test']],
    ['parents only', { student: false, parents: true }, ['parent@example.test']],
    ['both', { student: true, parents: true }, ['student@example.test', 'parent@example.test']]
]) {
    test(`published feedback resend supports ${name} without changing the project`, async (t) => {
        const { sent, records } = stubDelivery(t);
        const before = JSON.stringify(records);
        const result = await resendPublishedFeedbackEmail({ ...resendContext, notify });
        assert.deepEqual(result, { sent: recipients.length, failed: 0, missing: [] });
        assert.deepEqual(sent.map((message) => message.to), recipients);
        assert.ok(sent.every((message) => message.html.includes(assessment.overall.summary)));
        assert.equal(JSON.stringify(records), before);
    });
}

test('resending old feedback does not tell a finished student to start an old draft', () => {
    const message = build({ resend: true, project: { stage: 'completed', draftCount: 3 } });
    assert.match(message.text, /published feedback on draft 2 again/);
    assert.doesNotMatch(message.html, /Now: writing draft|before you start draft/);
    const arabic = build({ resend: true, language: 'ar', role: 'parent' });
    assert.match(arabic.text, /مرة أخرى/);
    assert.doesNotMatch(arabic.html, /الآن: كتابة المسودة/);
});

test('resend preview uses exactly the same saved email content without sending', async (t) => {
    const { sent } = stubDelivery(t);
    const preview = await previewPublishedFeedbackEmail(resendContext);
    assert.equal(sent.length, 0);
    assert.deepEqual(preview.previews.map((row) => row.role), ['student', 'parents']);
    assert.equal(preview.previews[0].recipients, 1);
    assert.equal(JSON.stringify(preview).includes('student@example.test'), false);
    await resendPublishedFeedbackEmail(resendContext);
    assert.deepEqual(preview.previews.map((row) => row.html), sent.map((row) => row.html));
});

for (const action of [previewPublishedFeedbackEmail, resendPublishedFeedbackEmail]) {
    test(`${action.name} rejects another teacher and missing tenant records`, async (t) => {
        const { sent, records } = stubDelivery(t);
        await assert.rejects(action({ ...resendContext, userId: 'other-teacher' }), { statusCode: 403 });
        records.assessment = null;
        await assert.rejects(action(resendContext), { statusCode: 404 });
        await assert.rejects(action({ ...resendContext, assessmentId: 'bad-id' }), { statusCode: 404 });
        assert.equal(sent.length, 0);
    });

    test(`${action.name} rejects drafts, comparisons and unfinished AI output`, async (t) => {
        const { sent, records } = stubDelivery(t);
        for (const patch of [{ publish: { state: 'draft' } }, { kind: 'comparison' }, { aiStatus: 'running' }]) {
            const original = records.assessment;
            records.assessment = { ...original, ...patch };
            await assert.rejects(action(resendContext), { code: 'WRITING_EMAIL_NOT_PUBLISHED' });
            records.assessment = original;
        }
        assert.equal(sent.length, 0);
    });

    test(`${action.name} requires explicit boolean recipients and respects delivery gates`, async (t) => {
        const { sent } = stubDelivery(t);
        for (const notify of [undefined, {}, { student: true }, { student: false, parents: false }, { student: 'false', parents: true }]) {
            await assert.rejects(action({ ...resendContext, notify }), { code: 'WRITING_EMAIL_RECIPIENTS_REQUIRED' });
        }
        for (const mode of ['off', 'students', 'parents']) {
            await assert.rejects(action({ ...resendContext, env: { WRITING_EMAIL_DELIVERY: mode } }), { code: 'WRITING_EMAIL_DISABLED' });
        }
        assert.equal(sent.length, 0);
    });
}

test('school admin may resend another teacher’s published feedback', async (t) => {
    const { sent } = stubDelivery(t);
    await resendPublishedFeedbackEmail({ ...resendContext, userId: 'admin', isAdmin: true });
    assert.equal(sent.length, 2);
});

test('missing addresses and empty feedback are not reported as successful sends', async (t) => {
    const { sent, records } = stubDelivery(t);
    records.student = { firstName: 'Areen' };
    await assert.rejects(resendPublishedFeedbackEmail(resendContext), { code: 'WRITING_EMAIL_NO_ADDRESSES' });
    records.student.email = 'student@example.test';
    const preview = await previewPublishedFeedbackEmail(resendContext);
    assert.deepEqual(preview.missing, ['parents']);
    records.assessment.overall = { summary: '', nextPriorities: [] };
    await assert.rejects(resendPublishedFeedbackEmail(resendContext), { code: 'WRITING_EMAIL_EMPTY' });
    assert.equal(sent.length, 0);
});

test('resend deduplicates shared addresses and reports transport failures accurately', async (t) => {
    const { sent, records } = stubDelivery(t, { fail: ['parent@example.test'] });
    const partial = await resendPublishedFeedbackEmail(resendContext);
    assert.deepEqual(partial, { sent: 1, failed: 1, missing: [] });
    assert.equal(sent.length, 1);
    const failed = await resendPublishedFeedbackEmail({ ...resendContext, notify: { student: false, parents: true } });
    assert.deepEqual(failed, { sent: 0, failed: 1, missing: [] });
    records.student.getAllContactEmailEntries = () => [{ type: 'guardian', email: 'student@example.test' }];
    const shared = await resendPublishedFeedbackEmail(resendContext);
    assert.deepEqual(shared, { sent: 1, failed: 0, missing: [] });
});

test('automatic publish delivery retains its channel and skip behavior', async (t) => {
    const { records, sent } = stubDelivery(t);
    const context = { schoolId: ids.schoolId, ...records, env: resendContext.env };
    assert.deepEqual(await notifyFeedbackPublished({ ...context, env: {} }), { skipped: 'off' });
    assert.deepEqual(await notifyFeedbackPublished({ ...context, assessment: { kind: 'comparison' } }), { skipped: 'not-feedback' });
    const result = await notifyFeedbackPublished(context);
    assert.equal(result.results.length, 2);
    assert.equal(sent.length, 2);
});

test('resend routes require staff, rate-limit sends, and never reach AI or credit', async () => {
    const routes = await readFile(new URL('../routes/writingRoutes.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.post\('\/assessments\/:assessmentId\/email-preview', staff, previewFeedbackEmail\)/);
    assert.match(routes, /router\.post\('\/assessments\/:assessmentId\/resend-email', staff, emailSendRateLimiter, resendFeedbackEmail\)/);
    const source = await readFile(new URL('../services/writingFeedbackEmailService.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /connectAi|assertCanSpend|chargeUsage|writingAssistantAssessmentService/);
});
