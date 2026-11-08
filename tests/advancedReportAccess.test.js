import test from 'node:test';
import assert from 'node:assert/strict';

import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import Class from '../models/Class.js';
import TeacherPeriodAssignment from '../models/TeacherPeriodAssignment.js';
import { ReportProfile } from '../models/ReportProfile.js';
import { ReportDraft } from '../models/ReportDraft.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import gradeService from '../services/gradeService.js';
import aiService from '../services/aiservice.js';
import emailService from '../services/emailService.js';
import {
    generateAdvancedReport,
    getDraftEmailPreview,
    getEmailStatus,
    getReportHistory
} from '../controllers/advancedReportingController.js';

const SCHOOL_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SCHOOL_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TEACHER_1 = 'cccccccccccccccccccccccc';
const TEACHER_2 = 'dddddddddddddddddddddddd';
const STUDENT_1 = 'eeeeeeeeeeeeeeeeeeeeeeee';
const CLASS_1 = 'ffffffffffffffffffffffff';
const DRAFT_1 = '111111111111111111111111';

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        skip: () => q,
        populate: () => q,
        setOptions: () => q,
        lean: async () => value,
        distinct: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
};

const makeRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    return res;
};


// asyncHandler does not return the handler promise; let its microtasks finish.
const invoke = async (handler, req, res) => {
    handler(req, res, (err) => { res.error = err; });
    await new Promise((resolve) => setImmediate(resolve));
};

const teacherUser = (id = TEACHER_1, school = SCHOOL_A) => ({
    _id: id,
    role: 'teacher',
    roles: ['teacher'],
    school: { _id: school },
    firstName: 'Test',
    lastName: 'Teacher'
});

const studentDoc = () => ({
    _id: STUDENT_1,
    firstName: 'Test',
    lastName: 'Student',
    school: { _id: SCHOOL_A, name: 'School A' },
    currentClass: { _id: CLASS_1, name: 'Grade 5' },
    enrolledClasses: [CLASS_1],
    parentInfo: { motherEmail: 'mother@family.test', motherName: 'Mom' },
    user: { email: 'student@family.test' }
});

const draftDoc = (overrides = {}) => ({
    _id: DRAFT_1,
    school: SCHOOL_A,
    teacher: { _id: TEACHER_1, firstName: 'Test', lastName: 'Teacher', email: 'teacher@school.test' },
    student: studentDoc(),
    status: 'draft',
    content: '<p>Report body</p>',
    language: 'english',
    requestedLanguages: ['en'],
    period: 'November 2026',
    dateRange: { startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30') },
    recipients: { student: true, mother: true, father: true, guardian: true, teacher: false },
    teacherRemark: '',
    evidenceSnapshot: null,
    save: async function () { return this; },
    ...overrides
});

/* ------------------------------------------------------------------ */
/* Route guards                                                        */
/* ------------------------------------------------------------------ */

test('generation route denies the read-only report_viewer role', async () => {
    const { default: router } = await import('../routes/advancedReportRoutes.js');
    const layer = router.stack.find((l) => l.route?.path === '/generate-advanced' && l.route.methods.post);
    assert.ok(layer, 'generate-advanced route exists');
    // Run every guard before the controller handler.
    const guards = layer.route.stack.slice(0, -1).map((s) => s.handle);
    const req = { user: { role: 'report_viewer', roles: ['report_viewer'], school: SCHOOL_A }, schoolId: SCHOOL_A };
    const res = makeRes();
    let reachedController = false;
    for (const guard of guards) {
        let next = false;
        guard(req, res, () => { next = true; });
        if (!next) break;
    }
    reachedController = res.statusCode === 200;
    assert.equal(reachedController, false, 'report_viewer must not reach generation');
    assert.equal(res.statusCode, 403);
});

/* ------------------------------------------------------------------ */
/* Draft preview / status ownership                                    */
/* ------------------------------------------------------------------ */

test('email preview is restricted to the draft owner (or admin), not the whole school', async () => {
    ReportDraft.findById = () => chain(draftDoc());
    const req = { user: teacherUser(TEACHER_2), params: { id: DRAFT_1 }, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(getDraftEmailPreview, req, res);
    assert.equal(res.statusCode, 403);
});

test('email preview cross-school access stays denied', async () => {
    ReportDraft.findById = () => chain(draftDoc({ school: SCHOOL_B }));
    const req = { user: teacherUser(TEACHER_1, SCHOOL_A), params: { id: DRAFT_1 }, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(getDraftEmailPreview, req, res);
    assert.equal(res.statusCode, 403);
});

test('email preview owner can read the preview', async () => {
    ReportDraft.findById = () => chain(draftDoc());
    const req = { user: teacherUser(TEACHER_1), params: { id: DRAFT_1 }, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(getDraftEmailPreview, req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.html.includes('Report body'));
});

test('email status is restricted to the draft owner for teachers', async () => {
    ReportDraft.findById = () => chain(draftDoc());
    emailService.getEmailStatus = async () => ({ total: 0, sent: 0, failed: 0, pending: 0, details: [] });
    const req = { user: teacherUser(TEACHER_2), params: { reportId: DRAFT_1 }, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(getEmailStatus, req, res);
    assert.equal(res.statusCode, 403);
});

test('history query scopes teachers to their own reports', async () => {
    let capturedQuery = null;
    AITokenUsage.find = (query) => { capturedQuery = query; return chain([]); };
    AITokenUsage.countDocuments = async () => 0;
    const req = { user: teacherUser(TEACHER_1), query: {}, schoolId: SCHOOL_A };
    const res = makeRes();
    await invoke(getReportHistory, req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(String(capturedQuery.user), TEACHER_1, 'teacher history must filter by the requesting user');
});

/* ------------------------------------------------------------------ */
/* Generation: teacher must actually have access to the student        */
/* ------------------------------------------------------------------ */

test('generation denies a teacher with no assignment to the student', async () => {
    Student.findById = () => chain(studentDoc());
    // No Teacher profile => no class assignments => no access.
    Teacher.findOne = () => chain(null);
    ReportProfile.resolveEffective = async () => null;
    gradeService.getStudentGradesByDateRange = async () => [];

    const req = {
        user: teacherUser(TEACHER_1),
        schoolId: SCHOOL_A,
        body: { studentId: STUDENT_1, reportType: 'monthly', sources: ['grades'] }
    };
    const res = makeRes();
    await invoke(generateAdvancedReport, req, res);
    assert.equal(res.statusCode, 403);
});

test('generation still works for a teacher assigned to the student class', async () => {
    Student.findById = () => chain(studentDoc());
    Student.findOne = () => chain({ currentClass: CLASS_1, enrolledClasses: [CLASS_1] });
    Teacher.findOne = () => chain({ _id: '999999999999999999999999', user: TEACHER_1 });
    Teacher.findById = () => chain({ user: TEACHER_1, assignedClasses: [] });
    Class.find = () => chain([CLASS_1]);
    TeacherPeriodAssignment.find = () => chain([]);
    ReportProfile.resolveEffective = async () => null;
    gradeService.getStudentGradesByDateRange = async () => [
        { marks: 8, maxMarks: 10, subject: { name: 'Math' }, gradeType: 'quiz', date: new Date('2026-11-05') }
    ];
    aiService.generateAdvancedReport = async () => ({
        text: '<p>Generated</p>',
        language: 'english',
        requestedLanguages: ['en'],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
    let created = null;
    ReportDraft.create = async (doc) => {
        created = doc;
        return { _id: DRAFT_1, status: 'draft', createdAt: new Date(), ...doc };
    };

    const req = {
        user: teacherUser(TEACHER_1),
        schoolId: SCHOOL_A,
        body: { studentId: STUDENT_1, reportType: 'monthly', sources: ['grades'] }
    };
    const res = makeRes();
    await invoke(generateAdvancedReport, req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.ok(created, 'a draft is saved');
});

test('generation rejects an empty source selection instead of running every collector', async () => {
    Student.findById = () => chain(studentDoc());
    Student.findOne = () => chain({ currentClass: CLASS_1, enrolledClasses: [CLASS_1] });
    Teacher.findOne = () => chain({ _id: '999999999999999999999999', user: TEACHER_1 });
    Teacher.findById = () => chain({ user: TEACHER_1, assignedClasses: [] });
    Class.find = () => chain([CLASS_1]);
    TeacherPeriodAssignment.find = () => chain([]);
    ReportProfile.resolveEffective = async () => null;
    let evidenceCalled = false;
    gradeService.getStudentGradesByDateRange = async () => { evidenceCalled = true; return []; };

    const req = {
        user: teacherUser(TEACHER_1),
        schoolId: SCHOOL_A,
        body: { studentId: STUDENT_1, reportType: 'monthly', sources: [] }
    };
    const res = makeRes();
    await invoke(generateAdvancedReport, req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(evidenceCalled, false, 'no collector may run for an empty source selection');
});