import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

import Teacher from '../models/Teacher.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import { getMyDashboardAnalytics } from '../controllers/teacherController.js';

const schoolId = new mongoose.Types.ObjectId();
const teacherUserId = new mongoose.Types.ObjectId();
const classR = new mongoose.Types.ObjectId();
const classT = new mongoose.Types.ObjectId();
const studentId = new mongoose.Types.ObjectId();

const leanChain = (value) => {
    const chain = {
        select: () => chain,
        lean: () => Promise.resolve(value),
        then: (resolve) => resolve(value)
    };
    return chain;
};

const runAnalytics = async (context, { currentClass }) => {
    context.mock.method(Teacher, 'findOne', () => leanChain({ _id: new mongoose.Types.ObjectId() }));
    context.mock.method(TeacherPeriodAssignment, 'aggregate', async () => [{ _id: 2, count: 2 }]);
    context.mock.method(Grade, 'aggregate', async (pipeline) => {
        if (pipeline[1].$group._id === '$class') {
            return [{ classId: classR, avgPercentage: 82, studentCount: 4 }];
        }
        return [{ studentId, classId: classR, avgPercentage: 49 }];
    });

    const captured = {};
    context.mock.method(Student, 'find', (filter) => {
        captured.studentFilter = filter;
        return leanChain([{
            _id: studentId,
            firstName: 'Mohamed',
            lastName: 'FahilBomm',
            currentClass
        }]);
    });
    context.mock.method(Class, 'find', (filter) => {
        captured.classFilter = filter;
        return leanChain([
            { _id: classR, name: 'Grade 5-R' },
            { _id: classT, name: 'Grade 5-T' }
        ]);
    });

    let resolvePayload;
    const payloadPromise = new Promise((resolve) => {
        resolvePayload = resolve;
    });
    const req = {
        schoolId,
        user: { _id: teacherUserId },
        query: {},
        school: { settings: { currentAcademicYear: '2026-2027' } }
    };
    const res = {
        status: () => res,
        json: (body) => {
            resolvePayload(body);
            return res;
        }
    };

    await getMyDashboardAnalytics(req, res, (err) => {
        if (err) throw err;
    });

    const payload = await payloadPromise;
    assert.equal(payload.success, true);
    return { data: payload.data, captured };
};

test('an at-risk student is labelled with the class they are in now', async (context) => {
    const { data, captured } = await runAnalytics(context, { currentClass: classT });

    assert.equal(data.atRiskStudents.length, 1);
    assert.equal(data.atRiskStudents[0].className, 'Grade 5-T');
    assert.equal(String(data.atRiskStudents[0].classId), String(classT));
    // The graded class is still needed for the performance chart
    assert.equal(data.classPerformance[0].className, 'Grade 5-R');
    const lookedUp = captured.classFilter._id.$in.map(String);
    assert.ok(lookedUp.includes(String(classT)));
    assert.ok(lookedUp.includes(String(classR)));
});

test('without a current class the at-risk label falls back to the graded class', async (context) => {
    const { data } = await runAnalytics(context, { currentClass: null });

    assert.equal(data.atRiskStudents[0].className, 'Grade 5-R');
    assert.equal(String(data.atRiskStudents[0].classId), String(classR));
});
