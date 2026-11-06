import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import Assignment from '../models/Assignment.js';
import AssignmentType from '../models/AssignmentType.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import {
    createAssignment,
    draftAssignmentSummary,
    getAssignmentGradebook,
    gradeAssignment,
    updateAssignment
} from '../controllers/assignmentController.js';
import { draftLessonSummaryFromText } from '../services/lessonSummaryAiService.js';

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_VISION_MODEL', 'OPENAI_FALLBACK_MODEL', 'OPENAI_BASE_URL'];

const withOpenAiEnv = (t, values = {}) => {
    const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.OPENAI_API_KEY = 'sk-test';
    Object.assign(process.env, values);
    t.after(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });
};

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const openAiReply = (text) => ({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 500, completion_tokens: 120, total_tokens: 620 }
});

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveResponse;
    let rejectResponse;
    const responseDone = new Promise((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
    });
    response.status = function setStatus(code) {
        this.statusCode = code;
        return this;
    };
    response.json = function sendJson(body) {
        this.body = body;
        resolveResponse();
        return this;
    };
    return { response, responseDone, rejectResponse };
};

const invoke = async (handler, req) => {
    const { response, responseDone, rejectResponse } = makeResponse();
    await handler(req, response, (error) => rejectResponse(error));
    await responseDone;
    return response;
};

const adminReq = (extra = {}) => ({
    schoolId: 'school-1',
    user: { role: 'admin', _id: 'admin-1' },
    ...extra
});

test('a valid model reply becomes a title and instructions', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        title: '  States of matter  ',
        instructions: '  We compared solids, liquids and gases.  '
    }))));

    const result = await draftLessonSummaryFromText({ sourceText: 'Particles behave differently in each state.' });
    assert.equal(result.title, 'States of matter');
    assert.equal(result.instructions, 'We compared solids, liquids and gases.');
});

test('the draft is capped to the schema limits', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        title: 't'.repeat(300),
        instructions: 'i'.repeat(6000)
    }))));

    const result = await draftLessonSummaryFromText({ sourceText: 'Some material' });
    assert.equal(result.title.length, 200);
    assert.equal(result.instructions.length, 5000);
});

test('a fenced JSON reply is still read', async (t) => {
    withOpenAiEnv(t);
    const payload = { title: 'Lesson title', instructions: 'Lesson summary.' };
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)));

    const result = await draftLessonSummaryFromText({ sourceText: 'Some material' });
    assert.equal(result.title, 'Lesson title');
});

test('two unusable replies fail with a retry-shaped error', async (t) => {
    withOpenAiEnv(t);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls += 1;
        return jsonResponse(openAiReply('I am sorry, I cannot do that.'));
    });

    await assert.rejects(
        () => draftLessonSummaryFromText({ sourceText: 'Some material' }),
        (error) => error.code === 'LESSON_SUMMARY_RESPONSE_INVALID' && calls === 2
    );
});

test('a reply missing the summary is refused', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({ title: 'Only a title' }))));

    await assert.rejects(
        () => draftLessonSummaryFromText({ sourceText: 'Some material' }),
        (error) => error.code === 'LESSON_SUMMARY_RESPONSE_INVALID'
    );
});

test('an empty source is refused before any AI call', async () => {
    await assert.rejects(
        () => draftLessonSummaryFromText({ sourceText: '   ' }),
        (error) => error.code === 'LESSON_SUMMARY_SOURCE_EMPTY'
    );
});

const lessonSummaryType = {
    _id: 'type-summary',
    key: 'lesson_summary',
    name: 'Lesson Summary',
    defaults: { maxMarks: 0, allowLateSubmission: false, notifyOnAssign: true, notifyOnGrade: false }
};

const homeworkType = {
    _id: 'type-homework',
    key: 'homework',
    name: 'Homework',
    defaults: { maxMarks: 10, allowLateSubmission: true, notifyOnAssign: true, notifyOnGrade: true }
};

const classDoc = {
    _id: 'class-1',
    academicYear: '2026-2027',
    subjects: [{ subject: 'subject-1', teacher: 'teacher-1' }],
    classTeacher: 'teacher-1'
};

const mockCreateDeps = (t, { type, onCreate }) => {
    t.mock.method(AssignmentType, 'bulkWrite', async () => ({}));
    t.mock.method(Class, 'findOne', async () => classDoc);
    t.mock.method(Class, 'findById', async () => classDoc);
    t.mock.method(Teacher, 'findOne', () => ({
        select: () => ({ lean: async () => ({ _id: 'teacher-1' }) })
    }));
    t.mock.method(AssignmentType, 'findOne', async () => type);
    t.mock.method(Assignment, 'create', async (doc) => {
        onCreate?.(doc);
        return { ...doc, _id: 'assignment-1' };
    });
    t.mock.method(Assignment, 'findById', () => ({
        populate() { return this; },
        lean: async () => ({ ...lastCreated, _id: 'assignment-1' })
    }));
    let lastCreated = null;
    return { setCreated: (doc) => { lastCreated = doc; } };
};

test('creating a lesson summary saves it ungraded with zero marks', async (t) => {
    let created = null;
    const deps = mockCreateDeps(t, {
        type: lessonSummaryType,
        onCreate: (doc) => { created = doc; deps.setCreated(doc); }
    });

    const response = await invoke(createAssignment, adminReq({
        body: {
            classId: 'class-1',
            subjectId: 'subject-1',
            assignmentTypeKey: 'lesson_summary',
            title: 'States of matter',
            instructions: 'We compared solids, liquids and gases.',
            maxMarks: 25,
            notifyOnGrade: true,
            notifyOnAssign: false
        }
    }));

    assert.equal(response.statusCode, 201);
    assert.equal(created.maxMarks, 0);
    assert.equal(created.isGraded, false);
    assert.equal(created.notifyOnGrade, false);
    assert.equal(created.notifyOnAssign, false);
    const summary = response.body.data.assignment;
    assert.equal(summary.isGraded, false);
    assert.equal(summary.maxMarks, 0);
    assert.equal(summary.notifyOnGrade, false);
});

test('graded types keep the positive-marks fallback even when sent zero', async (t) => {
    let created = null;
    const deps = mockCreateDeps(t, {
        type: homeworkType,
        onCreate: (doc) => { created = doc; deps.setCreated(doc); }
    });

    const response = await invoke(createAssignment, adminReq({
        body: {
            classId: 'class-1',
            subjectId: 'subject-1',
            assignmentTypeKey: 'homework',
            title: 'Practice sheet',
            maxMarks: 0,
            notifyOnAssign: false
        }
    }));

    assert.equal(response.statusCode, 201);
    assert.equal(created.maxMarks, 10);
    assert.equal(created.isGraded, true);
    assert.equal(response.body.data.assignment.isGraded, true);
});

test('grading an ungraded assignment is refused', async (t) => {
    t.mock.method(Assignment, 'findOne', async () => ({
        _id: 'assignment-1',
        school: 'school-1',
        status: 'published',
        isGraded: false,
        assignmentTypeKey: 'lesson_summary'
    }));

    const response = await invoke(gradeAssignment, adminReq({
        params: { id: 'assignment-1' },
        body: { rows: [{ studentId: 'student-1', marks: 5 }] }
    }));

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /not graded/i);
});

test('the gradebook endpoint stays readable and flags the assignment ungraded', async (t) => {
    const assignment = {
        _id: 'assignment-1',
        school: 'school-1',
        class: 'class-1',
        subject: 'subject-1',
        status: 'published',
        isGraded: false,
        maxMarks: 0,
        assignmentTypeKey: 'lesson_summary',
        title: 'States of matter',
        scope: 'class',
        excusedStudentIds: []
    };
    t.mock.method(Assignment, 'findOne', () => ({
        populate() { return this; },
        lean: async () => assignment
    }));
    t.mock.method(Student, 'find', () => ({
        select: () => ({ lean: async () => [] })
    }));
    t.mock.method(Grade, 'find', () => ({
        select: () => ({ lean: async () => [] })
    }));

    const response = await invoke(getAssignmentGradebook, adminReq({ params: { id: 'assignment-1' } }));

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.isGraded, false);
    assert.equal(response.body.data.assignment.isGraded, false);
    assert.deepEqual(response.body.data.rows, []);
});

const mockUpdateDeps = (t, { assignment, nextType, hasGrades }) => {
    t.mock.method(AssignmentType, 'bulkWrite', async () => ({}));
    t.mock.method(Assignment, 'findOne', async () => assignment);
    t.mock.method(Class, 'findOne', async () => classDoc);
    t.mock.method(AssignmentType, 'findOne', async () => nextType);
    t.mock.method(Grade, 'exists', async () => hasGrades ? { _id: 'grade-1' } : null);
    t.mock.method(Assignment, 'findById', () => ({
        populate() { return this; },
        lean: async () => assignment
    }));
};

const updatableAssignment = (overrides = {}) => ({
    _id: 'assignment-1',
    school: 'school-1',
    class: 'class-1',
    subject: 'subject-1',
    academicYear: '2026-2027',
    status: 'published',
    title: 'Practice sheet',
    instructions: '',
    assignmentType: 'type-homework',
    assignmentTypeKey: 'homework',
    assignmentTypeName: 'Homework',
    maxMarks: 10,
    isGraded: true,
    notifyOnAssign: true,
    notifyOnGrade: true,
    notifyAudience: 'both',
    scope: 'class',
    studentIds: [],
    lessonPlanIds: [],
    links: [],
    attachments: [],
    metadata: null,
    assignedDate: new Date(),
    dueDate: null,
    publishedAt: new Date(),
    save: async function save() { return this; },
    ...overrides
});

test('switching an assignment with grades into lesson summary is refused', async (t) => {
    const assignment = updatableAssignment();
    mockUpdateDeps(t, { assignment, nextType: lessonSummaryType, hasGrades: true });

    const response = await invoke(updateAssignment, adminReq({
        params: { id: 'assignment-1' },
        body: { assignmentTypeKey: 'lesson_summary' }
    }));

    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /cannot become ungraded/i);
    assert.equal(assignment.isGraded, true);
    assert.equal(assignment.maxMarks, 10);
});

test('switching an ungraded-eligible assignment into lesson summary forces zero marks', async (t) => {
    const assignment = updatableAssignment();
    mockUpdateDeps(t, { assignment, nextType: lessonSummaryType, hasGrades: false });

    const response = await invoke(updateAssignment, adminReq({
        params: { id: 'assignment-1' },
        body: { assignmentTypeKey: 'lesson_summary', maxMarks: 50, notifyOnGrade: true }
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(assignment.maxMarks, 0);
    assert.equal(assignment.isGraded, false);
    assert.equal(assignment.notifyOnGrade, false);
    assert.equal(assignment.assignmentTypeKey, 'lesson_summary');
});

test('switching back to a graded type restores marks with a positive fallback', async (t) => {
    const assignment = updatableAssignment({
        assignmentType: 'type-summary',
        assignmentTypeKey: 'lesson_summary',
        assignmentTypeName: 'Lesson Summary',
        maxMarks: 0,
        isGraded: false,
        notifyOnGrade: false
    });
    mockUpdateDeps(t, { assignment, nextType: homeworkType, hasGrades: false });

    const response = await invoke(updateAssignment, adminReq({
        params: { id: 'assignment-1' },
        body: { assignmentTypeKey: 'homework' }
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(assignment.isGraded, true);
    assert.equal(assignment.maxMarks, 10);
});

test('drafting a summary without a file asks for one', async () => {
    const response = await invoke(draftAssignmentSummary, adminReq({ body: {} }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'DRAFT_SOURCE_REQUIRED');
});