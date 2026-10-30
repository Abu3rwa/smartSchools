import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
    buildPracticePrompt,
    buildTutorPrompt,
    countTries,
    gradePractice,
    normalizePracticeQuestions,
    readTutorReply,
    resolveAccess,
    scoreLesson,
    selectLessons,
    summarizeLessonsByUnit,
    validateLessonImport,
    walletNotice
} from '../services/tutorCore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.join(here, '..', relative), 'utf8');

const lesson = (id, overrides = {}) => ({
    _id: id,
    unitNumber: 1,
    unitTitle: 'Matter',
    chapterNumber: 1,
    chapterTitle: 'States',
    lessonNumber: 1,
    title: 'Solids, liquids and gases',
    keywords: ['solid', 'liquid', 'gas'],
    searchText: 'solids keep their shape liquids flow gases fill the container',
    content: 'Solids keep their shape. Liquids flow. Gases fill the container.',
    standards: ['SCI.5.1'],
    ...overrides
});

/* ------------------------------------------------------------------ */
/* Import rules                                                        */
/* ------------------------------------------------------------------ */

test('a flat lesson list is accepted and sorted by unit, chapter and lesson', () => {
    const rows = validateLessonImport({
        subjectId: 's1',
        grade: 5,
        lessons: [
            { lessonNumber: 2, title: 'Second', content: 'B' },
            { lessonNumber: 1, title: 'First', content: 'A' }
        ]
    });
    assert.deepEqual(rows.map((row) => row.title), ['First', 'Second']);
    assert.equal(rows[0].unitNumber, null);
});

test('a unit row without its title is rejected and names the row', () => {
    assert.throws(
        () => validateLessonImport({
            subjectId: 's1',
            grade: 5,
            lessons: [{ unitNumber: 1, lessonNumber: 1, title: 'First', content: 'A' }]
        }),
        /Row 2: unit_title is required/
    );
});

test('a chapter title without a chapter number is rejected', () => {
    assert.throws(
        () => validateLessonImport({
            subjectId: 's1',
            grade: 5,
            lessons: [{ unitNumber: 1, unitTitle: 'U', chapterTitle: 'C', lessonNumber: 1, title: 'T', content: 'A' }]
        }),
        /chapter_number/
    );
});

test('the same lesson slot twice rejects the whole file', () => {
    assert.throws(
        () => validateLessonImport({
            subjectId: 's1',
            grade: 5,
            lessons: [
                { unitNumber: 1, unitTitle: 'U', lessonNumber: 1, title: 'One', content: 'A' },
                { unitNumber: 1, unitTitle: 'U', lessonNumber: 1, title: 'Again', content: 'B' }
            ]
        }),
        /Row 3: lesson 1 is already used/
    );
});

test('standards and keywords are cleaned, deduplicated and capped', () => {
    const [row] = validateLessonImport({
        subjectId: 's1',
        grade: 5,
        lessons: [{
            lessonNumber: 1,
            title: 'One',
            content: 'A',
            standards: 'sci.5.1|SCI.5.1 | sci.5.2',
            keywords: 'Matter|matter|Gas'
        }]
    });
    assert.deepEqual(row.standards, ['SCI.5.1', 'SCI.5.2']);
    assert.deepEqual(row.keywords, ['matter', 'gas']);
});

test('an import needs a subject and a grade before it reads any row', () => {
    assert.throws(() => validateLessonImport({ grade: 5, lessons: [] }), /Pick the subject/);
    assert.throws(() => validateLessonImport({ subjectId: 's1', lessons: [] }), /Pick the grade/);
});

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

test('the lesson whose title names the question wins', () => {
    const solid = lesson('a');
    const plant = lesson('b', {
        title: 'Photosynthesis',
        keywords: ['plants', 'sunlight'],
        searchText: 'plants make sugar from sunlight'
    });
    const picked = selectLessons({
        lessons: [solid, plant],
        question: 'How does photosynthesis work?'
    });
    assert.equal(picked[0]._id, 'b');
});

test('the lesson the student opened is always part of the answer', () => {
    const solid = lesson('a');
    const plant = lesson('b', { title: 'Photosynthesis', keywords: ['plants'], searchText: 'plants' });
    const picked = selectLessons({
        lessons: [solid, plant],
        question: 'photosynthesis',
        selectedLessonId: 'a'
    });
    assert.equal(picked[0]._id, 'a');
    assert.equal(picked[1]._id, 'b');
});

test('a question with no shared words picks nothing, so the caller can choose a scope', () => {
    assert.deepEqual(selectLessons({ lessons: [lesson('a')], question: 'hello there' }), []);
});

test('a lesson body mention still scores, but below a title match', () => {
    const inBody = lesson('body', { title: 'Everyday materials', keywords: [], searchText: 'glass is a solid' });
    const inTitle = lesson('title', { title: 'Solid or liquid', keywords: [] });
    assert.ok(scoreLesson(inTitle, ['solid']) > scoreLesson(inBody, ['solid']));
});

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

test('the tutor prompt carries the lesson text and the standards, and forbids outside knowledge', () => {
    const prompt = buildTutorPrompt({
        question: 'Why does a gas fill the room?',
        lessons: [lesson('a')],
        standards: [{ code: 'SCI.5.1', description: 'Model matter as particles.' }],
        subjectName: 'Science',
        grade: 5,
        language: 'en'
    });
    assert.match(prompt, /Use ONLY the lesson material below/);
    assert.match(prompt, /Gases fill the container/);
    assert.match(prompt, /SCI\.5\.1: Model matter as particles/);
    assert.match(prompt, /not covered by the lesson material/);
    assert.match(prompt, /Never mention the student's name/);
    assert.match(prompt, /Reply in English only/);
    assert.match(prompt, /Why does a gas fill the room\?/);
});

test('an arabic session asks for arabic and keeps the same grounding rule', () => {
    const prompt = buildTutorPrompt({
        question: 'لماذا يملأ الغاز الغرفة؟',
        lessons: [lesson('a')],
        language: 'ar'
    });
    assert.match(prompt, /Reply in Arabic only/);
    assert.match(prompt, /Use ONLY the lesson material below/);
});

test('no student name is ever part of the tutor prompts', () => {
    const ask = buildTutorPrompt({ question: 'q', lessons: [lesson('a')] });
    const practice = buildPracticePrompt({ lessons: [lesson('a')] });
    for (const prompt of [ask, practice]) {
        assert.equal(/studentName|firstName|lastName|email/i.test(prompt), false);
    }
});

test('a first question must be answered with an invite to try, never an explanation', () => {
    const prompt = buildTutorPrompt({ question: 'Why do gases spread?', lessons: [lesson('a')], tries: 0 });
    assert.match(prompt, /has not tried yet/);
    assert.match(prompt, /Do NOT explain, hint or give the answer/);
    assert.match(prompt, /explain in their own words/);
    assert.match(prompt, /\[TRY\]/);
    assert.match(prompt, /\[HINT\]/);
    assert.match(prompt, /\[ANSWER\]/);
});

test('after one try the tutor may give exactly one hint and no answer', () => {
    const prompt = buildTutorPrompt({ question: 'q', lessons: [lesson('a')], tries: 1 });
    assert.match(prompt, /has tried once/);
    assert.match(prompt, /ONE hint only/);
    assert.match(prompt, /Do NOT explain the whole idea and do NOT give the answer/);
});

test('only after two tries may the tutor explain, and then asks for an explain-back', () => {
    const prompt = buildTutorPrompt({ question: 'q', lessons: [lesson('a')], tries: 2 });
    assert.match(prompt, /has tried 2 times/);
    assert.match(prompt, /may now explain the idea fully/);
    assert.match(prompt, /explain it back in their own words/);
});

test('the earlier thread is part of the prompt so the ladder can follow it', () => {
    const prompt = buildTutorPrompt({
        question: 'I think gases move fast',
        lessons: [lesson('a')],
        tries: 1,
        history: [
            { role: 'student', text: 'Why do gases spread?', stage: null },
            { role: 'tutor', text: 'What do you already know about particles?', stage: 'prompt' }
        ]
    });
    assert.match(prompt, /CONVERSATION SO FAR/);
    assert.match(prompt, /Student: Why do gases spread\?/);
    assert.match(prompt, /You: What do you already know about particles\?/);
});

test('the stage tag is removed before the student reads the reply', () => {
    assert.deepEqual(readTutorReply('[HINT]\nThink about the particles.'), {
        stage: 'hint',
        text: 'Think about the particles.'
    });
    assert.deepEqual(readTutorReply('[ANSWER] Gases spread because particles move.'), {
        stage: 'answer',
        text: 'Gases spread because particles move.'
    });
    assert.equal(readTutorReply('[TRY] What do you think happens?').stage, 'prompt');
    assert.equal(readTutorReply('No tag here.').stage, 'hint');
    assert.equal(readTutorReply('[HINT]\nText').text.includes('['), false);
});

test('tries count the attempts after the question and restart after an explanation', () => {
    const question = { role: 'student', text: 'How does this work?' };
    assert.equal(countTries([]), 0);
    assert.equal(countTries([question]), 0);
    assert.equal(countTries([question, { role: 'tutor', stage: 'prompt' }]), 0);
    assert.equal(
        countTries([question, { role: 'tutor', stage: 'prompt' }, { role: 'student', text: 'a guess' }]),
        1
    );
    assert.equal(
        countTries([
            question,
            { role: 'tutor', stage: 'prompt' },
            { role: 'student', text: 'a guess' },
            { role: 'tutor', stage: 'hint' },
            { role: 'student', text: 'another guess' }
        ]),
        2
    );
    assert.equal(
        countTries([
            question,
            { role: 'tutor', stage: 'prompt' },
            { role: 'student', text: 'a' },
            { role: 'tutor', stage: 'hint' },
            { role: 'student', text: 'b' },
            { role: 'tutor', stage: 'answer' },
            { role: 'student', text: 'next question' }
        ]),
        0
    );
});

test('the practice prompt asks for one JSON object with an answer index', () => {
    const prompt = buildPracticePrompt({ lessons: [lesson('a')], subjectName: 'Science', grade: 5 });
    assert.match(prompt, /Return ONLY one JSON object/);
    assert.match(prompt, /"answer":0/);
    assert.match(prompt, /Exactly 4 options/);
});

/* ------------------------------------------------------------------ */
/* Practice                                                            */
/* ------------------------------------------------------------------ */

test('practice questions are read from the model reply and bad rows are dropped', () => {
    const questions = normalizePracticeQuestions({
        questions: [
            { question: 'A?', options: ['one', 'two'], answer: 1, explanation: 'because' },
            { question: 'A?', options: ['dup', 'dup'], answer: 0 },
            { question: 'B?', options: ['x'], answer: 0 },
            { question: 'C?', options: ['x', 'y', 'z'], answer: 'z' },
            { question: 'D?', options: ['x', 'y'], answer: 9 }
        ]
    });
    assert.deepEqual(questions.map((row) => row.question), ['A?', 'C?']);
    assert.equal(questions[1].correctIndex, 2);
});

test('marking compares every answer and refuses an incomplete set', () => {
    const questions = [
        { options: ['a', 'b'], correctIndex: 0 },
        { options: ['a', 'b'], correctIndex: 1 }
    ];
    assert.deepEqual(gradePractice(questions, [0, 0]), {
        results: [{ choiceIndex: 0, correct: true }, { choiceIndex: 0, correct: false }],
        score: 1,
        total: 2
    });
    assert.throws(() => gradePractice(questions, [0]), /Answer every question/);
    assert.throws(() => gradePractice(questions, [5, 0]), /no valid answer/);
});

/* ------------------------------------------------------------------ */
/* Access and credit                                                   */
/* ------------------------------------------------------------------ */

test('the school switch beats the class switch and a paused wallet beats both', () => {
    assert.deepEqual(resolveAccess({ settings: { enabled: false } }), { allowed: false, reason: 'school_off' });
    assert.deepEqual(
        resolveAccess({ settings: { enabled: true }, classAccess: { status: 'locked' } }),
        { allowed: false, reason: 'class_locked' }
    );
    assert.deepEqual(
        resolveAccess({ settings: { enabled: true }, classAccess: { status: 'paused' } }),
        { allowed: false, reason: 'class_paused' }
    );
    assert.deepEqual(
        resolveAccess({ settings: { enabled: true }, walletPaid: true }),
        { allowed: false, reason: 'wallet_paused' }
    );
    assert.deepEqual(resolveAccess({ settings: { enabled: true } }), { allowed: true, reason: '' });
});

test('the student is told about low and empty credit in plain counts', () => {
    assert.equal(walletNotice({ credits: 12 }).level, 'ok');
    assert.equal(walletNotice({ credits: 3 }).level, 'low');
    assert.equal(walletNotice({ credits: 0 }).level, 'empty');
    assert.equal(walletNotice({ credits: -4 }).credits, 0);
});

test('the outline groups lessons under units and chapters', () => {
    const outline = summarizeLessonsByUnit([
        { unitNumber: 2, unitTitle: 'Energy', chapterNumber: null, lessonNumber: 1, title: 'Heat' },
        { unitNumber: 1, unitTitle: 'Matter', chapterNumber: 1, chapterTitle: 'States', lessonNumber: 1, title: 'Solids' },
        { unitNumber: 1, unitTitle: 'Matter', chapterNumber: 2, chapterTitle: 'Changes', lessonNumber: 2, title: 'Melting' }
    ]);
    assert.equal(outline[0].unitTitle, 'Matter');
    assert.deepEqual(outline[0].chapters.map((chapter) => chapter.chapterTitle), ['States', 'Changes']);
    assert.equal(outline[1].lessons[0].title, 'Heat');
});

/* ------------------------------------------------------------------ */
/* Boundaries                                                          */
/* ------------------------------------------------------------------ */

test('only the tutor service reaches the AI, and marking never does', () => {
    const core = read('services/tutorCore.js');
    const controller = read('controllers/tutorController.js');
    const service = read('services/tutorService.js');
    assert.equal(/connectAi|aiservice/.test(core), false);
    assert.equal(/connectAi|aiservice/.test(controller), false);
    assert.match(service, /connectAi/);

    const submit = service.slice(
        service.indexOf('export const submitPractice'),
        service.indexOf('export const getPracticeSet')
    );
    assert.ok(submit.length > 0);
    assert.equal(/connectAi|buildPracticePrompt/.test(submit), false);
});

test('every tutor AI call asks for GPT, never the default provider', () => {
    const service = read('services/tutorService.js');
    const calls = service.match(/connectAi\([^;]*;/g) || [];
    assert.equal(calls.length > 0, true);
    assert.match(service, /provider:\s*'openai'/);
    for (const call of calls) {
        assert.match(call, /TUTOR_AI/);
    }
});

test('the student read routes never mount an AI call', () => {
    const routes = read('routes/tutorRoutes.js');
    const grading = routes.split('\n').find((line) => line.includes("practice/:practiceId/submit"));
    assert.ok(grading);
    assert.equal(/askTutor|createPractice/.test(grading), false);
});

test('student-facing credit and access copy carries no prices or jargon', () => {
    const source = read('services/tutorService.js');
    const studentStrings = source.match(/'(You have used all your tutor questions[^']*|You have asked[^']*)'/g) || [];
    assert.ok(studentStrings.length >= 2);
    for (const copy of studentStrings) {
        assert.equal(/cent|token|USD|\$|API|model/i.test(copy), false, copy);
    }
});
