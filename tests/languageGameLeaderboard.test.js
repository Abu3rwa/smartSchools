import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import School from '../models/School.js';
import Subscription from '../models/Subscription.js';
import Student from '../models/Student.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import Teacher from '../models/Teacher.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import GameProfile from '../models/GameProfile.js';
import GameRewardEvent from '../models/GameRewardEvent.js';
import GameClassSetting from '../models/GameClassSetting.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { invalidateSchoolFeatureContext } from '../middleware/featureGate.js';
import { getLeaderboard, setClassLeaderboard } from '../controllers/languageGameLeaderboardController.js';
import {
    accuracyFor,
    displayNameFor,
    leaderboardMatch,
    previousWindowBoundsFor,
    windowBoundsFor
} from '../services/languageGameLeaderboard.js';
import {
    awardedXpForDay,
    dateKeyFor,
    monthKeyForDateKey,
    previousMonthKey,
    previousWeekKey,
    weekKeyForDateKey,
    XP_DAILY_SUBJECT_CAP
} from '../services/languageGameScoring.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const STUDENT = 'eeeeeeeeeeeeeeeeeeeeeeee';
const OTHER_STUDENT = 'eeeeeeeeeeeeeeeeeeeeee01';
const CLASS = '333333333333333333333333';
const OTHER_CLASS = '333333333333333333333301';
const SUBJECT = '222222222222222222222222';
const TEACHER_USER = 'ffffffffffffffffffffffff';
const TEACHER_PROFILE = 'ffffffffffffffffffffff01';

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

test('month keys and the previous month cross the year boundary', () => {
    assert.equal(monthKeyForDateKey('2026-11-19'), '2026-11');
    assert.equal(previousMonthKey('2026-11'), '2026-10');
    assert.equal(previousMonthKey('2026-01'), '2025-12');
    assert.equal(previousMonthKey('garbage'), '');
});

test('the daily cap trims at the boundary and never goes negative', () => {
    assert.equal(XP_DAILY_SUBJECT_CAP, 200);
    assert.equal(awardedXpForDay(10, 0), 10);
    assert.equal(awardedXpForDay(10, 190), 10);
    assert.equal(awardedXpForDay(10, 195), 5);
    assert.equal(awardedXpForDay(10, 200), 0);
    assert.equal(awardedXpForDay(10, 260), 0);
    assert.equal(awardedXpForDay(0, 0), 0);
});

test('week bounds follow the ISO week in the school timezone, not UTC', () => {
    const instant = new Date('2026-11-19T22:30:00Z'); // already Friday in Riyadh
    const riyadh = windowBoundsFor('week', instant, 'Asia/Riyadh');
    assert.equal(riyadh.periodKey, '2026-W47');
    assert.equal(riyadh.start.toISOString(), '2026-11-15T21:00:00.000Z'); // Monday 00:00 +03
    assert.equal(riyadh.end.toISOString(), '2026-11-22T21:00:00.000Z');
    const utc = windowBoundsFor('week', instant, 'UTC');
    assert.equal(utc.periodKey, '2026-W47');
    assert.equal(utc.start.toISOString(), '2026-11-16T00:00:00.000Z');
});

test('month bounds start at local midnight on the first', () => {
    const instant = new Date('2026-11-19T22:30:00Z');
    const riyadh = windowBoundsFor('month', instant, 'Asia/Riyadh');
    assert.equal(riyadh.periodKey, '2026-11');
    assert.equal(riyadh.start.toISOString(), '2026-10-31T21:00:00.000Z');
    assert.equal(riyadh.end.toISOString(), '2026-11-30T21:00:00.000Z');
    const all = windowBoundsFor('all', instant, 'UTC');
    assert.equal(all.start, null);
    assert.equal(all.end, null);
});

test('the previous window is the one podium badges settle against', () => {
    const instant = new Date('2026-11-19T22:30:00Z');
    const week = previousWindowBoundsFor('week', instant, 'Asia/Riyadh');
    assert.equal(week.periodKey, '2026-W46');
    assert.equal(week.start.toISOString(), '2026-11-08T21:00:00.000Z');
    assert.equal(week.end.toISOString(), '2026-11-15T21:00:00.000Z');
    const month = previousWindowBoundsFor('month', instant, 'Asia/Riyadh');
    assert.equal(month.periodKey, '2026-10');
    assert.equal(previousWindowBoundsFor('all', instant, 'UTC'), null);
});

test('names mask to first name plus last initial for students only', () => {
    const student = { firstName: 'Sara', lastName: 'Ahmed' };
    assert.equal(displayNameFor(student, true), 'Sara A.');
    assert.equal(displayNameFor(student, false), 'Sara Ahmed');
    assert.equal(displayNameFor({ firstName: 'Sara', lastName: '' }, true), 'Sara');
    assert.equal(displayNameFor({ firstName: 'سارة', lastName: 'أحمد' }, true), 'سارة أ.');
});

test('accuracy rounds and reports null with no attempts', () => {
    assert.equal(accuracyFor(2, 3), 67);
    assert.equal(accuracyFor(0, 0), null);
});

test('the match distinguishes combined, General and a named subject', () => {
    const bounds = { start: new Date('2026-11-16T00:00:00Z'), end: new Date('2026-11-23T00:00:00Z') };
    const combined = leaderboardMatch({ schoolId: SCHOOL, classId: null, subjectId: undefined, bounds });
    assert.equal('subject' in combined, false);
    assert.equal(combined.source, 'practice');
    assert.deepEqual(combined.createdAt, { $gte: bounds.start, $lt: bounds.end });
    const general = leaderboardMatch({ schoolId: SCHOOL, classId: null, subjectId: null, bounds: null });
    assert.equal(general.subject, null);
    assert.equal('createdAt' in general, false);
    const named = leaderboardMatch({ schoolId: SCHOOL, classId: CLASS, subjectId: SUBJECT, bounds: null });
    assert.equal(String(named.subject), SUBJECT);
    assert.equal(String(named.classes), CLASS);
});

/* ------------------------------------------------------------------ */
/* Controller harness                                                  */
/* ------------------------------------------------------------------ */

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        session: () => q,
        distinct: async () => value,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
};

const makeRes = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
});

const invoke = async (handler, req, res) => {
    handler(req, res, (err) => { res.error = err; });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    if (res.error) throw res.error;
};

const reqAs = (role, query = {}, params = {}, body = {}) => ({
    user: { _id: role === 'student' ? '111111111111111111111111' : TEACHER_USER, role, roles: [role], school: SCHOOL },
    schoolId: SCHOOL,
    body,
    params,
    query
});

const stubGate = (t, plan = 'professional', overrides = {}) => {
    invalidateSchoolFeatureContext(SCHOOL);
    t.mock.method(School, 'findById', () => chain({ subscription: { plan }, settings: { features: overrides } }));
    t.mock.method(Subscription, 'findOne', () => chain(null));
    t.mock.method(Subscription, 'getPlanConfig', async () => ({ features: {}, limits: {} }));
};

const stubViewerStudent = (t, classId = CLASS) => {
    t.mock.method(Student, 'findOne', () => chain({
        _id: STUDENT, firstName: 'Sara', lastName: 'Ahmed', currentClass: classId, enrolledClasses: []
    }));
};

const stubTeacher = (t, classIds = [CLASS]) => {
    t.mock.method(Teacher, 'findOne', () => chain({ _id: TEACHER_PROFILE, user: TEACHER_USER }));
    t.mock.method(Teacher, 'findById', () => chain({ user: TEACHER_USER, assignedClasses: [] }));
    t.mock.method(Class, 'find', () => chain(classIds));
    t.mock.method(TeacherPeriodAssignment, 'find', () => chain([]));
};

const BOARD_ROWS = [
    { _id: OTHER_STUDENT, xp: 120, attempts: 12, correct: 10 },
    { _id: STUDENT, xp: 30, attempts: 3, correct: 2 }
];

const NAMES = [
    { _id: OTHER_STUDENT, firstName: 'Omar', lastName: 'Khalid' },
    { _id: STUDENT, firstName: 'Sara', lastName: 'Ahmed' }
];

// First aggregate call reads the current board; later calls read the previous
// period for podium settlement.
const stubBoard = (t, { board = BOARD_ROWS, previous = [], setting = null, roster = NAMES } = {}) => {
    const calls = [];
    t.mock.method(GameRewardEvent, 'aggregate', async (pipeline) => {
        calls.push(pipeline);
        return calls.length === 1 ? board : previous;
    });
    t.mock.method(Student, 'find', (query) => chain(query.$or ? roster : NAMES));
    t.mock.method(GameProfile, 'find', () => chain([{ student: STUDENT, streakWeeks: 2 }]));
    t.mock.method(GameClassSetting, 'findOne', () => chain(setting));
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS, classTeacher: TEACHER_PROFILE }));
    t.mock.method(SchoolCalendarConfig, 'findOne', () => chain({ timezone: 'UTC' }));
    return calls;
};

const currentPeriodKey = () => weekKeyForDateKey(dateKeyFor(new Date(), 'UTC'));
const previousPeriodKey = () => previousWeekKey(currentPeriodKey());

/* ------------------------------------------------------------------ */
/* Gate and toggle                                                     */
/* ------------------------------------------------------------------ */

test('a plan without the feature gets an explicit locked state, not an empty board', async (t) => {
    stubGate(t, 'starter');
    stubViewerStudent(t);
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.available, false);
    assert.equal(res.body.data.reason, 'feature_locked');
    assert.deepEqual(res.body.data.rows, []);
});

test('a school override enables the feature on a starter plan', async (t) => {
    stubGate(t, 'starter', { skillpathLeaderboard: true });
    stubViewerStudent(t);
    stubBoard(t);
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.available, true);
});

test('a disabled class board says so; the school board is unaffected', async (t) => {
    stubGate(t);
    stubViewerStudent(t);
    stubBoard(t, { setting: { leaderboardEnabled: false } });
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.available, false);
    assert.equal(res.body.data.reason, 'class_disabled');

    const res2 = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'school' }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(res2.body.data.available, true);
});

/* ------------------------------------------------------------------ */
/* Scoping and masking                                                 */
/* ------------------------------------------------------------------ */

test('a student cannot read a class they are not in', async (t) => {
    stubGate(t);
    stubViewerStudent(t, OTHER_CLASS);
    stubBoard(t);
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 403);
});

test('students see masked names and their own row pinned outside the limit', async (t) => {
    stubGate(t);
    stubViewerStudent(t);
    stubBoard(t);
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS, window: 'week', limit: '1' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const data = res.body.data;
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].displayName, 'Omar K.');
    assert.equal(data.rows[0].attempts, undefined, 'attempt counts stay staff-only');
    assert.equal(data.myRow.displayName, 'Sara A.');
    assert.equal(data.myRow.rank, 2);
    assert.equal(data.myRow.inTop, false);
    assert.equal(data.myRow.streakWeeks, 2);
    assert.equal(data.myRow.accuracy, 67);
    assert.equal(data.periodKey, currentPeriodKey());
    assert.equal(JSON.stringify(data).includes('Khalid'), false);
});

test('a class board lists classmates who have not practiced yet', async (t) => {
    const IDLE = 'eeeeeeeeeeeeeeeeeeeeee02';
    stubGate(t);
    stubViewerStudent(t);
    stubBoard(t, { roster: [...NAMES, { _id: IDLE, firstName: 'Lina', lastName: 'Hassan' }] });
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const data = res.body.data;
    assert.equal(data.rows.length, 3);
    assert.equal(data.totalRanked, 3);
    const idle = data.rows.find((row) => row.studentId === IDLE);
    assert.equal(idle.displayName, 'Lina H.');
    assert.equal(idle.xp, 0);
    assert.equal(idle.accuracy, null);
    assert.equal(idle.rank, 3);
    assert.equal(data.myRow.rank, 2);
});

test('teachers see full names with attempts, but only for their classes', async (t) => {
    stubGate(t);
    stubTeacher(t, [CLASS]);
    stubBoard(t);
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('teacher', { scope: 'class', classId: CLASS }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.rows[0].displayName, 'Omar Khalid');
    assert.equal(res.body.data.rows[0].attempts, 12);
    assert.equal(res.body.data.myRow, null);

    const res2 = makeRes();
    await invoke(getLeaderboard, reqAs('teacher', { scope: 'class', classId: OTHER_CLASS }), res2);
    assert.equal(res2.statusCode, 403);
});

test('admins can read any class board', async (t) => {
    stubGate(t);
    stubBoard(t);
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('admin', { scope: 'class', classId: OTHER_CLASS }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.available, true);
});

test('subject chips map to a named subject, the General bucket, or everything', async (t) => {
    stubGate(t);
    stubViewerStudent(t);
    const calls = stubBoard(t);
    t.mock.method(Subject, 'findOne', () => chain({ _id: SUBJECT, code: 'MATH' }));
    t.mock.method(GameRewardEvent, 'create', async (payload) => payload);
    t.mock.method(GameProfile, 'updateOne', async () => ({ modifiedCount: 1 }));

    await invoke(getLeaderboard, reqAs('student', { scope: 'school', subjectId: SUBJECT }), makeRes());
    assert.equal(String(calls[0][0].$match.subject), SUBJECT);

    const res2 = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'school', subjectId: 'general' }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));

    const res3 = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'school', subjectId: 'not-an-id' }), res3);
    assert.equal(res3.statusCode, 400);
});

/* ------------------------------------------------------------------ */
/* Podium settlement                                                   */
/* ------------------------------------------------------------------ */

test('reading a weekly board settles last week’s podium exactly once', async (t) => {
    stubGate(t);
    stubViewerStudent(t);
    stubBoard(t, { previous: [{ _id: STUDENT, xp: 50, attempts: 5, correct: 5 }] });
    const created = [];
    let createCalls = 0;
    t.mock.method(GameRewardEvent, 'create', async (payload) => {
        createCalls += 1;
        if (createCalls > 1) throw Object.assign(new Error('duplicate'), { code: 11000 });
        created.push(payload);
        return payload;
    });
    const badgeWrites = [];
    t.mock.method(GameProfile, 'updateOne', async (query, update) => {
        badgeWrites.push({ query, update });
        return { modifiedCount: 1 };
    });

    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS, window: 'week' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(created.length, 1);
    assert.equal(created[0].source, 'leaderboard');
    assert.equal(created[0].amount, 0);
    assert.equal(created[0].uniqueKey, `podium:week:${previousPeriodKey()}:class:all:${STUDENT}`);
    assert.equal(badgeWrites.length, 1);
    assert.deepEqual(badgeWrites[0].update, { $addToSet: { badges: `podium_week_${previousPeriodKey()}_class_all` } });

    // A second read settles the same period again; the unique key blocks it.
    const res2 = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'class', classId: CLASS, window: 'week' }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(createCalls, 2);
    assert.equal(badgeWrites.length, 1, 'the badge is granted once, never twice');
});

test('an all-time board never settles a podium', async (t) => {
    stubGate(t);
    stubViewerStudent(t);
    const calls = stubBoard(t, { previous: [{ _id: STUDENT, xp: 50, attempts: 5, correct: 5 }] });
    t.mock.method(GameRewardEvent, 'create', async () => { throw new Error('must not settle'); });
    const res = makeRes();
    await invoke(getLeaderboard, reqAs('student', { scope: 'school', window: 'all' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(calls.length, 1, 'no settlement aggregation for all-time');
});

/* ------------------------------------------------------------------ */
/* Class toggle                                                        */
/* ------------------------------------------------------------------ */

test('only the class teacher or an admin can flip the class board', async (t) => {
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS, classTeacher: TEACHER_PROFILE }));
    t.mock.method(Teacher, 'findOne', () => chain({ _id: TEACHER_PROFILE, user: TEACHER_USER }));
    let upsert = null;
    t.mock.method(GameClassSetting, 'findOneAndUpdate', (query, update) => {
        upsert = { query, update };
        return chain({ leaderboardEnabled: false });
    });

    const res = makeRes();
    await invoke(setClassLeaderboard, reqAs('teacher', {}, { classId: CLASS }, { enabled: false }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.setting.leaderboardEnabled, false);
    assert.equal(upsert.update.$set.leaderboardEnabled, false);
    assert.equal(String(upsert.query.school), SCHOOL);

    const res2 = makeRes();
    await invoke(setClassLeaderboard, reqAs('admin', {}, { classId: CLASS }, { enabled: true }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
});

test('a subject teacher who is not the class teacher cannot flip it', async (t) => {
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS, classTeacher: 'ffffffffffffffffffffff99' }));
    t.mock.method(Teacher, 'findOne', () => chain({ _id: TEACHER_PROFILE, user: TEACHER_USER }));
    const res = makeRes();
    await invoke(setClassLeaderboard, reqAs('teacher', {}, { classId: CLASS }, { enabled: false }), res);
    assert.equal(res.statusCode, 403);
});

test('a foreign class is not found even for an admin', async (t) => {
    t.mock.method(Class, 'findOne', () => chain(null));
    const res = makeRes();
    await invoke(setClassLeaderboard, reqAs('admin', {}, { classId: OTHER_CLASS }, { enabled: false }), res);
    assert.equal(res.statusCode, 404);
});