import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ANALYSIS_LIMITS,
    aggregateAnalysis,
    buildGrowth,
    estimateRun,
    levelForStandard,
    promptTextFor,
    quoteIsReal,
    selectPieces
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
    assert.equal(quoteIsReal('cat', text), false);
    assert.equal(quoteIsReal('', text), false);
});

const rows = (judgments, writingType = 'narrative') => judgments.map((judgment, index) => ({
    draft: `d${index}`,
    opportunity: judgment !== 'none',
    judgment,
    writingType
}));

test('the level table counts a partial demonstration as half evidence', () => {
    assert.deepEqual(levelForStandard({ rows: rows(['none', 'none']) }), {
        counts: { applicable: 0, met: 0, partly: 0, notMet: 0 },
        status: 'not_observed',
        proposedLevel: null
    });
    assert.equal(levelForStandard({ rows: rows(['met']) }).proposedLevel, null);
    assert.equal(levelForStandard({ rows: rows(['met']) }).status, 'insufficient_evidence');

    // Level 0 is only for a standard never demonstrated at all.
    assert.equal(levelForStandard({ rows: rows(['not_met', 'not_met']) }).proposedLevel, 0);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'not_met']) }).status, 'fragile');

    // The real-run cases: partial work must never publish as "Not Demonstrated".
    assert.equal(levelForStandard({ rows: rows(['partly', 'partly']) }).proposedLevel, 2);
    assert.equal(levelForStandard({ rows: rows(['partly', 'not_met']) }).proposedLevel, 1);

    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'not_met']) }).proposedLevel, 1);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'met']) }).proposedLevel, 2);
    assert.equal(levelForStandard({ rows: rows(['not_met', 'met', 'not_met', 'met']) }).proposedLevel, 2);

    assert.equal(levelForStandard({ rows: rows(['met', 'met']) }).proposedLevel, 3);
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met']) }).proposedLevel, 3);
    // Level 4 needs the same skill met in a second writing type.
    const twoTypes = [...rows(['met', 'met']), ...rows(['met', 'met'], 'argument')];
    assert.equal(levelForStandard({ rows: twoTypes }).proposedLevel, 4);
    // Four pieces in one genre stay "consistent", never "transfer".
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met', 'met']) }).proposedLevel, 3);

    // A lost skill is not "consistent".
    assert.equal(levelForStandard({ rows: rows(['met', 'met', 'met', 'not_met']) }).proposedLevel, 2);
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
    assert.equal(result.standards[0].proposedLevel, 3);
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
    const issue = (draftId) => ({ draft: draftId, patterns: [{ category: 'conventions', kind: 'issue' }] });
    const result = buildGrowth({
        pieces,
        pieceResults: [issue('d1'), issue('d2'), issue('d3'), { draft: 'd4', patterns: [] }, { draft: 'd5', patterns: [] }]
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
