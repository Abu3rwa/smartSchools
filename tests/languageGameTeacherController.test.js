import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import mongoose from 'mongoose';

import GameSkill from '../models/GameSkill.js';
import GamePack from '../models/GamePack.js';
import GameAssignment from '../models/GameAssignment.js';
import GameSession from '../models/GameSession.js';
import GameSkillProgress from '../models/GameSkillProgress.js';
import GameImportReceipt from '../models/GameImportReceipt.js';
import Student from '../models/Student.js';
import Standard from '../models/Standard.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';
import GameTeacherReward from '../models/GameTeacherReward.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import {
    previewImport,
    publishPack,
    commitImport,
    createSkill,
    createPack,
    updateSkill,
    updatePack,
    deleteSkill,
    deletePack,
    getPack,
    listSkills,
    listPacks,
    createAssignment,
    closeAssignment,
    importTemplate,
    importPrompt,
    listQuestionPools,
    previewPoolImport,
    giveReward,
    listClassRewards,
    myRewards
} from '../controllers/languageGameTeacherController.js';
import { buildPackTemplateCsv, PACK_CSV_TEMPLATES } from '../services/languageGamePackCsv.js';
import { createPlanToken } from '../services/languageGameImportToken.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TEACHER_USER = 'ffffffffffffffffffffffff';
const OTHER_USER = 'dddddddddddddddddddddddd';
const SKILL = 'cccccccccccccccccccccccc';
const PACK = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CLASS = 'eeeeeeeeeeeeeeeeeeeeeeee';
const STUDENT = '111111111111111111111111';

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
    headers: {},
    sent: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(payload) { this.sent = payload; return this; }
});

const invoke = async (handler, req, res) => {
    handler(req, res, (err) => { res.error = err; });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    if (res.error) throw res.error;
};

const teacherReq = (body = {}, params = {}, user = {}, query = {}) => ({
    user: { _id: TEACHER_USER, role: 'teacher', roles: ['teacher'], school: SCHOOL, ...user },
    schoolId: SCHOOL,
    body,
    params,
    query
});

const mockSession = (t) => {
    const session = {
        withTransaction: async (fn) => fn(session),
        endSession: async () => {}
    };
    t.mock.method(mongoose, 'startSession', async () => session);
    return session;
};

const packItem = (overrides = {}) => ({
    externalId: 'Q1',
    type: 'mcq',
    prompt: 'Which word means "not happy"?',
    options: [{ id: '1', text: 'unhappy' }, { id: '2', text: 'happy' }],
    correctOptionId: '1',
    acceptedAnswers: [],
    explanation: '',
    skillId: SKILL,
    difficulty: 2,
    ...overrides
});

const packDoc = (overrides = {}) => ({
    _id: PACK,
    key: 'prefixes',
    title: 'Prefixes',
    description: '',
    owner: TEACHER_USER,
    status: 'draft',
    visibility: 'private',
    language: 'en',
    gradeLevels: ['5'],
    items: [packItem()],
    skillIds: [SKILL],
    defaultSkillId: null,
    authoringRevision: 0,
    publishedRevision: null,
    updatedAt: new Date('2026-11-19T10:00:00Z'),
    save() { return Promise.resolve(this); },
    ...overrides
});

const skillDoc = (overrides = {}) => ({
    _id: SKILL,
    owner: TEACHER_USER,
    key: 'prefix-un',
    name: 'Prefix un-',
    gradeLevel: '5',
    language: 'en',
    revision: 0,
    status: 'draft',
    save() { return Promise.resolve(this); },
    ...overrides
});

const skillLean = () => ({ _id: SKILL, key: 'prefix-un', name: 'Prefix un-', gradeLevel: '5', language: 'en', status: 'draft' });

const bulkRow = (overrides = {}) => {
    const row = {
        pack_key: 'p', pack_title: 'P', external_id: 'Q1', language: 'en', grade_levels: '5',
        skill_key: 'missing-skill', skill_name: '', standard_codes: '', prompt: 'Pick',
        option_1: 'a', option_2: 'b', option_3: '', option_4: '', option_5: '', option_6: '',
        correct_option: '1', answer: '', accepted_answers: '', explanation: '', difficulty: '2', ...overrides
    };
    return PACK_CSV_TEMPLATES.multiple_choice.headers.map((header) => row[header]).join(',');
};

const bulkCsv = (rows) => `${PACK_CSV_TEMPLATES.multiple_choice.headers.join(',')}\n${rows.join('\n')}`;

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

test('publishing snapshots the items into an immutable revision', async (t) => {
    mockSession(t);
    const pack = packDoc();
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', nameAr: 'السابقة un-', key: 'prefix-un' }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length, modifiedCount: 1 }));

    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(pack.status, 'published');
    assert.equal(pack.publishedRevision.version, 1);
    assert.equal(pack.publishedRevision.items.length, 1);
    assert.equal(pack.publishedRevision.items[0].correctOptionId, '1');
    assert.equal(pack.publishedRevision.skills[0].key, 'prefix-un');
    assert.equal(String(pack.skillIds[0]), SKILL);
    assert.deepEqual(pack.$where, { school: SCHOOL, authoringRevision: 0 });
});

test('republishing increments the revision version', async (t) => {
    mockSession(t);
    const pack = packDoc({
        publishedRevision: { version: 3, publishedAt: new Date(), publishedBy: TEACHER_USER, items: [packItem()], skills: [] }
    });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', key: 'prefix-un' }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length, modifiedCount: 0 }));

    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }), res);
    assert.equal(pack.publishedRevision.version, 4);
});

test('publishing a pack that still stores legacy mcq items snapshots canonical types', async (t) => {
    mockSession(t);
    const pack = packDoc({
        items: [
            packItem({ type: 'mcq', externalId: 'Q1' }),
            packItem({ type: 'fill_blank', externalId: 'Q2', options: [], correctOptionId: null, acceptedAnswers: ['unkind'] })
        ]
    });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', key: 'prefix-un' }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length, modifiedCount: 1 }));

    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(
        pack.publishedRevision.items.map((item) => item.type),
        ['multiple_choice', 'fill_in_blank']
    );
    assert.equal(pack.publishedRevision.items[0].correctOptionId, '1');
    assert.deepEqual(pack.publishedRevision.items[1].acceptedAnswers, ['unkind']);
});

test('an empty pack cannot publish and a non-owner cannot publish at all', async (t) => {
    const empty = packDoc({ _id: 'bbbbbbbbbbbbbbbbbbbbbb01', items: [] });
    const foreign = packDoc({ owner: OTHER_USER });
    t.mock.method(GamePack, 'findOne', (query) => chain(String(query._id) === String(empty._id) ? empty : foreign));

    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: String(empty._id) }), res);
    assert.equal(res.statusCode, 400);

    const res2 = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }), res2);
    assert.equal(res2.statusCode, 403);
});

test('an admin listed only in roles[] can manage another teacher’s pack', async (t) => {
    mockSession(t);
    const pack = packDoc({ owner: OTHER_USER });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', key: 'prefix-un' }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length, modifiedCount: 1 }));

    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }, { role: 'teacher', roles: ['teacher', 'admin'] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(pack.status, 'published');
});

test('an archived pack cannot be published', async (t) => {
    const pack = packDoc({ status: 'archived' });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    const res = makeRes();
    await invoke(publishPack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 409);
});

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

test('a second skill with the same name and grade is refused, a different grade is allowed', async (t) => {
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefixes and suffixes', gradeLevel: '5', status: 'draft' }]));
    t.mock.method(GameSkill, 'findOne', () => chain(null));
    let created = null;
    t.mock.method(GameSkill, 'create', async (doc) => {
        created = { _id: 'cccccccccccccccccccccc01', ...doc };
        return created;
    });

    const res = makeRes();
    await invoke(createSkill, teacherReq({ name: 'prefixes   AND suffixes', gradeLevel: '5' }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /already exists/);

    const res2 = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Prefixes and suffixes', gradeLevel: '6' }), res2);
    assert.equal(res2.statusCode, 201, JSON.stringify(res2.body));
    assert.equal(created.gradeLevel, '6');
});

test('an archived twin is surfaced for restore instead of a duplicate create', async (t) => {
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', gradeLevel: '5', status: 'archived' }]));
    const res = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Prefix un-', gradeLevel: '5' }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /Restore it/);
    assert.equal(res.body.data.archived, true);
    assert.equal(res.body.data.skillId, SKILL);
});

test('a skill that still tags pack items cannot be archived', async (t) => {
    mockSession(t);
    const skill = skillDoc();
    let packsUsing = 2;
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    t.mock.method(GamePack, 'countDocuments', () => chain(packsUsing));

    const res = makeRes();
    await invoke(updateSkill, teacherReq({ status: 'archived' }, { id: SKILL }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(skill.status, 'draft');
    assert.match(res.body.message, /2 packs/);

    packsUsing = 0;
    const res2 = makeRes();
    await invoke(updateSkill, teacherReq({ status: 'archived' }, { id: SKILL }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(skill.status, 'archived');
});

test('an archived skill can be restored explicitly', async (t) => {
    const skill = skillDoc({ status: 'archived' });
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    const res = makeRes();
    await invoke(updateSkill, teacherReq({ status: 'draft' }, { id: SKILL }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(skill.status, 'draft');
});

test('only the skill owner can edit it', async (t) => {
    const skill = skillDoc({ owner: OTHER_USER });
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    const res = makeRes();
    await invoke(updateSkill, teacherReq({ name: 'Hijacked' }, { id: SKILL }), res);
    assert.equal(res.statusCode, 403);
});

/* ------------------------------------------------------------------ */
/* Pack editing                                                        */
/* ------------------------------------------------------------------ */

test('saving with a stale expectedRevision is a 409 before anything is written', async (t) => {
    const pack = packDoc({ authoringRevision: 5 });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    const res = makeRes();
    await invoke(updatePack, teacherReq({ title: 'Renamed', expectedRevision: 4 }, { id: PACK }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'REVISION_CONFLICT');
    assert.equal(pack.title, 'Prefixes');
});

test('a metadata-only save leaves the questions and published state untouched', async (t) => {
    mockSession(t);
    const pack = packDoc({ status: 'published' });
    const originalItems = pack.items;
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    const res = makeRes();
    await invoke(updatePack, teacherReq({ title: 'Renamed', expectedRevision: 0 }, { id: PACK }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(pack.title, 'Renamed');
    assert.equal(pack.items, originalItems);
    assert.equal(pack.status, 'published');
    assert.equal(pack.authoringRevision, 1);
});

test('saving questions demotes a published pack back to draft', async (t) => {
    mockSession(t);
    const pack = packDoc({ status: 'published' });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    const res = makeRes();
    await invoke(updatePack, teacherReq({ items: [packItem()], expectedRevision: 0 }, { id: PACK }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(pack.status, 'draft');
    assert.equal(String(pack.skillIds[0]), SKILL);
});

test('an archived pack cannot be edited', async (t) => {
    const pack = packDoc({ status: 'archived' });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    const res = makeRes();
    await invoke(updatePack, teacherReq({ title: 'Renamed' }, { id: PACK }), res);
    assert.equal(res.statusCode, 409);
});

test('a private pack is hidden from other teachers', async (t) => {
    const privatePack = packDoc({ owner: OTHER_USER, visibility: 'private', status: 'published' });
    t.mock.method(GamePack, 'findOne', () => chain(privatePack));
    const res = makeRes();
    await invoke(getPack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 403);
});

test('a published school pack is readable but not editable by other teachers', async (t) => {
    const schoolPack = packDoc({ owner: OTHER_USER, visibility: 'school', status: 'published' });
    t.mock.method(GamePack, 'findOne', () => chain(schoolPack));
    const res = makeRes();
    await invoke(getPack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.canEdit, false);
});

test('the pack list carries skill names from items and the default skill', async (t) => {
    t.mock.method(GamePack, 'find', () => chain([packDoc({ skillIds: [], defaultSkillId: SKILL })]));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-' }]));
    const res = makeRes();
    await invoke(listPacks, teacherReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.packs[0].skills[0].name, 'Prefix un-');
    assert.equal(res.body.data.packs[0].defaultSkillId, SKILL);
    assert.equal(res.body.data.packs[0].authoringRevision, 0);
});

test('the skill list counts packs that only reference it as their default', async (t) => {
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL, name: 'Prefix un-', key: 'prefix-un' }]));
    t.mock.method(GamePack, 'find', () => chain([
        { skillIds: [SKILL], items: [{ skillId: SKILL }, { skillId: SKILL }] },
        { skillIds: [], defaultSkillId: SKILL, items: [{ skillId: SKILL }] }
    ]));
    const res = makeRes();
    await invoke(listSkills, teacherReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.skills[0].packCount, 2);
    assert.equal(res.body.data.skills[0].itemCount, 3);
});

/* ------------------------------------------------------------------ */
/* Subjects                                                            */
/* ------------------------------------------------------------------ */

const SUBJECT = '222222222222222222222222';
const OTHER_SUBJECT = '333333333333333333333333';

test('createSkill stores a validated school subject and rejects unknown ones', async (t) => {
    t.mock.method(GameSkill, 'find', () => chain([]));
    t.mock.method(GameSkill, 'findOne', () => chain(null));
    let created = null;
    t.mock.method(GameSkill, 'create', async (doc) => { created = doc; return { _id: SKILL, ...doc }; });
    let existsQuery = null;
    t.mock.method(Subject, 'exists', async (query) => {
        existsQuery = query;
        return String(query._id) === SUBJECT ? { _id: SUBJECT } : null;
    });

    const res = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Fractions', gradeLevel: '5', subject: SUBJECT }), res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(created.subject, SUBJECT);
    assert.equal(existsQuery.school, SCHOOL);
    assert.equal(existsQuery.isActive, true);

    const res2 = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Fractions', gradeLevel: '5', subject: OTHER_SUBJECT }), res2);
    assert.equal(res2.statusCode, 400);
    assert.match(res2.body.message, /not found/);

    const res3 = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Fractions', gradeLevel: '5', subject: 'not-an-id' }), res3);
    assert.equal(res3.statusCode, 400);
    assert.match(res3.body.message, /Choose a subject/);

    const res4 = makeRes();
    await invoke(createSkill, teacherReq({ name: 'Fractions', gradeLevel: '5' }), res4);
    assert.equal(res4.statusCode, 201, JSON.stringify(res4.body));
    assert.equal(created.subject, null);
});

test('updateSkill can set and clear the subject', async (t) => {
    const skill = skillDoc();
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    t.mock.method(Subject, 'exists', async (query) => (String(query._id) === SUBJECT ? { _id: SUBJECT } : null));

    const res = makeRes();
    await invoke(updateSkill, teacherReq({ subject: SUBJECT }, { id: SKILL }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(skill.subject, SUBJECT);

    const res2 = makeRes();
    await invoke(updateSkill, teacherReq({ subject: '' }, { id: SKILL }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(skill.subject, null);

    const res3 = makeRes();
    await invoke(updateSkill, teacherReq({ subject: OTHER_SUBJECT }, { id: SKILL }), res3);
    assert.equal(res3.statusCode, 400);
    assert.equal(skill.subject, null);
});

test('createPack seeds the subject from the default skill unless one is chosen', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain({ _id: SKILL, subject: SUBJECT }));
    t.mock.method(GameSkill, 'find', () => chain([{ _id: SKILL }]));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    let created = null;
    t.mock.method(GamePack, 'create', async ([doc]) => { created = doc; return [{ _id: PACK, ...doc }]; });
    t.mock.method(Subject, 'exists', async (query) => (String(query._id) === OTHER_SUBJECT ? { _id: OTHER_SUBJECT } : null));

    const res = makeRes();
    await invoke(createPack, teacherReq({ title: 'Fractions practice', defaultSkillId: SKILL }), res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(created.subject, SUBJECT);

    const res2 = makeRes();
    await invoke(createPack, teacherReq({ title: 'Fractions practice', defaultSkillId: SKILL, subject: OTHER_SUBJECT }), res2);
    assert.equal(res2.statusCode, 201, JSON.stringify(res2.body));
    assert.equal(created.subject, OTHER_SUBJECT);

    const res3 = makeRes();
    await invoke(createPack, teacherReq({ title: 'Fractions practice', subject: SUBJECT }), res3);
    assert.equal(res3.statusCode, 400);
});

test('updatePack validates a subject change like every other metadata field', async (t) => {
    mockSession(t);
    const pack = packDoc();
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(Subject, 'exists', async (query) => (String(query._id) === SUBJECT ? { _id: SUBJECT } : null));

    const res = makeRes();
    await invoke(updatePack, teacherReq({ subject: SUBJECT, expectedRevision: 0 }, { id: PACK }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(pack.subject, SUBJECT);

    const res2 = makeRes();
    await invoke(updatePack, teacherReq({ subject: OTHER_SUBJECT, expectedRevision: 1 }, { id: PACK }), res2);
    assert.equal(res2.statusCode, 400);
    assert.equal(pack.subject, SUBJECT);
});

test('list filters map subjectId to a subject and general to the untagged bucket', async (t) => {
    let skillQuery = null;
    let packQuery = null;
    t.mock.method(GameSkill, 'find', (query) => { skillQuery = query; return chain([]); });
    t.mock.method(GamePack, 'find', (query) => { packQuery = query; return chain([]); });

    await invoke(listSkills, teacherReq({}, {}, {}, { subjectId: SUBJECT }), makeRes());
    assert.equal(skillQuery.subject, SUBJECT);
    await invoke(listSkills, teacherReq({}, {}, {}, { subjectId: 'general' }), makeRes());
    assert.equal(skillQuery.subject, null);
    await invoke(listSkills, teacherReq({}, {}, {}, { subjectId: 'garbage' }), makeRes());
    assert.equal('subject' in skillQuery, false);

    await invoke(listPacks, teacherReq({}, {}, {}, { subjectId: SUBJECT }), makeRes());
    assert.equal(packQuery.subject, SUBJECT);
    await invoke(listPacks, teacherReq({}, {}, {}, { subjectId: 'General' }), makeRes());
    assert.equal(packQuery.subject, null);
    await invoke(listPacks, teacherReq(), makeRes());
    assert.equal('subject' in packQuery, false);
});

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

const assignmentMocks = (t, pack) => {
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(Teacher, 'findById', () => chain({ user: TEACHER_USER, assignedClasses: [] }));
    t.mock.method(Class, 'find', () => chain([CLASS]));
    t.mock.method(TeacherPeriodAssignment, 'find', () => chain([]));
    t.mock.method(Student, 'find', () => chain([{ _id: STUDENT, currentClass: CLASS }]));
    t.mock.method(GameAssignment, 'create', async (doc) => ({
        _id: 'assign-1', status: 'open', createdAt: new Date(), ...doc
    }));
};

const publishedPack = (overrides = {}) => packDoc({
    status: 'published',
    publishedRevision: { version: 1, publishedAt: new Date(), publishedBy: TEACHER_USER, items: [packItem()], skills: [] },
    ...overrides
});

test('another teacher’s private pack cannot be assigned even when published', async (t) => {
    const pack = publishedPack({ owner: OTHER_USER, visibility: 'private' });
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    const req = teacherReq({ packId: PACK, classIds: [CLASS] });
    req.teacherProfile = { _id: 'teacher-1' };
    const res = makeRes();
    await invoke(createAssignment, req, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /private/);
});

test('a published school-wide pack can be assigned by any teacher of the class', async (t) => {
    assignmentMocks(t, publishedPack({ owner: OTHER_USER, visibility: 'school' }));
    const req = teacherReq({ packId: PACK, classIds: [CLASS], settings: { itemCount: 5 } });
    req.teacherProfile = { _id: 'teacher-1' };
    const res = makeRes();
    await invoke(createAssignment, req, res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.assignment.studentCount, 1);
});

test('an unpublished pack cannot be assigned', async (t) => {
    assignmentMocks(t, packDoc({ visibility: 'school' }));
    const req = teacherReq({ packId: PACK, classIds: [CLASS] });
    req.teacherProfile = { _id: 'teacher-1' };
    const res = makeRes();
    await invoke(createAssignment, req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Publish the pack/);
});

test('a class the teacher does not teach is refused', async (t) => {
    assignmentMocks(t, publishedPack({ visibility: 'school' }));
    const req = teacherReq({ packId: PACK, classIds: ['eeeeeeeeeeeeeeeeeeeeee02'] });
    req.teacherProfile = { _id: 'teacher-1' };
    const res = makeRes();
    await invoke(createAssignment, req, res);
    assert.equal(res.statusCode, 403);
});

// Assignments pinned from packs published before the canonical type names
// still carry `mcq`/`fill_blank`. Saving the parent document (closing it)
// re-validates the whole items array, so those values must be normalised by
// the item schema itself rather than rejected.
const legacyAssignment = () => {
    const doc = new GameAssignment({
        _id: new mongoose.Types.ObjectId(),
        school: SCHOOL,
        teacher: TEACHER_USER,
        pack: PACK,
        packRevisionVersion: 1,
        mode: 'practice',
        status: 'open',
        items: [
            packItem({ type: 'mcq' }),
            packItem({ externalId: 'Q2', type: 'fill_blank', options: undefined, correctOptionId: '', acceptedAnswers: ['unhappy'] })
        ]
    });
    doc.save = async function save() { await this.validate(); return this; };
    return doc;
};

test('assignments with legacy item types validate and normalise them', async () => {
    const assignment = new GameAssignment({
        school: SCHOOL,
        teacher: TEACHER_USER,
        pack: PACK,
        packRevisionVersion: 1,
        items: [
            packItem({ type: 'mcq' }),
            packItem({ externalId: 'Q2', type: 'fill_blank', options: undefined, correctOptionId: '', acceptedAnswers: ['unhappy'] })
        ]
    });
    await assignment.validate();
    assert.deepEqual(assignment.items.map((item) => item.type), ['multiple_choice', 'fill_in_blank']);
});

test('closing an assignment that still holds legacy item types succeeds', async (t) => {
    const assignment = legacyAssignment();
    t.mock.method(Teacher, 'findOne', () => chain({ _id: 'teacher-1', user: TEACHER_USER }));
    t.mock.method(GameAssignment, 'findOne', () => chain(assignment));
    const res = makeRes();
    await invoke(closeAssignment, teacherReq({}, { id: String(assignment._id) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(assignment.status, 'closed');
    assert.deepEqual(assignment.items.map((item) => item.type), ['multiple_choice', 'fill_in_blank']);
});

test('closing a missing assignment still returns 404', async (t) => {
    t.mock.method(Teacher, 'findOne', () => chain({ _id: 'teacher-1', user: TEACHER_USER }));
    t.mock.method(GameAssignment, 'findOne', () => chain(null));
    const res = makeRes();
    await invoke(closeAssignment, teacherReq({}, { id: String(new mongoose.Types.ObjectId()) }), res);
    assert.equal(res.statusCode, 404);
});

/* ------------------------------------------------------------------ */
/* Import preview and commit                                           */
/* ------------------------------------------------------------------ */

const singleBody = (overrides = {}) => ({
    type: 'mcq',
    content: buildPackTemplateCsv('mcq', 'single'),
    skillId: SKILL,
    newPack: { title: 'Unit 3 practice' },
    ...overrides
});

test('previewing a single import returns a token, the destination and answer-free samples', async (t) => {
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    const res = makeRes();
    await invoke(previewImport, teacherReq(singleBody()), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.canCommit, true);
    assert.equal(res.body.data.destination.skill.name, 'Prefix un-');
    assert.equal(res.body.data.destination.isNewPack, true);
    assert.equal(res.body.data.errors.length, 0);
    assert.ok(res.body.data.sampleItems.length > 0);
    assert.equal(JSON.stringify(res.body.data.sampleItems).includes('correctOptionId'), false);
});

test('previewing without a chosen skill is refused', async () => {
    const res = makeRes();
    await invoke(previewImport, teacherReq(singleBody({ skillId: '' })), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Choose the skill/);
});

test('committing a reviewed single import creates the pack under the chosen skill', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    let createdPack = null;
    t.mock.method(GamePack, 'create', async ([doc]) => {
        createdPack = doc;
        return [{ _id: PACK, ...doc }];
    });
    t.mock.method(GameImportReceipt, 'create', async ([doc]) => [doc]);

    const preview = makeRes();
    await invoke(previewImport, teacherReq(singleBody()), preview);
    const { token } = preview.body.data;

    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...singleBody(), token, submissionId: 'sub-12345678' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.summary.packsCreated, 1);
    assert.equal(res.body.data.summary.itemsImported, 2);
    assert.equal(res.body.data.primaryPackId, PACK);
    assert.equal(String(createdPack.defaultSkillId), SKILL);
    assert.equal(createdPack.authoringRevision, 1);
    assert.ok(createdPack.items.every((item) => String(item.skillId) === SKILL));
});

test('commit rejects a preview made for a different destination', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));

    const preview = makeRes();
    await invoke(previewImport, teacherReq(singleBody()), preview);
    const { token } = preview.body.data;

    const res = makeRes();
    await invoke(commitImport, teacherReq({
        ...singleBody({ newPack: { title: 'A different pack' } }), token, submissionId: 'sub-12345678'
    }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /changed since the preview/);
});

test('commit requires a submission id', async () => {
    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...singleBody(), token: 'whatever' }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /submission id/);
});

test('an expired preview cannot be committed', async () => {
    const { token } = createPlanToken({
        schoolId: SCHOOL, userId: TEACHER_USER, fingerprint: 'fp', now: Date.now() - 31 * 60 * 1000
    });
    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...singleBody(), token, submissionId: 'sub-12345678' }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /expired/);
});

test('retrying a committed import replays the stored result without writing', async (t) => {
    const { token } = createPlanToken({ schoolId: SCHOOL, userId: TEACHER_USER, fingerprint: 'fp-1' });
    t.mock.method(GameImportReceipt, 'findOne', () => chain({
        fingerprint: 'fp-1',
        result: { summary: { packsCreated: 1, packsUpdated: 0, itemsImported: 2, skillsCreated: 0, rowsSkipped: 0 }, primaryPackId: PACK }
    }));
    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...singleBody(), token, submissionId: 'sub-12345678' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.replayed, true);
    assert.equal(res.body.data.primaryPackId, PACK);
});

test('reusing a submission id with different content is a 409', async (t) => {
    const { token } = createPlanToken({ schoolId: SCHOOL, userId: TEACHER_USER, fingerprint: 'fp-1' });
    t.mock.method(GameImportReceipt, 'findOne', () => chain({ fingerprint: 'fp-2', result: {} }));
    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...singleBody(), token, submissionId: 'sub-12345678' }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'SUBMISSION_REUSED');
});

test('bulk commit refuses rows with errors and reports them', async (t) => {
    mockSession(t);
    const content = bulkCsv([bulkRow()]);
    const { token } = createPlanToken({ schoolId: SCHOOL, userId: TEACHER_USER, fingerprint: 'fp' });
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));
    t.mock.method(GameSkill, 'find', () => chain([]));
    t.mock.method(GamePack, 'find', () => chain([]));
    t.mock.method(Standard, 'find', () => chain([]));

    const res = makeRes();
    await invoke(commitImport, teacherReq({ mode: 'advanced', type: 'mcq', content, token, submissionId: 'sub-12345678' }), res);
    assert.equal(res.statusCode, 422, JSON.stringify(res.body));
    assert.ok(res.body.data.errors.some((error) => /Unknown skill/.test(error.message)));
});

test('an archived skill key blocks the import instead of reviving the skill', async (t) => {
    mockSession(t);
    const content = bulkCsv([bulkRow({ skill_key: 'archived-skill', skill_name: 'Archived skill' })]);
    const { token } = createPlanToken({ schoolId: SCHOOL, userId: TEACHER_USER, fingerprint: 'fp' });
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));
    t.mock.method(GameSkill, 'find', (query) => chain(query.key ? [skillDoc({ status: 'archived', key: 'archived-skill' })] : []));
    t.mock.method(GameSkill, 'create', async () => { throw new Error('must not create or revive a skill'); });
    t.mock.method(GamePack, 'find', () => chain([]));
    t.mock.method(Standard, 'find', () => chain([]));

    const res = makeRes();
    await invoke(commitImport, teacherReq({
        mode: 'advanced', type: 'mcq', content, token, submissionId: 'sub-12345678',
        confirmations: ['skillCreate', 'replace', 'unpublish', 'validRows']
    }), res);
    assert.equal(res.statusCode, 422, JSON.stringify(res.body));
    assert.ok(res.body.data.problems.some((problem) => /Restore it in the studio/.test(problem)));
});

/* ------------------------------------------------------------------ */
/* Templates and prompts                                               */
/* ------------------------------------------------------------------ */

test('the single template is skill-named and has no destination columns', async (t) => {
    t.mock.method(GameSkill, 'findOne', () => chain({ name: 'Prefix un-', gradeLevel: '5', language: 'en' }));
    const res = makeRes();
    await invoke(importTemplate, teacherReq({}, { type: 'mcq' }, {}, { target: 'single', skillId: SKILL }), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Content-Disposition'], /prefix-un/);
    assert.ok(res.sent.includes('prompt'));
    assert.ok(!res.sent.includes('pack_key'));
    assert.ok(!res.sent.includes('skill_key'));
});

test('the single AI prompt names the skill and forbids destination columns', async (t) => {
    t.mock.method(GameSkill, 'findOne', () => chain({ name: 'Prefix un-', gradeLevel: '5', language: 'en' }));
    const res = makeRes();
    await invoke(importPrompt, teacherReq({}, { type: 'mcq' }, {}, { target: 'single', skillId: SKILL }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.prompt.includes('Prefix un-'));
    assert.ok(res.body.data.prompt.includes('Do not add pack_key'));
});

test('the mixed template and prompt carry the type column and every answer column', async (t) => {
    t.mock.method(GameSkill, 'findOne', () => chain({ name: 'Prefix un-', gradeLevel: '5', language: 'en' }));
    const template = makeRes();
    await invoke(importTemplate, teacherReq({}, { type: 'mixed' }, {}, { target: 'single', skillId: SKILL }), template);
    assert.equal(template.statusCode, 200);
    assert.ok(template.sent.includes('type'));
    for (const column of ['correct_option', 'correct_answer', 'matching_pairs', 'ordering_items', 'numeric_rule']) {
        assert.ok(template.sent.includes(column), `${column} missing from the mixed template`);
    }

    const prompt = makeRes();
    await invoke(importPrompt, teacherReq({}, { type: 'mixed' }, {}, { target: 'single', skillId: SKILL }), prompt);
    assert.equal(prompt.statusCode, 200);
    assert.equal(prompt.body.data.type, 'mixed');
    assert.ok(prompt.body.data.prompt.includes('type column'));
    assert.ok(prompt.body.data.prompt.includes('multiple_choice'));
});

/* ------------------------------------------------------------------ */
/* Question pool import                                                */
/* ------------------------------------------------------------------ */

const POOL = '444444444444444444444444';
const STANDARD_ID = '777777777777777777777777';
const TEACHER_PROFILE = 'ffffffffffffffffffffff01';
const REWARD = '555555555555555555555555';
const POOL_Q1 = '660000000000000000000001';

const poolQuestion = (overrides = {}) => ({
    _id: POOL_Q1,
    questionText: 'Which word means "not happy"?',
    questionType: 'multiple_choice',
    options: [{ label: 'A', text: 'unhappy' }, { label: 'B', text: 'happy' }],
    correctAnswer: 'A',
    acceptableAnswers: [],
    explanation: '',
    difficulty: 'medium',
    passageText: '',
    matchingPairs: [],
    orderingItems: [],
    blanks: [],
    numericRule: null,
    ...overrides
});

const poolDoc = (overrides = {}) => ({
    _id: POOL,
    school: SCHOOL,
    class: CLASS,
    subject: SUBJECT,
    standard: STANDARD_ID,
    status: 'published',
    isActive: true,
    currentVersion: 3,
    questions: [poolQuestion()],
    updatedAt: new Date('2026-11-19T10:00:00Z'),
    ...overrides
});

// Class.find serves two callers: the teacher scope queries with $or and reads
// distinct ids; display lookups query by _id and read documents. Dispatch on
// the query shape so repeated scope checks in one test stay correct.
const stubTeacherScope = (t, { classIds = [CLASS], classDocs = [{ _id: CLASS, name: '5-R', section: 'R' }] } = {}) => {
    t.mock.method(Teacher, 'findOne', () => chain({ _id: TEACHER_PROFILE, user: TEACHER_USER }));
    t.mock.method(Teacher, 'findById', () => chain({ user: TEACHER_USER, assignedClasses: [] }));
    t.mock.method(Class, 'find', (query) => (query?.$or ? chain(classIds) : chain(classDocs)));
    t.mock.method(TeacherPeriodAssignment, 'find', () => chain([]));
};

test('listQuestionPools shows only published pools of classes the teacher teaches', async (t) => {
    stubTeacherScope(t);
    let poolQuery = null;
    t.mock.method(StandardQuestionPool, 'find', (query) => { poolQuery = query; return chain([poolDoc()]); });
    t.mock.method(Standard, 'find', () => chain([{ _id: STANDARD_ID, code: 'RL.5.1', name: 'Quote accurately' }]));
    t.mock.method(Subject, 'find', () => chain([{ _id: SUBJECT, name: 'English' }]));

    const res = makeRes();
    await invoke(listQuestionPools, teacherReq({}, {}, {}, { subjectId: SUBJECT }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(poolQuery.status, 'published');
    assert.equal(poolQuery.isActive, true);
    assert.equal(String(poolQuery.subject), SUBJECT);
    assert.ok(poolQuery.class.$in.map(String).includes(CLASS));
    const entry = res.body.data.pools[0];
    assert.equal(entry.questionCount, 1);
    assert.equal(entry.typeCounts.multiple_choice, 1);
    assert.equal(entry.standard.code, 'RL.5.1');
    assert.equal(entry.class.name, '5-R');
    assert.equal(entry.subject.name, 'English');
    assert.deepEqual(entry.questions, [{
        _id: POOL_Q1,
        questionText: 'Which word means "not happy"?',
        questionType: 'multiple_choice',
        difficulty: 'medium',
        hasPassage: false
    }]);
});

test('admins list every published pool without a class filter', async (t) => {
    let poolQuery = null;
    t.mock.method(StandardQuestionPool, 'find', (query) => { poolQuery = query; return chain([]); });
    t.mock.method(Standard, 'find', () => chain([]));
    t.mock.method(Class, 'find', () => chain([]));
    t.mock.method(Subject, 'find', () => chain([]));
    const res = makeRes();
    await invoke(listQuestionPools, teacherReq({}, {}, { role: 'admin', roles: ['admin'] }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(poolQuery.class, undefined);
});

test('previewPoolImport previews through the shared plan machinery without leaking answers', async (t) => {
    stubTeacherScope(t);
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(poolDoc()));
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GamePack, 'findOne', () => chain(null));

    const res = makeRes();
    await invoke(previewPoolImport, teacherReq({ poolId: POOL, skillId: SKILL, newPack: { title: 'From the pool' } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.source, 'pool');
    assert.equal(res.body.data.pool.poolId, POOL);
    assert.equal(res.body.data.canCommit, true);
    assert.equal(res.body.data.counts.validRows, 1);
    assert.ok(res.body.data.token);
    assert.equal(JSON.stringify(res.body.data.sampleItems).includes('correctOptionId'), false);
});

test('previewPoolImport refuses a pool from a class the teacher does not teach', async (t) => {
    stubTeacherScope(t, { classIds: [] });
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(poolDoc()));
    const res = makeRes();
    await invoke(previewPoolImport, teacherReq({ poolId: POOL, skillId: SKILL }), res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /class you do not teach/);
});

test('committing a pool import creates the pack under the chosen skill', async (t) => {
    mockSession(t);
    stubTeacherScope(t);
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(poolDoc()));
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));
    t.mock.method(GameSkill, 'updateMany', async () => ({ matchedCount: 1 }));
    let createdPack = null;
    t.mock.method(GamePack, 'create', async ([doc]) => { createdPack = doc; return [{ _id: PACK, ...doc }]; });
    t.mock.method(GameImportReceipt, 'create', async ([doc]) => [doc]);

    const body = { source: 'pool', poolId: POOL, skillId: SKILL, newPack: { title: 'From the pool' } };
    const preview = makeRes();
    await invoke(previewPoolImport, teacherReq(body), preview);
    assert.equal(preview.statusCode, 200, JSON.stringify(preview.body));
    const { token } = preview.body.data;

    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...body, token, submissionId: 'sub-pool-123' }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.summary.packsCreated, 1);
    assert.equal(res.body.data.summary.itemsImported, 1);
    assert.equal(String(createdPack.defaultSkillId), SKILL);
    assert.equal(createdPack.items[0].externalId, POOL_Q1);
    assert.equal(createdPack.items[0].sourceSkillKey, undefined);
});

test('a pool commit re-checks class scope at write time', async (t) => {
    mockSession(t);
    const classIds = [CLASS];
    stubTeacherScope(t, { classIds });
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(poolDoc()));
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    t.mock.method(GameImportReceipt, 'findOne', () => chain(null));
    t.mock.method(GamePack, 'create', async () => { throw new Error('must not write after losing the class'); });

    const body = { source: 'pool', poolId: POOL, skillId: SKILL, newPack: { title: 'From the pool' } };
    const preview = makeRes();
    await invoke(previewPoolImport, teacherReq(body), preview);
    const { token } = preview.body.data;

    classIds.splice(0, classIds.length);
    const res = makeRes();
    await invoke(commitImport, teacherReq({ ...body, token, submissionId: 'sub-pool-123' }), res);
    assert.equal(res.statusCode, 403, JSON.stringify(res.body));
});

/* ------------------------------------------------------------------ */
/* Teacher rewards                                                     */
/* ------------------------------------------------------------------ */

const stubRewardReads = (t, { student = { _id: STUDENT, currentClass: CLASS } } = {}) => {
    stubTeacherScope(t);
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS }));
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(SchoolCalendarConfig, 'findOne', () => chain({ timezone: 'UTC' }));
};

test('giveReward stores a trimmed note and computes the week period key', async (t) => {
    stubRewardReads(t);
    let created = null;
    t.mock.method(GameTeacherReward, 'create', async (doc) => { created = doc; return { _id: REWARD, createdAt: new Date(), ...doc }; });

    const res = makeRes();
    await invoke(giveReward, teacherReq(
        { studentId: STUDENT, note: '  Great effort on prefixes!  ', periodType: 'week' },
        { classId: CLASS }
    ), res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(created.note, 'Great effort on prefixes!');
    assert.equal(String(created.class), CLASS);
    assert.equal(String(created.student), STUDENT);
    assert.equal(String(created.issuedBy), TEACHER_USER);
    assert.match(created.periodKey, /^\d{4}-W\d{2}$/);
    assert.equal(res.body.data.reward.periodType, 'week');
});

test('giveReward defaults to a custom period and rejects unknown period types', async (t) => {
    stubRewardReads(t);
    t.mock.method(GameTeacherReward, 'create', async (doc) => ({ _id: REWARD, createdAt: new Date(), ...doc }));
    const res = makeRes();
    await invoke(giveReward, teacherReq({ studentId: STUDENT, note: 'Well done', periodType: 'daily' }, { classId: CLASS }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.reward.periodType, 'custom');
    assert.equal(res.body.data.reward.periodKey, '');
});

test('giveReward refuses a teacher who is not assigned to the class', async (t) => {
    stubTeacherScope(t, { classIds: [] });
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS }));
    t.mock.method(GameTeacherReward, 'create', async () => { throw new Error('must not create'); });
    const res = makeRes();
    await invoke(giveReward, teacherReq({ studentId: STUDENT, note: 'Nice' }, { classId: CLASS }), res);
    assert.equal(res.statusCode, 403);
});

test('giveReward refuses a student outside the class', async (t) => {
    stubRewardReads(t, { student: { _id: STUDENT, currentClass: 'eeeeeeeeeeeeeeeeeeeeee01', enrolledClasses: [] } });
    t.mock.method(GameTeacherReward, 'create', async () => { throw new Error('must not create'); });
    const res = makeRes();
    await invoke(giveReward, teacherReq({ studentId: STUDENT, note: 'Nice' }, { classId: CLASS }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /not in the selected class/);
});

test('giveReward requires a note and caps it at 300 characters', async (t) => {
    stubRewardReads(t);
    t.mock.method(GameTeacherReward, 'create', async () => { throw new Error('must not create'); });

    const empty = makeRes();
    await invoke(giveReward, teacherReq({ studentId: STUDENT, note: '   ' }, { classId: CLASS }), empty);
    assert.equal(empty.statusCode, 400);

    const long = makeRes();
    await invoke(giveReward, teacherReq({ studentId: STUDENT, note: 'x'.repeat(301) }, { classId: CLASS }), long);
    assert.equal(long.statusCode, 400);
    assert.match(long.body.message, /300/);
});

test('admins can give rewards in any class of the school', async (t) => {
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS }));
    t.mock.method(Student, 'findOne', () => chain({ _id: STUDENT, currentClass: CLASS }));
    t.mock.method(GameTeacherReward, 'create', async (doc) => ({ _id: REWARD, createdAt: new Date(), ...doc }));
    const res = makeRes();
    await invoke(giveReward, teacherReq(
        { studentId: STUDENT, note: 'Great focus this week' },
        { classId: CLASS },
        { role: 'admin', roles: ['admin'] }
    ), res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
});

test('listClassRewards shows full names to staff', async (t) => {
    stubTeacherScope(t);
    t.mock.method(Class, 'findOne', () => chain({ _id: CLASS }));
    t.mock.method(GameTeacherReward, 'find', () => chain([{
        _id: REWARD, student: STUDENT, issuedBy: TEACHER_USER, note: 'Well done',
        periodType: 'custom', periodKey: '', createdAt: new Date('2026-11-19T10:00:00Z')
    }]));
    t.mock.method(Student, 'find', () => chain([{ _id: STUDENT, firstName: 'Aya', lastName: 'Hassan' }]));
    t.mock.method(User, 'find', () => chain([{ _id: TEACHER_USER, firstName: 'Abu', lastName: 'Bakr' }]));

    const res = makeRes();
    await invoke(listClassRewards, teacherReq({}, { classId: CLASS }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const row = res.body.data.rewards[0];
    assert.equal(row.studentName, 'Aya Hassan');
    assert.equal(row.issuedByName, 'Abu Bakr');
    assert.equal(row.note, 'Well done');
});

test('myRewards returns only the signed-in student\'s notes with the teacher name', async (t) => {
    t.mock.method(Student, 'findOne', () => chain({ _id: STUDENT }));
    let rewardQuery = null;
    t.mock.method(GameTeacherReward, 'find', (query) => { rewardQuery = query; return chain([{
        _id: REWARD, student: STUDENT, issuedBy: TEACHER_USER, note: 'Keep it up',
        periodType: 'week', periodKey: '2026-W47', createdAt: new Date('2026-11-19T10:00:00Z')
    }]); });
    t.mock.method(User, 'find', () => chain([{ _id: TEACHER_USER, firstName: 'Abu', lastName: 'Bakr' }]));

    const res = makeRes();
    await invoke(myRewards, teacherReq({}, {}, { role: 'student', roles: ['student'] }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(String(rewardQuery.student), STUDENT);
    assert.equal(String(rewardQuery.school), SCHOOL);
    const row = res.body.data.rewards[0];
    assert.equal(row.note, 'Keep it up');
    assert.equal(row.teacherName, 'Abu Bakr');
    assert.equal(row.studentId, undefined);
});
/* ------------------------------------------------------------------ */
/* Deleting skills and packs                                           */
/* ------------------------------------------------------------------ */

test('deleting an unused skill removes it', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain(skillDoc()));
    t.mock.method(GamePack, 'countDocuments', () => chain(0));
    t.mock.method(GameSkillProgress, 'countDocuments', () => chain(0));
    const remove = t.mock.method(GameSkill, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deleteSkill, teacherReq({}, { id: SKILL }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.deleted, true);
    assert.equal(remove.mock.calls.length, 1);
    assert.equal(String(remove.mock.calls[0].arguments[0].school), SCHOOL);
});

test('a skill that still tags pack questions cannot be deleted', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain(skillDoc()));
    t.mock.method(GamePack, 'countDocuments', () => chain(2));
    const remove = t.mock.method(GameSkill, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deleteSkill, teacherReq({}, { id: SKILL }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /2 packs/);
    assert.equal(remove.mock.calls.length, 0);
});

test('a skill students already practiced cannot be deleted, only archived', async (t) => {
    mockSession(t);
    t.mock.method(GameSkill, 'findOne', () => chain(skillDoc()));
    t.mock.method(GamePack, 'countDocuments', () => chain(0));
    t.mock.method(GameSkillProgress, 'countDocuments', () => chain(3));
    const remove = t.mock.method(GameSkill, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deleteSkill, teacherReq({}, { id: SKILL }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /Archive it instead/);
    assert.equal(remove.mock.calls.length, 0);
});

test('only the skill owner can delete it', async (t) => {
    t.mock.method(GameSkill, 'findOne', () => chain(skillDoc({ owner: OTHER_USER })));
    const remove = t.mock.method(GameSkill, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deleteSkill, teacherReq({}, { id: SKILL }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(remove.mock.calls.length, 0);
});

test('deleting a pack that was never assigned or played removes it', async (t) => {
    mockSession(t);
    t.mock.method(GamePack, 'findOne', () => chain(packDoc()));
    t.mock.method(GameAssignment, 'countDocuments', () => chain(0));
    t.mock.method(GameSession, 'countDocuments', () => chain(0));
    const remove = t.mock.method(GamePack, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deletePack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.deleted, true);
    assert.equal(remove.mock.calls.length, 1);
    assert.equal(String(remove.mock.calls[0].arguments[0].school), SCHOOL);
});

test('a pack with assignments cannot be deleted', async (t) => {
    mockSession(t);
    t.mock.method(GamePack, 'findOne', () => chain(packDoc()));
    t.mock.method(GameAssignment, 'countDocuments', () => chain(1));
    const remove = t.mock.method(GamePack, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deletePack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /assignments/);
    assert.equal(remove.mock.calls.length, 0);
});

test('a pack students already played cannot be deleted', async (t) => {
    mockSession(t);
    t.mock.method(GamePack, 'findOne', () => chain(packDoc()));
    t.mock.method(GameAssignment, 'countDocuments', () => chain(0));
    t.mock.method(GameSession, 'countDocuments', () => chain(4));
    const remove = t.mock.method(GamePack, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deletePack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /Archive it instead/);
    assert.equal(remove.mock.calls.length, 0);
});

test('only the pack owner can delete it', async (t) => {
    t.mock.method(GamePack, 'findOne', () => chain(packDoc({ owner: OTHER_USER })));
    const remove = t.mock.method(GamePack, 'deleteOne', () => chain({ deletedCount: 1 }));

    const res = makeRes();
    await invoke(deletePack, teacherReq({}, { id: PACK }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(remove.mock.calls.length, 0);
});
