import assert from 'node:assert/strict';
import test from 'node:test';

import { createAcademicIntelligenceController } from '../controllers/academicIntelligenceController.js';

const buildQuery = (value) => ({
    populate() {
        return this;
    },
    select() {
        return this;
    },
    lean() {
        return Promise.resolve(value);
    }
});

const runController = (handler, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            resolve({ statusCode: this.statusCode, payload, error: null });
            return this;
        }
    };

    handler(req, res, (error) => {
        resolve({ statusCode: res.statusCode, payload: null, error });
    });
});

const buildReq = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    school: { _id: 'school-1' },
    schoolId: 'school-1',
    academicYear: '2025-2026',
    user: { _id: 'actor-1', role: 'admin', email: 'parent@school.test' },
    ...overrides
});

test('GET /students/:id/learning-trace controller returns success contract', async () => {
    const student = { _id: 'student-1', currentClass: { _id: 'class-1' } };
    let receivedPayload = null;

    const controller = createAcademicIntelligenceController({
        Student: {
            findOne: () => buildQuery(student)
        },
        getStudentLearningTrace: async (payload) => {
            receivedPayload = payload;
            return { studentId: payload.studentId, entries: [{ assessmentGroupId: 'asg-1' }] };
        }
    });

    const result = await runController(
        controller.getStudentLearningTraceController,
        buildReq({ params: { id: 'student-1' }, query: { subjectId: 'subject-1', from: '2026-03-01', to: '2026-03-15' } })
    );

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.equal(result.payload.data.studentId, 'student-1');
    assert.equal(receivedPayload.subjectId, 'subject-1');
    assert.equal(receivedPayload.dateRange.$gte.getFullYear(), 2026);
    assert.equal(receivedPayload.dateRange.$gte.getMonth(), 2);
    assert.equal(receivedPayload.dateRange.$gte.getDate(), 1);
    assert.equal(receivedPayload.dateRange.$gte.getHours(), 0);
    assert.equal(receivedPayload.dateRange.$gte.getMinutes(), 0);
    assert.equal(receivedPayload.dateRange.$lte.getFullYear(), 2026);
    assert.equal(receivedPayload.dateRange.$lte.getMonth(), 2);
    assert.equal(receivedPayload.dateRange.$lte.getDate(), 15);
    assert.equal(receivedPayload.dateRange.$lte.getHours(), 23);
    assert.equal(receivedPayload.dateRange.$lte.getMinutes(), 59);
});

test('POST /assessments/:id/reflection controller blocks duplicate reflections', async () => {
    const controller = createAcademicIntelligenceController({
        Class: {
            findOne: () => buildQuery({ _id: 'class-1', department: 'dep-1' })
        },
        getAssessmentObjectiveAnalysis: async () => ({
            assessmentGroupId: 'asg-1',
            class: { _id: 'class-1' },
            subject: { _id: 'subject-1' },
            weakObjectives: [{ objectiveKey: 'obj-1', objectiveName: 'Main idea' }]
        }),
        getAssessmentReflection: async () => ({ _id: 'reflection-1' })
    });

    const result = await runController(
        controller.createAssessmentReflectionController,
        buildReq({ params: { id: 'assessment-1' }, body: { whatWorked: 'Small groups' } })
    );

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 409);
    assert.equal(result.payload.success, false);
    assert.match(result.payload.message, /already exists/i);
});

test('GET /classes/:id/objective-performance controller fans out by teacher subject assignments', async () => {
    const requestedSubjects = [];

    const controller = createAcademicIntelligenceController({
        Class: {
            findOne: () => buildQuery({ _id: 'class-1', department: 'dep-1' })
        },
        resolveTeacherProfile: async () => ({ _id: 'teacher-1' }),
        getTeacherAssignments: async () => ([
            { classId: 'class-1', subjectId: 'subject-1' },
            { classId: 'class-1', subjectId: 'subject-2' },
            { classId: 'class-2', subjectId: 'subject-3' }
        ]),
        getClassObjectivePerformance: async ({ subjectId }) => {
            requestedSubjects.push(subjectId);
            return { subjectId, weakObjectives: [] };
        }
    });

    const result = await runController(
        controller.getClassObjectivePerformanceController,
        buildReq({ params: { id: 'class-1' }, user: { _id: 'user-1', role: 'teacher' } })
    );

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.success, true);
    assert.deepEqual(requestedSubjects, ['subject-1', 'subject-2']);
    assert.equal(result.payload.data.classId, 'class-1');
    assert.equal(result.payload.data.subjects.length, 2);
});

test('GET /parent/children/:childId/learning-summary controller denies unlinked parents', async () => {
    const controller = createAcademicIntelligenceController({
        Student: {
            findOne: () => buildQuery({
                _id: 'student-1',
                parentInfo: {
                    fatherEmail: 'other@school.test'
                }
            })
        }
    });

    const result = await runController(
        controller.getParentChildLearningSummaryController,
        buildReq({ params: { childId: 'student-1' }, user: { _id: 'parent-1', role: 'parent', email: 'parent@school.test' } })
    );

    assert.equal(result.error, null);
    assert.equal(result.statusCode, 403);
    assert.equal(result.payload.success, false);
    assert.equal(result.payload.message, 'Access denied');
});