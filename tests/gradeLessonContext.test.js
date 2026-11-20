import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { setImmediate as runAfterCallbacks } from 'node:timers';
import { normalizeLessonContext, LESSON_TITLE_MAX, LESSON_SUMMARY_MAX } from '../helpers/gradeLessonContext.js';
import notificationService, {
    buildLessonContextHtml,
    buildLessonContextPlainText,
    groupGradesByAssessmentGroup
} from '../services/notificationService.js';
import {
    draftGradeLessonSummary,
    extractGradeLessonSource,
    previewGradeLessonEmail
} from '../controllers/gradeLessonDraftController.js';
import {
    bulkAddGrades,
    bulkUpdateGrades,
    getGradesByAssessmentGroup
} from '../controllers/gradebookController.js';
import Grade from '../models/Grade.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import School from '../models/School.js';
import GradebookConfig from '../models/GradebookConfig.js';
import GradeAuditLog from '../models/GradeAuditLog.js';

const makeResponse = () => {
    const response = { statusCode: 200, body: null };
    let resolveResponse;
    const responseDone = new Promise((resolve) => { resolveResponse = resolve; });
    response.status = function setStatus(code) {
        this.statusCode = code;
        return this;
    };
    response.json = function sendJson(body) {
        this.body = body;
        resolveResponse();
        return this;
    };
    return { response, responseDone };
};

const invoke = async (handler, req) => {
    const { response, responseDone } = makeResponse();
    let nextError = null;
    await handler(req, response, (error) => {
        nextError = error;
        resolveNothing();
    });
    function resolveNothing() {
        // asyncHandler error path never calls res.json; settle via microtask
    }
    await Promise.race([responseDone, new Promise((resolve) => runAfterCallbacks(resolve))]);
    return { response, nextError };
};

const adminReq = (body = {}, extra = {}) => ({
    schoolId: 'school-1',
    user: { role: 'admin', _id: 'admin-1' },
    body,
    ...extra
});

const student = {
    firstName: 'Sami',
    lastName: 'A.',
    fullName: 'Sami A.',
    currentClass: 'class-1',
    enrolledClasses: []
};

const lessonGrade = {
    title: 'Opinion writing: supporting a point of view',
    lessonSummary: 'In this lesson, we built an opinion paragraph.\n- We wrote a topic sentence.\n- We added two reasons.',
    remarks: 'Clear topic sentence (+2)',
    marks: 8,
    maxMarks: 10,
    date: new Date('2026-11-19T12:00:00Z'),
    gradeType: 'classwork',
    subjectName: 'English',
    subjectNameAr: 'اللغة الإنجليزية'
};

// ---------- normalizeLessonContext ----------

test('normalizeLessonContext trims and accepts empty context', () => {
    assert.deepEqual(normalizeLessonContext({}), { title: '', lessonSummary: '' });
    assert.deepEqual(
        normalizeLessonContext({ title: '  Fractions  ', lessonSummary: '  We compared fractions.  ' }),
        { title: 'Fractions', lessonSummary: 'We compared fractions.' }
    );
});

test('normalizeLessonContext accepts title-only', () => {
    assert.deepEqual(
        normalizeLessonContext({ title: 'Fractions', lessonSummary: '' }),
        { title: 'Fractions', lessonSummary: '' }
    );
});

test('normalizeLessonContext rejects summary without title', () => {
    assert.throws(
        () => normalizeLessonContext({ title: ' ', lessonSummary: 'We learned.' }),
        (error) => error.statusCode === 400 && error.code === 'LESSON_TITLE_REQUIRED'
    );
});

test('normalizeLessonContext enforces length limits', () => {
    assert.throws(
        () => normalizeLessonContext({ title: 'x'.repeat(LESSON_TITLE_MAX + 1) }),
        (error) => error.code === 'LESSON_TITLE_TOO_LONG'
    );
    assert.throws(
        () => normalizeLessonContext({ title: 'Ok', lessonSummary: 'x'.repeat(LESSON_SUMMARY_MAX + 1) }),
        (error) => error.code === 'LESSON_SUMMARY_TOO_LONG'
    );
});

// ---------- lesson renderers ----------

test('lesson renderers return empty string when no lesson context exists', () => {
    assert.equal(buildLessonContextHtml({}, 'en'), '');
    assert.equal(buildLessonContextPlainText({}, 'en'), '');
    assert.equal(buildLessonContextHtml({ remarks: 'x' }, 'ar'), '');
});

test('lesson HTML renders title, paragraphs and bullets with escaping', () => {
    const html = buildLessonContextHtml({
        title: '<script>alert(1)</script> Fractions & decimals',
        lessonSummary: 'We compared <b>fractions</b>.\n- We used a number line.'
    }, 'en');
    assert.match(html, /What we learned/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&bull;&nbsp;We used a number line\./);
    assert.match(html, /&lt;b&gt;fractions&lt;\/b&gt;/);
    assert.doesNotMatch(html, /class=/);
    assert.doesNotMatch(html, /display:\s*(flex|grid)/);
});

test('lesson HTML is RTL-native in Arabic', () => {
    const html = buildLessonContextHtml({ title: 'الكسور', lessonSummary: 'قارنا الكسور.' }, 'ar');
    assert.match(html, /dir="rtl"/);
    assert.match(html, /text-align:right/);
    assert.match(html, /ما تعلمناه/);
});

test('lesson plain text keeps the same content', () => {
    const text = buildLessonContextPlainText(lessonGrade, 'en');
    assert.match(text, /What we learned/);
    assert.match(text, /Opinion writing: supporting a point of view/);
    assert.match(text, /- We wrote a topic sentence\./);
});

test('groupGradesByAssessmentGroup preserves order and isolates legacy rows', () => {
    const grades = [
        { _id: 'a', assessmentGroupId: 'g1' },
        { _id: 'b' },
        { _id: 'c', assessmentGroupId: 'g1' },
        { _id: 'd', assessmentGroupId: 'g2' }
    ];
    const groups = groupGradesByAssessmentGroup(grades);
    assert.equal(groups.length, 3);
    assert.deepEqual(groups[0].grades.map((g) => g._id), ['a', 'c']);
    assert.equal(groups[1].groupId, '');
    assert.deepEqual(groups[2].grades.map((g) => g._id), ['d']);
});

// ---------- immediate grade update emails ----------

test('immediate grade email text is recipient-neutral with lesson above marks', () => {
    const message = notificationService.formatGradeUpdateMessage(student, lessonGrade, 'en');
    assert.match(message, /Class update for Sami A\./);
    assert.doesNotMatch(message, /Parent/);
    const lessonIndex = message.indexOf('What we learned');
    const marksIndex = message.indexOf('Marks: 8/10');
    assert.ok(lessonIndex > -1 && marksIndex > -1 && lessonIndex < marksIndex);
    assert.match(message, /Teacher's Remarks/);
});

test('immediate grade email text in Arabic uses the neutral greeting', () => {
    const message = notificationService.formatGradeUpdateMessage(student, lessonGrade, 'ar');
    assert.match(message, /تحديث الحصة للطالب Sami A\./);
    assert.doesNotMatch(message, /ولي أمر/);
    assert.match(message, /ما تعلمناه/);
});

test('immediate grade email uses the assignment-graded header with the lesson block before marks', async () => {
    const html = await notificationService.formatGradeUpdateHtml(student, lessonGrade, null, 'en');
    // Same header anatomy as assignment-graded emails: "<type> graded", title, "For <student>"
    assert.match(html, /Classwork graded/);
    assert.match(html, /<h1[^>]*>Opinion writing: supporting a point of view<\/h1>/);
    assert.match(html, /For Sami A\./);
    assert.doesNotMatch(html, /'s Parent/);
    const lessonIndex = html.indexOf('What we learned');
    const marksIndex = html.indexOf('8 / 10');
    assert.ok(lessonIndex > -1 && marksIndex > -1 && lessonIndex < marksIndex);
    // Title appears in <title> and the header h1 only, never in the body block
    assert.equal(html.split('Opinion writing: supporting a point of view').length, 3);
});

test('immediate grade email still shows a title without a summary once, in the header', async () => {
    const titleOnly = { ...lessonGrade, lessonSummary: '' };
    const html = await notificationService.formatGradeUpdateHtml(student, titleOnly, null, 'en');
    assert.equal(html.split('Opinion writing: supporting a point of view').length, 3);
    // No summary means no empty "What we learned" panel
    assert.doesNotMatch(html, /What we learned/);

    const bare = { ...lessonGrade, title: '', lessonSummary: '' };
    const bareHtml = await notificationService.formatGradeUpdateHtml(student, bare, null, 'en');
    assert.match(bareHtml, /Class update/);
    assert.doesNotMatch(bareHtml, /What we learned/);
    assert.match(bareHtml, /8 \/ 10/);
});

// ---------- daily classwork emails ----------

const dailyGrades = [
    {
        _id: 'd1', assessmentGroupId: 'group-a', subject: { name: 'English', nameAr: 'الإنجليزية' },
        category: 'classwork', date: new Date('2026-11-19T08:00:00Z'), marks: 8, maxMarks: 10,
        title: 'Opinion writing', lessonSummary: 'We supported an opinion with two reasons.', remarks: ''
    },
    {
        _id: 'd2', assessmentGroupId: 'group-a', subject: { name: 'English', nameAr: 'الإنجليزية' },
        category: 'classwork', date: new Date('2026-11-19T08:00:00Z'), marks: 6, maxMarks: 10,
        title: 'Opinion writing', lessonSummary: 'We supported an opinion with two reasons.', remarks: 'Good effort (+1)'
    },
    {
        _id: 'd3', assessmentGroupId: 'group-b', subject: { name: 'English', nameAr: 'الإنجليزية' },
        category: 'classwork', date: new Date('2026-11-19T11:00:00Z'), marks: 9, maxMarks: 10,
        title: 'Spelling review', lessonSummary: 'We reviewed the missed words.', remarks: ''
    },
    {
        _id: 'd4', subject: { name: 'English', nameAr: 'الإنجليزية' },
        category: 'classwork', date: new Date('2026-11-19T12:00:00Z'), marks: 5, maxMarks: 10,
        title: 'Legacy quiz', remarks: ''
    }
];

test('daily classwork text shows each distinct lesson once before its rows', async () => {
    const message = await notificationService.formatDailyClassworkUpdateMessage(
        student, dailyGrades, new Date('2026-11-19T12:00:00Z'), 'November', 2026,
        'Daily Classwork Update', null, 'Classwork Summary', 'en'
    );
    assert.equal(message.split('We supported an opinion with two reasons.').length, 2);
    assert.equal(message.split('We reviewed the missed words.').length, 2);
    assert.match(message, /Legacy quiz/);
    assert.match(message, /Daily Average: 70\.0%/);
    const firstLesson = message.indexOf('Opinion writing');
    const firstRow = message.indexOf('8/10');
    assert.ok(firstLesson > -1 && firstLesson < firstRow);
});

test('daily classwork HTML groups by assessmentGroupId, keeps legacy rows and totals', async () => {
    const html = await notificationService.formatDailyClassworkUpdateHtml(
        student, dailyGrades, new Date('2026-11-19T12:00:00Z'), 'November', 2026,
        'Daily Classwork Update', null, 'en'
    );
    assert.equal(html.split('We supported an opinion with two reasons.').length, 2);
    assert.equal(html.split('We reviewed the missed words.').length, 2);
    assert.match(html, /Legacy quiz/);
    assert.match(html, /8 \/ 10/);
    assert.match(html, /6 \/ 10/);
    assert.match(html, /Good effort/);
});

test('daily classwork Arabic HTML renders RTL lesson blocks', async () => {
    const arabicGrades = dailyGrades.slice(0, 2).map((g) => ({
        ...g, title: 'الكتابة الإقناعية', lessonSummary: 'دعمنا رأينا بسببين.'
    }));
    const html = await notificationService.formatDailyClassworkUpdateHtml(
        student, arabicGrades, new Date('2026-11-19T12:00:00Z'), 'نوفمبر', 2026,
        'تقرير العمل الصفي اليومي', null, 'ar'
    );
    assert.match(html, /ما تعلمناه/);
    assert.match(html, /dir="rtl"/);
    assert.equal(html.split('دعمنا رأينا بسببين.').length, 2);
});

test('legacy daily report includes the lesson summary when present', async () => {
    const grades = [{
        subject: { name: 'English' }, marks: 8, maxMarks: 10,
        title: 'Opinion writing', lessonSummary: 'We supported an opinion.', remarks: ''
    }];
    const message = notificationService.formatDailyReportMessage(student, grades, new Date('2026-11-19'), 'en');
    assert.match(message, /What we learned: We supported an opinion\./);
    const html = await notificationService.formatDailyReportHtml(student, grades, new Date('2026-11-19'), null, 'en');
    assert.match(html, /What we learned: We supported an opinion\./);
});

// ---------- draft / source / preview controllers ----------

test('lesson draft endpoint validates scope and source before any AI call', async () => {
    const missingScope = await invoke(draftGradeLessonSummary, adminReq({ sourceText: 'We read chapter 3.' }));
    assert.equal(missingScope.response.statusCode, 400);
    assert.equal(missingScope.response.body.code, 'LESSON_CLASS_SUBJECT_REQUIRED');

    const empty = await invoke(draftGradeLessonSummary, adminReq({ classId: 'class-1', subjectId: 'subject-1', sourceText: '  ' }));
    assert.equal(empty.response.statusCode, 400);
    assert.equal(empty.response.body.code, 'LESSON_SOURCE_EMPTY');

    const tooLong = await invoke(draftGradeLessonSummary, adminReq({
        classId: 'class-1', subjectId: 'subject-1', sourceText: 'x'.repeat(30001)
    }));
    assert.equal(tooLong.response.statusCode, 400);
    assert.equal(tooLong.response.body.code, 'LESSON_SOURCE_TOO_LONG');
});

test('lesson source endpoint rejects non-PDF uploads', async () => {
    const req = adminReq(
        { classId: 'class-1', subjectId: 'subject-1' },
        { file: { mimetype: 'text/csv', buffer: Buffer.from('lesson_title,lesson_summary\nA,B\n', 'utf8') } }
    );
    const { response } = await invoke(extractGradeLessonSource, req);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'LESSON_SOURCE_TYPE_UNSUPPORTED');
});

test('lesson source endpoint rejects images with the honest privacy gate', async () => {
    const req = adminReq(
        { classId: 'class-1', subjectId: 'subject-1' },
        { file: { mimetype: 'image/png', buffer: Buffer.from('fake') } }
    );
    const { response } = await invoke(extractGradeLessonSource, req);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'LESSON_IMAGE_NOT_ENABLED');
});

test('lesson source endpoint rejects a file that is not a real PDF', async () => {
    const req = adminReq(
        { classId: 'class-1', subjectId: 'subject-1' },
        { file: { mimetype: 'application/pdf', buffer: Buffer.from('not a pdf at all') } }
    );
    const { response } = await invoke(extractGradeLessonSource, req);
    assert.equal(response.statusCode, 422);
    assert.equal(response.body.code, 'DOCUMENT_PDF_UNREADABLE');
});

test('lesson source endpoint requires a file and a scope', async () => {
    const noFile = await invoke(extractGradeLessonSource, adminReq({ classId: 'class-1', subjectId: 'subject-1' }));
    assert.equal(noFile.response.body.code, 'LESSON_SOURCE_REQUIRED');
    const noScope = await invoke(extractGradeLessonSource, adminReq({}, { file: { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4') } }));
    assert.equal(noScope.response.body.code, 'LESSON_CLASS_SUBJECT_REQUIRED');
});

const mockPreviewDeps = (t, studentOverride = null) => {
    t.mock.method(Student, 'findOne', async () => studentOverride || student);
    t.mock.method(Subject, 'findById', () => ({
        select: () => ({ lean: async () => ({ name: 'English', nameAr: 'الإنجليزية' }) })
    }));
    t.mock.method(notificationService, '_resolveTeacherName', async () => 'Amina');
    t.mock.method(notificationService, '_resolveSchoolName', async () => 'AMLY');
};

test('email preview renders the real formatter without saving or sending', async (t) => {
    mockPreviewDeps(t);
    const { response } = await invoke(previewGradeLessonEmail, adminReq({
        classId: 'class-1', subjectId: 'subject-1', studentId: 'student-1',
        title: lessonGrade.title, lessonSummary: lessonGrade.lessonSummary,
        remarks: lessonGrade.remarks, marks: 8, maxMarks: 10, date: '2026-11-19', language: 'en'
    }));
    assert.equal(response.statusCode, 200);
    assert.match(response.body.data.html, /What we learned/);
    assert.match(response.body.data.html, /Classwork graded/);
    assert.match(response.body.data.html, /For Sami A\./);
    assert.match(response.body.data.html, /8 \/ 10/);
});

test('email preview rejects pupils outside the class and invalid marks', async (t) => {
    mockPreviewDeps(t, { ...student, currentClass: 'other-class', enrolledClasses: ['another'] });
    const outside = await invoke(previewGradeLessonEmail, adminReq({
        classId: 'class-1', subjectId: 'subject-1', studentId: 'student-1', marks: 8, maxMarks: 10
    }));
    assert.equal(outside.response.statusCode, 403);
    assert.equal(outside.response.body.code, 'LESSON_STUDENT_NOT_IN_CLASS');

    mockPreviewDeps(t);
    const badMarks = await invoke(previewGradeLessonEmail, adminReq({
        classId: 'class-1', subjectId: 'subject-1', studentId: 'student-1', marks: 11, maxMarks: 10
    }));
    assert.equal(badMarks.response.statusCode, 400);
    assert.equal(badMarks.response.body.code, 'LESSON_MARKS_INVALID');
});

// ---------- bulk create / update / group read ----------

const mockBulkAddDeps = (t, { insertMany } = {}) => {
    t.mock.method(Subject, 'findById', async () => ({ name: 'English', nameAr: 'الإنجليزية', dailyMaxMarks: 10 }));
    t.mock.method(GradebookConfig, 'findOne', () => ({
        lean: async () => null,
        sort: () => ({ lean: async () => null })
    }));
    t.mock.method(School, 'findById', () => ({ lean: async () => null }));
    t.mock.method(Grade, 'insertMany', insertMany || (async (docs) => docs.map((doc, i) => ({
        ...doc,
        _id: `new-${i}`,
        toObject: () => ({ ...doc, _id: `new-${i}` })
    }))));
};

test('bulk add copies the lesson context across every grade in one group', async (t) => {
    let captured = null;
    mockBulkAddDeps(t, {
        insertMany: async (docs) => {
            captured = docs;
            return docs.map((doc, i) => ({ ...doc, _id: `new-${i}`, toObject: () => doc }));
        }
    });
    const { response } = await invoke(bulkAddGrades, adminReq({
        classId: 'class-1', subject: 'subject-1', category: 'Classwork', date: '2026-11-19',
        maxMarks: 10, academicYear: '2026-2027',
        title: '  Opinion writing  ', lessonSummary: '  We supported an opinion.  ',
        grades: [{ student: 's1', marks: 8, remarks: 'Good' }, { student: 's2', marks: 6, remarks: '' }],
        sendNotifications: false
    }));
    assert.equal(response.statusCode, 201);
    assert.equal(captured.length, 2);
    for (const doc of captured) {
        assert.equal(doc.title, 'Opinion writing');
        assert.equal(doc.lessonSummary, 'We supported an opinion.');
    }
    assert.equal(captured[0].assessmentGroupId, captured[1].assessmentGroupId);
    assert.ok(captured[0].assessmentGroupId);
    assert.equal(response.body.data.emailFailures, 0);
});

test('bulk add rejects a summary without a title before writing anything', async (t) => {
    mockBulkAddDeps(t);
    const { nextError } = await invoke(bulkAddGrades, adminReq({
        classId: 'class-1', subject: 'subject-1', academicYear: '2026-2027',
        lessonSummary: 'No title given', grades: [{ student: 's1', marks: 8 }]
    }));
    assert.ok(nextError);
    assert.equal(nextError.code, 'LESSON_TITLE_REQUIRED');
});

test('bulk add reports email failures separately from the saved grades', async (t) => {
    mockBulkAddDeps(t);
    t.mock.method(notificationService, 'sendGradeUpdateNotification', async () => {
        throw new Error('SMTP unavailable');
    });
    const { response } = await invoke(bulkAddGrades, adminReq({
        classId: 'class-1', subject: 'subject-1', academicYear: '2026-2027',
        title: 'Opinion writing', lessonSummary: 'We supported an opinion.',
        grades: [{ student: 's1', marks: 8 }, { student: 's2', marks: 6 }],
        sendNotifications: true
    }));
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.data.count, 2);
    assert.equal(response.body.data.emailFailures, 2);
});

const mockBulkUpdateDeps = (t, existingGrades) => {
    t.mock.method(Grade, 'find', () => ({ lean: async () => existingGrades }));
    t.mock.method(Class, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: 'class-1' }) }) }));
    t.mock.method(Subject, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: 'subject-1' }) }) }));
    t.mock.method(GradeAuditLog, 'insertMany', async () => []);
};

test('bulk update applies lesson metadata to every record in the payload', async (t) => {
    const existing = [
        { _id: 'g1', student: 's1', subject: 'subject-1', class: 'class-1', marks: 8, maxMarks: 10 },
        { _id: 'g2', student: 's2', subject: 'subject-1', class: 'class-1', marks: 6, maxMarks: 10 }
    ];
    mockBulkUpdateDeps(t, existing);
    let operations = null;
    t.mock.method(Grade, 'bulkWrite', async (ops) => {
        operations = ops;
        return { modifiedCount: ops.length };
    });
    const { response } = await invoke(bulkUpdateGrades, adminReq({
        grades: [
            { _id: 'g1', marks: 9, maxMarks: 10, remarks: 'Improved' },
            { _id: 'g2', marks: 6, maxMarks: 10, remarks: '' }
        ],
        metadata: {
            classId: 'class-1', subject: 'subject-1', category: 'classwork',
            date: '2026-11-19', maxMarks: 10,
            title: 'Revised lesson', lessonSummary: 'Updated family summary.'
        }
    }));
    assert.equal(response.statusCode, 200);
    assert.equal(operations.length, 2);
    for (const op of operations) {
        assert.equal(op.updateOne.update.$set.title, 'Revised lesson');
        assert.equal(op.updateOne.update.$set.lessonSummary, 'Updated family summary.');
        assert.equal(op.updateOne.filter.school, 'school-1');
    }
    // Per-pupil marks/remarks stay separate; only the lesson context is shared
    const first = operations.find((op) => op.updateOne.filter._id === 'g1');
    const second = operations.find((op) => op.updateOne.filter._id === 'g2');
    assert.equal(first.updateOne.update.$set.marks, 9);
    assert.equal(first.updateOne.update.$set.remarks, 'Improved');
    assert.equal(second.updateOne.update.$set.marks, 6);
    assert.equal(second.updateOne.update.$set.remarks, '');
});

test('bulk update without lesson metadata never touches title or summary', async (t) => {
    const existing = [{ _id: 'g1', student: 's1', subject: 'subject-1', class: 'class-1', marks: 8, maxMarks: 10 }];
    mockBulkUpdateDeps(t, existing);
    let operations = null;
    t.mock.method(Grade, 'bulkWrite', async (ops) => {
        operations = ops;
        return { modifiedCount: ops.length };
    });
    await invoke(bulkUpdateGrades, adminReq({
        grades: [{ _id: 'g1', marks: 9, maxMarks: 10 }],
        metadata: { maxMarks: 10 }
    }));
    assert.equal(operations[0].updateOne.update.$set.title, undefined);
    assert.equal(operations[0].updateOne.update.$set.lessonSummary, undefined);
});

test('group read returns the lesson context for edit hydration', async (t) => {
    const grades = [{
        _id: 'g1', class: 'class-1', subject: 'subject-1', category: 'classwork',
        gradeType: 'daily', date: new Date('2026-11-19'), maxMarks: 10,
        assessmentGroupId: 'group-a', title: 'Opinion writing', lessonSummary: 'We supported an opinion.'
    }];
    t.mock.method(Grade, 'find', () => ({
        populate: () => ({ sort: async () => grades })
    }));
    const { response } = await invoke(getGradesByAssessmentGroup, {
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' },
        params: { assessmentGroupId: 'group-a' }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.metadata.title, 'Opinion writing');
    assert.equal(response.body.data.metadata.lessonSummary, 'We supported an opinion.');
});