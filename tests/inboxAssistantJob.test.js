import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';

import AiCreditSetting from '../models/AiCreditSetting.js';
import InboxDeadline from '../models/InboxDeadline.js';
import InboxEmail from '../models/InboxEmail.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { runInboxAssistantJob } from '../jobs/inboxAssistantJob.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';

const SCHOOL = 'school-1';
const TEACHER = 'teacher-1';
const NOW = new Date('2026-11-20T00:00:00.000Z');

const originals = {
    creditFindOne: AiCreditSetting.findOne,
    emailUpdateMany: InboxEmail.updateMany,
    deadlineFind: InboxDeadline.find,
    deadlineFindOneAndUpdate: InboxDeadline.findOneAndUpdate,
    notificationCreate: Notification.create,
    userFind: User.find
};

const restore = () => {
    AiCreditSetting.findOne = originals.creditFindOne;
    InboxEmail.updateMany = originals.emailUpdateMany;
    InboxDeadline.find = originals.deadlineFind;
    InboxDeadline.findOneAndUpdate = originals.deadlineFindOneAndUpdate;
    Notification.create = originals.notificationCreate;
    User.find = originals.userFind;
};

const chain = (value) => {
    const wrapper = {
        select: () => wrapper,
        lean: async () => value
    };
    return wrapper;
};

const installPlatformRetention = (days = 14) => {
    AiCreditSetting.findOne = () => chain({ inbox: { rawTextRetentionDays: days } });
};

const noDeadlines = () => {
    InboxDeadline.find = () => chain([]);
};

beforeEach(() => {
    restore();
    installPlatformRetention();
    noDeadlines();
    InboxEmail.updateMany = async () => ({ modifiedCount: 0 });
    Notification.create = async (doc) => doc;
    User.find = () => chain([]);
});

after(() => {
    restore();
});

test('retention clears old bodies only, and reads the window from platform settings', async () => {
    const captured = {};
    InboxEmail.updateMany = async (filter, update) => {
        captured.filter = filter;
        captured.update = update;
        return { modifiedCount: 4 };
    };

    const result = await runInboxAssistantJob({
        now: NOW,
        env: {},
        pushSender: async () => {}
    });

    assert.equal(result.purged, 4);
    assert.deepEqual(captured.filter, {
        bodyPurgedAt: null,
        createdAt: { $lt: new Date('2026-11-06T00:00:00.000Z') }
    });
    assert.deepEqual(captured.update, {
        $set: { bodyText: '', bodyPurgedAt: NOW }
    });
    assert.deepEqual(Object.keys(captured.update.$set), ['bodyText', 'bodyPurgedAt']);
});

test('recent emails and unconfirmed deadlines never remind', async () => {
    const captured = {};
    InboxDeadline.find = (filter) => {
        captured.filter = filter;
        return chain([]);
    };
    let created = 0;
    Notification.create = async () => { created += 1; };

    const result = await runInboxAssistantJob({
        now: NOW,
        env: {},
        pushSender: async () => {}
    });

    assert.equal(result.remindersSent, 0);
    assert.equal(created, 0);
    assert.equal(captured.filter.state, 'confirmed');
    assert.equal(captured.filter.reminderSentAt, null);
    assert.ok(captured.filter.remindAt.$lte instanceof Date);
});

test('a confirmed deadline reminds exactly once across two job runs', async () => {
    const deadline = {
        _id: 'deadline-1',
        school: SCHOOL,
        user: TEACHER,
        title: 'Return the forms',
        dueAt: new Date('2026-11-05T12:00:00.000Z'),
        dueDateOnly: false,
        timeZone: 'UTC',
        remindAt: new Date('2026-11-05T10:00:00.000Z')
    };
    let claims = 0;
    const claimCalls = [];
    InboxDeadline.find = () => chain([deadline]);
    InboxDeadline.findOneAndUpdate = (filter, update) => {
        claims += 1;
        claimCalls.push({ filter, update });
        return chain(claims === 1 ? { ...deadline, ...update.$set } : null);
    };

    User.find = () => chain([{ _id: TEACHER, email: 'teacher@school.org' }]);
    const notifications = [];
    Notification.create = async (doc) => { notifications.push(doc); return doc; };
    const pushes = [];
    const pushSender = async (payload) => { pushes.push(payload); };

    await runInboxAssistantJob({ now: NOW, env: {}, pushSender });
    await runInboxAssistantJob({ now: new Date(NOW.getTime() + 60 * 60 * 1000), env: {}, pushSender });

    assert.equal(claims, 2);
    assert.deepEqual(claimCalls[0].filter, {
        _id: 'deadline-1',
        state: 'confirmed',
        reminderSentAt: null,
        remindAt: { $lte: NOW }
    });
    assert.equal(claimCalls[0].update.$set.reminderSentAt.toISOString(), NOW.toISOString());

    assert.equal(notifications.length, 1);
    const notification = notifications[0];
    assert.equal(notification.type, NOTIFICATION_TYPES.INBOX_DEADLINE_REMINDER);
    assert.equal(notification.recipient, TEACHER);
    assert.equal(notification.recipientEmail, 'teacher@school.org');
    assert.match(notification.message, /Return the forms/);
    assert.equal(notification.channels[0], 'push');

    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].schoolId, SCHOOL);
    assert.deepEqual(pushes[0].userIds, [TEACHER]);
});

test('the job can be switched off without touching any inbox row', async () => {
    let updates = 0;
    let queries = 0;
    InboxEmail.updateMany = async () => { updates += 1; return { modifiedCount: 0 }; };
    InboxDeadline.find = () => { queries += 1; return chain([]); };

    const result = await runInboxAssistantJob({
        now: NOW,
        env: { RUN_INBOX_ASSISTANT_JOB: 'false' },
        pushSender: async () => {}
    });

    assert.deepEqual(result, { skipped: true, purged: 0, remindersSent: 0 });
    assert.equal(updates, 0);
    assert.equal(queries, 0);
});
