import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import Student from '../models/Student.js';
import Class from '../models/Class.js';
import GamePack from '../models/GamePack.js';
import GameAssignment from '../models/GameAssignment.js';
import GameSession from '../models/GameSession.js';
import GameAttempt from '../models/GameAttempt.js';
import GameSkill from '../models/GameSkill.js';
import GameSkillProgress from '../models/GameSkillProgress.js';
import GameProfile from '../models/GameProfile.js';
import GameRewardEvent from '../models/GameRewardEvent.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import {
    answerSession,
    completeSession,
    getHome,
    getSession,
    myClasses,
    startSession
} from '../controllers/languageGameStudentController.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const STUDENT = 'eeeeeeeeeeeeeeeeeeeeeeee';
const PACK = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SKILL = 'cccccccccccccccccccccccc';

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
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
};

const studentReq = (body = {}, params = {}) => ({
    user: { _id: 'ffffffffffffffffffffffff', role: 'student', school: SCHOOL },
    schoolId: SCHOOL,
    body,
    params,
    query: {}
});

const item = (overrides = {}) => ({
    externalId: 'Q1',
    type: 'mcq',
    prompt: 'Which word means "not happy"?',
    options: [{ id: '1', text: 'unhappy' }, { id: '2', text: 'happy' }],
    correctOptionId: '1',
    acceptedAnswers: [],
    explanation: 'un- means not.',
    skillId: SKILL,
    difficulty: 1,
    ...overrides
});

const sessionDoc = (overrides = {}) => ({
    _id: '999999999999999999999999',
    student: STUDENT,
    assignment: null,
    pack: PACK,
    mode: 'practice',
    showAnswersAfter: true,
    items: [item()],
    answeredCount: 0,
    correctCount: 0,
    status: 'in_progress',
    save: async function save() { return this; },
    ...overrides
});

const stubStudent = () => {
    Student.findOne = () => chain({ _id: STUDENT, firstName: 'A', lastName: 'B' });
};

test('startSession strips answer keys and resumes an open session instead of starting another', async () => {
    stubStudent();
    GamePack.findById = () => chain({ title: 'Prefixes', language: 'en' });
    GamePack.findOne = async () => ({
        _id: PACK,
        status: 'published',
        visibility: 'school',
        publishedRevision: { version: 2, items: [item(), item({ externalId: 'Q2' })] }
    });
    const open = sessionDoc();
    GameSession.findOne = async () => open;
    GameAttempt.find = () => chain([]);
    GameSession.create = async () => { throw new Error('must not create a second session'); };

    const res = makeRes();
    await invoke(startSession, studentReq({ packId: PACK }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.resumed, true);
    const leaked = JSON.stringify(res.body.data.session.items);
    assert.equal(leaked.includes('correctOptionId'), false);
    assert.equal(leaked.includes('acceptedAnswers'), false);
});

test('startSession refuses a pack that is not published and visible', async () => {
    stubStudent();
    GamePack.findOne = async () => null;
    const res = makeRes();
    await invoke(startSession, studentReq({ packId: PACK }), res);
    assert.equal(res.statusCode, 404);
});

test('answerSession grades, counts the answer, and reveals only after an accepted answer', async () => {
    stubStudent();
    const session = sessionDoc();
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => null;
    GameAttempt.create = async (payload) => ({ ...payload, answeredAt: new Date() });
    GameSkillProgress.exists = async () => false;
    GameSkillProgress.findOneAndUpdate = async () => ({});
    stubAward();

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '1', submissionId: 'sub-1' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.attempt.correct, true);
    assert.equal(res.body.data.expected, '1');
    assert.equal(res.body.data.progress.answered, 1);
    assert.equal(session.answeredCount, 1);
    assert.equal(session.correctCount, 1);
});

test('a transport retry with the same submission id returns the same result, not a second attempt', async () => {
    stubStudent();
    const session = sessionDoc({ answeredCount: 1, correctCount: 1 });
    const stored = {
        session: session._id,
        itemId: 'Q1',
        submissionId: 'sub-1',
        correct: true
    };
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => stored;
    GameAttempt.create = async () => { throw new Error('must not create a duplicate attempt'); };
    stubAward();

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '1', submissionId: 'sub-1' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.duplicate, true);
    assert.equal(res.body.data.attempt.correct, true);
});

test('a different submission for an answered item is refused', async () => {
    stubStudent();
    const session = sessionDoc({ answeredCount: 1 });
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => ({ itemId: 'Q1', submissionId: 'sub-1', correct: true });
    stubAward();

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '2', submissionId: 'sub-2' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 409);
});

test('a quiz that hides answers returns correctness without the expected answer', async () => {
    stubStudent();
    const session = sessionDoc({ showAnswersAfter: false });
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => null;
    GameAttempt.create = async (payload) => ({ ...payload });
    GameSkillProgress.exists = async () => false;
    GameSkillProgress.findOneAndUpdate = async () => ({});
    stubAward();

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '2', submissionId: 'sub-3' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.attempt.correct, false);
    assert.equal(res.body.data.expected, undefined);
    assert.equal(res.body.data.explanation, undefined);
});

/* ------------------------------------------------------------------ */
/* Rewards (paid per answered item)                                    */
/* ------------------------------------------------------------------ */

const freshProfile = () => ({
    xp: 0,
    badges: [],
    practiceDays: [],
    weeklyGoalDays: 3,
    streakWeeks: 0,
    longestStreakWeeks: 0,
    save: async function save() { return this; }
});

const stubAward = ({
    profile = freshProfile(),
    replay = false,
    usedToday = 0,
    subject = null,
    assignmentClasses = [],
    create
} = {}) => {
    stubStudent();
    SchoolCalendarConfig.findOne = () => chain({ timezone: 'UTC' });
    GameAttempt.countDocuments = async () => 1;
    GameProfile.findOne = async () => profile;
    GamePack.findOne = () => chain({ _id: PACK, subject });
    GameSession.exists = async () => replay;
    GameRewardEvent.aggregate = async () => (usedToday > 0 ? [{ _id: null, total: usedToday }] : []);
    GameRewardEvent.create = create || (async (payload) => payload);
    GameAssignment.findOne = () => chain({
        classIds: assignmentClasses,
        status: 'open',
        settings: { attemptsAllowed: 3 }
    });
    GameSession.countDocuments = async () => 0;
    return profile;
};

const answerReq = (session, overrides = {}) => studentReq(
    { itemId: 'Q1', response: '1', submissionId: 'sub-1', ...overrides },
    { id: String(session._id) }
);

const stubAnswerSession = (session) => {
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => null;
    GameAttempt.create = async (payload) => ({ ...payload, answeredAt: new Date() });
    GameSkillProgress.exists = async () => false;
    GameSkillProgress.findOneAndUpdate = async () => ({});
};

test('answering a question pays XP immediately and starts the weekly practice state', async () => {
    const session = sessionDoc();
    stubAnswerSession(session);
    const created = [];
    const profile = stubAward({ create: async (payload) => { created.push(payload); return payload; } });

    const res = makeRes();
    await invoke(answerSession, answerReq(session), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.xpEarned, 10);
    assert.equal(created[0].uniqueKey, `practice:${session._id}:Q1`);
    assert.equal(created[0].amount, 10);
    assert.equal(created[0].attempts, 1);
    assert.equal(created[0].correct, 1);
    assert.equal(profile.xp, 10);
    assert.equal(profile.practiceDays.length, 1);
    assert.equal(profile.badges.includes('first_practice'), true);
    assert.equal(session.answeredCount, 1);
});

test('a replayed pack earns the later-attempt rate on every correct answer', async () => {
    const session = sessionDoc({ items: [item(), item({ externalId: 'Q2' })] });
    stubAnswerSession(session);
    const created = [];
    const profile = stubAward({
        replay: true,
        create: async (payload) => { created.push(payload); return payload; }
    });

    const first = makeRes();
    await invoke(answerSession, answerReq(session), first);
    const second = makeRes();
    await invoke(answerSession, answerReq(session, { itemId: 'Q2', submissionId: 'sub-2' }), second);

    assert.equal(first.body.data.xpEarned, 5);
    assert.equal(second.body.data.xpEarned, 5);
    assert.deepEqual(created.map((event) => event.amount), [5, 5]);
    assert.equal(profile.xp, 10);
});

test('the daily subject cap trims the award at the boundary and to zero beyond it', async () => {
    const session = sessionDoc({ items: [item(), item({ externalId: 'Q2' })] });
    stubAnswerSession(session);
    const created = [];
    const profile = stubAward({
        usedToday: 195,
        create: async (payload) => { created.push(payload); return payload; }
    });

    const res = makeRes();
    await invoke(answerSession, answerReq(session), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.xpEarned, 5);
    assert.equal(created[0].amount, 5);
    assert.equal(profile.xp, 5);

    // The cap is now full: the next answer still records, but pays nothing.
    const profile2 = freshProfile();
    stubAward({
        profile: profile2,
        usedToday: 200,
        create: async (payload) => { created.push(payload); return payload; }
    });
    const res2 = makeRes();
    await invoke(answerSession, answerReq(session, { itemId: 'Q2', submissionId: 'sub-2' }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(res2.body.data.xpEarned, 0);
    assert.equal(created[1].amount, 0);
    assert.equal(profile2.xp, 0);
    assert.equal(profile2.practiceDays.length, 1, 'a capped answer still counts as practice');
});

test('the reward event carries subject, classes and the school day', async () => {
    const SUBJECT = '222222222222222222222222';
    const CLASS = '333333333333333333333333';
    const session = sessionDoc({ assignment: '777777777777777777777777' });
    stubAnswerSession(session);
    const created = [];
    stubAward({
        subject: SUBJECT,
        assignmentClasses: [CLASS],
        create: async (payload) => { created.push(payload); return payload; }
    });

    const res = makeRes();
    await invoke(answerSession, answerReq(session), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(created[0].subject, SUBJECT);
    assert.deepEqual(created[0].classes, [CLASS]);
    assert.match(created[0].dayKey, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(created[0].attempts, 1);
});

test('a duplicate submission pays nothing extra', async () => {
    const session = sessionDoc({ answeredCount: 1, correctCount: 1 });
    GameSession.findOne = async () => session;
    GameAttempt.findOne = async () => ({ itemId: 'Q1', submissionId: 'sub-1', correct: true });
    const profile = stubAward({
        create: async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); }
    });

    const res = makeRes();
    await invoke(answerSession, answerReq(session), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.duplicate, true);
    assert.equal(res.body.data.xpEarned, 0);
    assert.equal(profile.xp, 0);
});

test('completing a session reports the session XP without paying again', async () => {
    const session = sessionDoc({ answeredCount: 1, correctCount: 1, status: 'completed' });
    GameSession.findOne = async () => session;
    GameAttempt.find = () => chain([{ itemId: 'Q1', correct: true }]);
    const profile = stubAward({
        create: async () => { throw new Error('must not award at completion'); }
    });
    GameRewardEvent.find = () => chain([{ uniqueKey: `practice:${session._id}:Q1` }]);
    GameRewardEvent.aggregate = async (pipeline) => (
        pipeline[0].$match.uniqueKey ? [{ _id: null, xp: 10 }] : []
    );

    const res = makeRes();
    await invoke(completeSession, studentReq({}, { id: String(session._id) }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.summary.xpEarned, 10);
    assert.equal(profile.xp, 0);
});

test('completing a legacy session settles answers that were never paid', async () => {
    const session = sessionDoc({ answeredCount: 2, correctCount: 1, status: 'completed', items: [item(), item({ externalId: 'Q2' })] });
    GameSession.findOne = async () => session;
    GameAttempt.find = () => chain([
        { itemId: 'Q1', correct: true },
        { itemId: 'Q2', correct: false }
    ]);
    const created = [];
    const profile = stubAward({
        create: async (payload) => { created.push(payload); return payload; }
    });
    GameRewardEvent.find = () => chain([]);
    GameRewardEvent.aggregate = async (pipeline) => (
        pipeline[0].$match.uniqueKey ? [{ _id: null, xp: 12 }] : []
    );

    const res = makeRes();
    await invoke(completeSession, studentReq({}, { id: String(session._id) }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(created.map((event) => event.uniqueKey), [
        `practice:${session._id}:Q1`,
        `practice:${session._id}:Q2`
    ]);
    assert.deepEqual(created.map((event) => event.amount), [10, 2]);
    assert.equal(profile.xp, 12);
    assert.equal(res.body.data.summary.xpEarned, 12);
});

test('a session that straddles the deploy settles only its unpaid answers', async () => {
    const session = sessionDoc({ answeredCount: 2, correctCount: 2, status: 'completed', items: [item(), item({ externalId: 'Q2' })] });
    GameSession.findOne = async () => session;
    GameAttempt.find = () => chain([
        { itemId: 'Q1', correct: true },
        { itemId: 'Q2', correct: true }
    ]);
    const created = [];
    const profile = stubAward({
        create: async (payload) => { created.push(payload); return payload; }
    });
    GameRewardEvent.find = () => chain([{ uniqueKey: `practice:${session._id}:Q1` }]);
    GameRewardEvent.aggregate = async (pipeline) => (
        pipeline[0].$match.uniqueKey ? [{ _id: null, xp: 20 }] : []
    );

    const res = makeRes();
    await invoke(completeSession, studentReq({}, { id: String(session._id) }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(created.map((event) => event.uniqueKey), [`practice:${session._id}:Q2`]);
    assert.equal(profile.xp, 10, 'only the unpaid answer is paid now');
    assert.equal(res.body.data.summary.xpEarned, 20, 'the summary still reports the whole session');
});

test('a session cannot finish with unanswered items', async () => {
    stubStudent();
    const session = sessionDoc({ items: [item(), item({ externalId: 'Q2' })], answeredCount: 1 });
    GameSession.findOne = async () => session;
    GameRewardEvent.create = async () => { throw new Error('must not award yet'); };

    const res = makeRes();
    await invoke(completeSession, studentReq({}, { id: String(session._id) }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.data.answered, 1);
    assert.equal(res.body.data.total, 2);
});

/* ------------------------------------------------------------------ */
/* Ownership                                                           */
/* ------------------------------------------------------------------ */

test('a session that belongs to another student is not found', async () => {
    stubStudent();
    GameSession.findOne = async () => null;
    const res = makeRes();
    await invoke(completeSession, studentReq({}, { id: '999999999999999999999999' }), res);
    assert.equal(res.statusCode, 404);
});

test('an assignment that does not list this student is not found', async () => {
    stubStudent();
    GameAssignment.findOne = async () => null;
    const res = makeRes();
    await invoke(startSession, studentReq({ assignmentId: '999999999999999999999999' }), res);
    assert.equal(res.statusCode, 404);
});

/* ------------------------------------------------------------------ */
/* My classes (leaderboard class scope)                                */
/* ------------------------------------------------------------------ */

test('myClasses dedupes the student class ids and returns names only', async (t) => {
    const CLASS_A = '111111111111111111111111';
    const CLASS_B = '222222222222222222222222';
    t.mock.method(Student, 'findOne', () => chain({
        _id: STUDENT,
        currentClass: CLASS_A,
        enrolledClasses: [CLASS_B, CLASS_A]
    }));
    t.mock.method(Class, 'find', (query) => {
        assert.deepEqual(query._id.$in, [CLASS_A, CLASS_B]);
        assert.equal(query.school, SCHOOL);
        return chain([
            { _id: CLASS_A, name: 'Grade 5', section: 'R' },
            { _id: CLASS_B, name: 'Grade 5', section: 'Y' }
        ]);
    });
    const res = makeRes();
    await invoke(myClasses, studentReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.classes, [
        { _id: CLASS_A, name: 'Grade 5', section: 'R' },
        { _id: CLASS_B, name: 'Grade 5', section: 'Y' }
    ]);
});

test('myClasses returns an empty list without querying when the student has no classes', async (t) => {
    t.mock.method(Student, 'findOne', () => chain({ _id: STUDENT, currentClass: null, enrolledClasses: [] }));
    t.mock.method(Class, 'find', () => { throw new Error('must not query classes'); });
    const res = makeRes();
    await invoke(myClasses, studentReq(), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.classes, []);
});

/* ------------------------------------------------------------------ */
/* Legacy item types (packs published before the canonical names)      */
/* ------------------------------------------------------------------ */

test('startSession normalizes legacy mcq items from a published revision before saving the session', async () => {
    stubStudent();
    GamePack.findOne = async () => ({
        _id: PACK,
        status: 'published',
        visibility: 'school',
        publishedRevision: {
            version: 3,
            items: [
                item(),
                item({
                    externalId: 'Q2',
                    type: 'fill_blank',
                    prompt: 'Add the prefix un- to "kind": ___',
                    options: [],
                    acceptedAnswers: ['unkind']
                })
            ]
        }
    });
    GamePack.findById = () => chain({ title: 'Prefixes and Suffixes', language: 'en' });
    GameSession.findOne = async () => null;
    let created = null;
    GameSession.create = async (payload) => {
        created = payload;
        return { _id: '999999999999999999999999', ...payload, answeredCount: 0, correctCount: 0, status: 'in_progress' };
    };

    const res = makeRes();
    await invoke(startSession, studentReq({ packId: PACK }), res);

    assert.equal(res.statusCode, 201);
    const itemsById = Object.fromEntries(created.items.map((entry) => [entry.externalId, entry]));
    assert.deepEqual(created.items.map((entry) => entry.type).sort(), ['fill_in_blank', 'multiple_choice']);
    assert.equal(itemsById.Q1.correctOptionId, '1');
    assert.deepEqual(itemsById.Q2.acceptedAnswers, ['unkind']);
});

test('startSession normalizes legacy items copied onto an assignment', async () => {
    stubStudent();
    GameAssignment.findOne = async () => ({
        _id: '777777777777777777777777',
        pack: PACK,
        status: 'open',
        mode: 'practice',
        packRevisionVersion: 1,
        items: [item()],
        settings: { attemptsAllowed: 1, itemCount: 1, shuffle: false, showAnswersAfter: true }
    });
    GameSession.countDocuments = async () => 0;
    GamePack.findById = () => chain({ title: 'Prefixes and Suffixes', language: 'en' });
    GameSession.findOne = async () => null;
    let created = null;
    GameSession.create = async (payload) => {
        created = payload;
        return { _id: '999999999999999999999999', ...payload, answeredCount: 0, correctCount: 0, status: 'in_progress' };
    };

    const res = makeRes();
    await invoke(startSession, studentReq({ assignmentId: '777777777777777777777777' }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(created.items[0].type, 'multiple_choice');
});

test('canonicalizeGameItems keeps every other field and accepts mongoose subdocuments', async () => {
    const { canonicalizeGameItems } = await import('../services/languageGameItems.js');
    const plain = canonicalizeGameItems([item(), item({ externalId: 'Q2', type: 'fill_blank' })]);
    assert.deepEqual(plain.map((entry) => entry.type), ['multiple_choice', 'fill_in_blank']);
    assert.equal(plain[0].externalId, 'Q1');
    assert.equal(plain[0].correctOptionId, '1');
});

/* ------------------------------------------------------------------ */
/* Assignment rules bind the whole session                             */
/* ------------------------------------------------------------------ */

const ASSIGN = '777777777777777777777777';

const stubHome = ({ openAssignments = [], assignmentLookups = [], inProgress = [], aggregate = () => [] } = {}) => {
    stubStudent();
    GameAssignment.find = (query = {}) => chain(query._id?.$in ? assignmentLookups : openAssignments);
    GamePack.find = () => chain([]);
    GamePack.findById = () => chain(null);
    GameSession.aggregate = async (...args) => aggregate(...args);
    GameSession.find = () => chain(inProgress);
    GameProfile.findOne = () => chain(null);
    SchoolCalendarConfig.findOne = () => chain({ timezone: 'UTC' });
    GameSkillProgress.find = () => chain([]);
    GameSkill.find = () => chain([]);
};

test('the student home reports completed attempts separately from started sessions', async () => {
    const assignment = {
        _id: ASSIGN,
        pack: PACK,
        mode: 'practice',
        items: [item()],
        settings: { attemptsAllowed: 5, dueDate: null }
    };
    stubHome({
        openAssignments: [assignment],
        aggregate: () => [{ _id: ASSIGN, sessions: 4, completed: 2 }]
    });

    const res = makeRes();
    await invoke(getHome, studentReq(), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const [card] = res.body.data.assignments;
    assert.equal(card.sessions, 4);
    assert.equal(card.completed, 2);
    assert.equal(card.attemptsLeft, 3);
});

test('a session for a closed assignment is not offered in Pick up where you left off', async () => {
    stubHome({
        assignmentLookups: [{ _id: ASSIGN, status: 'closed', settings: { attemptsAllowed: 1 } }],
        inProgress: [sessionDoc({ assignment: ASSIGN })]
    });

    const res = makeRes();
    await invoke(getHome, studentReq(), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.inProgress, []);
});

test('a session past its assignment due date is not offered either', async () => {
    stubHome({
        assignmentLookups: [{
            _id: ASSIGN,
            status: 'open',
            settings: { attemptsAllowed: 1, dueDate: new Date('2020-01-01T00:00:00Z') }
        }],
        inProgress: [sessionDoc({ assignment: ASSIGN })]
    });

    const res = makeRes();
    await invoke(getHome, studentReq(), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.inProgress, []);
});

test('answering a session of a closed assignment is refused', async () => {
    stubStudent();
    const session = sessionDoc({ assignment: ASSIGN });
    GameSession.findOne = async () => session;
    GameAssignment.findOne = () => chain({ _id: ASSIGN, status: 'closed', settings: {} });
    GameAttempt.create = async () => { throw new Error('must not record an attempt'); };

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '1', submissionId: 'sub-1' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /closed/);
});

test('answering a session past its assignment due date is refused', async () => {
    stubStudent();
    const session = sessionDoc({ assignment: ASSIGN });
    GameSession.findOne = async () => session;
    GameAssignment.findOne = () => chain({
        _id: ASSIGN,
        status: 'open',
        settings: { attemptsAllowed: 3, dueDate: new Date('2020-01-01T00:00:00Z') }
    });
    GameAttempt.create = async () => { throw new Error('must not record an attempt'); };

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '1', submissionId: 'sub-1' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /due date/);
});

test('answering a session after the attempt allotment is used up is refused', async () => {
    stubStudent();
    const session = sessionDoc({ assignment: ASSIGN });
    GameSession.findOne = async () => session;
    GameAssignment.findOne = () => chain({ _id: ASSIGN, status: 'open', settings: { attemptsAllowed: 1 } });
    GameSession.countDocuments = async () => 1;
    GameAttempt.create = async () => { throw new Error('must not record an attempt'); };

    const res = makeRes();
    await invoke(answerSession, studentReq(
        { itemId: 'Q1', response: '1', submissionId: 'sub-1' },
        { id: String(session._id) }
    ), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /attempts/);
});

test('opening a session of a closed assignment is refused, but a finished one can be reviewed', async () => {
    stubStudent();
    const open = sessionDoc({ assignment: ASSIGN });
    GameSession.findOne = async () => open;
    GameAssignment.findOne = () => chain({ _id: ASSIGN, status: 'closed', settings: {} });

    const blocked = makeRes();
    await invoke(getSession, studentReq({}, { id: String(open._id) }), blocked);
    assert.equal(blocked.statusCode, 409);

    const finished = sessionDoc({ assignment: ASSIGN, status: 'completed' });
    GameSession.findOne = async () => finished;
    GameAttempt.find = () => chain([]);
    GamePack.findById = () => chain({ title: 'Prefixes', language: 'en' });
    const review = makeRes();
    await invoke(getSession, studentReq({}, { id: String(finished._id) }), review);
    assert.equal(review.statusCode, 200, JSON.stringify(review.body));
});
