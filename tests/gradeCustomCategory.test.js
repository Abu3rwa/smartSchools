import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import GradeAuditLog from '../models/GradeAuditLog.js';
import GradebookConfig from '../models/GradebookConfig.js';
import { setImmediate as runAfterCallbacks } from 'node:timers';
import { bulkAddGrades, bulkUpdateGrades } from '../controllers/gradebookController.js';
import { validateCustomCategory } from '../utils/gradebookDefaults.js';

const responseHarness = () => {
    const response = { statusCode: 200, body: null };
    let settle;
    const done = new Promise((resolve) => { settle = resolve; });
    response.status = (code) => { response.statusCode = code; return response; };
    response.json = (body) => { response.body = body; settle(); return response; };
    return { response, done };
};

const invoke = async (handler, req) => {
    const { response, done } = responseHarness();
    let nextError = null;
    handler(req, response, (error) => { nextError = error; });
    await Promise.race([done, new Promise((resolve) => runAfterCallbacks(resolve))]);
    return { response, nextError };
};

const req = (body) => ({
    schoolId: 'school-1',
    user: { role: 'admin', _id: 'admin-1' },
    school: { academicYear: '2026-2027' },
    body
});

const mockAdd = (t) => {
    t.mock.method(Subject, 'findById', async () => ({ _id: 'subject-1', name: 'English' }));
    t.mock.method(GradebookConfig, 'findOne', () => ({
        lean: async () => null,
        sort: () => ({ lean: async () => null })
    }));
    let documents = null;
    t.mock.method(Grade, 'insertMany', async (docs) => {
        documents = docs;
        return docs.map((doc, index) => ({
            ...doc,
            _id: new mongoose.Types.ObjectId(),
            toObject: () => ({ ...doc, _id: String(index) })
        }));
    });
    return () => documents;
};

const mockUpdate = (t) => {
    const gradeId = 'g1';
    t.mock.method(Grade, 'find', () => ({
        lean: async () => [{
            _id: gradeId,
            student: new mongoose.Types.ObjectId(),
            subject: new mongoose.Types.ObjectId(),
            class: new mongoose.Types.ObjectId(),
            teacher: new mongoose.Types.ObjectId(),
            category: 'classwork',
            gradeType: 'classwork',
            marks: 8,
            maxMarks: 10
        }]
    }));
    t.mock.method(Class, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: 'class-1' }) }) }));
    t.mock.method(Subject, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: 'subject-1' }) }) }));
    t.mock.method(GradeAuditLog, 'insertMany', async () => []);
    let operations = null;
    t.mock.method(Grade, 'bulkWrite', async (ops) => {
        operations = ops;
        return { modifiedCount: ops.length };
    });
    return { operations: () => operations, gradeId };
};

const addPayload = (category) => ({
    classId: 'class-1', subject: 'subject-1', category, date: '2026-11-24',
    maxMarks: 10, academicYear: '2026-2027',
    grades: [{ student: 'student-1', marks: 8, remarks: '' }],
    sendNotifications: false
});

test('custom category is stored as a free label with a known scoring type', async (t) => {
    const documents = mockAdd(t);
    const { response, nextError } = await invoke(bulkAddGrades, req(addPayload('  New   Cat  ')));
    assert.equal(nextError, null);
    assert.equal(response.statusCode, 201);
    assert.equal(documents()[0].category, 'new cat');
    assert.equal(documents()[0].gradeType, 'other');
});

test('Arabic custom category is accepted', async (t) => {
    const documents = mockAdd(t);
    const { response } = await invoke(bulkAddGrades, req(addPayload('إملاء')));
    assert.equal(response.statusCode, 201);
    assert.equal(documents()[0].category, 'إملاء');
    assert.equal(documents()[0].gradeType, 'other');
});

test('invalid custom categories fail before inserting', async (t) => {
    const documents = mockAdd(t);
    for (const category of ['x'.repeat(41), '<script>']) {
        const { response } = await invoke(bulkAddGrades, req(addPayload(category)));
        assert.equal(response.statusCode, 400);
        assert.equal(response.body.success, false);
        assert.match(response.body.message, /Category/);
    }
    assert.equal(documents(), null);
});

test('known category derivation is unchanged', async (t) => {
    const documents = mockAdd(t);
    let result = await invoke(bulkAddGrades, req(addPayload('classwork')));
    assert.equal(result.response.statusCode, 201);
    assert.equal(documents()[0].gradeType, 'classwork');
    result = await invoke(bulkAddGrades, req(addPayload('Test')));
    assert.equal(result.response.statusCode, 201);
    assert.equal(documents()[0].gradeType, 'monthly_test');
});

test('custom update changes category without changing gradeType', async (t) => {
    const { operations, gradeId } = mockUpdate(t);
    const { response } = await invoke(bulkUpdateGrades, req({
        grades: [{ _id: gradeId, marks: 9 }],
        metadata: { category: '  Spelling   Bee ' }
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(operations()[0].updateOne.update.$set.category, 'spelling bee');
    assert.equal(operations()[0].updateOne.update.$set.gradeType, undefined);
});

test('custom update rejects invalid labels before writing', async (t) => {
    const { operations, gradeId } = mockUpdate(t);
    const { response } = await invoke(bulkUpdateGrades, req({
        grades: [{ _id: gradeId, marks: 9 }],
        metadata: { category: '<script>' }
    }));
    assert.equal(response.statusCode, 400);
    assert.equal(operations(), null);
});

test('Grade schema validates free labels and the 40 character limit', async () => {
    const base = {
        school: new mongoose.Types.ObjectId(), student: new mongoose.Types.ObjectId(),
        subject: new mongoose.Types.ObjectId(), class: new mongoose.Types.ObjectId(),
        teacher: new mongoose.Types.ObjectId(), academicYear: '2026-2027',
        gradeType: 'other', category: 'spelling bee', date: new Date(),
        month: 11, semester: 1, marks: 8, maxMarks: 10
    };
    await assert.doesNotReject(new Grade(base).validate());
    await assert.rejects(new Grade({ ...base, category: 'x'.repeat(41) }).validate(), /40/);
    await assert.rejects(new Grade({ ...base, gradeType: 'new cat' }).validate(), /gradeType/);
});

test('custom category validator trims and collapses whitespace', () => {
    assert.deepEqual(validateCustomCategory('  Spelling   Bee  '), {
        valid: true, category: 'spelling bee', message: ''
    });
    assert.equal(validateCustomCategory('').valid, false);
});
