import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import AssignmentType from '../models/AssignmentType.js';
import Class from '../models/Class.js';
import { draftAssignmentBrief } from '../controllers/assignmentController.js';
import {
    MAX_BRIEF_INSTRUCTIONS_CHARS,
    MAX_BRIEF_SUMMARY_CHARS,
    MAX_BRIEF_TITLE_CHARS,
    buildBriefPrompt,
    draftAssignmentBriefFromText,
    normalizeBriefSourceUsage
} from '../services/assignmentBriefAiService.js';

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
    usage: { prompt_tokens: 400, completion_tokens: 140, total_tokens: 540 }
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

test('source usage accepts arrays, JSON strings, comma lists and drops unknown values', () => {
    assert.deepEqual(normalizeBriefSourceUsage(['form', 'nonsense']), ['form']);
    assert.deepEqual(normalizeBriefSourceUsage('["attachment","form","form"]'), ['attachment', 'form']);
    assert.deepEqual(normalizeBriefSourceUsage('form, attachment'), ['form', 'attachment']);
    assert.deepEqual(normalizeBriefSourceUsage(undefined), []);
});

test('the prompt grounds the draft in the source, type and chosen usage', () => {
    const prompt = buildBriefPrompt({
        sourceText: 'Students read pages 8 and 9 and answer questions 1 to 4.',
        assignmentTypeKey: 'homework',
        assignmentTypeName: 'Homework',
        sourceUsage: ['form', 'attachment'],
        formContext: ['What is a solid?', 'Name one gas.'],
        isGraded: true
    });

    assert.match(prompt, /ASSIGNMENT TYPE\n- Homework/);
    assert.match(prompt, /SOURCE MATERIAL \(the only facts you may use\)/);
    assert.match(prompt, /Students read pages 8 and 9/);
    assert.match(prompt, /Google Form quiz/);
    assert.match(prompt, /What is a solid\?/);
    assert.match(prompt, /the attached file/);
    assert.match(prompt, /Never invent facts, names, dates, deadlines, links, question text, marks or grading criteria/);
    assert.match(prompt, /"summary"/);
});

test('lesson summaries keep the past-tense recap voice and are never graded', () => {
    const prompt = buildBriefPrompt({
        sourceText: 'We compared solids, liquids and gases.',
        assignmentTypeKey: 'lesson_summary',
        assignmentTypeName: 'Lesson Summary',
        sourceUsage: [],
        isGraded: false
    });

    assert.match(prompt, /In this lesson we/);
    assert.match(prompt, /past tense/);
    assert.match(prompt, /\(not graded\)/);
    assert.match(prompt, /Do not mention marks, grades or scores/);
    assert.doesNotMatch(prompt, /Google Form quiz/);
});

test('a valid reply becomes title, summary and instructions', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        title: '  Solids and gases  ',
        summary: '  A short reading task about states of matter.  ',
        instructions: '  1. Read pages 8 and 9.\n2. Answer questions 1 to 4.  '
    }))));

    const result = await draftAssignmentBriefFromText({
        sourceText: 'Students read pages 8 and 9 and answer questions 1 to 4.',
        assignmentTypeKey: 'homework',
        assignmentTypeName: 'Homework',
        sourceUsage: ['attachment']
    });

    assert.equal(result.title, 'Solids and gases');
    assert.equal(result.summary, 'A short reading task about states of matter.');
    assert.equal(result.instructions, '1. Read pages 8 and 9.\n2. Answer questions 1 to 4.');
});

test('the draft is capped to the saved schema limits', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        title: 't'.repeat(400),
        summary: 's'.repeat(900),
        instructions: 'i'.repeat(6000)
    }))));

    const result = await draftAssignmentBriefFromText({
        sourceText: 'Enough source text to draft an assignment from.',
        assignmentTypeKey: 'homework',
        assignmentTypeName: 'Homework'
    });

    assert.equal(result.title.length, MAX_BRIEF_TITLE_CHARS);
    assert.equal(result.summary.length, MAX_BRIEF_SUMMARY_CHARS);
    assert.equal(result.instructions.length, MAX_BRIEF_INSTRUCTIONS_CHARS);
});

test('a fenced JSON reply is still read', async (t) => {
    withOpenAiEnv(t);
    const payload = { title: 'Reading task', summary: 'A short reading.', instructions: 'Read the text.' };
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)));

    const result = await draftAssignmentBriefFromText({
        sourceText: 'Enough source text to draft an assignment from.',
        assignmentTypeKey: 'homework',
        assignmentTypeName: 'Homework'
    });
    assert.equal(result.title, 'Reading task');
});

test('two unusable replies fail with a retry-shaped error', async (t) => {
    withOpenAiEnv(t);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls += 1;
        return jsonResponse(openAiReply('I cannot help with that.'));
    });

    await assert.rejects(
        () => draftAssignmentBriefFromText({
            sourceText: 'Enough source text to draft an assignment from.',
            assignmentTypeKey: 'homework',
            assignmentTypeName: 'Homework'
        }),
        (error) => error.code === 'DRAFT_BRIEF_RESPONSE_INVALID' && calls === 2
    );
});

test('a reply missing the summary is refused', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        title: 'Only a title',
        instructions: 'Only instructions'
    }))));

    await assert.rejects(
        () => draftAssignmentBriefFromText({
            sourceText: 'Enough source text to draft an assignment from.',
            assignmentTypeKey: 'homework',
            assignmentTypeName: 'Homework'
        }),
        (error) => error.code === 'DRAFT_BRIEF_RESPONSE_INVALID'
    );
});

test('a file with too little text is refused before any AI call', async (t) => {
    withOpenAiEnv(t);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls += 1;
        return jsonResponse(openAiReply('{}'));
    });

    await assert.rejects(
        () => draftAssignmentBriefFromText({
            sourceText: 'Too short',
            assignmentTypeKey: 'homework',
            assignmentTypeName: 'Homework'
        }),
        (error) => error.code === 'DRAFT_BRIEF_SOURCE_TOO_SHORT'
    );
    assert.equal(calls, 0);
});

test('the endpoint asks for a file before doing any work', async (t) => {
    t.mock.method(Class, 'findOne', () => ({
        select: () => ({
            lean: async () => ({ _id: 'class-1', subjects: [{ subject: 'subject-1' }] })
        })
    }));
    t.mock.method(AssignmentType, 'findOne', async () => ({
        _id: 'type-homework',
        key: 'homework',
        name: 'Homework'
    }));

    const response = await invoke(draftAssignmentBrief, adminReq({
        body: {
            classId: 'class-1',
            subjectId: 'subject-1',
            assignmentTypeId: 'type-homework'
        }
    }));

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'DRAFT_SOURCE_REQUIRED');
});
