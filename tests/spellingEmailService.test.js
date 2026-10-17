import test from 'node:test';
import assert from 'node:assert/strict';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
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

test('formal test word lists put missed words first and exclude them from the curriculum list', () => {
    const missedWordId = 'word-1';
    assert.deepEqual(buildFormalTestWordList({
        pendingRetests: [
            { sourceWord: missedWordId, wordSnapshot: 'Previously Missed' },
            { sourceWord: 'word-2', wordSnapshot: 'Old Snapshot' }
        ],
        curriculumWords: [
            { _id: missedWordId, word: 'Previously Missed' },
            { _id: 'word-2', word: 'Updated Word' },
            { _id: 'word-3', word: 'New Word' }
        ]
    }), {
        lowConfidenceWords: ['Previously Missed', 'Old Snapshot'],
        curriculumWords: ['New Word']
    });
});

test('formal test preparation emails list low-confidence words before the planned curriculum words', () => {
    const email = buildFormalSpellingTestWordListEmail({
        session: { scheduledAt: new Date('2026-10-18T16:58:00.000Z') },
        lowConfidenceWords: ['missed word', '<script>alert("x")</script>'],
        curriculumWords: ['curriculum word'],
        timeZone: 'Africa/Cairo'
    });

    assert.match(email.subject, /Words to prepare for your spelling test/);
    assert.ok(email.text.indexOf('Previously missed words') < email.text.indexOf('Other words in the planned test'));
    assert.ok(email.text.indexOf('missed word') < email.text.indexOf('curriculum word'));
    assert.match(email.html, /&lt;script&gt;/);
    assert.doesNotMatch(email.html, /<script>/);
});
