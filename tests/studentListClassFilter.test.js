import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import Student from '../models/Student.js';
import { getStudents } from '../controllers/studentController.js';

const classId = new mongoose.Types.ObjectId();
const schoolId = new mongoose.Types.ObjectId();

const queryChain = () => {
    const chain = {
        populate: () => chain,
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        then: (resolve) => resolve([])
    };
    return chain;
};

const runGetStudents = async (context, query) => {
    const captured = {};
    context.mock.method(Student, 'find', (filter) => {
        captured.filter = filter;
        return queryChain();
    });
    context.mock.method(Student, 'countDocuments', async () => 0);

    let resolvePayload;
    const payloadPromise = new Promise((resolve) => {
        resolvePayload = resolve;
    });
    const req = {
        query,
        schoolId,
        user: { role: 'admin' }
    };
    const res = {
        status: () => res,
        json: (body) => {
            resolvePayload(body);
            return res;
        }
    };

    await getStudents(req, res, (err) => {
        if (err) throw err;
    });

    const payload = await payloadPromise;
    assert.equal(payload.success, true);
    return captured.filter;
};

test('a class filter matches the class the table displays, not every class a student ever joined', async (context) => {
    const filter = await runGetStudents(context, { classId: String(classId), academicYear: '2026-2027' });

    assert.equal(String(filter.currentClass), String(classId));
    assert.equal(filter.enrolledClasses, undefined);
    assert.equal(filter.$or, undefined);
});

test('an unassigned filter still selects students with no current class', async (context) => {
    const filter = await runGetStudents(context, { classId: 'unassigned' });

    assert.equal(filter.currentClass, null);
    assert.equal(filter.enrolledClasses, undefined);
});

test('without a class filter the academic year still scopes the list', async (context) => {
    const filter = await runGetStudents(context, { academicYear: '2026-2027' });

    assert.equal(filter.academicYear, '2026-2027');
    assert.equal(filter.currentClass, undefined);
});
