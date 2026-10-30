import assert from 'node:assert/strict';
import test from 'node:test';
import Student from '../models/Student.js';
import TraditionalReportCard from '../models/TraditionalReportCard.js';
import { getParentGrades } from '../controllers/parentGradebookController.js';
import { getReportCard } from '../controllers/reportCardController.js';

const chain = (rows) => ({
    populate() { return this; },
    select() { return this; },
    sort() { return this; },
    lean: async () => rows,
});

const fakeResponse = () => {
    const state = { statusCode: 200, body: null, error: null };
    const res = {
        status(code) { state.statusCode = code; return res; },
        json(body) { state.body = body; return res; },
    };
    const next = (error) => { state.error = error; };
    return { res, next, state };
};

// Async handlers are fire-and-forget wrappers; let their awaits settle.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const parentRequest = (overrides = {}) => ({
    user: { _id: 'parent-user-1', role: 'parent', email: 'Parent@Example.com ' },
    schoolId: 'school-1',
    school: { settings: {} },
    params: {},
    query: {},
    ...overrides,
});

test('parent gradebook refuses a child that is not linked to the account', async (t) => {
    t.mock.method(Student, 'findOne', () => chain(null));

    const req = parentRequest({ params: { studentId: '66f000000000000000000001' } });
    const { res, next, state } = fakeResponse();

    getParentGrades(req, res, next);
    await settle();

    assert.equal(state.error, null);
    assert.equal(state.statusCode, 404);
    assert.equal(state.body.success, false);
});

test('a parent cannot open another family\'s report card', async (t) => {
    t.mock.method(TraditionalReportCard, 'findById', () => chain({
        _id: 'report-1',
        school: 'school-1',
        status: 'published',
        student: 'another-student'
    }));
    t.mock.method(Student, 'findOne', () => chain(null));

    const req = parentRequest({ params: { id: 'report-1' } });
    const { res, next, state } = fakeResponse();

    getReportCard(req, res, next);
    await settle();

    assert.equal(state.error, null);
    assert.equal(state.statusCode, 403);
});

test('a draft report card stays hidden from the linked parent', async (t) => {
    t.mock.method(TraditionalReportCard, 'findById', () => chain({
        _id: 'report-2',
        school: 'school-1',
        status: 'draft',
        student: 'child-1'
    }));
    t.mock.method(Student, 'findOne', () => chain({ _id: 'child-1' }));

    const req = parentRequest({ params: { id: 'report-2' } });
    const { res, next, state } = fakeResponse();

    getReportCard(req, res, next);
    await settle();

    assert.equal(state.error, null);
    assert.equal(state.statusCode, 403);
});

test('a published report card is returned to the linked parent', async (t) => {
    t.mock.method(TraditionalReportCard, 'findById', () => chain({
        _id: 'report-3',
        school: 'school-1',
        status: 'published',
        student: 'child-1'
    }));
    t.mock.method(Student, 'findOne', () => chain({ _id: 'child-1' }));

    const req = parentRequest({ params: { id: 'report-3' } });
    const { res, next, state } = fakeResponse();

    getReportCard(req, res, next);
    await settle();

    assert.equal(state.error, null);
    assert.equal(state.statusCode, 200);
    assert.equal(state.body.data._id, 'report-3');
});

test('a report card from another school is not visible', async (t) => {
    t.mock.method(TraditionalReportCard, 'findById', () => chain({
        _id: 'report-4',
        school: 'school-2',
        status: 'published',
        student: 'child-1'
    }));

    const req = parentRequest({ params: { id: 'report-4' } });
    const { res, next, state } = fakeResponse();

    getReportCard(req, res, next);
    await settle();

    assert.equal(state.statusCode, 404);
});
