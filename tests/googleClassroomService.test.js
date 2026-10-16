import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import { CLASSROOM_SCOPES, CLASSROOM_EMAIL_SCOPE } from '../config/classroomConfig.js';
import {
    buildCourseWorkPatch,
    buildCourseWorkMaterials,
    buildCourseWorkPayload,
    buildDescription,
    desiredClassroomState
} from '../services/googleClassroomService.js';

const baseAssignment = (overrides = {}) => ({
    title: 'Fractions worksheet',
    instructions: 'Complete page 4.',
    maxMarks: 20,
    status: 'draft',
    dueDate: new Date('2026-10-09T00:00:00.000Z'),
    links: [],
    ...overrides
});

test('requests exactly the two Classroom scopes plus the non-sensitive email scope', () => {
    assert.deepEqual([...CLASSROOM_SCOPES], [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.coursework.students'
    ]);
    assert.equal(CLASSROOM_EMAIL_SCOPE, 'https://www.googleapis.com/auth/userinfo.email');
});

test('the integration never calls course create, update, patch or delete', () => {
    const files = [
        '../services/googleClassroomService.js',
        '../services/googleClassroomOAuthService.js',
        '../services/classroomPublishService.js',
        '../controllers/googleClassroomController.js'
    ];
    for (const file of files) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(
            source,
            /\.courses\.(create|update|patch|delete)\b/,
            `${file} must not modify Classroom courses`
        );
    }
});

test('desiredClassroomState only publishes published assignments', () => {
    assert.equal(desiredClassroomState({ status: 'published' }), 'PUBLISHED');
    assert.equal(desiredClassroomState({ status: 'draft' }), 'DRAFT');
});

test('buildDescription includes instructions without placing links in the description', () => {
    const description = buildDescription(baseAssignment({
        links: [
            { type: 'external_url', title: 'Video', url: 'https://example.com/v' },
            { type: 'assessment', title: 'Quiz', url: '', refId: 'abc' }
        ]
    }));
    assert.equal(description, 'Complete page 4.');
    assert.doesNotMatch(description, /https:\/\/example\.com/);
    assert.doesNotMatch(description, /Quiz/);
});

test('buildCourseWorkMaterials maps valid external URLs to Classroom link materials', () => {
    assert.deepEqual(buildCourseWorkMaterials(baseAssignment({
        links: [
            { type: 'external_url', title: 'Video', url: 'https://example.com/v' },
            { type: 'external_url', title: '', url: 'http://example.org/plain' },
            { type: 'external_url', title: 'Invalid scheme', url: 'javascript:alert(1)' },
            { type: 'external_url', title: 'Local only', url: 'http://localhost:5173/portal/assignments' },
            { type: 'external_url', title: 'Loopback only', url: 'http://[::1]:5173/' },
            { type: 'assessment', title: 'Quiz', url: '', refId: 'abc' }
        ]
    })), [
        { link: { url: 'https://example.com/v', title: 'Video' } },
        { link: { url: 'http://example.org/plain', title: 'example.org' } }
    ]);
});

test('buildCourseWorkMaterials attaches a generated Google Form responder link', () => {
    const assignment = baseAssignment({
        metadata: {
            googleForm: {
                responderUri: 'https://docs.google.com/forms/d/abc123/viewform'
            }
        }
    });

    assert.deepEqual(buildCourseWorkMaterials(assignment), [
        { link: { url: 'https://docs.google.com/forms/d/abc123/viewform', title: 'Google Form' } }
    ]);
});

test('buildCourseWorkMaterials includes the Google Form only once when it is already an assignment link', () => {
    const responderUri = 'https://docs.google.com/forms/d/abc123/viewform';
    const assignment = baseAssignment({
        links: [{ type: 'external_url', title: 'Google Form', url: responderUri }],
        metadata: { googleForm: { responderUri } }
    });

    assert.deepEqual(buildCourseWorkMaterials(assignment), [
        { link: { url: responderUri, title: 'Google Form' } }
    ]);
});

test('buildCourseWorkMaterials ignores invalid Google Form responder URLs', () => {
    const assignment = baseAssignment({
        metadata: { googleForm: { responderUri: 'javascript:alert(1)' } }
    });

    assert.deepEqual(buildCourseWorkMaterials(assignment), []);
});

test('buildCourseWorkPayload maps app fields to Classroom coursework', () => {
    const payload = buildCourseWorkPayload({
        assignment: baseAssignment({
            links: [{ type: 'external_url', title: 'Study guide', url: 'https://example.com/guide' }]
        }),
        timeZone: 'UTC'
    });
    assert.equal(payload.title, 'Fractions worksheet');
    assert.equal(payload.workType, 'ASSIGNMENT');
    assert.equal(payload.maxPoints, 20);
    assert.equal(payload.state, 'DRAFT');
    assert.deepEqual(payload.dueDate, { year: 2026, month: 10, day: 9 });
    assert.deepEqual(payload.dueTime, { hours: 23, minutes: 59 });
    assert.deepEqual(payload.materials, [
        { link: { url: 'https://example.com/guide', title: 'Study guide' } }
    ]);
});

test('buildCourseWorkPayload omits due fields when there is no due date', () => {
    const payload = buildCourseWorkPayload({
        assignment: baseAssignment({ dueDate: null, status: 'published' }),
        timeZone: 'UTC'
    });
    assert.equal(payload.state, 'PUBLISHED');
    assert.equal('dueDate' in payload, false);
    assert.equal('dueTime' in payload, false);
    assert.deepEqual(payload.materials, []);
});

test('buildCourseWorkPayload caps the title length', () => {
    const payload = buildCourseWorkPayload({
        assignment: baseAssignment({ title: 'x'.repeat(5000) }),
        timeZone: 'UTC'
    });
    assert.equal(payload.title.length, 3000);
});

test('buildCourseWorkPatch promotes a Classroom draft when the app assignment is published', () => {
    const { requestBody, updateMask } = buildCourseWorkPatch({
        assignment: baseAssignment({ status: 'published' }),
        timeZone: 'UTC',
        link: { syncState: 'draft', dueDateSynced: true }
    });
    assert.equal(requestBody.state, 'PUBLISHED');
    assert.deepEqual(updateMask.split(','), [
        'title', 'description', 'maxPoints', 'state', 'dueDate', 'dueTime'
    ]);
});

test('buildCourseWorkPatch never changes state of already published coursework', () => {
    const { requestBody, updateMask } = buildCourseWorkPatch({
        assignment: baseAssignment({ status: 'published' }),
        timeZone: 'UTC',
        link: { syncState: 'published', dueDateSynced: true }
    });
    assert.equal('state' in requestBody, false);
    assert.equal(updateMask.split(',').includes('state'), false);
});

test('buildCourseWorkPatch does not downgrade a published post when the app draft is edited', () => {
    const { updateMask } = buildCourseWorkPatch({
        assignment: baseAssignment({ status: 'draft' }),
        timeZone: 'UTC',
        link: { syncState: 'published', dueDateSynced: true }
    });
    assert.equal(updateMask.split(',').includes('state'), false);
});

test('buildCourseWorkPatch does not send materials because Classroom patch does not support them', () => {
    const { requestBody, updateMask } = buildCourseWorkPatch({
        assignment: baseAssignment({
            links: [{ type: 'external_url', title: 'New link', url: 'https://example.com/new' }]
        }),
        timeZone: 'UTC',
        link: { syncState: 'draft', dueDateSynced: false }
    });
    assert.equal(requestBody.description, 'Complete page 4.');
    assert.equal('materials' in requestBody, false);
    assert.equal(updateMask.split(',').includes('materials'), false);
});

test('buildCourseWorkPatch clears a removed due date only if one was synced before', () => {
    const cleared = buildCourseWorkPatch({
        assignment: baseAssignment({ dueDate: null }),
        timeZone: 'UTC',
        link: { syncState: 'draft', dueDateSynced: true }
    });
    assert.deepEqual(cleared.updateMask.split(','), [
        'title', 'description', 'maxPoints', 'dueDate', 'dueTime'
    ]);
    assert.equal('dueDate' in cleared.requestBody, false);

    const untouched = buildCourseWorkPatch({
        assignment: baseAssignment({ dueDate: null }),
        timeZone: 'UTC',
        link: { syncState: 'draft', dueDateSynced: false }
    });
    assert.deepEqual(untouched.updateMask.split(','), ['title', 'description', 'maxPoints']);
});
