import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/*
 * The one rule this module must never break: a student's writing path makes no
 * AI calls. Assessment is teacher-triggered, so anything reachable from
 * /api/writing/my* must stay free of the AI service. These tests read the
 * source instead of a mock so the guard survives a refactor.
 */

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const SERVICE = '../services/writingAssistantService.js';
const CONTROLLER = '../controllers/writingController.js';
const ROUTES = '../routes/writingRoutes.js';

const STUDENT_HANDLERS = [
    'myWriting',
    'myProject',
    'myProjectById',
    'autosaveProject',
    'submitProject',
    'markNotebookWritten'
];

// Only the student block of the controller, i.e. everything from myWriting on.
const studentSection = (source) => {
    const start = source.indexOf('export const myWriting');
    assert.notEqual(start, -1, 'writingController.js must keep its student handlers together');
    return source.slice(start);
};

const serviceCalls = (source) =>
    [...source.matchAll(/writingService\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);

const ALLOWED_SERVICE_CALLS = [
    'getStudentFeed',
    'openProject',
    'getStudentProject',
    'autosaveProject',
    'submitDraft',
    'markNotebookWritten'
];

test('no writing file on the student path imports the AI', async () => {
    for (const file of [SERVICE, CONTROLLER, ROUTES]) {
        const source = await read(file);
        for (const forbidden of ['connectAi', 'writingAssistantPrompts', 'aiService', 'gemini']) {
            assert.equal(
                source.includes(forbidden),
                false,
                `${file} must not reference ${forbidden}`
            );
        }
    }
});

test('student handlers only call the six non-AI service functions', async () => {
    const source = studentSection(await read(CONTROLLER));
    const calls = [...new Set(serviceCalls(source))].sort();
    assert.deepEqual(calls, [...ALLOWED_SERVICE_CALLS].sort());
});

test('the rest of the controller never reuses a student handler name', async () => {
    const source = await read(CONTROLLER);
    const teacherSection = source.slice(0, source.indexOf('export const myWriting'));
    for (const handler of STUDENT_HANDLERS) {
        assert.equal(
            new RegExp(`export const ${handler}\\b`).test(teacherSection),
            false,
            `${handler} belongs to the student block only`
        );
    }
});

test('every student route is authorize(student) and maps to a student handler', async () => {
    const source = await read(ROUTES);
    const studentRoutes = [...source.matchAll(/router\.(get|post|put)\('([^']+)',\s*([^;]+);/g)]
        .filter((match) => match[3].includes("authorize('student')"));

    assert.equal(studentRoutes.length, 6, 'all six student routes must exist');
    for (const route of studentRoutes) {
        const handler = route[3].trim().replace(/\)$/, '').split(',').pop().trim();
        assert.ok(
            STUDENT_HANDLERS.includes(handler),
            `${route[2]} is bound to ${handler}, which is not a student handler`
        );
    }
});

test('teacher routes stay behind the staff guard', async () => {
    const source = await read(ROUTES);
    const staffRoutes = [...source.matchAll(/router\.\w+\('([^']+)',\s*staff,/g)].map((m) => m[1]);
    assert.ok(staffRoutes.length >= 11, 'teacher CRUD, board and history routes must use staff');
    assert.equal(staffRoutes.some((path) => path === '/my'), false);
});

test('the writing service exports the student-facing functions', async () => {
    const module = await import(SERVICE);
    for (const name of ALLOWED_SERVICE_CALLS) {
        assert.equal(typeof module[name], 'function', `${name} must be exported`);
    }
});
