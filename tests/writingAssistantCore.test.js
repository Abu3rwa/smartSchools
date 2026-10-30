import test from 'node:test';
import assert from 'node:assert/strict';

import {
    STALE_RUN_MS,
    alignSections,
    buildDraftSections,
    buildTracker,
    buildWorkingSections,
    canMoveTo,
    canStudentSubmit,
    configSnapshotFor,
    countWords,
    guardRecommendation,
    ledgerSummary,
    mergeRevisionLedger,
    sectionTotalWords,
    selectSpellingTargets,
    spellingProfileFrom,
    stalledTasksFrom,
    verifiedSpellingWins,
    writingTierFrom,
    stageAfterPublish,
    stageAfterSubmit,
    staleRunCutoff,
    studentNextAction,
    summarizeBoard,
    tasksForCheckback,
    tasksFromPriorities,
    validateSubmission,
    workingSectionsFor
} from '../services/writingAssistantLogic.js';
import {
    buildComparisonPrompt,
    buildFeedbackPrompt,
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
    workflow: { teacherPublishesFeedback: true, requireNotebookCheck: true }
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

test('a revision starts from what the student sent when no autosave exists', () => {
    const draft = {
        sections: [
            { key: 'introduction', index: 0, text: 'Opening line.', label: 'Introduction', words: 2 },
            { key: 'body', index: 0, text: 'First reason.' }
        ]
    };
    const rows = workingSectionsFor({ draft, assignment: essay() });

    assert.deepEqual(rows, [
        { key: 'introduction', index: 0, text: 'Opening line.' },
        { key: 'body', index: 0, text: 'First reason.' }
    ]);
});

test('newer autosaved work wins over the last sent draft', () => {
    const autosave = { sections: [{ key: 'introduction', index: 0, text: 'Half-rewritten intro.' }] };
    const draft = { sections: [{ key: 'introduction', index: 0, text: 'What was sent.' }] };

    assert.deepEqual(workingSectionsFor({ autosave, draft, assignment: essay() }), autosave.sections);
});

test('with no autosave and no draft the blank structure is used', () => {
    const rows = workingSectionsFor({ assignment: essay() });
    assert.equal(rows.length, buildWorkingSections(essay()).length);
    assert.ok(rows.every((row) => row.text === ''));
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

test('a published comparison lands where its recommendation points', () => {
    assert.equal(stageAfterPublish('feedback'), 'feedback_published');
    assert.equal(stageAfterPublish('comparison', 'revise'), 'compared');
    assert.equal(stageAfterPublish('comparison', 'notebook'), 'ready_for_notebook');
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

test('a student can keep sending drafts; no count ever stops the loop', () => {
    const gate = canStudentSubmit({
        project: { stage: 'feedback_published', draftCount: 14 },
        assignment: essay()
    });
    assert.equal(gate.allowed, true);
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

test('the tracker shows a repeatable revise step and no fixed second draft', () => {
    const withoutNotebook = buildTracker({
        assignment: { workflow: { requireNotebookCheck: false } },
        project: { stage: 'not_started', draftCount: 0 },
        hasComparison: false
    });
    assert.deepEqual(withoutNotebook.map((step) => step.key), [
        'draft_1', 'feedback_1', 'draft_2', 'next_step', 'completed'
    ]);

    const full = buildTracker({
        assignment: { workflow: { requireNotebookCheck: true } },
        project: { stage: 'not_started', draftCount: 0 },
        hasComparison: false
    });
    assert.deepEqual(full.map((step) => step.key), [
        'draft_1', 'feedback_1', 'draft_2', 'next_step', 'notebook_check', 'completed'
    ]);
    assert.equal(full[0].state, 'current');
    assert.equal(full[1].state, 'upcoming');

    const compared = buildTracker({
        assignment: { workflow: { requireNotebookCheck: true } },
        project: { stage: 'compared', draftCount: 7 },
        hasComparison: true
    });
    assert.equal(compared.find((step) => step.key === 'compare').state, 'current');
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
        }
    });
    assert.equal(decision.path, 'revise');
});

test('a strong rubric with nothing unresolved can go to the notebook', () => {
    const decision = guardRecommendation({
        aiPath: 'notebook',
        assessment: {
            comparison: { criteriaUnresolved: [], newIssues: [] },
            scores: [{ key: 'ideas', score: 5, maxScore: 5 }]
        }
    });
    assert.equal(decision.path, 'notebook');
});

test('the draft count is not an input to the recommendation anymore', () => {
    const decision = guardRecommendation({
        aiPath: 'revise',
        assessment: { comparison: { criteriaUnresolved: ['Conventions'], newIssues: [] }, scores: [] },
        draftNumber: 12,
        assignment: essay()
    });
    assert.equal(decision.path, 'revise');
    assert.equal(/drafts/.test(decision.reason), false);
});

/* ------------------------------------------------------------------ */
/* Revision task ledger                                                */
/* ------------------------------------------------------------------ */

const ledgerTask = (id, text) => ({ id, text });

test('the ledger follows one task from open to resolved across drafts', () => {
    let ledger = mergeRevisionLedger({
        ledger: [],
        tasks: [ledgerTask('t1', 'Add an example.')],
        draftNumber: 2
    });
    assert.equal(ledger[0].status, 'open');
    assert.equal(ledger[0].introducedDraft, 2);
    assert.equal(ledger[0].unresolvedStreak, 0);

    ledger = mergeRevisionLedger({
        ledger,
        tasks: [ledgerTask('t1', 'Add an example.')],
        taskResults: [{ id: 't1', applied: true, note: 'Added "for example".' }],
        draftNumber: 3
    });
    assert.equal(ledger[0].status, 'resolved');
    assert.equal(ledger[0].resolvedDraft, 3);
    assert.equal(ledger[0].checks, 1);
    assert.equal(ledger[0].unresolvedStreak, 0);
});

test('a task that survives two comparisons is flagged as stalled for the teacher', () => {
    let ledger = [{ id: 't1', text: 'Add an example.', introducedDraft: 2, checks: 0, unresolvedStreak: 0, status: 'open' }];
    for (const draftNumber of [3, 4]) {
        ledger = mergeRevisionLedger({
            ledger,
            tasks: [ledgerTask('t1', 'Add an example.')],
            taskResults: [{ id: 't1', applied: false }],
            draftNumber
        });
    }
    assert.equal(ledger[0].status, 'stalled');
    assert.equal(ledger[0].unresolvedStreak, 2);
    assert.deepEqual(stalledTasksFrom(ledger).map((row) => row.id), ['t1']);
});

test('rewording a task starts a fresh entry instead of inheriting a stall', () => {
    const ledger = mergeRevisionLedger({
        ledger: [{ id: 't1', text: 'Add an example.', unresolvedStreak: 2, status: 'stalled' }],
        tasks: [ledgerTask('t1', 'Add one sentence that names the source.')],
        taskResults: [{ id: 't1', applied: false }],
        draftNumber: 4
    });
    assert.equal(ledger[0].status, 'open');
    assert.equal(ledger[0].introducedDraft, 4);
    assert.equal(ledger[0].unresolvedStreak, 1);
});

test('a task the teacher stopped asking for is dropped, not left stalling', () => {
    const ledger = mergeRevisionLedger({
        ledger: [{ id: 't2', text: 'Join paragraphs.', unresolvedStreak: 2, status: 'stalled' }],
        tasks: [ledgerTask('t1', 'Add an example.')],
        draftNumber: 5
    });
    assert.equal(ledger.find((row) => row.id === 't2').status, 'dropped');
    assert.deepEqual(ledgerSummary(ledger), { open: 1, resolved: 0, stalled: 0, dropped: 1 });
});

test('a stalled task blocks the notebook even when the rubric looks strong', () => {
    const decision = guardRecommendation({
        aiPath: 'notebook',
        assessment: {
            comparison: { criteriaUnresolved: [], newIssues: [] },
            scores: [{ key: 'ideas', score: 5, maxScore: 5 }]
        },
        stalled: 1
    });
    assert.equal(decision.path, 'revise');
    assert.match(decision.reason, /earlier round/);
});

test('feedback on a draft with a stalled task changes its approach', () => {
    const prompt = buildFeedbackPrompt({
        snapshot: configSnapshotFor(essay()),
        draft: { number: 4, sections: filled() },
        stalledTasks: [{ id: 't1', text: 'Add an example.' }],
        language: 'en'
    });
    assert.match(prompt, /survived two revisions/);
    assert.match(prompt, /- Add an example\./);
});

/* ------------------------------------------------------------------ */
/* Differentiation profile                                             */
/* ------------------------------------------------------------------ */

const marked = (draft, earned, max = 10) => ({
    draft,
    aiStatus: 'done',
    scores: [{ key: 'ideas', score: earned, maxScore: max }]
});

test('the writing tier comes from the newest marked drafts, not one weak piece', () => {
    assert.equal(writingTierFrom({ assessments: [] }), 'unknown');
    assert.equal(writingTierFrom({ assessments: [marked('d1', 9), marked('d2', 8)] }), 'secure');
    assert.equal(writingTierFrom({ assessments: [marked('d1', 6), marked('d2', 6)] }), 'developing');
    assert.equal(writingTierFrom({ assessments: [marked('d1', 3)] }), 'emerging');
    // Older pieces fall outside the newest three and stop following the student.
    const improved = [marked('d4', 9), marked('d3', 9), marked('d2', 9), marked('d1', 1)];
    assert.equal(writingTierFrom({ assessments: improved }), 'secure');
});

test('one draft counted once, even when feedback and comparison both marked it', () => {
    const assessments = [marked('d2', 2), { ...marked('d2', 10), kind: 'comparison' }, marked('d1', 10)];
    assert.equal(writingTierFrom({ assessments }), 'developing');
});

test('spelling profile ignores an untouched analysis instead of reporting 0%', () => {
    assert.deepEqual(
        spellingProfileFrom({ grade: 'G3', metrics: { attempts: 0, accuracy: 0 } }),
        { grade: 'G3', accuracy: null }
    );
    assert.deepEqual(
        spellingProfileFrom({ grade: 'G3', metrics: { attempts: 20, accuracy: 64.4 } }),
        { grade: 'G3', accuracy: 64.4 }
    );
});

test('the profile steers the prompt but may never be named to the student', () => {
    const prompt = buildFeedbackPrompt({
        snapshot: configSnapshotFor(essay()),
        draft: { number: 2, sections: filled() },
        profile: { tier: 'emerging', spellingGrade: 'G3', spellingAccuracy: 64 },
        language: 'en'
    });
    assert.match(prompt, /still building control/);
    assert.match(prompt, /G3 level/);
    assert.match(prompt, /about 64%/);
    assert.match(prompt, /never name, label, quote or hint at a level/);
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

test('a reply that names sections by label is filed under the real section key', () => {
    const result = normalizeFeedback({
        draft: { number: 1, sections: filled() },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            sections: [
                { key: 'Body paragraph', index: 0, evidence: 'uniforms save time', nextStep: 'Add an example.' },
                { key: 'Body paragraph', index: 0, evidence: 'help me concentrate', nextStep: 'Say why.' },
                { key: 'Conclusion', index: 0, evidence: 'I would keep uniforms', nextStep: 'Restate it.' }
            ]
        }
    });

    // Labels, and two body paragraphs both numbered 0, still fill the real slots once each.
    assert.deepEqual(
        result.sections.map((row) => `${row.key}:${row.index}`),
        ['body:0', 'body:1', 'conclusion:0']
    );
    assert.equal(result.sections[0].evidence, 'uniforms save time');
    assert.equal(result.sections[1].evidence, 'help me concentrate');
});

test('renderDraftForPrompt labels sections and marks empty ones', () => {
    const rendered = renderDraftForPrompt({
        number: 1,
        sections: [
            { key: 'introduction', index: 0, label: 'Introduction', text: 'My opening line.', words: 3 },
            { key: 'body', index: 1, label: 'Body paragraph 1', text: '   ', words: 0 }
        ]
    });
    assert.match(rendered, /Introduction \[key: introduction, index: 0\] \(draft 1, 3 words\)/);
    // The index has to be visible: feedback is filed back under key + index.
    assert.match(rendered, /Body paragraph 1 \[key: body, index: 1\]/);
    assert.match(rendered, /\[empty\]/);
});

test('the prompt lists the section and rubric keys the reply must use', () => {
    const snapshot = configSnapshotFor(essay());
    const prompt = buildFeedbackPrompt({
        snapshot,
        draft: { number: 1, sections: [{ key: 'body', index: 1, label: 'Body paragraph 1', text: 'A reason.' }] },
        language: 'en'
    });
    assert.match(prompt, /^- body: Body paragraph/m);
    assert.match(prompt, new RegExp(`^- ${snapshot.rubric[0].key}: ${snapshot.rubric[0].label}`, 'm'));
});

for (const language of ['en', 'ar']) {
    for (const kind of ['feedback', 'comparison']) {
        test(`${kind} prompt requires actionable, evidence-based spelling guidance in ${language}`, () => {
            const snapshot = configSnapshotFor(essay());
            snapshot.rubric = snapshot.rubric.filter((row) => row.key === 'ideas');
            const previousDraft = {
                number: 1,
                sections: [{ key: 'introduction', index: 0, text: 'I like uniforms becues ih vaer.' }]
            };
            const currentDraft = {
                number: 2,
                sections: [{ key: 'introduction', index: 0, text: 'I like uniforms because ih vaer.' }]
            };
            const prompt = kind === 'feedback'
                ? buildFeedbackPrompt({ snapshot, draft: previousDraft, language })
                : buildComparisonPrompt({ snapshot, previousDraft, currentDraft, language });

            assert.match(prompt, /Word-level spelling corrections are allowed/);
            assert.match(prompt, /Check spelling even when it is not a separate rubric criterion/);
            assert.match(prompt, /quote the exact word from the draft and give its correct spelling/);
            assert.match(prompt, /"becues" → "because"/);
            assert.match(prompt, /If the intended word is unclear.*ask the student to check and rewrite the word they meant.*Do not guess/);
            assert.match(prompt, /Do not invent spelling errors or flag valid spelling variants or names/);
            assert.match(prompt, /If no spelling errors are evident, do not add a spelling problem/);
            assert.match(prompt, /Spelling guidance must accompany, not replace, feedback on ideas and organisation/);
            assert.match(prompt, /Deduct marks only where the supplied rubric covers spelling/);
            assert.match(prompt, /Keep quoted words and spelling corrections in the draft's language/);
            assert.match(prompt, new RegExp(`Write the feedback in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}`));
            assert.ok(prompt.includes(previousDraft.sections[0].text));
            if (kind === 'feedback') {
                assert.match(prompt, /Put spelling corrections or clarification requests in the relevant section's "improvements"/);
            } else {
                assert.match(prompt, /Report corrected spellings in "changedBySection"/);
                assert.match(prompt, /Only flag spelling problems still present in the current draft/);
                assert.match(prompt, /Do not report a corrected old misspelling as a current problem/);
                assert.ok(prompt.includes(currentDraft.sections[0].text));
            }
        });
    }
}

for (const language of ['en', 'ar']) {
    test(`normalizeFeedback preserves spelling corrections alongside content guidance in ${language}`, () => {
        const draft = {
            number: 1,
            sections: [{ key: 'introduction', index: 0, text: 'I like uniforms becues ih vaer.' }]
        };
        const improvements = language === 'ar'
            ? ['أضف سببين لرأيك في الزي المدرسي.', 'صحّح "becues" إلى "because" حتى يفهم القارئ السبب.', 'راجع "ih" و"vaer" واكتب الكلمتين اللتين تقصدهما.']
            : ['Name two reasons for your opinion on uniforms.', 'Change "becues" to "because" so the reader understands your reason.', 'Check "ih" and "vaer" and rewrite the words you meant.'];
        const result = normalizeFeedback({
            draft,
            snapshot: configSnapshotFor(essay()),
            parsed: { sections: [{ key: 'introduction', index: 0, evidence: 'becues', improvements }] }
        });

        assert.equal(result.ok, true);
        assert.deepEqual(result.sections[0].improvements, improvements);
        assert.equal(result.sections[0].evidence, 'becues');
    });
}

test('normalizeComparison preserves corrected and unresolved spellings in their existing fields', () => {
    const previousDraft = {
        number: 1,
        sections: [{ key: 'introduction', index: 0, text: 'I like uniforms becues ih vaer.' }]
    };
    const currentDraft = {
        number: 2,
        sections: [{ key: 'introduction', index: 0, text: 'I like uniforms because ih vaer.' }]
    };
    const summary = 'You corrected "becues" to "because", making your reason easier to read.';
    const priority = 'Check "ih" and "vaer" and rewrite the words you meant.';
    const result = normalizeComparison({
        previousDraft,
        currentDraft,
        snapshot: configSnapshotFor(essay()),
        parsed: {
            changedBySection: [{ key: 'introduction', index: 0, summary, meaningful: true }],
            newIssues: [],
            overall: { nextPriorities: [priority] }
        }
    });

    assert.equal(result.ok, true);
    assert.equal(result.changedBySection[0].summary, summary);
    assert.deepEqual(result.overall.nextPriorities, [priority]);
    assert.deepEqual(result.newIssues, []);
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

test('normalizeComparison advances the ledger and exposes stalled tasks', () => {
    const snapshot = configSnapshotFor(essay());
    const result = normalizeComparison({
        previousDraft: { number: 3, sections: [{ key: 'body', index: 0, text: 'A reason.' }] },
        currentDraft: { number: 4, sections: [{ key: 'body', index: 0, text: 'A reason with an example.' }] },
        previousAssessment: { tasks: [{ id: 't1', text: 'Add an example.' }] },
        snapshot,
        ledger: [{
            id: 't1',
            text: 'Add an example.',
            introducedDraft: 2,
            checks: 1,
            unresolvedStreak: 1,
            status: 'open'
        }],
        parsed: {
            taskResults: [{ id: 't1', applied: false }],
            scores: [],
            recommendation: { path: 'notebook', reason: 'Looks ready.' }
        }
    });

    assert.equal(result.revisionLedger[0].status, 'stalled');
    assert.equal(result.revisionLedger[0].lastCheckedDraft, 4);
    assert.deepEqual(result.stalledTasks.map((row) => row.id), ['t1']);
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

test('decideRecommendation counts unresolved comparison criteria even with a high score', () => {
    const decision = decideRecommendation({
        normalized: {
            scores: [{ key: 'ideas', score: 4, maxScore: 5 }],
            criteriaUnresolved: ['Organisation', 'Conventions'],
            newIssues: [],
            recommendation: { path: 'notebook', reason: 'Much better.' }
        },
        assignment: essay(),
        draftNumber: 2
    });
    assert.equal(decision.ratio, 0.8);
    assert.equal(decision.path, 'revise');
});

/* ------------------------------------------------------------------ */
/* Revision tasks and the draft-to-draft checkback                       */
/* ------------------------------------------------------------------ */

test('revision tasks come from the priorities, three at most, with stable ids', () => {
    assert.deepEqual(tasksFromPriorities([' Add a reason. ', '', 'Join your paragraphs.', 'End with your own idea.', 'A fourth.']), [
        { id: 't1', text: 'Add a reason.' },
        { id: 't2', text: 'Join your paragraphs.' },
        { id: 't3', text: 'End with your own idea.' }
    ]);
    assert.deepEqual(tasksFromPriorities(), []);
    assert.deepEqual(tasksFromPriorities([null, '   ']), []);
});

test('a checkback reads the stored tasks and falls back to the older priorities', () => {
    const stored = [{ id: 't1', text: 'Add a reason.' }];
    assert.deepEqual(tasksForCheckback({ tasks: stored, overall: { nextPriorities: ['Something else.'] } }), stored);
    // Feedback published before tasks existed still gets checked, by position.
    assert.deepEqual(tasksForCheckback({ overall: { nextPriorities: ['Add a reason.'] } }), [{ id: 't1', text: 'Add a reason.' }]);
    assert.deepEqual(tasksForCheckback(null), []);
});

test('published feedback carries its tasks without asking the model for them', () => {
    const result = normalizeFeedback({
        draft: { number: 1, sections: filled() },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            sections: [{ key: 'introduction', index: 0, strengths: ['Clear opinion.'] }],
            overall: { summary: 'A good start.', nextPriorities: ['Add a reason.', 'Check commas.'] }
        }
    });
    assert.deepEqual(result.tasks, [
        { id: 't1', text: 'Add a reason.' },
        { id: 't2', text: 'Check commas.' }
    ]);
});

test('each rubric score keeps a real quote and loses an invented one', () => {
    const result = normalizeFeedback({
        draft: { number: 1, sections: filled() },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            sections: [{ key: 'introduction', index: 0, strengths: ['Clear opinion.'] }],
            overall: { summary: 'A good start.' },
            scores: [
                { key: 'ideas', score: 4, explanation: 'Two reasons.', evidence: 'uniforms save time' },
                { key: 'organisation', score: 3, explanation: 'Order is clear.', evidence: 'a sentence the student never wrote' }
            ]
        }
    });
    const byKey = Object.fromEntries(result.scores.map((row) => [row.key, row]));
    assert.equal(byKey.ideas.evidence, 'uniforms save time');
    assert.equal(byKey.organisation.evidence, '');
    assert.equal(byKey.organisation.explanation, 'Order is clear.');
});

test('the comparison prompt lists the tasks by id and asks for one verdict each', () => {
    const prompt = buildComparisonPrompt({
        snapshot: configSnapshotFor(essay()),
        previousDraft: { number: 1, sections: filled() },
        currentDraft: { number: 2, sections: filled() },
        previousAssessment: { overall: { nextPriorities: ['Add a reason.', 'Check commas.'] } },
        language: 'en'
    });
    assert.match(prompt, /- t1: Add a reason\./);
    assert.match(prompt, /- t2: Check commas\./);
    assert.match(prompt, /Report one "taskResults" entry for every task id listed above/);
    assert.match(prompt, /"taskResults"/);
});

test('the comparison prompt asks for evidence behind every rubric score', () => {
    const prompt = buildFeedbackPrompt({
        snapshot: configSnapshotFor(essay()),
        draft: { number: 1, sections: filled() },
        language: 'en'
    });
    assert.match(prompt, /Every rubric score needs "evidence"/);
    assert.match(prompt, /leave "evidence" empty rather than inventing one/);
});

test('taskResults keep only the ids the student was actually given', () => {
    const result = normalizeComparison({
        previousDraft: { number: 1, sections: filled() },
        currentDraft: { number: 2, sections: filled() },
        previousAssessment: { tasks: [{ id: 't1', text: 'Add a reason.' }, { id: 't2', text: 'Check commas.' }] },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            changedBySection: [{ key: 'introduction', index: 0, summary: 'A second reason appeared.', meaningful: true }],
            taskResults: [
                { id: 't2', applied: true, note: 'Commas are in place.' },
                { id: 't9', applied: true, note: 'Never asked for.' },
                { id: 't2', applied: false, note: 'A duplicate verdict.' },
                { id: 't1', applied: 'yes', note: 'Still one reason.' }
            ]
        }
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.tasks, [{ id: 't1', text: 'Add a reason.' }, { id: 't2', text: 'Check commas.' }]);
    assert.deepEqual(result.taskResults, [
        { id: 't2', applied: true, note: 'Commas are in place.' },
        { id: 't1', applied: false, note: 'Still one reason.' }
    ]);
});

test('a comparison with no earlier tasks reports none rather than inventing them', () => {
    const result = normalizeComparison({
        previousDraft: { number: 1, sections: filled() },
        currentDraft: { number: 2, sections: filled() },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            changedBySection: [{ key: 'introduction', index: 0, summary: 'Wording changed.', meaningful: true }],
            taskResults: [{ id: 't1', applied: true, note: 'Nothing was asked.' }]
        }
    });
    assert.deepEqual(result.tasks, []);
    assert.deepEqual(result.taskResults, []);
});

test('an interrupted run is retryable far sooner than it would block the draft', () => {
    const now = Date.now();
    assert.equal(now - staleRunCutoff(now).getTime(), STALE_RUN_MS);
    // Two model attempts at a two-minute cap each must both be able to finish first.
    assert.ok(STALE_RUN_MS > 2 * 2 * 60 * 1000);
});

/* ------------------------------------------------------------------ */
/* Spelling targets and verified wins                                  */
/* ------------------------------------------------------------------ */

const candidates = [
    { word: 'because', grade: 'G4', week: 3 },
    { word: 'concentrate', grade: 'G4', week: 5 },
    { word: 'uniform', grade: 'G3', week: 2 },
    { word: 'judged', grade: 'G4', week: 4 },
    { word: 'morning', grade: 'G3', week: 1 }
];

test('spelling targets keep only words the student actually missed', () => {
    const picked = selectSpellingTargets({
        suggestions: ['because', 'elephant', { word: 'Judged' }, 'because'],
        candidates,
        assignment: essay(),
        draftText: 'I think uniforms are fair.'
    });
    assert.deepEqual(picked, [
        { word: 'because', grade: 'G4', week: 3 },
        { word: 'judged', grade: 'G4', week: 4 }
    ]);
});

test('a word the draft already uses, or the assignment already gave, is never suggested', () => {
    const picked = selectSpellingTargets({
        suggestions: ['uniform', 'because', 'morning', 'concentrate'],
        candidates,
        assignment: {
            ...essay(),
            supports: { wordBank: ['uniform'], modelText: 'Every morning I concentrate.' }
        },
        draftText: 'School uniforms are fair.'
    });
    // The three words the assignment and the draft already contain are gone.
    assert.deepEqual(picked, [{ word: 'because', grade: 'G4', week: 3 }]);
});

test('no suggestion at all is a normal result, and three is the ceiling', () => {
    assert.deepEqual(selectSpellingTargets({ candidates }), []);
    const picked = selectSpellingTargets({
        suggestions: candidates.map((row) => row.word),
        candidates,
        assignment: essay(),
        draftText: ''
    });
    assert.equal(picked.length, 3);
});

test('a win is the whole word in the draft, never a longer word that contains it', () => {
    const targets = [{ word: 'because' }, { word: 'judged' }];
    const wins = verifiedSpellingWins({
        targets,
        draftText: 'BECAUSE everyone looks the same, nobody is judged, becauseness aside.'
    });
    assert.deepEqual(wins, [{ word: 'because' }, { word: 'judged' }]);
    assert.deepEqual(
        verifiedSpellingWins({ targets, draftText: 'Nobody is becauses or judgedly.' }),
        []
    );
});

test('the prompt lists the missed words and never lets the model claim a win', () => {
    const prompt = buildFeedbackPrompt({
        snapshot: configSnapshotFor(essay()),
        draft: { number: 1, sections: filled() },
        spellingCandidates: candidates,
        language: 'en'
    });
    assert.match(prompt, /the only words allowed as targets/);
    assert.match(prompt, /- because \(G4, week 3\)/);
    assert.match(prompt, /return 0 to 3 exact words copied from the missed-word list/);
    assert.match(prompt, /Never claim or hint that the student used one of these words/);
    assert.match(prompt, /"spellingTargets"/);
});

test('with no missed words the prompt asks for an empty target list', () => {
    const prompt = buildComparisonPrompt({
        snapshot: configSnapshotFor(essay()),
        previousDraft: { number: 1, sections: filled() },
        currentDraft: { number: 2, sections: filled() },
        language: 'en'
    });
    assert.match(prompt, /Return "spellingTargets": \[\] because no missed-word list was supplied/);
});

test('feedback keeps the approved targets the server chose, not the reply text', () => {
    const result = normalizeFeedback({
        draft: { number: 1, sections: [{ key: 'introduction', index: 0, text: 'I think uniforms are fair.' }] },
        snapshot: configSnapshotFor(essay()),
        assignment: essay(),
        spellingCandidates: candidates,
        parsed: {
            sections: [{ key: 'introduction', index: 0, strengths: ['Clear opinion.'] }],
            overall: { summary: 'A good start.' },
            spellingTargets: ['because', 'elephant']
        }
    });
    assert.deepEqual(result.spellingTargets, [{ word: 'because', grade: 'G4', week: 3 }]);
});

test('wins count only published words from the round before, found in this draft', () => {
    const result = normalizeComparison({
        previousDraft: { number: 1, sections: filled() },
        currentDraft: {
            number: 2,
            sections: [{ key: 'introduction', index: 0, text: 'Because uniforms are fair, nobody is judged.' }]
        },
        previousAssessment: {
            publish: { state: 'published' },
            spellingTargets: [{ word: 'because' }, { word: 'morning' }]
        },
        snapshot: configSnapshotFor(essay()),
        parsed: {
            changedBySection: [{ key: 'introduction', index: 0, summary: 'A reason appeared.', meaningful: true }],
            spellingTargets: ['judged']
        }
    });
    assert.deepEqual(result.spellingWins, [{ word: 'because' }]);
    assert.deepEqual(result.spellingTargets, []);
    assert.deepEqual(
        normalizeComparison({
            previousDraft: { number: 1, sections: filled() },
            currentDraft: {
                number: 2,
                sections: [{ key: 'introduction', index: 0, text: 'Because uniforms are fair.' }]
            },
            previousAssessment: { publish: { state: 'draft' }, spellingTargets: [{ word: 'because' }] },
            snapshot: configSnapshotFor(essay()),
            parsed: { changedBySection: [] }
        }).spellingWins,
        []
    );
});
