import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { buildFeedbackEmail } from '../services/writingFeedbackEmailService.js';

/**
 * Language corrections in the family email. Pure builders only: no transport,
 * no database. The student and the parent receive the same stored corrections.
 */

const assignment = {
    title: 'Longer recess',
    topic: 'Should our school have a longer recess?',
    writingType: 'essay',
    dueDate: new Date('2026-11-12T00:00:00.000Z'),
    sections: [{ key: 'intro' }, { key: 'body' }, { key: 'ending' }]
};

const draft = {
    number: 2,
    totalWords: 42,
    sections: [
        { key: 'intro', index: 0, text: 'Our school should have a longer recess.' },
        { key: 'body', index: 0, text: 'A longer recess helps students focus. We run around and then we sit still.' },
        { key: 'ending', index: 0, text: 'So I think recess should be longer.' }
    ]
};

const baseAssessment = {
    kind: 'feedback',
    language: 'en',
    overall: { summary: 'The order of your paragraphs is clear.', nextPriorities: [] },
    scores: []
};

const BODY = draft.sections[1].text;
const BODY_ROW = {
    category: 'verb_tense',
    original: 'run',
    correction: 'ran',
    explanation: 'Use the past tense for something that already happened.',
    anchor: { start: BODY.indexOf('run'), end: BODY.indexOf('run') + 3 }
};

const ENDING = draft.sections[2].text;
const ENDING_ROW = {
    category: 'punctuation',
    original: 'longer',
    correction: 'longer.',
    explanation: 'End the sentence with a full stop.',
    anchor: { start: ENDING.indexOf('longer'), end: ENDING.indexOf('longer') + 6 }
};

const assessmentWith = (sections) => ({
    ...baseAssessment,
    sections: sections || [
        {
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: ['You give one clear reason.'], improvements: [],
            evidence: 'recess helps students focus', nextStep: 'Add one example.', why: '',
            mechanics: [BODY_ROW]
        }
    ]
});

const build = (overrides = {}) => buildFeedbackEmail({
    role: 'student',
    language: 'en',
    studentFirstName: 'Areen',
    schoolName: 'Al Noor School',
    assignment,
    project: { stage: 'feedback_published', draftCount: 2 },
    draft,
    assessment: assessmentWith(),
    url: 'https://portal.example.com/portal/writing/project/p1',
    ...overrides
});

const redSpans = (html) => html.match(/background-color:#fee2e2/g) || [];

test('M01 the student email paints the exact span and lists the correction', () => {
    const message = build();

    assert.ok(message);
    // Exactly the wrong word is red; the rest of the sentence is not.
    assert.match(
        message.html,
        /<span style="background-color:#fee2e2;[^"]*">run<\/span><sup[^>]*>1<\/sup>/,
    );
    assert.equal(redSpans(message.html).length, 1);
    assert.match(message.html, /Language corrections/);
    assert.match(message.html, /Correction 1 — Verb tense/);
    assert.match(message.html, /Original: run/);
    assert.match(message.html, /Change to: ran/);
    assert.match(message.html, /Why: Use the past tense/);
    // The line under the paragraph is the teacher's own note, unchanged.
    assert.match(message.html, /Add one example\./);
});

test('M02 the parent email carries the same corrections, not a student hint', () => {
    const parent = build({ role: 'parent' });

    assert.ok(parent);
    assert.match(parent.html, /Dear parent or guardian,/);
    assert.equal(redSpans(parent.html).length, 1);
    assert.match(parent.html, /Correction 1 — Verb tense/);
    assert.match(parent.html, /Change to: ran/);
    assert.match(parent.html, /These are the language corrections to review with your child\./);
    assert.equal(parent.html.includes('Use these corrections when you revise this paragraph.'), false);
});

test('M03 the plain text keeps Original / Change to / Why for both audiences', () => {
    for (const role of ['student', 'parent']) {
        const message = build({ role });
        assert.match(message.text, /Language corrections/);
        assert.match(message.text, /Correction 1 — Verb tense/);
        assert.match(message.text, /Original: run/);
        assert.match(message.text, /Change to: ran/);
        assert.match(message.text, /Why: Use the past tense/);
        assert.equal(/<span|background-color/.test(message.text), false);
    }
});

test('M04 numbers follow reading order across the parts of one draft', () => {
    const message = build({
        assessment: {
            ...baseAssessment,
            sections: [
                {
                    key: 'ending', index: 0, label: 'Ending',
                    strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
                    mechanics: [ENDING_ROW]
                },
                {
                    key: 'body', index: 0, label: 'Body paragraph',
                    strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
                    mechanics: [BODY_ROW]
                }
            ]
        }
    });

    const marks = [...message.html.matchAll(/<sup[^>]*>(\d+)<\/sup>/g)].map((match) => Number(match[1]));
    assert.deepEqual(marks, [1, 2]);
    // Body comes before ending in the essay, so it is correction 1.
    const bodyAt = message.html.indexOf('Correction 1');
    const endingAt = message.html.indexOf('Correction 2');
    assert.ok(bodyAt > -1 && endingAt > -1 && bodyAt < endingAt);
    assert.match(message.html, /Correction 2 — Punctuation/);
});

test('M05 a correction that no longer matches the draft is listed, never painted', () => {
    const stale = {
        ...BODY_ROW,
        original: 'sprinted',
        anchor: { start: BODY.indexOf('sprinted'), end: BODY.indexOf('sprinted') + 8 }
    };
    const message = build({
        assessment: assessmentWith([{
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [BODY_ROW, stale]
        }])
    });

    assert.equal(redSpans(message.html).length, 1);
    assert.match(message.html, /Original: sprinted/);
    assert.match(message.html, /This correction refers to text not shown in this email\./);
});

test('M06 a clipped paragraph never paints a half span or the ellipsis', () => {
    const long = `${'word '.repeat(1200)}We run to the field.`;
    const message = build({
        assignment: { ...assignment, sections: [{ key: 'body' }] },
        draft: { number: 2, totalWords: 1203, sections: [{ key: 'body', index: 0, text: long }] },
        assessment: assessmentWith([{
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [{
                category: 'verb_tense', original: 'run', correction: 'ran',
                explanation: 'Use the past tense.',
                anchor: { start: long.indexOf('run'), end: long.indexOf('run') + 3 }
            }]
        }])
    });

    assert.equal(redSpans(message.html).length, 0);
    assert.match(message.html, /Original: run/);
    assert.match(message.html, /This correction refers to text not shown in this email\./);
    assert.match(message.html, /The rest of your draft is in the app\./);
    assert.equal(message.html.includes('…</span>'), false);
    assert.ok(message.html.length < 30000);
});

test('M07 a part left out of the excerpt keeps its correction and says so', () => {
    const long = 'word '.repeat(1400);
    const clippedDraft = {
        number: 2,
        totalWords: 1642,
        sections: [
            { key: 'body', index: 0, text: `${long}recess helps students focus.` },
            { key: 'ending', index: 0, text: ENDING }
        ]
    };
    const sections = [
        {
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [{
                category: 'spelling', original: 'recess', correction: 'recess',
                explanation: 'Check the spelling.',
                anchor: { start: long.length, end: long.length + 6 }
            }]
        },
        {
            key: 'ending', index: 0, label: 'Ending',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [ENDING_ROW]
        }
    ];

    const student = build({ draft: clippedDraft, assessment: assessmentWith(sections) });
    assert.match(student.html, /Ending/);
    assert.match(student.html, /Correction 2 — Punctuation/);
    assert.match(student.html, /Original: longer/);
    assert.match(student.html, /The rest of your draft is in the app\./);

    const parent = build({ role: 'parent', draft: clippedDraft, assessment: assessmentWith(sections) });
    assert.match(parent.html, /Correction 2 — Punctuation/);
    assert.match(parent.html, /This email contains an excerpt\. Ask the teacher for the remaining feedback\./);
    assert.equal(parent.html.includes('The rest of the draft is in the app.'), false);
});

test('M08 a missing draft keeps the corrections in the per-part fallback', () => {
    const message = build({
        draft: { number: 2, totalWords: 0, sections: [] },
        assignment: { ...assignment, sections: [] }
    });

    assert.ok(message);
    assert.match(message.html, /Feedback by part/);
    assert.match(message.html, /Correction 1 — Verb tense/);
    assert.match(message.html, /Change to: ran/);
    assert.equal((message.html.match(/Correction 1 — Verb tense/g) || []).length, 1);
    assert.match(message.text, /Feedback by part/);
    assert.match(message.text, /Correction 1 — Verb tense/);
});

test('M09 an incomplete or unavailable check is reported as published', () => {
    const partial = build({
        assessment: assessmentWith([{
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [BODY_ROW],
            mechanicsReview: { version: 1, status: 'partial', reasons: ['Truncated output'] }
        }])
    });
    assert.match(partial.html, /This language check is incomplete\. Some parts may need another review\./);
    assert.match(partial.text, /This language check is incomplete\./);

    const unavailable = build({
        assessment: assessmentWith([{
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [],
            mechanicsReview: { version: 1, status: 'unavailable', reasons: ['Model error'] }
        }])
    });
    assert.match(unavailable.html, /Language corrections are not available for this feedback\./);
    assert.match(unavailable.text, /Language corrections are not available for this feedback\./);
    // A teacher-only reason is not shown to a family.
    assert.equal(unavailable.html.includes('Model error'), false);
});

test('M10 legacy pairs list as language notes without a number or a span', () => {
    const message = build({
        assessment: assessmentWith([{
            key: 'body', index: 0, label: 'Body paragraph',
            strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
            mechanics: [{ original: 'go', correction: 'went' }]
        }])
    });

    assert.equal(redSpans(message.html).length, 0);
    assert.match(message.html, /Original: go/);
    assert.match(message.html, /Change to: went/);
    assert.equal(/Correction 1/.test(message.html), false);
    assert.equal(message.html.includes('This correction refers to text not shown'), false);
});

test('M11 the Arabic email is RTL copy with Arabic category labels', () => {
    const message = build({
        language: 'ar',
        assessment: {
            ...baseAssessment,
            language: 'ar',
            overall: { summary: 'ترتيب الفقرات واضح.', nextPriorities: [] },
            sections: assessmentWith().sections
        }
    });

    assert.ok(message);
    assert.match(message.html, /تصحيحات لغوية/);
    assert.match(message.html, /التصحيح 1 — زمن الفعل/);
    assert.match(message.html, /النص الأصلي: run/);
    assert.match(message.html, /التعديل المقترح: ran/);
    assert.match(message.html, /السبب: Use the past tense/);
    assert.match(message.text, /التصحيح 1 — زمن الفعل/);
    assert.equal(message.html.includes('Language corrections'), false);
});

test('M12 a normal four-paragraph essay fits Gmail and keeps every correction', () => {
    const filler = 'We explained our reason with one clear example and a short detail. '.repeat(3);
    const essay = {
        number: 2,
        totalWords: 340,
        sections: [
            { key: 'intro', index: 0, text: `Our scool should have a longer recess. ${filler}` },
            { key: 'body', index: 0, text: `A longer recess helps students focuss. ${filler}` },
            { key: 'body', index: 1, text: `We also lern better after we run outside. ${filler}` },
            { key: 'ending', index: 0, text: `So I think recess should be longerr. ${filler}` }
        ]
    };
    const makeRow = (text, wrong, right, category = 'spelling') => ({
        category,
        original: wrong,
        correction: right,
        explanation: 'Check this word here.',
        anchor: { start: text.indexOf(wrong), end: text.indexOf(wrong) + wrong.length }
    });
    const assessment = {
        ...baseAssessment,
        sections: [
            {
                key: 'body', index: 0, label: 'Body paragraph',
                strengths: ['Clear reason.'], improvements: [], evidence: '', nextStep: 'Add an example.', why: '',
                mechanics: [
                    makeRow(essay.sections[1].text, 'focuss', 'focus'),
                    makeRow(essay.sections[1].text, 'helps', 'help', 'grammar')
                ]
            },
            {
                key: 'body', index: 1, label: 'Body paragraph 2',
                strengths: [], improvements: [], evidence: '', nextStep: '', why: '',
                mechanics: [
                    makeRow(essay.sections[2].text, 'lern', 'learn'),
                    makeRow(essay.sections[2].text, 'run', 'ran', 'verb_tense')
                ]
            }
        ]
    };

    for (const role of ['student', 'parent']) {
        const message = build({ role, draft: essay, assessment });
        assert.ok(message);
        const bytes = Buffer.byteLength(message.html, 'utf8');
        assert.ok(bytes < 90000, `${role} email is ${bytes} bytes`);
        assert.equal(message.text.includes('Original: focuss'), true);
        assert.equal(message.text.includes('Original: lern'), true);
        assert.equal((message.html.match(/Correction [1-4] — (Spelling|Grammar|Verb tense)/g) || []).length, 4);
        assert.equal(redSpans(message.html).length, 4);
    }
});
