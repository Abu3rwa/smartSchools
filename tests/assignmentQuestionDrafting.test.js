import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import {
    MAX_SOURCE_CHARS,
    buildDraftPrompt,
    buildLessonSourceText,
    clampDraftCount,
    draftQuestionsFromText,
    normalizeDraftQuestions,
    normalizeDraftTypes
} from '../services/assignmentQuestionAiService.js';
import { extractDocumentText } from '../services/documentTextExtraction.js';
import { connectAi } from '../utils/connectAi.js';

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
    usage: { prompt_tokens: 900, completion_tokens: 220, total_tokens: 1120 }
});

const lesson = {
    title: 'States of matter',
    topic: 'Solids, liquids and gases',
    teachingObjectives: 'Explain how particles behave in each state.',
    objectives: [{ text: 'Describe how gases spread to fill a container' }],
    vocabulary: 'particle, volume, diffusion',
    stages: [{ name: 'Warm up', procedure: 'Compare a liquid and a gas', materials: 'two balloons' }],
    extractedMaterialText: 'Particles in a gas move quickly and spread out.',
    contextText: ''
};

test('drafts take a sane count and only known question types', () => {
    assert.equal(clampDraftCount(undefined), 5);
    assert.equal(clampDraftCount('7'), 7);
    assert.equal(clampDraftCount(0), 1);
    assert.equal(clampDraftCount(500), 30);
    assert.deepEqual(normalizeDraftTypes(['multiple_choice', 'nonsense']), ['multiple_choice']);
    assert.deepEqual(normalizeDraftTypes([]), ['multiple_choice', 'true_false']);
});

test('the lesson source keeps what the teacher wrote and drops empty fields', () => {
    const source = buildLessonSourceText([lesson]);
    assert.match(source, /LESSON: States of matter/);
    assert.match(source, /Teaching objectives: Explain how particles behave/);
    assert.match(source, /- Describe how gases spread/);
    assert.match(source, /Vocabulary: particle, volume, diffusion/);
    assert.match(source, /Lesson stages:\n- Warm up: Compare a liquid and a gas Materials: two balloons/);
    assert.match(source, /Particles in a gas move quickly/);
    assert.doesNotMatch(source, /Additional context/);

    const long = buildLessonSourceText([{ ...lesson, extractedMaterialText: 'x'.repeat(MAX_SOURCE_CHARS + 50) }]);
    assert.equal(long.length, MAX_SOURCE_CHARS);
});

test('the prompt pins the count, the allowed types and the grounding rules', () => {
    const prompt = buildDraftPrompt({
        sourceText: 'Gas particles move quickly.',
        count: 4,
        types: ['multiple_choice', 'true_false']
    });
    assert.match(prompt, /Exactly 4 questions\./);
    assert.match(prompt, /- multiple choice/);
    assert.match(prompt, /- true or false/);
    assert.match(prompt, /Never invent facts, names, dates or numbers/);
    assert.match(prompt, /same language as the source material/);
    assert.match(prompt, /Return exactly one JSON object/);
});

test('the prompt asks for a grading rubric on every short answer', () => {
    const prompt = buildDraftPrompt({
        sourceText: 'Gas particles move quickly.',
        count: 2,
        types: ['short_answer']
    });
    assert.match(prompt, /"rubric":/);
    assert.match(prompt, /"rubric" is required for short-answer questions/);
    assert.match(prompt, /partial credit/);
});

test('a valid model reply becomes questions the Google Form builder accepts', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(JSON.stringify({
        questions: [
            { type: 'multiple_choice', title: 'Which gas do plants take in?', options: ['Oxygen', 'Carbon dioxide', 'Helium'], correctAnswer: 'Carbon dioxide', points: 2 },
            { type: 'true_false', title: 'Gases spread to fill their container.', options: ['True', 'False'], correctAnswer: 'TRUE', points: 1 },
            { type: 'short_answer', title: 'Name one gas in air.', modelAnswer: 'Nitrogen', points: 4 }
        ]
    }))));

    const result = await draftQuestionsFromText({
        sourceText: 'Plants take in carbon dioxide.',
        count: 5,
        types: ['multiple_choice', 'true_false', 'short_answer']
    });

    assert.equal(result.questions.length, 3);
    assert.deepEqual(result.questions[0], {
        type: 'multiple_choice',
        title: 'Which gas do plants take in?',
        options: ['Oxygen', 'Carbon dioxide', 'Helium'],
        correctAnswer: 'Carbon dioxide',
        points: 2
    });
    assert.equal(result.questions[1].correctAnswer, 'True');
    assert.equal(result.questions[2].points, 4);
    assert.equal(result.questions[2].type, 'short_answer');
    assert.equal(result.questions[2].modelAnswer, 'Nitrogen');
});

test('short-answer drafts default to 1 point and keep the rubric as an editable draft', () => {
    const questions = normalizeDraftQuestions({
        questions: [
            { type: 'short_answer', title: 'Why do gases spread?', modelAnswer: 'Particles move quickly.', rubric: '1 point for mentioning particle movement.' },
            { type: 'short_answer', title: 'Name a state of matter.' }
        ]
    }, { count: 5, types: ['short_answer'] });

    assert.equal(questions.length, 2);
    assert.deepEqual(questions[0], {
        type: 'short_answer',
        title: 'Why do gases spread?',
        points: 1,
        modelAnswer: 'Particles move quickly.',
        rubric: '1 point for mentioning particle movement.'
    });
    assert.equal(questions[1].points, 1);
    assert.equal(questions[1].modelAnswer, '');
});

test('a fenced JSON reply is still read', async (t) => {
    withOpenAiEnv(t);
    const payload = { questions: [{ type: 'multiple_choice', title: 'Pick one', options: ['A', 'B'], correctAnswer: 'B', points: 1 }] };
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)));

    const result = await draftQuestionsFromText({ sourceText: 'Some material', count: 1, types: ['multiple_choice'] });
    assert.equal(result.questions.length, 1);
});

test('two unusable replies fail with a retry-shaped error instead of empty questions', async (t) => {
    withOpenAiEnv(t);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls += 1;
        return jsonResponse(openAiReply('I am sorry, I cannot do that.'));
    });

    await assert.rejects(
        () => draftQuestionsFromText({ sourceText: 'Some material', count: 2, types: ['multiple_choice'] }),
        (error) => error.code === 'DRAFT_RESPONSE_INVALID' && calls === 2
    );
});

test('malformed questions are dropped, never guessed at', () => {
    const questions = normalizeDraftQuestions({
        questions: [
            { type: 'multiple_choice', title: 'No key', options: ['A', 'B'] },
            { type: 'multiple_choice', title: 'One option', options: ['A'], correctAnswer: 'A' },
            { type: 'essay', title: 'Unsupported type', correctAnswer: 'x' },
            { type: 'short_answer', title: '  ' },
            { type: 'true_false', title: 'Water boils at 100 C.', correctAnswer: 'definitely' },
            { type: 'multiple_choice', title: 'Duplicate', options: ['A', 'B'], correctAnswer: 'A' },
            { type: 'multiple_choice', title: 'duplicate', options: ['A', 'B'], correctAnswer: 'B' },
            { type: 'multiple_choice', title: 'Kept', options: ['A', 'B', 'C'], correctAnswer: 'C', points: 9 }
        ]
    }, { count: 10, types: ['multiple_choice', 'true_false', 'short_answer'] });

    assert.deepEqual(questions.map((question) => question.title), ['Duplicate', 'Kept']);
    assert.equal(questions[1].points, 5);
});

test('an empty source is refused before any AI call', async () => {
    await assert.rejects(
        () => draftQuestionsFromText({ sourceText: '   ', count: 3, types: ['multiple_choice'] }),
        (error) => error.code === 'DRAFT_SOURCE_EMPTY'
    );
});

test('uploads are refused with a fixable message', async () => {
    await assert.rejects(
        () => extractDocumentText({ buffer: Buffer.alloc(0), mimeType: 'application/pdf' }),
        (error) => error.code === 'DOCUMENT_EMPTY_FILE'
    );
    await assert.rejects(
        () => extractDocumentText({ buffer: Buffer.from('hello'), mimeType: 'text/plain' }),
        (error) => error.code === 'DOCUMENT_TYPE_UNSUPPORTED' && /PDF, JPG, PNG or WebP/.test(error.message)
    );
    await assert.rejects(
        () => extractDocumentText({ buffer: Buffer.alloc(11 * 1024 * 1024), mimeType: 'image/png' }),
        (error) => error.code === 'DOCUMENT_TOO_LARGE'
    );
});

test('a photo is transcribed by one vision call and never stored', async (t) => {
    withOpenAiEnv(t, { OPENAI_VISION_MODEL: 'gpt-vision-test' });
    let requestBody = null;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
        requestBody = JSON.parse(init.body);
        return jsonResponse(openAiReply('Chapter 1\nParticles move quickly.'));
    });

    const result = await extractDocumentText({
        buffer: Buffer.from('fake-image-bytes'),
        mimeType: 'image/png'
    });

    assert.equal(requestBody.model, 'gpt-vision-test');
    assert.equal(Array.isArray(requestBody.messages[0].content), true);
    assert.equal(requestBody.messages[0].content[0].type, 'text');
    assert.equal(
        requestBody.messages[0].content[1].image_url.url,
        `data:image/png;base64,${Buffer.from('fake-image-bytes').toString('base64')}`
    );
    assert.match(result.text, /Particles move quickly/);
    assert.equal(result.sourceType, 'image');
    assert.equal(result.truncated, false);
});

test('a photo with no readable text says how to fix it', async (t) => {
    withOpenAiEnv(t);
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(openAiReply('NO_TEXT_FOUND')));

    await assert.rejects(
        () => extractDocumentText({ buffer: Buffer.from('blur'), mimeType: 'image/jpeg' }),
        (error) => error.code === 'DOCUMENT_NO_TEXT' && /clearer/.test(error.message)
    );
});

test('the gateway still refuses hosted image URLs from older callers', async (t) => {
    withOpenAiEnv(t);
    await assert.rejects(
        () => connectAi('Describe.', { imageUrls: ['https://example.com/a.png'] }),
        (error) => error.status === 400 && /Image input is not supported/.test(error.message)
    );
});
