import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPieceEvidencePrompt,
    normalizePieceEvidence
} from '../services/writingAnalysisPrompts.js';

const standards = [
    { standard: 's1', code: 'W1', name: 'Organisation', description: 'Orders ideas into paragraphs.' },
    { standard: 's2', code: 'W2', name: 'Sentences', description: 'Writes complete sentences.' },
    { standard: 's3', code: 'W3', name: 'Vocabulary', description: 'Chooses precise words.' }
];

const text = 'My name is Sara and I wrote this letter. First, we planted the seeds. Then we watered them every day.';

test('the prompt never contains the student name or contact details', () => {
    const prompt = buildPieceEvidencePrompt({
        text: `${text} Email sara@example.com or call 0551234567.`,
        standards,
        writingType: 'narrative',
        studentName: 'Sara Ali'
    });
    assert.equal(prompt.includes('Sara'), false);
    assert.equal(prompt.includes('sara@example.com'), false);
    assert.equal(prompt.includes('0551234567'), false);
    assert.match(prompt, /\[S1\] W1/);
    assert.match(prompt, /at most 25 words/);
    assert.match(prompt, /Do not propose a level/);
});

test('Arabic notes are requested when the school works in Arabic', () => {
    const prompt = buildPieceEvidencePrompt({ text, standards, language: 'ar' });
    assert.match(prompt, /Modern Standard Arabic/);
});

test('real quotes are kept, invented quotes are dropped and counted', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: true, judgment: 'met', quote: 'First, we planted the seeds.', note: 'Opens with a clear first step.' },
                { key: 'S2', opportunity: true, judgment: 'partly', quote: 'this sentence is not in the piece', note: 'Attempts a sentence.' },
                { key: 'S3', opportunity: true, judgment: 'met', quote: 'watered them every day', note: 'Precise verb.' }
            ],
            patterns: [
                { category: 'organisation', kind: 'strength', quote: 'Then we watered them every day.', note: 'Clear sequence.' },
                { category: 'not-a-category', kind: 'issue', quote: 'anything', note: 'Ignored.' }
            ]
        },
        text,
        standards,
        studentName: 'Sara Ali'
    });
    assert.equal(result.ok, true);
    assert.equal(result.quotesKept, 2);
    assert.equal(result.quotesDropped, 1);
    assert.equal(result.standards.length, 3);
    assert.equal(result.standards[1].quote, '');
    assert.equal(result.patterns.length, 1);
    assert.equal(result.patterns[0].category, 'organisation');
});

test('a piece where most quotes cannot be found is unusable', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: true, judgment: 'met', quote: 'invented words here', note: '' },
                { key: 'S2', opportunity: true, judgment: 'met', quote: 'First, we planted the seeds.', note: '' }
            ]
        },
        text,
        standards
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'quotes_dropped');
});

test('no opportunity needs no quote and never counts as failure', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: false, judgment: 'none', quote: '', note: 'This piece had no paragraphs to organise.' },
                { key: 'S2', opportunity: true, judgment: 'met', quote: 'First, we planted the seeds.', note: 'Complete sentence.' }
            ]
        },
        text,
        standards
    });
    assert.equal(result.ok, true);
    assert.equal(result.standards[0].opportunity, false);
    assert.equal(result.standards[0].judgment, 'none');
    assert.equal(result.standards[0].quote, '');
    assert.equal(result.quotesDropped, 0);
});

test('a quote that used the student token is restored to the real name', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: true, judgment: 'met', quote: 'My name is {{student}} and I wrote this letter.', note: 'States the purpose.' }
            ]
        },
        text,
        standards,
        studentName: 'Sara Ali'
    });
    assert.equal(result.ok, true);
    assert.equal(result.standards[0].quote, 'My name is Sara and I wrote this letter.');
});

test('an absence judgment is kept without a quote and never counts as a lost quote', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: true, judgment: 'not_met', absence: true, quote: '', note: 'No title of a work appears in this piece.' },
                { key: 'S2', opportunity: true, judgment: 'met', quote: 'First, we planted the seeds.', note: 'Complete sentence.' }
            ]
        },
        text,
        standards
    });
    assert.equal(result.ok, true);
    assert.equal(result.standards[0].absence, true);
    assert.equal(result.standards[0].judgment, 'not_met');
    assert.equal(result.standards[0].quote, '');
    assert.equal(result.quotesDropped, 0);
    assert.equal(result.quotesKept, 1);
});

test('a note that describes text outside the quote is blanked, the quote stays', () => {
    const result = normalizePieceEvidence({
        parsed: {
            standards: [
                { key: 'S1', opportunity: true, judgment: 'partly', quote: 'First, we planted the seeds.', note: 'Opens well, but there are several errors elsewhere.' },
                { key: 'S2', opportunity: true, judgment: 'met', quote: 'watered them every day', note: 'Uses "every day" precisely.' }
            ]
        },
        text,
        standards
    });
    assert.equal(result.ok, true);
    assert.equal(result.standards[0].note, '');
    assert.equal(result.standards[0].quote, 'First, we planted the seeds.');
    assert.equal(result.vagueNotes, 1);
    // A note about words that are actually in the quote is kept.
    assert.match(result.standards[1].note, /every day/);
});

test('the prompt states the absence rule and forbids claims about unquoted text', () => {
    const prompt = buildPieceEvidencePrompt({ text, standards });
    assert.match(prompt, /"absence"/);
    assert.match(prompt, /Describe only the quoted words/);
    assert.match(prompt, /elsewhere/);
});

test('a reply that names no standard of this run is unusable', () => {
    const result = normalizePieceEvidence({
        parsed: { standards: [{ key: 'X9', opportunity: true, judgment: 'met', quote: 'First, we planted the seeds.' }] },
        text,
        standards
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_matching_standards');
});
