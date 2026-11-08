import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEvidencePack } from '../services/reportEvidence/index.js';
import * as homeworkCollector from '../services/reportEvidence/homework.js';
import * as gradesCollector from '../services/reportEvidence/grades.js';
import * as standardsCollector from '../services/reportEvidence/standards.js';
import gradeService from '../services/gradeService.js';
import HomeworkAssignment from '../models/HomeworkAssignment.js';
import HomeworkSubmission from '../models/HomeworkSubmission.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import LiveSession from '../models/LiveSession.js';
import LiveResponse from '../models/LiveResponse.js';
import Attendance from '../models/Attendance.js';
import BehaviorIncident from '../models/BehaviorIncident.js';
import MasteryRecord from '../models/MasteryRecord.js';
import StandardsGradebookEntry from '../models/StandardsGradebookEntry.js';
import Standard from '../models/Standard.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const STUDENT = 'eeeeeeeeeeeeeeeeeeeeeeee';
const CLASS = 'ffffffffffffffffffffffff';

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        populate: () => q,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
};

const emptyAllCollectors = () => {
    SpellingSession.find = () => chain([]);
    SpellingRetestItem.find = () => chain([]);
    LiveSession.find = () => chain([]);
    LiveResponse.find = () => chain([]);
    Attendance.find = () => chain([]);
    HomeworkAssignment.find = () => chain([]);
    HomeworkSubmission.find = () => chain([]);
    BehaviorIncident.find = () => chain([]);
    MasteryRecord.find = () => chain([]);
    StandardsGradebookEntry.find = () => chain([]);
    Standard.find = () => chain([]);
};

const baseParams = {
    schoolId: SCHOOL,
    studentId: STUDENT,
    classId: CLASS,
    startDate: new Date('2026-11-01'),
    endDate: new Date('2026-11-30')
};

/* ------------------------------------------------------------------ */
/* Builder boundary: omitted vs empty sources                          */
/* ------------------------------------------------------------------ */

test('an empty source selection runs no collectors at all', async () => {
    emptyAllCollectors();
    let gradesCalled = false;
    gradeService.getStudentGradesByDateRange = async () => { gradesCalled = true; return []; };
    const pack = await buildEvidencePack({ ...baseParams, sources: [] });
    assert.equal(Object.keys(pack.results).length, 0);
    assert.equal(pack.availableSources.length, 0);
    assert.equal(gradesCalled, false, 'empty must not fall back to all sources');
});

test('omitted sources still run every collector', async () => {
    emptyAllCollectors();
    gradeService.getStudentGradesByDateRange = async () => [];
    const pack = await buildEvidencePack({ ...baseParams });
    assert.equal(Object.keys(pack.results).length, 7);
});

/* ------------------------------------------------------------------ */
/* Homework accuracy                                                   */
/* ------------------------------------------------------------------ */

test('homework due in the future is not overdue', async () => {
    const now = Date.now();
    HomeworkAssignment.find = () => chain([{
        _id: '333333333333333333333333',
        title: 'Future work',
        dueDate: new Date(now + 24 * 3600 * 1000),
        maxMarks: 10,
        scope: 'class'
    }]);
    HomeworkSubmission.find = () => chain([]);
    const result = await homeworkCollector.collect({
        ...baseParams,
        startDate: new Date(now - 24 * 3600 * 1000),
        endDate: new Date(now + 2 * 24 * 3600 * 1000)
    });
    assert.equal(result.available, true);
    assert.equal(result.metrics.overdue, 0, 'future-due work is upcoming, not overdue');
    assert.ok(!result.facts.some((f) => /overdue/i.test(f)), `no overdue claim allowed: ${result.facts.join(' | ')}`);
});

test('selected-student assignments that exclude this student are not counted', async () => {
    HomeworkAssignment.find = (query) => {
        // The collector must push the audience filter into the query or filter rows.
        const rows = [{
            _id: '333333333333333333333333',
            title: 'For someone else',
            dueDate: new Date('2026-11-05'),
            maxMarks: 10,
            scope: 'selected_students',
            studentIds: ['999999999999999999999999']
        }];
        return chain(rows);
    };
    HomeworkSubmission.find = () => chain([]);
    const result = await homeworkCollector.collect(baseParams);
    assert.equal(result.available, false, 'assignment targeted at another student must be excluded');
});

test('homework trend orders by due date even when the query returns unsorted rows', async () => {
    const d = (day) => new Date(`2026-11-${String(day).padStart(2, '0')}`);
    const assignments = [
        { _id: 'a3', title: 'A3', dueDate: d(3), maxMarks: 10, scope: 'class' },
        { _id: 'a1', title: 'A1', dueDate: d(1), maxMarks: 10, scope: 'class' },
        { _id: 'a4', title: 'A4', dueDate: d(4), maxMarks: 10, scope: 'class' },
        { _id: 'a2', title: 'A2', dueDate: d(2), maxMarks: 10, scope: 'class' }
    ];
    HomeworkAssignment.find = () => chain(assignments);
    HomeworkSubmission.find = () => chain([
        { homeworkAssignment: 'a1', status: 'submitted' },
        { homeworkAssignment: 'a2', status: 'submitted' }
    ]);
    const result = await homeworkCollector.collect(baseParams);
    assert.equal(result.trend, 'declining', 'older half done, newer half missing => declining');
});

/* ------------------------------------------------------------------ */
/* Grades accuracy                                                     */
/* ------------------------------------------------------------------ */

test('fewer than four grade entries are insufficient data, not stable', async () => {
    gradeService.getStudentGradesByDateRange = async () => [
        { marks: 8, maxMarks: 10, subject: { name: 'Math' }, date: new Date('2026-11-02') },
        { marks: 9, maxMarks: 10, subject: { name: 'Math' }, date: new Date('2026-11-03') }
    ];
    const result = await gradesCollector.collect(baseParams);
    assert.equal(result.trend, 'insufficient_data');
});

test('a zero max-marks denominator never produces a fabricated 0% average', async () => {
    gradeService.getStudentGradesByDateRange = async () => [
        { marks: 0, maxMarks: 0, subject: { name: 'Math' }, date: new Date('2026-11-02') }
    ];
    const result = await gradesCollector.collect(baseParams);
    assert.equal(result.available, true);
    assert.ok(result.metrics.average == null, 'undefined average must stay undefined, not 0');
    assert.ok(!result.facts.some((f) => /Overall average: 0%/.test(f)));
});

/* ------------------------------------------------------------------ */
/* Standards accuracy                                                  */
/* ------------------------------------------------------------------ */

test('standards entries without percentages do not fabricate a 0% overall', async () => {
    MasteryRecord.find = () => chain([]);
    StandardsGradebookEntry.find = () => chain([
        { standard: '444444444444444444444444', percentage: null, submittedAt: new Date('2026-11-05') }
    ]);
    Standard.find = () => chain([]);
    const result = await standardsCollector.collect(baseParams);
    assert.equal(result.available, true);
    assert.ok(result.metrics.overallPct == null, 'no measured percentage => no overall figure');
});