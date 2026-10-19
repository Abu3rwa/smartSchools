import test from 'node:test';
import assert from 'node:assert/strict';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import { resolvePortalUrl } from '../helpers/portalUrl.js';
import {
    buildFormalTestWordList,
    buildFormalSpellingTestWordListEmail,
    getSpellingAssessmentCoverage,
    processSpellingEmailDelivery,
    resolveSpellingCompletionRecipients
} from '../services/spellingEmailService.js';

test('formal test preparation emails are processed by their own delivery ID', async (t) => {
    const deliveryId = 'delivery-123';
    let query;
    t.mock.method(SpellingEmailDelivery, 'findOneAndUpdate', (filter) => {
        query = filter;
        return { then: (resolve) => resolve(null) };
    });
    t.mock.method(SpellingEmailDelivery, 'findById', (id) => {
        assert.equal(id, deliveryId);
        return {
            select: () => ({ lean: async () => ({ status: 'pending', lastError: '' }) })
        };
    });

    const delivery = await processSpellingEmailDelivery({ deliveryId });

    assert.equal(query._id, deliveryId);
    assert.equal(delivery.status, 'pending');
});

test('spelling completion recipients honor each audience', () => {
    const student = {
        getAllContactEmailEntries: () => [
            { email: 'student@school.test', type: 'student' },
            { email: 'father@school.test', type: 'father' },
            { email: 'mother@school.test', type: 'mother' },
            { email: 'student@school.test', type: 'student' }
        ]
    };

    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'none'), []);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-only'), ['student@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'parents-only'), ['father@school.test', 'mother@school.test']);
    assert.deepEqual(resolveSpellingCompletionRecipients(student, 'student-and-parents'), [
        'student@school.test',
        'father@school.test',
        'mother@school.test'
    ]);
});

test('spelling completion recipients safely return no addresses without the model helper', () => {
    assert.deepEqual(resolveSpellingCompletionRecipients({}, 'student-and-parents'), []);
});

test('portal links in emails never point at a local development server', () => {
    assert.equal(
        resolvePortalUrl('http://localhost:5173/portal'),
        'https://smile3-8c8c5.web.app/portal'
    );
    assert.equal(
        resolvePortalUrl('https://school.example'),
        'https://school.example/portal'
    );
    assert.equal(
        resolvePortalUrl('http://localhost:5173/portal'),
        'https://smile3-8c8c5.web.app/portal'
    );
});

test('formal spelling email coverage includes every distinct grade, week, and category', () => {
    const coverage = getSpellingAssessmentCoverage([
        { grade: 'G4', week: 3, category: 'Animals' },
        { grade: 'G4', week: 12, category: 'Prefixes' },
        { grade: 'G4', week: 3, category: 'Animals' },
        { grade: 'G5', week: 2, category: 'Homophones' }
    ]);

    assert.deepEqual(coverage, {
        grades: ['G4', 'G5'],
        weeks: [2, 3, 12],
        categories: ['Animals', 'Homophones', 'Prefixes']
    });
});

test('formal spelling email coverage falls back to the selected quiz grade and week when attempts have no coverage', () => {
    assert.deepEqual(getSpellingAssessmentCoverage([], { fallbackGrade: 'G3', fallbackWeek: 4 }), {
        grades: ['G3'],
        weeks: [4],
        categories: []
    });
});

test('formal test word lists contain only distinct missed words not resolved formally', () => {
    const missedWordId = 'word-1';
    assert.deepEqual(buildFormalTestWordList({
        retestItems: [
            { _id: 'retest-1', sourceWord: missedWordId, wordSnapshot: 'Previously Missed', grade: 'G2', week: 1, category: 'Animals', status: 'pending' },
            { _id: 'retest-2', sourceWord: 'word-2', wordSnapshot: 'Old Snapshot', grade: 'G2', week: 1, category: 'Animals' }
        ],
        curriculumWords: [
            { _id: missedWordId, word: 'Previously Missed', grade: 'G2', week: 1, category: 'Animals', order: 1 },
            { _id: 'word-3', word: 'New Word', grade: 'G2', week: 1, category: 'Animals', order: 3 }
        ]
    }), {
        lowConfidenceWords: ['Previously Missed', 'Old Snapshot'],
        curriculumWords: [],
        plannedWords: [
            {
                wordId: missedWordId,
                wordSnapshot: 'Previously Missed',
                grade: 'G2',
                week: 1,
                category: 'Animals',
                order: null,
                retestItemId: 'retest-1',
                isRetest: true
            },
            {
                wordId: 'word-2',
                wordSnapshot: 'Old Snapshot',
                grade: 'G2',
                week: 1,
                category: 'Animals',
                order: null,
                retestItemId: 'retest-2',
                isRetest: true
            }
        ]
    });
});

test('formal test word lists include practice-mastered words and prefer active retests when deduplicating', () => {
    const result = buildFormalTestWordList({
        retestItems: [
            { _id: 'retest-1', sourceWord: 'word-1', wordSnapshot: 'Previously Missed', grade: 'G2', week: 1, category: 'Animals', status: 'practice-mastered' },
            { _id: 'retest-2', sourceWord: 'word-1', wordSnapshot: 'Previously Missed', grade: 'G2', week: 1, category: 'Animals', status: 'pending' }
        ],
        curriculumWords: [
            { _id: 'word-1', word: 'Previously Missed', grade: 'G2', week: 1, category: 'Animals', order: 1 },
            { _id: 'word-3', word: 'New Word', grade: 'G2', week: 1, category: 'Animals', order: 3 }
        ]
    });

    assert.deepEqual(result.lowConfidenceWords, ['Previously Missed']);
    assert.deepEqual(result.curriculumWords, []);
    assert.deepEqual(result.plannedWords, [
        {
            wordId: 'word-1',
            wordSnapshot: 'Previously Missed',
            grade: 'G2',
            week: 1,
            category: 'Animals',
            order: null,
            retestItemId: 'retest-2',
            isRetest: true
        }
    ]);
});

test('formal test preparation emails list only unresolved words in a readable, safe layout', () => {
    const email = buildFormalSpellingTestWordListEmail({
        session: { scheduledAt: new Date('2026-10-18T16:58:00.000Z') },
        lowConfidenceWords: ['missed word', '<script>alert("x")</script>'],
        timeZone: 'Africa/Cairo'
    });

    assert.match(email.subject, /Words to prepare for your spelling test/);
    assert.match(email.text, /Unresolved missed words to review/);
    assert.doesNotMatch(email.text, /Other words in this test|curriculum word/);
    assert.match(email.text, /test list has 2 words/);
    assert.match(email.html, /background:#4338ca/);
    assert.match(email.html, /Words still to recover/);
    assert.doesNotMatch(email.html, /Other words in this test|curriculum word/);
    assert.match(email.html, /2 words in your test/);
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.match(email.html, /&lt;script&gt;.*?<\/span>&nbsp;/);
    assert.match(email.html, /covers only these unresolved words/);
    assert.match(email.text, /finish when you complete it/);
});
