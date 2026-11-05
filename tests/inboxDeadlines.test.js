import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import AiCreditSetting from '../models/AiCreditSetting.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import InboxDeadline from '../models/InboxDeadline.js';
import InboxEmail from '../models/InboxEmail.js';
import InboxEvent from '../models/InboxEvent.js';
import inboxAiService from '../services/inbox/inboxAiService.js';
import inboxGmailReader from '../services/inbox/inboxGmailReader.js';
import {
    createDeadlineForUser,
    defaultRemindAt,
    getSummaryForUser,
    listDeadlinesForUser,
    updateDeadlineForUser
} from '../services/inbox/inboxDeadlinesService.js';
import { getSummary } from '../controllers/inboxDeadlineController.js';

const SCHOOL = 'school-1';
const TEACHER = 'teacher-1';
const USER = { _id: TEACHER, school: SCHOOL, role: 'teacher', roles: ['teacher'] };
const NOW = new Date('2026-11-04T10:00:00.000Z');

const originals = {
    deadlineFind: InboxDeadline.find,
    deadlineFindOne: InboxDeadline.findOne,
    deadlineFindOneAndUpdate: InboxDeadline.findOneAndUpdate,
    deadlineCreate: InboxDeadline.create,
    deadlineCount: InboxDeadline.countDocuments,
    emailCount: InboxEmail.countDocuments,
    eventCount: InboxEvent.countDocuments,
    settingsFindOne: InboxAssistantSettings.findOne,
    creditFindOne: AiCreditSetting.findOne,
    listInboxIds: inboxGmailReader.listInboxIds,
    fetchMessages: inboxGmailReader.fetchMessages,
    classifyBatch: inboxAiService.classifyBatch
};

const restore = () => {
    InboxDeadline.find = originals.deadlineFind;
    InboxDeadline.findOne = originals.deadlineFindOne;
    InboxDeadline.findOneAndUpdate = originals.deadlineFindOneAndUpdate;
    InboxDeadline.create = originals.deadlineCreate;
    InboxDeadline.countDocuments = originals.deadlineCount;
    InboxEmail.countDocuments = originals.emailCount;
    InboxEvent.countDocuments = originals.eventCount;
    InboxAssistantSettings.findOne = originals.settingsFindOne;
    AiCreditSetting.findOne = originals.creditFindOne;
    inboxGmailReader.listInboxIds = originals.listInboxIds;
    inboxGmailReader.fetchMessages = originals.fetchMessages;
    inboxAiService.classifyBatch = originals.classifyBatch;
};

const chain = (value) => {
    const wrapper = {
        select: () => wrapper,
        lean: async () => value
    };
    return wrapper;
};

beforeEach(() => {
    restore();
    // Calendar is off at the platform level by default, so no token is read.
    AiCreditSetting.findOne = () => chain({ inbox: {} });
    InboxAssistantSettings.findOne = () => chain(null);
});

after(() => {
    restore();
});

/* ---------------------------------------------------------------- */
/* Default reminder time                                            */
/* ---------------------------------------------------------------- */

test('a date-only deadline reminds at 08:00 the day before, in the teacher time zone', () => {
    const dubai = defaultRemindAt({
        dueAt: new Date('2026-11-09T20:00:00.000Z'), // 2026-11-10 00:00 in Dubai
        dueDateOnly: true,
        timeZone: 'Asia/Dubai',
        now: NOW
    });
    assert.equal(dubai.toISOString(), '2026-11-09T04:00:00.000Z');

    const newYork = defaultRemindAt({
        dueAt: new Date('2026-11-10T05:00:00.000Z'), // 2026-11-10 00:00 in New York
        dueDateOnly: true,
        timeZone: 'America/New_York',
        now: NOW
    });
    assert.equal(newYork.toISOString(), '2026-11-09T13:00:00.000Z');
});

test('a timed deadline reminds two hours before it is due', () => {
    const remindAt = defaultRemindAt({
        dueAt: new Date('2026-11-10T15:00:00.000Z'),
        dueDateOnly: false,
        timeZone: 'Asia/Dubai',
        now: NOW
    });
    assert.equal(remindAt.toISOString(), '2026-11-10T13:00:00.000Z');
});

test('a default reminder already in the past is left empty', () => {
    const dateOnly = defaultRemindAt({
        dueAt: new Date('2026-11-10T00:00:00.000Z'),
        dueDateOnly: true,
        timeZone: 'UTC',
        now: new Date('2026-11-10T09:00:00.000Z')
    });
    assert.equal(dateOnly, null);

    const timed = defaultRemindAt({
        dueAt: new Date('2026-11-04T11:00:00.000Z'),
        dueDateOnly: false,
        timeZone: 'UTC',
        now: NOW
    });
    assert.equal(timed, null);
});

/* ---------------------------------------------------------------- */
/* Confirm, create, scope                                           */
/* ---------------------------------------------------------------- */

test('confirming a proposed deadline sets a default reminder and keeps the tenant scope', async () => {
    const proposed = {
        _id: 'deadline-1',
        school: SCHOOL,
        user: TEACHER,
        email: 'email-1',
        title: 'Return the forms',
        dueAt: new Date('2026-11-10T00:00:00.000Z'),
        dueDateOnly: true,
        timeZone: 'UTC',
        state: 'proposed',
        source: 'ai',
        remindAt: null
    };
    const captured = {};

    InboxDeadline.findOne = (filter) => {
        captured.readFilter = filter;
        return chain(proposed);
    };
    InboxDeadline.findOneAndUpdate = (filter, update) => {
        captured.updateFilter = filter;
        captured.update = update;
        return chain({ ...proposed, ...update.$set });
    };

    const saved = await updateDeadlineForUser(USER, 'deadline-1', { state: 'confirmed' }, { now: NOW });

    assert.deepEqual(captured.readFilter, { _id: 'deadline-1', school: SCHOOL, user: TEACHER });
    assert.deepEqual(captured.updateFilter, { _id: 'deadline-1', school: SCHOOL, user: TEACHER });
    assert.equal(captured.update.$set.state, 'confirmed');
    assert.equal(captured.update.$set.remindAt.toISOString(), '2026-11-09T08:00:00.000Z');
    assert.equal(captured.update.$set.reminderSentAt, null);
    assert.equal(saved.state, 'confirmed');
});

test('a manual deadline is confirmed, may have no email and defaults its reminder', async () => {
    const captured = {};
    InboxDeadline.create = async (doc) => {
        captured.doc = doc;
        return { ...doc, _id: 'deadline-2' };
    };

    const created = await createDeadlineForUser(USER, {
        title: 'Submit grades',
        dueAt: '2026-11-12T09:00:00.000Z',
        dueDateOnly: false,
        timeZone: 'Asia/Dubai'
    }, { now: NOW });

    assert.equal(captured.doc.school, SCHOOL);
    assert.equal(captured.doc.user, TEACHER);
    assert.equal(captured.doc.email, null);
    assert.equal(captured.doc.source, 'manual');
    assert.equal(captured.doc.state, 'confirmed');
    assert.equal(created.remindAt.toISOString(), '2026-11-12T07:00:00.000Z');
});

test('the deadline list is scoped to the teacher and defaults to proposed and confirmed', async () => {
    const captured = {};
    InboxDeadline.find = (filter) => {
        captured.filter = filter;
        return { sort: () => ({ lean: async () => [] }) };
    };

    const rows = await listDeadlinesForUser(USER);
    assert.deepEqual(rows, []);
    assert.deepEqual(captured.filter, {
        school: SCHOOL,
        user: TEACHER,
        state: { $in: ['proposed', 'confirmed'] }
    });
});

/* ---------------------------------------------------------------- */
/* Summary                                                          */
/* ---------------------------------------------------------------- */

test('the summary endpoint counts only and never calls Gmail or AI', async () => {
    let gmailCalls = 0;
    let aiCalls = 0;
    inboxGmailReader.listInboxIds = async () => { gmailCalls += 1; return []; };
    inboxGmailReader.fetchMessages = async () => { gmailCalls += 1; return []; };
    inboxAiService.classifyBatch = async () => { aiCalls += 1; return []; };

    const emailFilters = [];
    const deadlineFilters = [];
    const eventFilters = [];
    InboxEmail.countDocuments = async (filter) => {
        emailFilters.push(filter);
        return filter.receivedAt ? 2 : 5;
    };
    InboxDeadline.countDocuments = async (filter) => {
        deadlineFilters.push(filter);
        if (filter.$or) return 2;
        if (filter.state === 'proposed') return 3;
        return filter.dueAt.$lt ? 1 : 4;
    };
    InboxEvent.countDocuments = async (filter) => {
        eventFilters.push(filter);
        if (filter.$or) return 1;
        return filter.state === 'proposed' ? 6 : 7;
    };
    InboxAssistantSettings.findOne = () => chain({ nudgeAfterDays: 2 });

    const body = await getSummaryForUser(USER, { now: NOW });
    assert.deepEqual(body, {
        needsReply: 5,
        waiting: 2,
        deadlinesDueSoon: 4,
        overdue: 1,
        proposedDeadlines: 3,
        proposedEvents: 6,
        upcomingEvents: 7,
        calendarAttention: 3
    });

    assert.equal(gmailCalls, 0);
    assert.equal(aiCalls, 0);
    assert.equal(emailFilters.length, 2);
    assert.ok(emailFilters[0].school === SCHOOL && emailFilters[0].user === TEACHER);
    assert.equal(emailFilters[1].receivedAt.$lte.toISOString(), '2026-11-02T10:00:00.000Z');
    assert.ok(deadlineFilters.every((filter) => filter.school === SCHOOL && filter.user === TEACHER));
    assert.ok(eventFilters.every((filter) => filter.school === SCHOOL && filter.user === TEACHER));
});

test('the summary controller returns the counts as JSON', async () => {
    InboxEmail.countDocuments = async () => 0;
    InboxDeadline.countDocuments = async () => 0;
    InboxEvent.countDocuments = async () => 0;
    InboxAssistantSettings.findOne = () => chain(null);

    const res = {
        body: null,
        json(value) { this.body = value; return this; }
    };
    await getSummary({ user: USER }, res, (error) => { throw error; });
    await delay(0);

    assert.deepEqual(res.body, {
        needsReply: 0,
        waiting: 0,
        deadlinesDueSoon: 0,
        overdue: 0,
        proposedDeadlines: 0,
        proposedEvents: 0,
        upcomingEvents: 0,
        calendarAttention: 0
    });
});
