import test from 'node:test';
import assert from 'node:assert/strict';

import {
    alignSections,
    buildDraftSections,
    buildTracker,
    buildWorkingSections,
    canMoveTo,
    canStudentSubmit,
    configSnapshotFor,
    countWords,
    guardRecommendation,
    sectionTotalWords,
    stageAfterPublish,
    stageAfterSubmit,
    studentNextAction,
    summarizeBoard,
    validateSubmission
} from '../services/writingAssistantLogic.js';
import {
    decideRecommendation,
    extractJsonObject,
    normalizeComparison,
    normalizeFeedback,
    renderDraftForPrompt
} from '../services/writingAssistantPrompts.js';
import { presetRubric, presetSections } from '../constants/writingPresets.js';

const essay = () => ({
    _id: 'a1',
    school: 's1',
    title: 'School uniforms',
    writingType: 'essay',
    instructions: 'Say what you think about school uniforms.',
    expectedLevel: 'Grade 6',
    minWords: 40,
    maxWords: 300,
    sections: presetSections('essay'),
    rubric: presetRubric(),
    workflow: { teacherPublishesFeedback: true, maxDrafts: 4, requireNotebookCheck: true }
});

const filled = () => [
    {
        key: 'introduction',
        index: 0,
        text: 'I think uniforms are fair because everyone looks the same and nobody is judged on clothes.'
    },
    {
        key: 'body',
        index: 0,
        text: 'First, uniforms save time in the morning because my mother does not have to pick my clothes.'
    },
    {
        key: 'body',
        index: 1,
        text: 'Second, uniforms help me concentrate on learning instead of comparing what other students wear.'
    },
    { key: 'conclusion', index: 0, text: 'For these reasons I would keep uniforms at our school.' }
];

/** Replace one slot's text, or add extra slots, without rebuilding the whole draft. */
const draftWith = (overrides = []) => {
    const rows = filled();
    return rows.map(
        (row) => overrides.find((next) => next.key === row.key && next.index === row.index) || row
    ).concat(overrides.filter(
        (next) => !rows.some((row) => row.key === next.key && row.index === next.index)
    ));
};

/* ------------------------------------------------------------------ */
/* Word counting                                                       */
/* ------------------------------------------------------------------ */

test('countWords collapses whitespace and ignores punctuation-only text', () => {
    assert.equal(countWords('  one   two\n\tthree  '), 3);
    assert.equal(countWords('...'), 1);
    assert.equal(countWords(''), 0);
    assert.equal(countWords(null), 0);
});

test('countWords counts Arabic words the same way', () => {
    assert.equal(countWords('أعتقد أن الزي المدرسي   عادل'), 5);
});

test('sectionTotalWords adds up only the text', () => {
    assert.equal(sectionTotalWords([
        { text: 'one two three' },
        { text: 'four' },
        { text: '' }
    ]), 4);
});

/* ------------------------------------------------------------------ */
/* Structure seeding                                                   */
/* ------------------------------------------------------------------ */

test('buildWorkingSections seeds every section, with repeats at their minimum', () => {
    const slots = buildWorkingSections(essay());
    const keys = slots.map((slot) => `${slot.key}:${slot.index}`);

    assert.deepEqual(keys, [
        'introduction:0',
        'body:0',
        'body:1',
        'counterargument:0',
        'rebuttal:0',
        'conclusion:0'
    ]);
    assert.equal(slots[1].label, 'Body paragraph 1');
    assert.equal(slots[2].label, 'Body paragraph 2');
});

test('configSnapshotFor keeps only what a draft must be judged against', () => {
    const snapshot = configSnapshotFor(essay());
    assert.equal(snapshot.title, 'School uniforms');
    assert.equal(snapshot.expectedLevel, 'Grade 6');
    assert.deepEqual(Object.keys(snapshot.sections[0]).sort(), [
        'criteria', 'instructions', 'key', 'kind', 'label', 'minWords', 'required'
    ]);
    assert.equal(snapshot.rubric.length, 4);
    assert.equal(snapshot.students, undefined);
});

test('buildDraftSections follows assignment order and drops unknown keys', () => {
    const rows = buildDraftSections({
        assignment: essay(),
        sections: [
            { key: 'conclusion', index: 0, text: 'End here.' },
            { key: 'nonsense', index: 0, text: 'Not in the assignment.' },
            { key: 'body', index: 1, text: 'Second reason paragraph.' },
            { key: 'body', index: 0, text: 'First reason paragraph.' },
            { key: 'introduction', index: 0, text: 'Opening line.' }
        ]
    });
    assert.deepEqual(rows.map((row) => `${row.key}:${row.index}`), [
        'introduction:0', 'body:0', 'body:1', 'conclusion:0'
    ]);
    assert.equal(rows[2].label, 'Body paragraph 2');
    assert.equal(rows[0].words, 2);
});

/* ------------------------------------------------------------------ */
/* Submission validation                                               */
/* ------------------------------------------------------------------ */

test('a complete draft passes validation and reports its word count', () => {
    const result = validateSubmission({ assignment: essay(), sections: filled() });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.ok(result.totalWords >= 40);
    assert.equal(result.totalWords, result.perSectionWords.reduce((sum, row) => sum + row.words, 0));
});

test('missing and empty required sections are both refused', () => {
    const missing = validateSubmission({
        assignment: essay(),
        sections: [
            { key: 'introduction', index: 0, text: 'An opening sentence about uniforms.' },
            { key: 'body', index: 0, text: 'One body paragraph with a reason in it.' }
        ]
    });
    assert.ok(missing.errors.some((error) => error.code === 'missing_required' && error.key === 'conclusion'));

    const empty = validateSubmission({
        assignment: essay(),
        sections: draftWith([{ key: 'conclusion', index: 0, text: '   ' }])
    });
    assert.ok(empty.errors.some((error) => error.code === 'empty_section'));
});

test('optional counterargument and rebuttal are not demanded', () => {
    const result = validateSubmission({ assignment: essay(), sections: filled() });
    assert.ok(!result.errors.some((error) => error.key === 'counterargument'));
    assert.ok(!result.errors.some((error) => error.key === 'rebuttal'));
});

test('leaving an optional section empty does not block the submission', () => {
    const result = validateSubmission({
        assignment: essay(),
        sections: draftWith([
            { key: 'counterargument', index: 0, text: '' },
            { key: 'rebuttal', index: 0, text: '' }
        ])
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('extra body paragraphs beyond maxCount are refused', () => {
    const capped = essay();
    capped.sections = capped.sections.map((section) => (
        section.key === 'body' ? { ...section, maxCount: 2 } : section
    ));
    const result = validateSubmission({
        assignment: capped,
        sections: draftWith([{ key: 'body', index: 2, text: 'A third body paragraph nobody asked for.' }])
    });
    assert.ok(result.errors.some((error) => error.code === 'too_many' && error.key === 'body'));
});

test('a repeatable section below its minimum asks for more', () => {
    const result = validateSubmission({
        assignment: essay(),
        sections: filled().filter((row) => !(row.key === 'body' && row.index === 1)).concat(
            { key: 'conclusion', index: 0, text: 'Closing sentence here.' }
        )
    });
    assert.ok(result.errors.some((error) => error.code === 'too_few' && error.key === 'body'));
});

test('whole-piece and per-section word limits are enforced', () => {
    const tooShort = validateSubmission({
        assignment: essay(),
        sections: [
            { key: 'introduction', index: 0, text: 'Idea.' },
            { key: 'body', index: 0, text: 'Idea.' },
            { key: 'body', index: 1, text: 'Idea.' },
            { key: 'conclusion', index: 0, text: 'Idea.' }
        ]
    });
    assert.ok(tooShort.errors.some((error) => error.code === 'too_short'));

    const withMin = essay();
    withMin.sections = withMin.sections.map((section) => ({ ...section, minWords: 22 }));
    const shortSection = validateSubmission({ assignment: withMin, sections: filled() });
    assert.ok(shortSection.errors.some((error) => error.code === 'section_too_short'));

    const withMax = essay();
    withMax.maxWords = 20;
    const tooLong = validateSubmission({ assignment: withMax, sections: filled() });
    assert.ok(tooLong.errors.some((error) => error.code === 'too_long'));
});

test('unknown section keys cannot be smuggled into a submission', () => {
    const result = validateSubmission({
        assignment: essay(),
        sections: draftWith([{ key: 'secret', index: 0, text: 'Extra text nobody asked for.' }])
    });
    assert.ok(result.errors.some((error) => error.code === 'unknown_section'));
});

/* ------------------------------------------------------------------ */
/* Stage machine                                                       */
/* ------------------------------------------------------------------ */

test('submissions always land in submitted and wait for the teacher', () => {
    assert.equal(stageAfterSubmit(), 'submitted');
    assert.equal(stageAfterPublish(), 'feedback_published');
});

test('a student can start, keep writing, and revise after published feedback', () => {
    for (const stage of ['not_started', 'drafting', 'feedback_published', 'revising', 'compared']) {
        const gate = canStudentSubmit({ project: { stage, draftCount: 1 }, assignment: essay() });
        assert.equal(gate.allowed, true, `${stage} should allow submitting`);
    }
});

test('a student cannot submit while a draft is with the teacher or the notebook is being checked', () => {
    for (const stage of ['submitted', 'feedback_ready', 'awaiting_notebook_check', 'ready_for_notebook', 'completed']) {
        const gate = canStudentSubmit({ project: { stage, draftCount: 1 }, assignment: essay() });
        assert.equal(gate.allowed, false, `${stage} should block submitting`);
    }
});

test('the draft limit stops further submissions', () => {
    const gate = canStudentSubmit({
        project: { stage: 'feedback_published', draftCount: 4 },
        assignment: essay()
    });
    assert.equal(gate.allowed, false);
    assert.match(gate.reason, /4 drafts/);
});

test('a teacher stage lock blocks automatic movement but not the locked stage', () => {
    const project = { teacherOverride: { stageLockedTo: 'revising' } };
    assert.equal(canMoveTo(project, 'revising'), true);
    assert.equal(canMoveTo(project, 'ready_for_notebook'), false);
    assert.equal(canMoveTo({ teacherOverride: {} }, 'ready_for_notebook'), true);
});

test('the next action tells a waiting student the draft is with the teacher', () => {
    const action = studentNextAction({
        project: { stage: 'submitted', draftCount: 2 },
        assignment: essay(),
        publishedAssessment: null
    });
    assert.equal(action.action, 'wait');
    assert.equal(action.primary, false);
    assert.match(action.label, /draft 2/);
});

test('a published recommendation of notebook offers the handwritten copy', () => {
    const action = studentNextAction({
        project: { stage: 'compared', draftCount: 2 },
        assignment: essay(),
        publishedAssessment: { recommendation: { path: 'notebook' } }
    });
    assert.equal(action.action, 'notebook');

    const revise = studentNextAction({
        project: { stage: 'compared', draftCount: 2 },
        assignment: essay(),
        publishedAssessment: { recommendation: { path: 'revise' } }
    });
    assert.equal(revise.action, 'revise');
});

/* ------------------------------------------------------------------ */
/* Board and tracker                                                   */
/* ------------------------------------------------------------------ */

test('summarizeBoard groups students by what the teacher must do', () => {
    const summary = summarizeBoard([
        { stage: 'not_started' },
        { stage: 'drafting' },
        { stage: 'submitted' },
        { stage: 'submitted' },
        { stage: 'feedback_ready' },
        { stage: 'revising' },
        { stage: 'ready_for_notebook' },
        { stage: 'awaiting_notebook_check' },
        { stage: 'completed' }
    ]);
    assert.equal(summary.total, 9);
    assert.equal(summary.notStarted, 2);
    assert.equal(summary.awaitingAssessment, 2);
    assert.equal(summary.awaitingPublish, 1);
    assert.equal(summary.revising, 1);
    assert.equal(summary.completed, 1);
});

test('the tracker drops steps the configuration does not use', () => {
    const single = buildTracker({
        assignment: { workflow: { maxDrafts: 1, requireNotebookCheck: false } },
        project: { stage: 'not_started', draftCount: 0 },
        hasComparison: false
    });
    assert.deepEqual(single.map((step) => step.key), ['draft_1', 'feedback_1', 'next_step', 'completed']);

    const full = buildTracker({
        assignment: { workflow: { maxDrafts: 4, requireNotebookCheck: true } },
        project: { stage: 'not_started', draftCount: 0 },
        hasComparison: false
    });
    assert.deepEqual(full.map((step) => step.key), [
        'draft_1', 'feedback_1', 'draft_2', 'compare', 'next_step', 'notebook_check', 'completed'
    ]);
    assert.equal(full[0].state, 'current');
    assert.equal(full[1].state, 'upcoming');
});

/* ------------------------------------------------------------------ */
/* Draft comparison                                                    */
/* ------------------------------------------------------------------ */

test('alignSections separates changed, added and removed sections', () => {
    const previous = [
        { key: 'introduction', index: 0, text: 'Old opening.' },
        { key: 'body', index: 0, text: 'Unchanged body.' },
        { key: 'conclusion', index: 0, text: 'Deleted ending.' }
    ];
    const current = [
        { key: 'introduction', index: 0, text: 'A better opening with a reason.' },
        { key: 'body', index: 0, text: 'Unchanged body.' },
        { key: 'body', index: 1, text: 'A brand new second reason.' }
    ];
    const alignment = alignSections(previous, current);

    assert.equal(alignment.matched.length, 2);
    assert.equal(alignment.changedCount, 1);
    assert.equal(alignment.added.length, 1);
    assert.equal(alignment.removed.length, 1);
    assert.equal(alignment.matched[0].wordDelta, 4);
});

test('a revision that only adds a section still reports zero changed paragraphs', () => {
    const same = [{ key: 'body', index: 0, text: 'Same words here.' }];
    const alignment = alignSections(same, [...same, { key: 'body', index: 1, text: 'New one.' }]);
    assert.equal(alignment.changedCount, 0);
    assert.equal(alignment.added.length, 1);
});

/* ------------------------------------------------------------------ */
/* Recommendation guard                                                */
/* ------------------------------------------------------------------ */

test('a generous AI notebook recommendation is overruled while the rubric has gaps', () => {
    const decision = guardRecommendation({
        aiPath: 'notebook',
        assessment: {
            comparison: { criteriaUnresolved: ['Organisation', 'Conventions'], newIssues: [] },
            scores: [
                { key: 'ideas', score: 2, maxScore: 5 },
                { key: 'organisation', score: 1, maxScore: 5 }
            ]
        },
        assignment: essay(),
        draftNumber: 2
    });
    assert.equal(decision.path, 'revise');
});

test('a strong rubric with nothing unresolved can go to the notebook', () => {
    const decision = guardRecommendation({
        aiPath: 'notebook',
        assessment: {
            comparison: { criteriaUnresolved: [], newIssues: [] },
            scores: [{ key: 'ideas', score: 5, maxScore: 5 }]
        },
        assignment: essay(),
        draftNumber: 2
    });
    assert.equal(decision.path, 'notebook');
});

test('running out of allowed drafts sends the student to the notebook', () => {
    const decision = guardRecommendation({
        aiPath: 'revise',
        assessment: { comparison: { criteriaUnresolved: ['Conventions'], newIssues: [] }, scores: [] },
        assignment: essay(),
        draftNumber: 4
    });
    assert.equal(decision.path, 'notebook');
    assert.match(decision.reason, /allows 4 drafts/);
});

/* ------------------------------------------------------------------ */
/* AI response parsing                                                 */
/* ------------------------------------------------------------------ */

test('extractJsonObject reads fenced, embedded and bare JSON', () => {
    assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
    assert.deepEqual(extractJsonObject('Here you go:\n```json\n{"a":2}\n```\nDone.'), { a: 2 });
    assert.deepEqual(extractJsonObject('prose {"a":{"b":3}} trailing'), { a: { b: 3 } });
    assert.equal(extractJsonObject('no json at all'), null);
});

test('renderDraftForPrompt labels sections and marks empty ones', () => {
    const rendered = renderDraftForPrompt({
        number: 1,
        sections: [
            { key: 'introduction', label: 'Introduction', text: 'My opening line.', words: 3 },
            { key: 'body', label: 'Body paragraph 1', text: '   ', words: 0 }
        ]
    });
    assert.match(rendered, /Introduction \(draft 1, 3 words\)/);
    assert.match(rendered, /\[empty\]/);
});

test('normalizeFeedback keeps real evidence and drops invented quotes', () => {
    const draft = {
        number: 1,
        sections: [{ key: 'introduction', index: 0, label: 'Introduction', text: 'I think uniforms are fair.' }]
    };
    const snapshot = configSnapshotFor(essay());
    const result = normalizeFeedback({
        draft,
        snapshot,
        parsed: {
            sections: [
                {
                    key: 'introduction',
                    index: 0,
                    strengths: ['Clear point of view'],
                    improvements: ['Add a second reason'],
                    evidence: 'uniforms are fair',
                    why: 'The reader knows where you stand.',
                    nextStep: 'Add one more reason.',
                    score: 99
                },
                {
                    key: 'made-up-section',
                    index: 0,
                    strengths: ['Nothing'],
                    evidence: 'a quote that is not in the draft at all'
                }
            ],
            overall: { summary: 'A good start.', nextPriorities: ['Add reasons', 'Check commas'] },
            scores: [
                { key: 'ideas', score: 4, explanation: 'Clear.' },
                { key: 'not-a-criterion', score: 5, explanation: 'Ignored.' }
            ]
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.sections.length, 1, 'unknown section keys are dropped');
    assert.equal(result.sections[0].evidence, 'uniforms are fair');
    assert.equal(result.sections[0].score, 5, 'scores clamp to the rubric maximum');
    assert.equal(result.scores.length, 1, 'unknown rubric keys are dropped');
    assert.equal(result.scores[0].key, 'ideas');
    assert.equal(result.totalScore, 4);
});

test('normalizeFeedback fails when the model returns nothing usable', () => {
    const snapshot = configSnapshotFor(essay());
    assert.equal(normalizeFeedback({ parsed: null, draft: { sections: [] }, snapshot }).ok, false);
    assert.equal(normalizeFeedback({ parsed: { sections: [] }, draft: { sections: [] }, snapshot }).ok, false);
});

test('fabricated evidence is discarded rather than shown to the student', () => {
    const draft = { number: 1, sections: [{ key: 'introduction', index: 0, text: 'I like uniforms a lot.' }] };
    const result = normalizeFeedback({
        draft,
        snapshot: configSnapshotFor(essay()),
        parsed: {
            sections: [{
                key: 'introduction',
                index: 0,
                strengths: ['ok'],
                evidence: 'an invented sentence the student never wrote'
            }],
            overall: { summary: 'Fine.' }
        }
    });
    assert.equal(result.sections[0].evidence, '');
});

test('normalizeComparison reports added and removed sections even if the model ignored them', () => {
    const snapshot = configSnapshotFor(essay());
    const previousDraft = {
        number: 1,
        sections: [
            { key: 'introduction', index: 0, text: 'Old opening.', words: 2 },
            { key: 'conclusion', index: 0, text: 'An ending that vanished.', words: 5 }
        ]
    };
    const currentDraft = {
        number: 2,
        sections: [
            { key: 'introduction', index: 0, text: 'A new opening with a reason.', words: 7 },
            { key: 'body', index: 0, text: 'A paragraph that was not there before.', words: 9 }
        ]
    };

    const result = normalizeComparison({
        previousDraft,
        currentDraft,
        previousAssessment: {
            sections: [{ key: 'introduction', index: 0, nextStep: 'Name your reason in the first line.' }]
        },
        snapshot,
        parsed: {
            changedBySection: [{ key: 'introduction', index: 0, summary: 'Names the reason now.', meaningful: true }],
            criteriaImproved: ['Ideas and content'],
            criteriaUnresolved: ['Organisation'],
            feedbackApplied: [{ key: 'introduction', index: 0, applied: true }],
            newIssues: [],
            encouragement: 'You clearly worked on this.',
            scores: [{ key: 'ideas', score: 4, explanation: 'Better.' }],
            recommendation: { path: 'notebook', reason: 'Looks strong.' }
        }
    });

    assert.equal(result.ok, true);
    const keys = result.changedBySection.map((row) => `${row.key}:${row.index}:${row.kind}`);
    assert.deepEqual(keys, [
        'introduction:0:changed',
        'body:0:added',
        'conclusion:0:removed'
    ]);
    assert.equal(result.feedbackApplied[0].note, 'Name your reason in the first line.');
    assert.ok(result.newIssues.some((issue) => /conclusion/.test(issue)));
    // introduction 2 -> 6 words, body adds 7, the removed conclusion subtracts 4
    assert.equal(result.wordDelta, 7);
});

test('decideRecommendation holds the AI to the rubric numbers', () => {
    const decision = decideRecommendation({
        normalized: {
            scores: [{ key: 'ideas', score: 1, maxScore: 5 }],
            criteriaUnresolved: ['Organisation', 'Conventions'],
            newIssues: [],
            recommendation: { path: 'notebook', reason: 'Confident tone.' }
        },
        assignment: essay(),
        draftNumber: 2
    });
    assert.equal(decision.path, 'revise');
    assert.equal(decision.ratio, 0.2);
});
