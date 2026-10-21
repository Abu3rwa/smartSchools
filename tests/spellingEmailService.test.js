import test from 'node:test';
import assert from 'node:assert/strict';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import { resolvePortalUrl } from '../helpers/portalUrl.js';
import {
    buildFormalTestWordList,
    buildFormalSpellingTestWordListEmail,
    buildSpellingCompletionEmail,
    buildSpellingRetestPracticeEmail,
    getSpellingAssessmentCoverage,
    processSpellingEmailDelivery,
    resolveSpellingCompletionRecipients
} from '../services/spellingEmailService.js';
import { buildSpellingPassageEmail } from '../services/spellingPassageEmailService.js';

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
    assert.match(email.html, /background:#0f172a/);
    assert.match(email.html, /line-height:1\.6/);
    assert.match(email.html, /Words still to recover/);
    assert.doesNotMatch(email.html, /Other words in this test|curriculum word/);
    assert.match(email.html, /Test length<\/td><td[^>]*>2 words</);
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.match(email.html, /&lt;script&gt;.*?<\/span>&nbsp;/);
    assert.match(email.html, /covers only these unresolved words/);
    assert.match(email.text, /finish when you complete it/);
});

const attempts = [
    { wordSnapshot: 'because', correct: true, grade: 'G2', week: 3, category: 'Sight words' },
    { wordSnapshot: '<b>friend</b>', correct: false, grade: 'G2', week: 4, category: 'Sight words' }
];

test('formal spelling quiz result email shows the score, coverage, and escaped missed words', () => {
    const email = buildSpellingCompletionEmail({
        session: { assessmentType: 'formal-spelling-test', attempts, correctCount: 1, mistakeCount: 1, completedAt: '2026-10-20T10:00:00Z' },
        studentName: 'Ava Martinez',
        portalUrl: 'https://school.example/portal'
    });

    assert.equal(email.subject, 'Spelling quiz result for Ava Martinez: 1 of 2 correct');
    assert.match(email.text, /Score: 1 out of 2 words/);
    assert.match(email.text, /Weeks: 3, 4/);
    assert.match(email.html, /Formal spelling quiz/);
    assert.match(email.html, /For Ava Martinez · Completed Oct 20, 2026/);
    assert.match(email.html, />50%</);
    assert.match(email.html, /&lt;b&gt;friend&lt;\/b&gt;/);
    assert.doesNotMatch(email.html, /<b>friend/);
    assert.match(email.html, /href="https:\/\/school\.example\/portal"/);
    assert.doesNotMatch(email.html, /Retest deadline/);
});

test('spelling level check email shows tallies and skips an unknown retest deadline', () => {
    const session = { attempts, correctCount: 1, mistakeCount: 1, completedAt: '2026-10-20T10:00:00Z' };
    const withoutDeadline = buildSpellingCompletionEmail({ session, portalUrl: '' });
    const withDeadline = buildSpellingCompletionEmail({ session: { ...session, retestDeadline: '2026-10-27T10:00:00Z' }, portalUrl: '' });

    assert.match(withoutDeadline.subject, /^Spelling level check summary \(Oct 20, 2026\)$/);
    assert.match(withoutDeadline.html, /not a graded assignment/);
    assert.match(withoutDeadline.html, /Words checked/);
    assert.doesNotMatch(withoutDeadline.html, /Invalid Date|Retest deadline/);
    assert.doesNotMatch(withoutDeadline.html, /<a /);
    assert.match(withDeadline.html, /Retest deadline<\/td><td[^>]*>Oct 27, 2026</);
    assert.match(withDeadline.text, /Retest deadline: Oct 27, 2026/);
});

test('spelling passage email highlights practice words without trusting passage content', () => {
    const email = buildSpellingPassageEmail({
        passage: { missedWords: ['friend'], content: 'My friend <script>x</script> came over.', style: 'paragraph' },
        session: { completedAt: '2026-10-20T10:00:00Z' },
        studentName: 'Ava Martinez',
        portalUrl: 'https://school.example/portal'
    });

    assert.equal(email.subject, 'Practice passage for Ava Martinez (Oct 20, 2026)');
    assert.match(email.html, /<mark style="[^"]*">friend<\/mark>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.doesNotMatch(email.html, /<script>/);
    assert.match(email.html, /Your practice passage/);
});

test('spelling retest practice email lists each word once, escaped, with a start link', () => {
    const email = buildSpellingRetestPracticeEmail({
        session: { startedAt: '2026-10-21T08:00:00Z' },
        words: ['friend', 'Friend', '<i>enough</i>', ''],
        studentName: 'Ava Martinez',
        portalUrl: 'https://school.example/portal'
    });

    assert.equal(email.subject, 'Spelling retest quiz ready for Ava Martinez: 2 words to practice');
    assert.equal(email.text, 'Your spelling retest quiz is ready\nStudent: Ava Martinez\nAvailable since: Oct 21, 2026\n\nYour graded spelling retest quiz is now available. Practice these words before you begin:\n- friend\n- <i>enough</i>\n\nOpen the spelling portal: https://school.example/portal');
    assert.equal(email.html.match(/>friend<\/span>/gi).length, 1);
    assert.match(email.html, /&lt;i&gt;enough&lt;\/i&gt;/);
    assert.doesNotMatch(email.html, /<i>/);
    assert.match(email.html, /<strong[^>]*>Ava<\/strong>, it's time/);
    assert.match(email.html, /href="https:\/\/school\.example\/portal"[^>]*>Start retest quiz/);
});
