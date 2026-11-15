import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ANALYSIS_LIMITS,
    aggregateAnalysis,
    buildGrowth,
    coverParentStandards,
    estimateRun,
    isChildCode,
    levelForStandard,
    promptTextFor,
    quoteIsReal,
    selectPieces,
    standardsToJudge
} from '../services/writingAnalysisLogic.js';

const day = (n) => new Date(Date.UTC(2026, 0, n, 9)).toISOString();

const project = (id, title, writingType = 'narrative') => ({
    _id: id,
    assignment: { _id: `a-${id}`, title, writingType }
});

const draft = ({ id, project: projectId, number = 1, submittedAt, totalWords = 120, submissionSource = 'student' }) => ({
    _id: id,
    project: projectId,
    number,
    submittedAt,
    totalWords,
    submissionSource,
    title: `Draft ${number}`
});

test('only the final student submission of each project counts as one piece', () => {
    const { included, excluded } = selectPieces({
        projects: [project('p1', 'My holiday'), project('p2', 'My pet', 'opinion'), project('p3', 'Tiny')],
        drafts: [
            draft({ id: 'd1', project: 'p1', number: 1, submittedAt: day(1) }),
            draft({ id: 'd2', project: 'p1', number: 2, submittedAt: day(5) }),
            draft({ id: 'd3', project: 'p2', number: 1, submittedAt: day(7), totalWords: 11 }),
            draft({ id: 'd4', project: 'p2', number: 2, submittedAt: day(8), submissionSource: 'teacher' }),
            draft({ id: 'd5', project: 'p3', number: 1, submittedAt: day(9), totalWords: 12 })
        ]
    });
    assert.deepEqual(included.map((row) => row.draft), ['d2']);
    const reasons = excluded.map((row) => [row.draft, row.reason]);
    assert.deepEqual(reasons, [['d4', 'teacher_submitted'], ['d5', 'too_short']]);
    assert.equal(included[0].writingType, 'narrative');
    assert.equal(included[0].title, 'My holiday');
});

test('the window filters by the final submission, not by any draft', () => {
    const { included } = selectPieces({
        projects: [project('p1', 'A')],
        drafts: [
            draft({ id: 'd1', project: 'p1', number: 1, submittedAt: day(10) }),
            draft({ id: 'd2', project: 'p1', number: 2, submittedAt: day(20) })
        ],
        from: day(15),
        to: day(25)
    });
    assert.deepEqual(included.map((row) => row.draft), ['d2']);
});

test('newest pieces win the cap and the overflow is reported', () => {
    const projects = Array.from({ length: 5 }, (_, index) => project(`p${index}`, `T${index}`));
    const drafts = Array.from({ length: 5 }, (_, index) => draft({
        id: `d${index}`,
        project: `p${index}`,
        submittedAt: day(index + 1)
    }));
    const { included, excluded } = selectPieces({ projects, drafts, limits: { ...ANALYSIS_LIMITS, maxPieces: 3 } });
    assert.deepEqual(included.map((row) => row.draft), ['d4', 'd3', 'd2']);
    assert.deepEqual(excluded.map((row) => row.draft), ['d0', 'd1']);
    assert.ok(excluded.every((row) => row.reason === 'over_cap'));
});

test('a quote counts only when it is literally in the piece', () => {
    const text = 'The  cat sat\non the mat.';
    assert.equal(quoteIsReal('the cat sat on the mat', text), true);
    assert.equal(quoteIsReal('THE CAT SAT', text), true);
    assert.equal(quoteIsReal('القطة جلست على السجادة', 'القطة جلست على السجادة.'), true);
    assert.equal(quoteIsReal('the dog sat', text), false);
    // A three-letter word is real evidence when it is a whole word: "AND" in
    // capitals shows inconsistent spelling. It must not match inside a word.
    assert.equal(quoteIsReal('cat', text), true);
    assert.equal(quoteIsReal('cat', 'We need better education.'), false);
    assert.equal(quoteIsReal('', text), false);
});

const rows = (judgments, writingType = 'narrative') => judgments.map((judgment, index) => ({
    draft: `d${index}`,
    opportunity: judgment !== 'none',
    judgment,
    writingType
}));

test('the level table follows the spec: met-only fractions, zero met is level 0', () => {
    assert.deepEqual(levelForStandard({ rows: rows(['none', 'none']) }), {
        counts: { applicable: 0, met: 0, partly: 0, notMet: 0 },
        status: 'not_observed',
        proposedLevel: null
    });
    assert.equal(levelForStandard({ rows: rows(['met']) }).proposedLevel, null);
    assert.equal(levelForStandard({ rows: rows(['met']) }).status, 'insufficient_evidence');

    // Level 0 requires two or more pieces with nothing met at all.
    assert.equal(levelForStandard({ rows: rows(['not_met', 'not_met']) }).proposedLevel, 0);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'not_met']) }).status, 'not_shown');
    assert.equal(levelForStandard({ rows: rows(['partly', 'partly']) }).proposedLevel, 0);
    assert.equal(levelForStandard({ rows: rows(['partly', 'not_met']) }).proposedLevel, 0);

    // `partly` is counted but never lifts a level.
    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'partly']) }).proposedLevel, 1);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'met']) }).proposedLevel, 3);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'not_met', 'met']) }).proposedLevel, 2);

    // Level 3 needs three pieces with at least 60% met and the latest met.
    assert.equal(levelForStandard({ rows: rows(['met', 'met']) }).proposedLevel, 2);
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met']) }).proposedLevel, 3);
    // Level 4 needs the same skill met in a second writing type.
    const twoTypes = [...rows(['met', 'met']), ...rows(['met', 'met'], 'argument')];
    assert.equal(levelForStandard({ rows: twoTypes }).proposedLevel, 4);
    // Four pieces in one genre stay "consistent", never "transfer".
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met', 'met']) }).proposedLevel, 3);

    // A lost skill is not "consistent".
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met', 'not_met']) }).proposedLevel, 2);
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'not_met']) }).status, 'developing');
});

test('level 4 also needs the skill in two different writing types', () => {
    const mixed = [
        { draft: 'd1', opportunity: true, judgment: 'met', writingType: 'narrative' },
        { draft: 'd2', opportunity: true, judgment: 'met', writingType: 'narrative' },
        { draft: 'd3', opportunity: true, judgment: 'met', writingType: 'narrative' },
        { draft: 'd4', opportunity: true, judgment: 'met', writingType: 'narrative' }
    ];
    assert.equal(levelForStandard({ rows: mixed }).proposedLevel, 3);
});

test('aggregation orders pieces oldest to newest and keeps no-opportunity rows out of the counts', () => {
    const snapshot = [
        { standard: 's1', code: 'W1', name: 'Organisation', category: 'Structure' },
        { standard: 's2', code: 'W2', name: 'Sentences', category: 'Grammar' }
    ];
    const pieces = [
        { draft: 'late', submittedAt: day(20), writingType: 'narrative' },
        { draft: 'early', submittedAt: day(2), writingType: 'narrative' }
    ];
    const pieceResults = [
        {
            draft: 'early',
            standards: [
                { standard: 's1', opportunity: true, judgment: 'partly', quote: 'first', note: 'n1' },
                { standard: 's2', opportunity: false, judgment: 'none', quote: '', note: '' }
            ],
            patterns: [{ category: 'organisation', kind: 'issue', note: 'Paragraphs run together', quote: 'first' }]
        },
        {
            draft: 'late',
            standards: [
                { standard: 's1', opportunity: true, judgment: 'met', quote: 'second', note: 'n2' },
                { standard: 's2', opportunity: true, judgment: 'met', quote: 'third', note: 'n3' }
            ],
            patterns: []
        }
    ];

    const result = aggregateAnalysis({ standardSnapshot: snapshot, pieces, pieceResults });
    assert.deepEqual(result.standards[0].pieces.map((row) => row.draft), ['early', 'late']);
    assert.deepEqual(result.standards[0].counts, { applicable: 2, met: 1, partly: 1, notMet: 0 });
    assert.equal(result.standards[0].status, 'developing');
    assert.equal(result.standards[0].proposedLevel, 2);
    assert.equal(result.standards[1].counts.applicable, 1);
    assert.equal(result.standards[1].status, 'insufficient_evidence');
    assert.equal(result.patterns[0].category, 'organisation');
    assert.equal(result.patterns[0].pieces, 1);
    assert.equal(result.patterns[0].recurring, false);
    assert.equal(result.summary.pieces, 2);
    assert.equal(result.summary.withProposal, 1);
});

test('a pattern is recurring only when two pieces show it, and keeps one quote', () => {
    const snapshot = [{ standard: 's1', code: 'W1', name: 'Organisation' }];
    const pieces = [
        { draft: 'early', submittedAt: day(2), writingType: 'narrative' },
        { draft: 'late', submittedAt: day(20), writingType: 'narrative' }
    ];
    const pattern = (quote, note) => ({
        standards: [],
        patterns: [{ category: 'organisation', kind: 'issue', note, quote }]
    });
    const result = aggregateAnalysis({
        standardSnapshot: snapshot,
        pieces,
        pieceResults: [
            { draft: 'early', ...pattern('first', 'Old note') },
            { draft: 'late', ...pattern('second', 'New note') }
        ]
    });
    assert.equal(result.patterns.length, 1);
    assert.equal(result.patterns[0].recurring, true);
    assert.equal(result.patterns[0].pieces, 2);
    assert.deepEqual(result.patterns[0].notes, ['New note']);
    assert.deepEqual(result.patterns[0].quotes, ['second']);
});

test('growth direction needs two pieces on each side and reports counts only', () => {
    const pieces = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((draftId, index) => ({
        draft: draftId,
        submittedAt: day(index + 1)
    }));
    const issue = (draftId) => ({
        draft: draftId,
        aiStatus: 'done',
        patterns: [{ category: 'conventions', kind: 'issue' }]
    });
    const clean = (draftId) => ({ draft: draftId, aiStatus: 'done', patterns: [] });
    const result = buildGrowth({
        pieces,
        pieceResults: [issue('d1'), issue('d2'), issue('d3'), clean('d4'), clean('d5'), clean('d6')]
    });
    assert.equal(result.usable, true);
    assert.equal(result.direction, 'improving');
    assert.equal(result.early, 2);
    assert.equal(result.late, 0);
    assert.equal(result.minPieces, 4);
    assert.equal(result.pieces, 6);
    const tooFew = buildGrowth({ pieces: pieces.slice(0, 3), pieceResults: [] });
    assert.equal(tooFew.usable, false);
    assert.equal(tooFew.pieces, 3);
    assert.equal(tooFew.minPieces, 4);
});

test('a failed piece cannot turn missing data into an improving trend', () => {
    const pieces = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((draftId, index) => ({
        draft: draftId,
        submittedAt: day(index + 1)
    }));
    const issue = (draftId, aiStatus = 'done') => ({
        draft: draftId,
        aiStatus,
        patterns: aiStatus === 'done' ? [{ category: 'conventions', kind: 'issue' }] : []
    });
    // The newest two runs failed; the four pieces that really ran all carried
    // the issue, so the honest answer is "stable", not "improving".
    const result = buildGrowth({
        pieces,
        pieceResults: [issue('d1'), issue('d2'), issue('d3'), issue('d4'), issue('d5', 'failed'), issue('d6', 'unusable')]
    });
    assert.equal(result.usable, true);
    assert.equal(result.direction, 'stable');
    assert.equal(result.early, result.late);

    // Fewer than four readable pieces: no direction at all.
    const mostlyFailed = buildGrowth({
        pieces,
        pieceResults: [issue('d1'), issue('d2'), issue('d3', 'failed'), issue('d4', 'unusable'), issue('d5', 'failed'), issue('d6', 'failed')]
    });
    assert.equal(mostlyFailed.usable, false);
    assert.equal(mostlyFailed.direction, 'uncertain');
});

test('a parent code covers its parts, and a number is never a part', () => {
    assert.equal(isChildCode('L.5.1', 'L.5.1A'), true);
    assert.equal(isChildCode('L.5.1', 'L.5.1.A'), true);
    assert.equal(isChildCode('ELA.5.L.2', 'ELA.5.L.2.B'), true);
    assert.equal(isChildCode('L.5.1', 'L.5.10'), false);
    assert.equal(isChildCode('L.5.1', 'W.5.1'), false);
    assert.equal(isChildCode('L.5.1', 'L.5.1'), false);
    assert.equal(isChildCode('', 'L.5.1A'), false);
});

test('a parent standard chosen with its parts is covered by the parts', () => {
    const rows = coverParentStandards([
        { standard: 's1', code: 'L.5.1' },
        { standard: 's2', code: 'L.5.1A' },
        { standard: 's3', code: 'L.5.1B' },
        { standard: 's4', code: 'W.5.1' }
    ]);
    assert.deepEqual(rows[0].coveredBy, ['L.5.1A', 'L.5.1B']);
    assert.deepEqual(rows[1].coveredBy, []);
    assert.deepEqual(rows[3].coveredBy, []);
});

test('a covered parent never counts and never takes the place of its parts', () => {
    const snapshot = [
        { standard: 's1', code: 'L.5.1', name: 'Conventions' },
        { standard: 's2', code: 'L.5.1A', name: 'Conjunctions' }
    ];
    const pieces = [
        { draft: 'd1', submittedAt: day(2), writingType: 'narrative' },
        { draft: 'd2', submittedAt: day(20), writingType: 'narrative' }
    ];
    const pieceResults = [
        {
            draft: 'd1',
            standards: [{ standard: 's2', opportunity: true, judgment: 'not_met', quote: 'and then' }],
            patterns: []
        },
        {
            draft: 'd2',
            standards: [{ standard: 's2', opportunity: true, judgment: 'met', quote: 'but she' }],
            patterns: []
        }
    ];
    const result = aggregateAnalysis({ standardSnapshot: snapshot, pieces, pieceResults });
    const parent = result.standards[0];
    const child = result.standards[1];
    assert.deepEqual(parent.coveredBy, ['L.5.1A']);
    assert.equal(parent.counts.applicable, 0);
    assert.equal(parent.proposedLevel, null);
    assert.equal(child.counts.applicable, 2);
    assert.equal(child.counts.met, 1);
    assert.equal(child.proposedLevel, 2);
});

test('a row whose words could not be found is marked unverifiable', () => {
    const snapshot = [{ standard: 's1', code: 'L.5.2.E', name: 'Spelling' }];
    const pieces = [
        { draft: 'd1', submittedAt: day(2), writingType: 'narrative' },
        { draft: 'd2', submittedAt: day(20), writingType: 'narrative' }
    ];
    const pieceResults = [
        {
            draft: 'd1',
            aiStatus: 'done',
            quotesDropped: 1,
            notesDropped: 1,
            standards: [
                { standard: 's1', opportunity: true, judgment: 'partly', quote: '', note: '', unverifiable: true }
            ],
            patterns: []
        },
        {
            draft: 'd2',
            aiStatus: 'done',
            standards: [
                { standard: 's1', opportunity: true, judgment: 'met', quote: 'we planted the seeds' }
            ],
            patterns: []
        }
    ];
    const result = aggregateAnalysis({ standardSnapshot: snapshot, pieces, pieceResults });
    assert.equal(result.standards[0].pieces[0].unverifiable, true);
    assert.equal(result.standards[0].pieces[1].unverifiable, false);
    assert.equal(result.summary.notesDropped, 1);
});

test('the same line judged two ways is reported to the teacher', () => {
    const snapshot = [{ standard: 's1', code: 'L.5.2', name: 'Sentences' }];
    const pieces = [
        { draft: 'd1', submittedAt: day(2), writingType: 'narrative' },
        { draft: 'd2', submittedAt: day(20), writingType: 'narrative' }
    ];
    const pieceResults = [
        {
            draft: 'd1',
            standards: [{ standard: 's1', opportunity: true, judgment: 'met', quote: 'We planted the seeds' }],
            patterns: []
        },
        {
            draft: 'd2',
            standards: [{ standard: 's1', opportunity: true, judgment: 'not_met', quote: 'We planted the seeds' }],
            patterns: []
        }
    ];
    const result = aggregateAnalysis({ standardSnapshot: snapshot, pieces, pieceResults });
    assert.equal(result.standards[0].conflict.quote, 'we planted the seeds');
    assert.deepEqual(result.standards[0].conflict.judgments, ['met', 'not_met']);
    assert.equal(result.summary.conflicts, 1);
});

test('the direction comes with the words that caused it', () => {
    const pieces = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((draftId, index) => ({
        draft: draftId,
        submittedAt: day(index + 1)
    }));
    const issue = (draftId, quote) => ({
        draft: draftId,
        aiStatus: 'done',
        patterns: [{ category: 'conventions', kind: 'issue', quote }]
    });
    const strength = (draftId, quote) => ({
        draft: draftId,
        aiStatus: 'done',
        patterns: [{ category: 'conventions', kind: 'strength', quote }]
    });
    const result = buildGrowth({
        pieces,
        pieceResults: [
            issue('d1', 'teh cat'),
            issue('d2', 'i goed'),
            issue('d3', 'recieve'),
            strength('d4', 'the cat'),
            strength('d5', 'I go'),
            strength('d6', 'receive')
        ]
    });
    assert.equal(result.usable, true);
    assert.equal(result.direction, 'improving');
    assert.equal(result.focusCategory, 'conventions');
    assert.equal(result.earlyQuote, 'teh cat');
    assert.equal(result.lateQuote, 'I go');
    assert.equal(result.readable, 6);
    assert.equal(result.needed, 4);
});

test('too few readable pieces says how many were readable', () => {
    const pieces = ['d1', 'd2', 'd3', 'd4'].map((draftId, index) => ({
        draft: draftId,
        submittedAt: day(index + 1)
    }));
    const result = buildGrowth({
        pieces,
        pieceResults: [
            { draft: 'd1', aiStatus: 'done', patterns: [] },
            { draft: 'd2', aiStatus: 'done', patterns: [] },
            { draft: 'd3', aiStatus: 'failed', patterns: [] },
            { draft: 'd4', aiStatus: 'failed', patterns: [] }
        ]
    });
    assert.equal(result.usable, false);
    assert.equal(result.readable, 2);
    assert.equal(result.needed, 4);
});

test('a long piece is truncated on a word boundary before the prompt', () => {
    const text = 'word '.repeat(2000);
    const cut = promptTextFor(text, 100);
    assert.equal(cut.truncated, true);
    assert.ok(cut.text.length <= 120);
    assert.equal(promptTextFor('short', 100).truncated, false);
});

test('the run estimate grows with pieces and standards', () => {
    const pieces = [{ totalWords: 100 }, { totalWords: 200 }];
    const small = estimateRun({ pieces, standardCount: 2 });
    const large = estimateRun({ pieces, standardCount: 8 });
    assert.equal(small.pieces, 2);
    assert.ok(large.totalTokens > small.totalTokens);
});

test('a covered parent is never put to the model', () => {
    const snapshot = [
        { standard: 's1', code: 'L.5.1' },
        { standard: 's2', code: 'L.5.1A' },
        { standard: 's3', code: 'W.5.1' }
    ];
    assert.deepEqual(
        standardsToJudge(snapshot).map((row) => row.standard),
        ['s2', 's3']
    );
});
