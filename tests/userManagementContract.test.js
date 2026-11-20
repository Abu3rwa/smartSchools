import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import { updateSchoolUser, listSchoolUsers } from '../services/userManagementService.js';

const SCHOOL = '6af075f7d1712618b41696bd';
const TARGET_ID = '6af075f7d1712618b41696b1';
const ACTOR_ID = '6af075f7d1712618b41696b2';
const DEPT_ID = '6af075f7d1712618b41696b3';
const CLASS_ID = '6af075f7d1712618b41696b4';

mongoose.startSession = async () => ({
    withTransaction: (fn) => fn(),
    endSession: async () => {}
});

const chain = (value) => {
    const proxy = {
        session: () => proxy,
        select: () => proxy,
        populate: () => proxy,
        sort: () => proxy,
        setOptions: () => proxy,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return proxy;
};

const makeTarget = (overrides = {}) => ({
    _id: TARGET_ID,
    school: SCHOOL,
    role: 'teacher',
    roles: ['teacher'],
    permissions: [],
    titles: [],
    isActive: true,
    updatedAt: new Date('2026-11-16T10:00:00Z'),
    save: async () => {},
    ...overrides
});

const setup = ({ target = makeTarget(), otherAdmins = 1, departments = [DEPT_ID], classes = [CLASS_ID] } = {}) => {
    User.findById = () => chain(target);
    User.countDocuments = () => chain(otherAdmins);
    User.find = () => chain([target]);
    Department.findOne = ({ _id }) => chain(departments.includes(String(_id)) ? { _id } : null);
    Department.countDocuments = ({ _id }) => chain(_id.$in.filter((id) => departments.includes(String(id))).length);
    Class.countDocuments = ({ _id }) => chain(_id.$in.filter((id) => classes.includes(String(id))).length);
    return target;
};

const admin = { _id: ACTOR_ID, role: 'admin', roles: ['admin'] };
const delegated = { _id: ACTOR_ID, role: 'staff', roles: ['staff'], permissions: ['manage_users'] };
const settingsOnly = { _id: ACTOR_ID, role: 'staff', roles: ['staff'], permissions: ['manage_school_settings'] };

const patch = (actor, payload, extra = {}) =>
    updateSchoolUser({ actor, schoolId: SCHOOL, userId: TARGET_ID, payload, ...extra });

test('delegated manage_users actor cannot change authorization fields', async () => {
    setup();
    const result = await patch(delegated, { role: 'admin', roles: ['admin'] });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'AUTH_FIELDS_ADMIN_ONLY');
});

test('manage_school_settings alone cannot change roles', async () => {
    setup();
    const result = await patch(settingsOnly, { roles: ['teacher', 'admin'] });
    assert.equal(result.status, 403);
});

test('delegated actor can still edit titles', async () => {
    const target = setup();
    const result = await patch(delegated, { titles: [' Humanities Teacher ', 'Humanities Teacher'] });
    assert.equal(result.status, 200);
    assert.deepEqual(target.titles, ['Humanities Teacher']);
});

test('assigned admin in roles[] may edit authorization fields', async () => {
    setup();
    const result = await patch({ _id: ACTOR_ID, role: 'teacher', roles: ['teacher', 'admin'] }, { roles: ['teacher'], role: 'teacher' });
    assert.equal(result.status, 200);
});

test('empty roles array is rejected', async () => {
    setup();
    const result = await patch(admin, { roles: [], role: 'teacher' });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'ROLES_REQUIRED');
});

test('active role must be among assigned roles', async () => {
    setup();
    const result = await patch(admin, { roles: ['teacher'], role: 'admin' });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'ROLE_NOT_ASSIGNED');
});

test('self demotion is blocked', async () => {
    setup({ target: makeTarget({ _id: ACTOR_ID, role: 'admin', roles: ['admin'] }) });
    const result = await patch(admin, { roles: ['teacher'], role: 'teacher' });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'SELF_DEMOTION');
});

test('last active administrator cannot be demoted', async () => {
    setup({ target: makeTarget({ role: 'admin', roles: ['admin'] }), otherAdmins: 0 });
    const result = await patch(admin, { roles: ['teacher'], role: 'teacher' });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'LAST_ADMIN');
});

test('demotion allowed when another active administrator exists', async () => {
    setup({ target: makeTarget({ role: 'admin', roles: ['admin'] }), otherAdmins: 1 });
    const result = await patch(admin, { roles: ['teacher'], role: 'teacher' });
    assert.equal(result.status, 200);
});

test('super admin membership in roles[] is protected', async () => {
    setup({ target: makeTarget({ role: 'teacher', roles: ['teacher', 'super_admin'] }) });
    const result = await patch(admin, { roles: ['teacher'], role: 'teacher' });
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'SUPER_ADMIN_PROTECTED');
});

test('cross-school target is rejected', async () => {
    setup({ target: makeTarget({ school: 'other-school' }) });
    const result = await patch(admin, { titles: ['X'] });
    assert.equal(result.status, 403);
});

test('stale expectedUpdatedAt is rejected with 409', async () => {
    setup();
    const result = await patch(admin, { titles: ['X'] }, { expectedUpdatedAt: '2026-11-15T10:00:00Z' });
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'STALE_USER');
});

test('matching expectedUpdatedAt passes', async () => {
    setup();
    const result = await patch(admin, { titles: ['X'] }, { expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });
    assert.equal(result.status, 200);
});

test('department outside the school is rejected', async () => {
    setup({ departments: [] });
    const result = await patch(admin, { department: DEPT_ID });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'DEPARTMENT_NOT_IN_SCHOOL');
});

test('department inside the school is accepted', async () => {
    const target = setup();
    const result = await patch(admin, { department: DEPT_ID });
    assert.equal(result.status, 200);
    assert.equal(String(target.department), DEPT_ID);
});

test('unknown permission key is rejected', async () => {
    setup();
    const result = await patch(admin, { permissions: ['not_a_permission'] });
    assert.equal(result.status, 400);
});

test('newly catalogued permissions save and validate against the model', async () => {
    const keys = [
        'manage_grade_scaling', 'manage_assignment_config', 'create_assignments',
        'publish_assignments', 'grade_assignments', 'view_assessment_pool',
        'create_assessment_from_pool', 'manage_assessment_pool_settings',
        'manage_assessment_comms_settings'
    ];
    const target = setup();
    const result = await patch(admin, { permissions: keys });
    assert.equal(result.status, 200);
    assert.deepEqual(target.permissions, keys);
    const doc = new User({
        email: 'qa@classhope.test', password: 'password1', firstName: 'Q', lastName: 'A', permissions: keys
    });
    const error = doc.validateSync();
    assert.equal(error?.errors?.permissions, undefined);
});

test('scope keys must be known permissions', async () => {
    setup();
    const result = await patch(admin, { permissionScopes: { bogus_key: {} } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'INVALID_SCOPE_KEY');
});

test('scope class ids must belong to the school', async () => {
    setup({ classes: [] });
    const result = await patch(admin, { permissionScopes: { message_school_students: { classIds: [CLASS_ID] } } });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'SCOPE_NOT_IN_SCHOOL');
});

test('valid scopes are stored as a Map with parsed expiry', async () => {
    const target = setup();
    const result = await patch(admin, {
        permissionScopes: { message_school_students: { classIds: [CLASS_ID], expiresAt: '2026-12-01T00:00:00Z' } }
    });
    assert.equal(result.status, 200);
    assert.ok(target.permissionScopes instanceof Map);
    assert.equal(target.permissionScopes.get('message_school_students').expiresAt.toISOString(), '2026-12-01T00:00:00.000Z');
});

test('invalid scope expiry is rejected', async () => {
    setup();
    const result = await patch(admin, { permissionScopes: { message_school_students: { expiresAt: 'not-a-date' } } });
    assert.equal(result.status, 400);
});

test('titles longer than 100 characters are rejected', async () => {
    setup();
    const result = await patch(admin, { titles: ['x'.repeat(101)] });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'TITLE_TOO_LONG');
});

test('user list selects updatedAt for stale-edit detection', async () => {
    let selected = '';
    User.find = () => {
        const proxy = chain([]);
        proxy.select = (value) => { selected = value; return proxy; };
        return proxy;
    };
    await listSchoolUsers(SCHOOL);
    assert.match(selected, /updatedAt/);
});