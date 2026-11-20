import test from 'node:test';
import assert from 'node:assert/strict';

import GameSkill from '../models/GameSkill.js';
import GamePack from '../models/GamePack.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import {
    buildImportPlan,
    normalizeImportInput,
    previewResponseFor
} from '../services/languageGameImportPlan.js';
import { buildPoolDraft, mapPoolQuestion } from '../services/languageGamePoolImport.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TEACHER = 'ffffffffffffffffffffffff';
const SKILL = 'cccccccccccccccccccccccc';
const CLASS = '333333333333333333333333';
const POOL = '444444444444444444444444';
const Q1 = '660000000000000000000001';
const Q2 = '660000000000000000000002';

const chain = (value) => {
    const q = {
        select: () => q,
        sort: () => q,
        limit: () => q,
        session: () => q,
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
};

const ctx = (overrides = {}) => ({
    schoolId: SCHOOL, userId: TEACHER, isAdmin: false, session: null, teacherClassIds: [CLASS], ...overrides
});

const question = (overrides = {}) => ({
    _id: Q1,
    questionText: 'Which word means "not happy"?',
    questionType: 'multiple_choice',
    options: [{ label: 'A', text: 'unhappy' }, { label: 'B', text: 'happy' }],
    correctAnswer: 'A',
    acceptableAnswers: [],
    explanation: 'un- means not.',
    difficulty: 'easy',
    passageText: '',
    matchingPairs: [],
    orderingItems: [],
    blanks: [],
    numericRule: null,
    ...overrides
});

const pool = (overrides = {}) => ({
    _id: POOL,
    school: SCHOOL,
    class: CLASS,
    subject: '222222222222222222222222',
    standard: '777777777777777777777777',
    status: 'published',
    isActive: true,
    currentVersion: 3,
    questions: [question()],
    ...overrides
});

const skillLean = () => ({
    _id: SKILL, key: 'prefix-un', name: 'Prefix un-', gradeLevel: '5', language: 'en', status: 'draft', subject: null
});

const poolInput = (overrides = {}) => normalizeImportInput({
    source: 'pool',
    poolId: POOL,
    skillId: SKILL,
    newPack: { title: 'From the pool' },
    ...overrides
});

const mockPoolReads = (t, { poolDoc = pool(), skill = skillLean(), pack = null } = {}) => {
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(poolDoc));
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    t.mock.method(GamePack, 'findOne', () => chain(pack));
};

/* ------------------------------------------------------------------ */
/* Question mapping                                                    */
/* ------------------------------------------------------------------ */

test('a pool multiple-choice question keeps its option labels as ids', () => {
    const draft = buildPoolDraft(pool());
    assert.equal(draft.errors.length, 0);
    assert.equal(draft.validRows, 1);
    const item = draft.packs[0].items[0];
    assert.equal(item.externalId, Q1);
    assert.equal(item.type, 'multiple_choice');
    assert.deepEqual(item.options, [{ id: 'A', text: 'unhappy' }, { id: 'B', text: 'happy' }]);
    assert.equal(item.correctOptionId, 'A');
    assert.equal(item.difficulty, 1);
    assert.equal(item.skillKey, '');
});

test('true/false, multiple-select and difficulty mapping survive the draft', () => {
    const draft = buildPoolDraft(pool({
        questions: [
            question({ questionType: 'true_false', options: [], correctAnswer: 'true', difficulty: 'hard' }),
            question({
                _id: Q2,
                questionType: 'multiple_select',
                options: [{ label: 'A', text: '2' }, { label: 'B', text: '3' }, { label: 'C', text: '4' }],
                correctAnswer: 'A|C',
                difficulty: 'medium'
            })
        ]
    }));
    assert.equal(draft.errors.length, 0, JSON.stringify(draft.errors));
    const [tf, multi] = draft.packs[0].items;
    assert.equal(tf.type, 'true_false');
    assert.equal(tf.correctAnswer, 'true');
    assert.equal(tf.difficulty, 3);
    assert.equal(multi.type, 'multiple_select');
    assert.equal(multi.correctAnswer, 'A|C');
    assert.equal(multi.difficulty, 2);
});

test('matching pairs and hashed ordering ids are carried, not re-derived', () => {
    const draft = buildPoolDraft(pool({
        questions: [
            question({
                questionType: 'matching',
                options: [],
                correctAnswer: '',
                matchingPairs: [{ left: 'cat', right: 'قطة' }, { left: 'dog', right: 'كلب' }]
            }),
            question({
                _id: Q2,
                questionType: 'ordering',
                options: [],
                correctAnswer: '',
                orderingItems: [{ id: 'ix1', text: 'Sunrise' }, { id: 'ix2', text: 'Noon' }, { id: 'ix3', text: 'Sunset' }]
            })
        ]
    }));
    assert.equal(draft.errors.length, 0, JSON.stringify(draft.errors));
    const [matching, ordering] = draft.packs[0].items;
    assert.deepEqual(matching.matchingPairs, [{ left: 'cat', right: 'قطة' }, { left: 'dog', right: 'كلب' }]);
    assert.equal(matching.correctAnswer, 'cat::قطة|dog::كلب');
    assert.deepEqual(ordering.orderingItems.map((entry) => entry.id), ['ix1', 'ix2', 'ix3']);
    assert.equal(ordering.correctAnswer, 'ix1>ix2>ix3');
});

test('a single-blank pool question becomes a typed-answer question with every accepted spelling', () => {
    const draft = buildPoolDraft(pool({
        questions: [question({
            questionType: 'fill_in_blank',
            questionText: 'The prefix un- means {{b1}}.',
            options: [],
            correctAnswer: 'b1::not~no',
            blanks: [{ id: 'b1', accepts: ['not', 'no'] }],
            acceptableAnswers: ['opposite']
        })]
    }));
    assert.equal(draft.errors.length, 0, JSON.stringify(draft.errors));
    const item = draft.packs[0].items[0];
    assert.equal(item.type, 'fill_in_blank');
    assert.equal(item.prompt, 'The prefix un- means ___.');
    assert.deepEqual(item.acceptedAnswers, ['not', 'no', 'opposite']);
});

test('a numeric rule object becomes the same rule the CSV grammar produces', () => {
    const draft = buildPoolDraft(pool({
        questions: [question({
            questionType: 'numeric_response',
            options: [],
            correctAnswer: '3.14 ±0.01',
            numericRule: { mode: 'tolerance', value: '3.14', tolerance: '0.01' }
        })]
    }));
    assert.equal(draft.errors.length, 0, JSON.stringify(draft.errors));
    const item = draft.packs[0].items[0];
    assert.equal(item.numericRule.mode, 'tolerance');
    assert.equal(item.correctAnswer, '3.14 ±0.01');
});

test('a passage is inlined into the prompt; an over-long passage is a problem row, never a truncation', () => {
    const short = buildPoolDraft(pool({ questions: [question({ passageText: 'Read the story.' })] }));
    assert.equal(short.packs[0].items[0].prompt, 'Read the story.\n\nWhich word means "not happy"?');

    const long = buildPoolDraft(pool({ questions: [question({ passageText: 'x'.repeat(1100) })] }));
    assert.equal(long.validRows, 0);
    assert.equal(long.invalidRows, 1);
    assert.ok(long.errors.some((error) => /limit is 1000/.test(error.message)));
});

test('free-text and multi-blank pool questions are reported, not silently dropped', () => {
    const draft = buildPoolDraft(pool({
        questions: [
            question({ questionType: 'short_answer', options: [], correctAnswer: 'because un- means not' }),
            question({
                _id: Q2,
                questionType: 'fill_in_blank',
                questionText: '{{b1}} and {{b2}}',
                options: [],
                blanks: [{ id: 'b1', accepts: ['a'] }, { id: 'b2', accepts: ['b'] }]
            })
        ]
    }));
    assert.equal(draft.validRows, 0);
    assert.equal(draft.invalidRows, 2);
    assert.ok(draft.errors.some((error) => /Free-text answers/.test(error.message)));
    assert.ok(draft.errors.some((error) => /exactly one blank/.test(error.message)));
});

test('questionIds select a subset; a vanished selection is an error row', () => {
    const two = pool({ questions: [question(), question({ _id: Q2, questionText: 'Second question?' })] });
    const subset = buildPoolDraft(two, [Q2]);
    assert.equal(subset.totalRows, 1);
    assert.equal(subset.packs[0].items[0].externalId, Q2);

    const missing = buildPoolDraft(two, [Q2, '660000000000000000000099']);
    assert.ok(missing.errors.some((error) => /no longer in this pool/.test(error.message)));
});

test('mapPoolQuestion rejects an unknown type through the shared validator', () => {
    const mapped = mapPoolQuestion(question({ questionType: 'essay_alias' }), 0);
    assert.equal(mapped.item, null);
    assert.ok(mapped.errors.length > 0);
});

/* ------------------------------------------------------------------ */
/* Plan integration                                                    */
/* ------------------------------------------------------------------ */

test('pool source forces single mode and ignores CSV fields', () => {
    const input = normalizeImportInput({ source: 'pool', mode: 'advanced', type: '', content: '' });
    assert.equal(input.source, 'pool');
    assert.equal(input.mode, 'single');
    assert.equal(normalizeImportInput({}).source, 'csv');
});

test('a pool preview builds a committable plan through the same machinery', async (t) => {
    mockPoolReads(t);
    const plan = await buildImportPlan(poolInput(), ctx());
    assert.equal(plan.canCommit, true, JSON.stringify(plan.problems));
    assert.equal(plan.targets[0].items.length, 1);
    assert.equal(String(plan.targets[0].items[0].skillId), SKILL);
    assert.equal(plan.poolRef.poolId, POOL);
    assert.equal(plan.poolRef.version, 3);

    const preview = previewResponseFor(plan, ctx());
    assert.equal(preview.source, 'pool');
    assert.equal(preview.pool.poolId, POOL);
    assert.equal(preview.canCommit, true);
    assert.ok(preview.token);
    assert.equal(JSON.stringify(preview.sampleItems).includes('correctOptionId'), false);
    assert.equal(JSON.stringify(preview.sampleItems).includes('correctAnswer'), false);
});

test('a pool from a class the teacher does not teach is a 403', async (t) => {
    mockPoolReads(t);
    await assert.rejects(
        buildImportPlan(poolInput(), ctx({ teacherClassIds: [] })),
        (error) => error.status === 403 && /class you do not teach/.test(error.message)
    );
});

test('admins import from any published pool in the school', async (t) => {
    mockPoolReads(t);
    const plan = await buildImportPlan(poolInput(), ctx({ isAdmin: true, teacherClassIds: [] }));
    assert.equal(plan.canCommit, true);
});

test('an unpublished or foreign pool is a 404', async (t) => {
    mockPoolReads(t, { poolDoc: null });
    await assert.rejects(
        buildImportPlan(poolInput(), ctx()),
        (error) => error.status === 404 && /not published/.test(error.message)
    );
});

test('a pool edit between preview and commit changes the fingerprint', async (t) => {
    let version = 3;
    t.mock.method(StandardQuestionPool, 'findOne', () => chain(pool({ currentVersion: version })));
    t.mock.method(GameSkill, 'findOne', () => chain(skillLean()));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    const before = await buildImportPlan(poolInput(), ctx());
    const after = await buildImportPlan(poolInput(), ctx());
    assert.equal(before.fingerprint, after.fingerprint);

    version = 4;
    const edited = await buildImportPlan(poolInput(), ctx());
    assert.notEqual(before.fingerprint, edited.fingerprint);
});

test('selecting different questions changes the fingerprint too', async (t) => {
    mockPoolReads(t, { poolDoc: pool({ questions: [question(), question({ _id: Q2, questionText: 'Second?' })] }) });
    const all = await buildImportPlan(poolInput(), ctx());
    const subset = await buildImportPlan(poolInput({ questionIds: [Q2] }), ctx());
    assert.notEqual(all.fingerprint, subset.fingerprint);
});

test('invalid pool rows block commit unless the teacher accepts valid rows only', async (t) => {
    mockPoolReads(t, {
        poolDoc: pool({ questions: [question(), question({ _id: Q2, questionType: 'short_answer', options: [] })] })
    });
    const blocked = await buildImportPlan(poolInput(), ctx());
    assert.equal(blocked.canCommit, false);
    assert.equal(blocked.blockingErrors, true);

    const partial = await buildImportPlan(poolInput({ rowDisposition: 'valid_rows', confirmations: ['validRows'] }), ctx());
    assert.equal(partial.canCommit, true, JSON.stringify(partial.problems));
    assert.equal(partial.targets[0].items.length, 1);
    assert.equal(partial.csv.invalidRows, 1);
});

test('a pool replace reuses the pack guards and confirmations', async (t) => {
    const existingPack = {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        key: 'prefixes',
        title: 'Prefixes',
        description: '',
        owner: TEACHER,
        status: 'published',
        visibility: 'private',
        language: 'en',
        gradeLevels: ['5'],
        items: [{ externalId: 'OLD', type: 'mcq', prompt: 'Old', skillId: SKILL, difficulty: 2 }],
        skillIds: [SKILL],
        authoringRevision: 2,
        save() { return Promise.resolve(this); }
    };
    mockPoolReads(t, { pack: existingPack });
    const input = poolInput({ operation: 'replace', packId: String(existingPack._id) });
    const unconfirmed = await buildImportPlan(input, ctx());
    assert.equal(unconfirmed.canCommit, false);
    assert.ok(unconfirmed.requiredConfirmations.includes('replace'));
    assert.ok(unconfirmed.requiredConfirmations.includes('unpublish'));

    const confirmed = await buildImportPlan(
        poolInput({ operation: 'replace', packId: String(existingPack._id), confirmations: ['replace', 'unpublish'] }),
        ctx()
    );
    assert.equal(confirmed.canCommit, true, JSON.stringify(confirmed.problems));
    assert.equal(confirmed.packRevision, 2);
});