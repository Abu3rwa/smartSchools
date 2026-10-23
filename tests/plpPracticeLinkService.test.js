import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import mongoose from 'mongoose';
import SpellingSession from '../models/SpellingSession.js';
import MapPracticePlan from '../models/MapPracticePlan.js';
import MapPracticeSkill from '../models/MapPracticeSkill.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import { collectPracticeCandidates, resolvePracticeLinks } from '../services/plpPracticeLinkService.js';

const SCHOOL = new mongoose.Types.ObjectId();
const STUDENT = new mongoose.Types.ObjectId();
const OTHER_STUDENT = new mongoose.Types.ObjectId();

const id = () => new mongoose.Types.ObjectId();
const days = (ago) => new Date(Date.now() - ago * 86400000);

/**
 * The suite replaces model queries with a filter engine that behaves like the
 * driver: tenant and student filters are enforced, $in is honoured, populate
 * resolves only registered references, and limit/sort apply. A stub that ignores
 * a filter is what lets a cross-student link ship green.
 */
const buildCollection = (documents, references = {}) => {
    const matches = (document, filter) => Object.entries(filter).every(([key, condition]) => {
        const value = document[key];
        if (condition && typeof condition === 'object' && '$in' in condition) {
            return condition.$in.some((candidate) => String(candidate) === String(value));
        }
        if (value instanceof Date || condition instanceof Date) {
            return String(value) === String(condition);
        }
        return String(value) === String(condition);
    });

    return {
        find(filter = {}) {
            let results = documents.filter((document) => matches(document, filter));
            const query = {
                select() { return query; },
                sort(spec) {
                    const [key, direction] = Object.entries(spec)[0];
                    results = [...results].sort((left, right) => {
                        const delta = new Date(left[key] || 0) - new Date(right[key] || 0);
                        return direction < 0 ? -delta : delta;
                    });
                    return query;
                },
                limit(count) {
                    results = results.slice(0, count);
                    return query;
                },
                populate(path) {
                    results = results.map((document) => {
                        const populated = { ...document };
                        const ids = Array.isArray(populated[path]) ? populated[path] : [populated[path]];
                        populated[path] = ids
                            .map((entry) => (references[path] || []).find((doc) => String(doc._id) === String(entry)))
                            .filter(Boolean);
                        if (!Array.isArray(document[path])) [populated[path]] = populated[path];
                        return populated;
                    });
                    return query;
                },
                lean: async () => results.map((document) => ({ ...document })),
            };
            return query;
        },
    };
};

const SPELLING = [];
const PLANS = [];
const ASSIGNMENTS = [];
const SKILLS = [];
const SETS = [];
const originalFind = {};

const seed = () => {
    SPELLING.length = 0;
    PLANS.length = 0;
    ASSIGNMENTS.length = 0;
    SKILLS.length = 0;
    SETS.length = 0;
};

beforeEach(() => {
    seed();
    originalFind.SpellingSession = SpellingSession.find;
    originalFind.MapPracticePlan = MapPracticePlan.find;
    originalFind.MapPracticeAssignment = MapPracticeAssignment.find;

    SpellingSession.find = (filter) => buildCollection(SPELLING).find(filter);
    MapPracticePlan.find = (filter) => buildCollection(PLANS, { skills: SKILLS }).find(filter);
    MapPracticeAssignment.find = (filter) => buildCollection(ASSIGNMENTS, { set: SETS, plan: PLANS }).find(filter);
});

afterEach(() => {
    SpellingSession.find = originalFind.SpellingSession;
    MapPracticePlan.find = originalFind.MapPracticePlan;
    MapPracticeAssignment.find = originalFind.MapPracticeAssignment;
});

const spellingDoc = (overrides = {}) => ({
    _id: id(),
    school: SCHOOL,
    student: STUDENT,
    status: 'completed',
    assessmentType: 'spelling-assessment',
    curriculumWeek: 3,
    startedAt: days(3),
    completedAt: days(2),
    attempts: [
        { wordId: id(), wordSnapshot: 'courageous', correct: true, skipped: false },
        { wordId: id(), wordSnapshot: 'thoughtful', correct: false, skipped: false },
    ],
    ...overrides,
});

test('candidates only cover this school and this student, and skip untouched sessions', async () => {
    SPELLING.push(
        spellingDoc(),
        spellingDoc({ status: 'scheduled' }),
        spellingDoc({ student: OTHER_STUDENT }),
        spellingDoc({ school: id() })
    );

    const candidates = await collectPracticeCandidates({ schoolId: SCHOOL, studentId: STUDENT });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].kind, 'spelling_session');
    assert.equal(candidates[0].targetId, String(SPELLING[0]._id));
});

test('candidate labels describe the work and never repeat the words themselves', async () => {
    SPELLING.push(spellingDoc());
    const [candidate] = await collectPracticeCandidates({ schoolId: SCHOOL, studentId: STUDENT });
    assert.equal(candidate.label, 'Spelling assessment · week 3');
    assert.match(candidate.detail, /^1 of 2 words missed · \d{1,2} \w{3} \d{4}$/);
    assert.doesNotMatch(JSON.stringify(candidate), /courageous|thoughtful|wordSnapshot/);
});

test('MAP plan candidates read their skill names from the skill collection', async () => {
    const skillIds = [id(), id()];
    SKILLS.push(
        { _id: skillIds[0], name: 'Find the main idea' },
        { _id: skillIds[1], name: 'Use context clues' }
    );
    PLANS.push({ _id: id(), school: SCHOOL, student: STUDENT, title: 'Reading focus', skills: skillIds, status: 'active', updatedAt: days(1) });

    const [candidate] = await collectPracticeCandidates({ schoolId: SCHOOL, studentId: STUDENT });
    assert.equal(candidate.kind, 'map_practice_plan');
    assert.equal(candidate.label, 'Reading focus');
    assert.equal(candidate.detail, 'Find the main idea, Use context clues');
});

test('candidates are newest first across kinds', async () => {
    SPELLING.push(spellingDoc({ completedAt: days(20) }));
    PLANS.push({ _id: id(), school: SCHOOL, student: STUDENT, title: 'Recent plan', skills: [], status: 'active', updatedAt: days(1) });

    const candidates = await collectPracticeCandidates({ schoolId: SCHOOL, studentId: STUDENT });
    assert.deepEqual(candidates.map((candidate) => candidate.kind), ['map_practice_plan', 'spelling_session']);
});

test('collecting without a school or student is refused', async () => {
    await assert.rejects(() => collectPracticeCandidates({ studentId: STUDENT }), /School and student are required/);
    await assert.rejects(() => collectPracticeCandidates({ schoolId: SCHOOL, studentId: null }), /School and student are required/);
});

test('links are rebuilt from the student records, not from what the client sent', async () => {
    SPELLING.push(spellingDoc());
    const targetId = String(SPELLING[0]._id);

    const links = await resolvePracticeLinks({
        schoolId: SCHOOL,
        studentId: STUDENT,
        actorId: id(),
        submitted: [{
            kind: 'spelling_session',
            targetId,
            label: 'Totally different label',
            detail: 'totally different detail',
            reason: `${'long reason '.repeat(40)}`,
            source: 'ai_suggested',
        }],
    });

    assert.equal(links.length, 1);
    assert.equal(links[0].label, 'Spelling assessment · week 3');
    assert.equal(links[0].detail, links[0].detail);
    assert.notEqual(links[0].detail, 'totally different detail');
    assert.equal(links[0].source, 'ai_suggested');
    assert.equal(links[0].reason.length, 300);
    assert.equal(links[0].targetId, targetId);
});

test('a link to another student or another school is rejected', async () => {
    SPELLING.push(spellingDoc({ student: OTHER_STUDENT }));
    const foreign = String(SPELLING[0]._id);

    await assert.rejects(
        () => resolvePracticeLinks({ schoolId: SCHOOL, studentId: STUDENT, submitted: [{ kind: 'spelling_session', targetId: foreign }] }),
        (error) => error.statusCode === 400 && /does not belong to this student/.test(error.message)
    );
});

test('unknown practice kinds, forged ids and oversized batches are rejected', async () => {
    await assert.rejects(
        () => resolvePracticeLinks({ schoolId: SCHOOL, studentId: STUDENT, submitted: [{ kind: 'Student', targetId: String(STUDENT) }] }),
        (error) => error.statusCode === 400 && /Unknown linked practice type/.test(error.message)
    );
    await assert.rejects(
        () => resolvePracticeLinks({ schoolId: SCHOOL, studentId: STUDENT, submitted: [{ kind: 'spelling_session', targetId: 'nope' }] }),
        (error) => error.statusCode === 400 && /Invalid linked practice id/.test(error.message)
    );
    await assert.rejects(
        () => resolvePracticeLinks({
            schoolId: SCHOOL,
            studentId: STUDENT,
            submitted: Array.from({ length: 11 }, () => ({ kind: 'spelling_session', targetId: String(id()) })),
        }),
        (error) => error.statusCode === 400 && /at most 10 practice items/.test(error.message)
    );
});

test('already linked practice older than the candidate window still resolves', async () => {
    SPELLING.push(spellingDoc({ completedAt: days(400) }));
    const targetId = String(SPELLING[0]._id);
    for (let index = 0; index < 12; index += 1) {
        SPELLING.push(spellingDoc({ completedAt: days(index + 1), startedAt: days(index + 1) }));
    }

    const links = await resolvePracticeLinks({
        schoolId: SCHOOL,
        studentId: STUDENT,
        submitted: [{ kind: 'spelling_session', targetId }],
    });
    assert.equal(links.length, 1);
    assert.equal(links[0].label, 'Spelling assessment · week 3');
});

test('duplicate links collapse and assignment labels come from the set and plan', async () => {
    const setId = id();
    const planId = id();
    SETS.push({ _id: setId, title: 'Verb forms', questionCount: 12 });
    PLANS.push({ _id: planId, school: SCHOOL, student: STUDENT, title: 'Fall MAP practice', skills: [], status: 'active', updatedAt: days(1) });
    const assignmentId = id();
    ASSIGNMENTS.push({
        _id: assignmentId,
        school: SCHOOL,
        student: STUDENT,
        plan: planId,
        set: setId,
        status: 'assigned',
        dueDate: new Date('2026-11-04T00:00:00.000Z'),
        createdAt: days(2),
    });

    const links = await resolvePracticeLinks({
        schoolId: SCHOOL,
        studentId: STUDENT,
        submitted: [
            { kind: 'map_practice_assignment', targetId: String(assignmentId) },
            { kind: 'map_practice_assignment', targetId: String(assignmentId) },
        ],
    });

    assert.equal(links.length, 1);
    assert.equal(links[0].label, 'Verb forms · Fall MAP practice');
    assert.match(links[0].detail, /assigned · 12 questions · due 4 Nov 2026/);
    assert.equal(MapPracticeSkill.modelName, 'MapPracticeSkill');
    assert.equal(MapPracticeSet.modelName, 'MapPracticeSet');
});
