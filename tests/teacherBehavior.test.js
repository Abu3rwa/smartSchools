import test from 'node:test';
import assert from 'node:assert/strict';

import {
    TEACHER_BEHAVIOR_CATEGORIES,
    TEACHER_BEHAVIOR_CATEGORY_KEYS,
    SEVERITY_TO_STORED,
    STORED_SEVERITY_TO_TEACHER,
    STORED_SEVERITIES_FOR_FILTER,
    NO_NOTE_PLACEHOLDER
} from '../constants/teacherBehavior.js';
import {
    teacherBehaviorEntryBodySchema,
    teacherBehaviorEntriesQuerySchema,
    validateTeacherBehavior
} from '../validators/teacherBehaviorValidators.js';
import {
    startOfDay,
    startOfWeek,
    mapStoredSeverity,
    resolveIncidentType,
    matchedClassId,
    isStudentInClasses,
    buildFollowUpSuggestion,
    buildTrend,
    buildAlert,
    toEntryDto
} from '../services/behavior/teacherBehaviorService.js';
import teacherBehaviorRoutes from '../routes/teacherBehaviorRoutes.js';

const STUDENT_ID = '5f9f9f9f9f9f9f9f9f9f9f9f';
const CLASS_ID = '6a6a6a6a6a6a6a6a6a6a6a6a';

const runValidator = (middleware, req) => new Promise((resolve) => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve({ statusCode: this.statusCode, body: payload, next: false }); return this; }
    };
    middleware(req, res, () => resolve({ statusCode: 200, body: null, next: true }));
});

test('the teacher categories are exactly the requested plain-language list', () => {
    assert.deepEqual(TEACHER_BEHAVIOR_CATEGORY_KEYS, [
        'disruptive', 'disrespectful', 'tardiness', 'truancy',
        'academic_dishonesty', 'bullying', 'technology_misuse', 'dress_code', 'other'
    ]);
    for (const row of TEACHER_BEHAVIOR_CATEGORIES) {
        assert.ok(row.label.trim(), `${row.key} needs a visible label`);
        assert.match(row.key, /^[a-z_]+$/);
    }
    const types = new Set(TEACHER_BEHAVIOR_CATEGORIES.map((row) => row.incidentType));
    for (const type of types) {
        assert.ok(
            ['minor_infraction', 'attendance_issue', 'academic_concern', 'safety_concern'].includes(type),
            `unexpected incident type ${type}`
        );
    }
});

test('three teacher severities map onto the stored scale without a schema change', () => {
    assert.deepEqual(SEVERITY_TO_STORED, { minor: 'low', moderate: 'medium', serious: 'high' });
    assert.equal(mapStoredSeverity('low'), 'minor');
    assert.equal(mapStoredSeverity('medium'), 'moderate');
    assert.equal(mapStoredSeverity('high'), 'serious');
    assert.equal(mapStoredSeverity('critical'), 'serious', 'legacy critical reads as serious, never crashes');
    assert.equal(mapStoredSeverity(undefined), 'minor');
    assert.deepEqual(STORED_SEVERITIES_FOR_FILTER.serious, ['high', 'critical']);
    assert.equal(STORED_SEVERITY_TO_TEACHER.low, 'minor');
});

test('the stored incident type follows the category, and a serious case escalates it', () => {
    assert.equal(resolveIncidentType({ category: 'bullying', severity: 'minor' }), 'safety_concern');
    assert.equal(resolveIncidentType({ category: 'tardiness', severity: 'minor' }), 'attendance_issue');
    assert.equal(resolveIncidentType({ category: 'academic_dishonesty', severity: 'moderate' }), 'academic_concern');
    assert.equal(resolveIncidentType({ category: 'disruptive', severity: 'moderate' }), 'minor_infraction');
    assert.equal(resolveIncidentType({ category: 'disruptive', severity: 'serious' }), 'major_infraction');
    assert.equal(resolveIncidentType({ category: 'unknown', severity: 'minor' }), 'minor_infraction');
});

test('a teacher scope only matches students they actually teach', () => {
    const student = {
        currentClass: CLASS_ID,
        enrolledClasses: ['7b7b7b7b7b7b7b7b7b7b7b7b']
    };
    assert.equal(matchedClassId(student, [CLASS_ID]), CLASS_ID);
    assert.equal(matchedClassId(student, ['7b7b7b7b7b7b7b7b7b7b7b7b']), '7b7b7b7b7b7b7b7b7b7b7b7b');
    assert.equal(matchedClassId(student, ['8c8c8c8c8c8c8c8c8c8c8c8c']), null);
    assert.equal(isStudentInClasses(student, ['8c8c8c8c8c8c8c8c8c8c8c8c']), false);
    assert.equal(isStudentInClasses(student, [CLASS_ID]), true);
    // Admins (classIds = null) are not restricted.
    assert.equal(matchedClassId(student, null), CLASS_ID);
});

test('follow-up advice is ordered: serious, bullying, repeats, severity', () => {
    assert.equal(buildFollowUpSuggestion({ category: 'disruptive', severity: 'serious', recentCount: 1 }), 'admin_review');
    assert.equal(buildFollowUpSuggestion({ category: 'bullying', severity: 'minor', recentCount: 1 }), 'counseling_referral');
    assert.equal(buildFollowUpSuggestion({ category: 'disruptive', severity: 'minor', recentCount: 4 }), 'detention');
    assert.equal(buildFollowUpSuggestion({ category: 'disruptive', severity: 'minor', recentCount: 2 }), 'parent_contact');
    assert.equal(buildFollowUpSuggestion({ category: 'tardiness', severity: 'moderate', recentCount: 1 }), 'conversation');
    assert.equal(buildFollowUpSuggestion({ category: 'tardiness', severity: 'minor', recentCount: 1 }), 'warning_reflection');
});

test('trend and alert read from counts without inventing precision', () => {
    assert.deepEqual(buildTrend({ recent: 3, previous: 1 }), { recent: 3, previous: 1, direction: 'up' });
    assert.equal(buildTrend({ recent: 1, previous: 4 }).direction, 'down');
    assert.equal(buildTrend({ recent: 2, previous: 2 }).direction, 'steady');

    assert.equal(buildAlert({ seriousRecent: 1, pendingFollowUps: 5, recent: 9 }), 'serious');
    assert.equal(buildAlert({ seriousRecent: 0, pendingFollowUps: 1, recent: 9 }), 'follow_up');
    assert.equal(buildAlert({ seriousRecent: 0, pendingFollowUps: 0, recent: 3 }), 'watch');
    assert.equal(buildAlert({ seriousRecent: 0, pendingFollowUps: 0, recent: 2 }), 'steady');
});

test('an entry leaving the API never carries staff or reporter details', () => {
    const dto = toEntryDto({
        _id: STUDENT_ID,
        student: { _id: '1a1a1a1a1a1a1a1a1a1a1a1a', firstName: 'Layla', lastName: 'Hassan', studentId: 'S-104', email: 'layla@example.test' },
        class: { name: 'Grade 5', grade: 'A', section: '1' },
        category: 'disruptive',
        severity: 'high',
        description: 'Called out repeatedly.',
        incidentDate: new Date('2026-11-09T18:00:00.000Z'),
        reportedBy: { _id: 'staff-1', firstName: 'Teacher' },
        notes: [{ text: 'staff only' }],
        otherStudentsInvolved: ['2b2b2b2b2b2b2b2b2b2b2b2b'],
        followUpRequired: true,
        followUpCompletedAt: null,
        followUpNotes: 'internal'
    });

    assert.equal(dto.severity, 'serious');
    assert.equal(dto.isSerious, true);
    assert.equal(dto.student.name, 'Layla Hassan');
    assert.equal(dto.student.code, 'S-104');
    assert.equal(dto.className, 'Grade 5 • A • 1');
    assert.deepEqual(dto.followUp, { needed: true, completedAt: null });
    const serialized = JSON.stringify(dto);
    assert.equal(serialized.includes('layla@example.test'), false, 'student email must not leave the API');
    assert.equal(serialized.includes('staff-1'), false);
    assert.equal(serialized.includes('reportedBy'), false);
    assert.equal(serialized.includes('otherStudentsInvolved'), false);
    assert.equal(serialized.includes('staff only'), false);
});

test('the internal no-note placeholder is shown as an empty note', () => {
    const dto = toEntryDto({
        _id: STUDENT_ID,
        severity: 'low',
        category: 'other',
        description: NO_NOTE_PLACEHOLDER,
        incidentDate: new Date('2026-11-09T18:00:00.000Z'),
        followUpRequired: false
    });
    assert.equal(dto.notes, '');
    assert.deepEqual(dto.followUp, { needed: false, completedAt: null });
});

test('a serious case cannot be saved without a short note', () => {
    const parsed = teacherBehaviorEntryBodySchema.safeParse({
        student: STUDENT_ID,
        category: 'bullying',
        severity: 'serious',
        notes: '   '
    });
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.issues[0].message, 'Add a short note explaining this serious case.');

    const minorWithoutNote = teacherBehaviorEntryBodySchema.safeParse({
        student: STUDENT_ID,
        category: 'tardiness',
        severity: 'minor'
    });
    assert.equal(minorWithoutNote.success, true, 'a note stays optional for ordinary cases');
});

test('a future date is refused in plain language', () => {
    const parsed = teacherBehaviorEntryBodySchema.safeParse({
        student: STUDENT_ID,
        category: 'disruptive',
        severity: 'minor',
        occurredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    assert.equal(parsed.success, false);
    assert.equal(parsed.error.issues[0].message, 'The date cannot be in the future.');
});

test('the validator middleware returns the first friendly message, not "Validation failed"', async () => {
    const middleware = validateTeacherBehavior({ bodySchema: teacherBehaviorEntryBodySchema });
    const result = await runValidator(middleware, { body: { student: STUDENT_ID } });

    assert.equal(result.next, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.success, false);
    assert.notEqual(result.body.message, 'Validation failed');
    assert.ok(result.body.errors.length > 0);
    assert.equal(result.body.errors[0].field, 'category');
});

test('the list query only accepts the documented filters', () => {
    assert.equal(teacherBehaviorEntriesQuerySchema.safeParse({ range: 'today' }).success, true);
    assert.equal(teacherBehaviorEntriesQuerySchema.safeParse({ range: 'month' }).success, false);
    assert.equal(teacherBehaviorEntriesQuerySchema.safeParse({ severity: 'serious', limit: '25' }).success, true);
    assert.equal(teacherBehaviorEntriesQuerySchema.safeParse({ limit: '500' }).success, false);
    assert.equal(teacherBehaviorEntriesQuerySchema.safeParse({ surprise: '1' }).success, false);
});

test('the teacher behavior routes are mounted under their own path with staff roles only', () => {
    const routes = teacherBehaviorRoutes.stack
        .filter((layer) => layer.route)
        .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
        .sort();

    assert.deepEqual(routes, [
        'GET /entries',
        'GET /overview',
        'GET /roster',
        'GET /students/:studentId/summary',
        'POST /entries',
        'POST /entries/:id/follow-up'
    ].sort());

    const firstRouteIndex = teacherBehaviorRoutes.stack.findIndex((layer) => layer.route);
    const guards = teacherBehaviorRoutes.stack
        .slice(0, firstRouteIndex)
        .filter((layer) => typeof layer.handle === 'function');
    assert.equal(guards.length, 3, 'authentication, school context and role checks run before any handler');
});

test('the dashboard window starts today and on Monday', () => {
    const wednesday = new Date('2026-11-11T15:30:00.000Z');
    assert.equal(startOfDay(wednesday).getHours(), 0);
    const week = startOfWeek(wednesday);
    assert.equal(week.getDay(), 1, 'weeks start on Monday');
    assert.equal(startOfDay(week).getTime(), week.getTime());
    assert.ok(week < wednesday);
});
