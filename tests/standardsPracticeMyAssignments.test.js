import assert from 'node:assert/strict';
import test from 'node:test';

import { getMyAssignments } from '../controllers/standardsPracticeController.js';
import Class from '../models/Class.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import StandardAssignment from '../models/StandardAssignment.js';
import StandardsGradebookEntry from '../models/StandardsGradebookEntry.js';
import Student from '../models/Student.js';
import logger from '../utils/logger.js';

const classId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439021';
const standardId = '507f1f77bcf86cd799439031';
const orphanAssignmentId = '507f1f77bcf86cd799439041';

const assignmentRow = (id, standard) => ({
    _id: id,
    standard,
    practiceConfig: {},
    toObject: () => ({ _id: id, standard })
});

const populatedStandard = {
    _id: standardId,
    code: 'READ-1',
    name: 'Read closely',
    masteryThreshold: 80,
    masteryMinQuestions: 5
};

const stubSources = (t, rows) => {
    const masteryStandardIds = [];
    const warnings = [];

    t.mock.method(Student, 'findOne', () => ({
        populate: async () => ({ _id: studentId, currentClass: { _id: classId } })
    }));
    t.mock.method(Class, 'find', () => ({
        select: () => ({ lean: async () => [{ _id: classId }] })
    }));
    t.mock.method(StandardAssignment, 'find', () => {
        const chain = {
            populate: () => chain,
            sort: async () => rows
        };
        return chain;
    });
    t.mock.method(StandardsGradebookEntry, 'find', () => ({
        select: () => ({ lean: async () => [] })
    }));
    t.mock.method(PracticeAttempt, 'calculateMastery', async (sid, standard) => {
        masteryStandardIds.push(String(standard));
        return { totalAttempts: 4, isMastered: false };
    });
    t.mock.method(logger, 'warn', (message, meta) => warnings.push({ message, meta }));

    return { masteryStandardIds, warnings };
};

const requestMyAssignments = () =>
    new Promise((resolve, reject) => {
        const req = {
            user: { _id: 'user-1', role: 'student' },
            schoolId: 'school-1',
            academicYear: '2026-2027',
            query: {},
            body: {},
            headers: {}
        };
        getMyAssignments(req, { json: resolve }, reject);
    });

test('a live standard reference still reports mastery progress', async (t) => {
    const { masteryStandardIds, warnings } = stubSources(t, [
        assignmentRow('507f1f77bcf86cd799439051', populatedStandard)
    ]);

    const payload = await requestMyAssignments();

    assert.equal(payload.data.assignments.length, 1);
    assert.equal(payload.data.assignments[0].progressStatus, 'in_progress');
    assert.deepEqual(masteryStandardIds, [standardId]);
    assert.deepEqual(warnings, []);
});

test('an assignment whose standard was deleted is skipped, not served broken', async (t) => {
    const { masteryStandardIds, warnings } = stubSources(t, [
        assignmentRow(orphanAssignmentId, null),
        assignmentRow('507f1f77bcf86cd799439051', populatedStandard)
    ]);

    const payload = await requestMyAssignments();

    assert.deepEqual(
        payload.data.assignments.map((row) => String(row._id)),
        ['507f1f77bcf86cd799439051']
    );
    assert.deepEqual(masteryStandardIds, [standardId]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, 'practice_assignment_standard_missing');
    assert.deepEqual(warnings[0].meta.assignmentIds, [orphanAssignmentId]);
});

test('an empty dashboard is a valid answer when no standard survives', async (t) => {
    stubSources(t, [assignmentRow(orphanAssignmentId, null)]);

    const payload = await requestMyAssignments();

    assert.deepEqual(payload.data.assignments, []);
});
