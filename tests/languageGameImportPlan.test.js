import test from 'node:test';
import assert from 'node:assert/strict';

import GameSkill from '../models/GameSkill.js';
import GamePack from '../models/GamePack.js';
import Standard from '../models/Standard.js';
import {
    buildImportPlan,
    executeImportPlan,
    normalizeImportInput,
    previewResponseFor
} from '../services/languageGameImportPlan.js';
import { buildPackTemplateCsv, PACK_CSV_TEMPLATES } from '../services/languageGamePackCsv.js';
import { ImportConflictError } from '../services/languageGameAuthoring.js';

const SCHOOL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TEACHER = 'ffffffffffffffffffffffff';
const OTHER = 'dddddddddddddddddddddddd';
const SKILL = 'cccccccccccccccccccccccc';
const NEW_SKILL = 'ccccccccccccccccccccccc1';
const PACK = 'bbbbbbbbbbbbbbbbbbbbbbbb';

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

const ctx = (overrides = {}) => ({ schoolId: SCHOOL, userId: TEACHER, isAdmin: false, session: null, ...overrides });

const skillLean = (overrides = {}) => ({
    _id: SKILL, key: 'prefix-un', name: 'Prefix un-', gradeLevel: '5', language: 'en', status: 'draft', ...overrides
});

const packFields = ['title', 'description', 'status', 'visibility', 'language', 'gradeLevels', 'items', 'skillIds', 'defaultSkillId', 'subject', 'publishedRevision'];

// saveWithRevision writes through Model.findOneAndUpdate; the fake pack applies
// that update to itself so assertions read the saved state.
const packDoc = (overrides = {}) => {
    const doc = {
        _id: PACK,
        key: 'prefix-un-g5',
        title: 'Grade 5 Prefixes — Unit 3',
        description: '',
        owner: TEACHER,
        status: 'draft',
        visibility: 'private',
        language: 'en',
        gradeLevels: ['5'],
        items: [
            { externalId: 'U3-001', type: 'mcq', prompt: 'Old question', skillId: SKILL, options: [], correctOptionId: '1', acceptedAnswers: [], difficulty: 2 },
            { externalId: 'OLD-TYPED', type: 'fill_blank', prompt: 'Old typed: ___', skillId: SKILL, options: [], correctOptionId: '', acceptedAnswers: ['old'], difficulty: 2 }
        ],
        skillIds: [SKILL],
        authoringRevision: 2,
        ...overrides
    };
    doc.modifiedPaths = () => packFields.filter((path) => doc[path] !== undefined);
    doc.get = (path) => doc[path];
    doc.constructor = {
        findOneAndUpdate: async (filter, update) => {
            doc.__lastSave = { filter, update };
            if (doc.__saveResult !== undefined) return doc.__saveResult;
            Object.assign(doc, update.$set);
            return doc;
        }
    };
    doc.__saveResult = undefined;
    return doc;
};

const singleInput = (overrides = {}) => normalizeImportInput({
    type: 'mcq',
    content: buildPackTemplateCsv('mcq', 'single'),
    skillId: SKILL,
    newPack: { title: 'Unit 3 practice' },
    ...overrides
});

const bulkRow = (overrides = {}) => {
    const row = {
        pack_key: 'prefix-un-g5', pack_title: 'Grade 5 Prefixes — Unit 3', external_id: 'U3-001',
        language: 'en', grade_levels: '5', skill_key: 'prefix-un', skill_name: '', standard_codes: '',
        prompt: 'Which word means "not happy"?', option_1: 'unhappy', option_2: 'happy',
        option_3: '', option_4: '', option_5: '', option_6: '', correct_option: '1',
        answer: '', accepted_answers: '', explanation: '', difficulty: '2', ...overrides
    };
    return PACK_CSV_TEMPLATES.multiple_choice.headers.map((header) => row[header]).join(',');
};

const bulkCsv = (rows) => `${PACK_CSV_TEMPLATES.multiple_choice.headers.join(',')}\n${rows.join('\n')}`;

const mockSingleReads = (t, { skill = skillLean(), pack = null } = {}) => {
    t.mock.method(GameSkill, 'findOne', () => chain(skill));
    t.mock.method(GamePack, 'findOne', () => chain(pack));
    t.mock.method(Standard, 'find', () => chain([]));
};

/* ------------------------------------------------------------------ */
/* Input normalization                                                 */
/* ------------------------------------------------------------------ */

test('advanced is the bulk mode; everything else defaults to single create', () => {
    assert.equal(normalizeImportInput({ mode: 'advanced' }).mode, 'bulk');
    assert.equal(normalizeImportInput({}).mode, 'single');
    assert.equal(normalizeImportInput({}).operation, 'create');
    assert.equal(normalizeImportInput({ operation: 'replace' }).operation, 'replace');
    assert.equal(normalizeImportInput({ rowDisposition: 'valid_rows' }).rowDisposition, 'valid_rows');
    assert.equal(normalizeImportInput({ rowDisposition: 'anything' }).rowDisposition, 'all');
});

/* ------------------------------------------------------------------ */
/* Single destination                                                  */
/* ------------------------------------------------------------------ */

test('a single create plan defaults new-pack metadata from the chosen skill', async (t) => {
    mockSingleReads(t);
    const plan = await buildImportPlan(singleInput(), ctx());
    assert.equal(plan.canCommit, true, JSON.stringify(plan.problems));
    assert.equal(plan.targets.length, 1);
    assert.equal(plan.targets[0].pack, null);
    assert.deepEqual(plan.targets[0].meta.gradeLevels, ['5']);
    assert.equal(plan.targets[0].meta.language, 'en');
    assert.equal(plan.targets[0].items.length, 2);
    assert.ok(plan.targets[0].items.every((item) => String(item.skillId) === SKILL));
    assert.equal(plan.packRevision, null);
});

test('a single import without a chosen skill is refused before anything is read', async () => {
    await assert.rejects(
        buildImportPlan(singleInput({ skillId: '' }), ctx()),
        (error) => error.status === 400 && /Choose the skill/.test(error.message)
    );
});

test('an archived destination skill is a 409, not a silent revival', async (t) => {
    mockSingleReads(t, { skill: null });
    await assert.rejects(
        buildImportPlan(singleInput(), ctx()),
        (error) => error.status === 409 && /archived/.test(error.message)
    );
});

test('replacing a pack reports removals and requires replace plus unpublish confirmations', async (t) => {
    const pack = packDoc({ status: 'published' });
    mockSingleReads(t, { pack });
    const input = singleInput({ operation: 'replace', packId: PACK, newPack: {} });
    const plan = await buildImportPlan(input, ctx());
    assert.deepEqual(plan.replacement, {
        existingCount: 2,
        removedCount: 2,
        retainedIds: ['U3-001'],
        crossTypeRemovals: 1
    });
    assert.ok(plan.requiredConfirmations.includes('replace'));
    assert.ok(plan.requiredConfirmations.includes('unpublish'));
    assert.equal(plan.canCommit, false);
    assert.deepEqual(plan.confirmationsMissing, ['replace', 'unpublish']);
    assert.equal(plan.packRevision, 2);

    const confirmed = await buildImportPlan(
        singleInput({ operation: 'replace', packId: PACK, newPack: {}, confirmations: ['replace', 'unpublish'] }),
        ctx()
    );
    assert.equal(confirmed.canCommit, true);
});

test('a pack holding other skills cannot be replaced from the single dialog', async (t) => {
    const pack = packDoc();
    pack.items[1].skillId = OTHER;
    mockSingleReads(t, { pack });
    const plan = await buildImportPlan(singleInput({ operation: 'replace', packId: PACK, newPack: {} }), ctx());
    assert.equal(plan.canCommit, false);
    assert.ok(plan.problems.some((problem) => /other skills/.test(problem)));
});

test('someone else’s pack is a 403', async (t) => {
    mockSingleReads(t, { pack: packDoc({ owner: OTHER }) });
    await assert.rejects(
        buildImportPlan(singleInput({ operation: 'replace', packId: PACK, newPack: {} }), ctx()),
        (error) => error.status === 403
    );
});

test('an archived destination pack is a blocking problem', async (t) => {
    mockSingleReads(t, { pack: packDoc({ status: 'archived' }) });
    const plan = await buildImportPlan(singleInput({ operation: 'replace', packId: PACK, newPack: {} }), ctx());
    assert.ok(plan.problems.some((problem) => /archived/.test(problem)));
});

test('valid_rows is a single-create opt-in; replace and bulk still block on any bad row', async (t) => {
    const badContent = `${buildPackTemplateCsv('mcq', 'single')}Pick a broken row,,,\n`;
    mockSingleReads(t, { pack: packDoc() });

    const optedIn = await buildImportPlan(
        singleInput({ content: badContent, rowDisposition: 'valid_rows', confirmations: ['validRows'] }),
        ctx()
    );
    assert.equal(optedIn.csv.invalidRows, 1);
    assert.equal(optedIn.canCommit, true);

    const notConfirmed = await buildImportPlan(
        singleInput({ content: badContent, rowDisposition: 'valid_rows' }),
        ctx()
    );
    assert.deepEqual(notConfirmed.confirmationsMissing, ['validRows']);

    const replace = await buildImportPlan(
        singleInput({ content: badContent, operation: 'replace', packId: PACK, rowDisposition: 'valid_rows', confirmations: ['validRows', 'replace'] }),
        ctx()
    );
    assert.equal(replace.blockingErrors, true);
});

test('the fingerprint covers content and destination, and preview hides answer keys', async (t) => {
    mockSingleReads(t);
    const plan = await buildImportPlan(singleInput(), ctx());
    const again = await buildImportPlan(singleInput(), ctx());
    assert.equal(plan.fingerprint, again.fingerprint);

    const changed = await buildImportPlan(singleInput({ newPack: { title: 'Different title' } }), ctx());
    assert.notEqual(plan.fingerprint, changed.fingerprint);

    const preview = previewResponseFor(plan, ctx());
    assert.ok(preview.token);
    assert.equal(preview.destination.isNewPack, true);
    assert.equal(preview.destination.skill.name, 'Prefix un-');
    assert.ok(preview.sampleItems.length > 0);
    assert.equal(JSON.stringify(preview.sampleItems).includes('correctOptionId'), false);
    assert.equal(JSON.stringify(preview.sampleItems).includes('acceptedAnswers'), false);

    const blocked = await buildImportPlan(singleInput({ newPack: {} }), ctx());
    const blockedPreview = previewResponseFor(blocked, ctx());
    assert.equal(blockedPreview.token, null);
    assert.ok(blockedPreview.problems.some((problem) => /title/.test(problem)));
});

test('new-type answer fields ride the plan but never the preview', async (t) => {
    mockSingleReads(t);
    const cases = [
        { type: 'matching', content: 'prompt,matching_pairs\nMatch animals,cat::قطة|dog::كلب', secret: 'قطة' },
        { type: 'ordering', content: 'prompt,ordering_items\nSort,a > b > c', secret: 'orderingItems' },
        { type: 'numeric_response', content: 'prompt,numeric_rule\n12 x 12?,144', secret: '144' },
        { type: 'multiple_select', content: 'prompt,option_1,option_2,option_3,correct_answer\nPick evens,2,3,4,1|3', secret: 'correctAnswer' },
        { type: 'true_false', content: 'prompt,correct_answer\nThe sun is a star,true', secret: 'correctAnswer' }
    ];
    for (const entry of cases) {
        const plan = await buildImportPlan(singleInput({ type: entry.type, content: entry.content }), ctx());
        assert.equal(plan.canCommit, true, `${entry.type}: ${JSON.stringify(plan.problems)}`);
        const item = plan.targets[0].items[0];
        assert.equal(item.type, entry.type);
        assert.ok(item.correctAnswer, `${entry.type} keeps its answer key for execution`);
        if (entry.type === 'matching') {
            assert.deepEqual(item.matchingPairs, [{ left: 'cat', right: 'قطة' }, { left: 'dog', right: 'كلب' }]);
        }
        if (entry.type === 'ordering') assert.equal(item.orderingItems.length, 3);
        if (entry.type === 'numeric_response') assert.equal(item.numericRule.mode, 'exact');

        const preview = previewResponseFor(plan, ctx());
        const serialized = JSON.stringify(preview.sampleItems);
        assert.equal(serialized.includes('correctAnswer'), false, `${entry.type} preview leaks correctAnswer`);
        assert.equal(serialized.includes(entry.secret), false, `${entry.type} preview leaks ${entry.secret}`);
    }
});

test('a mixed single import keeps each row’s own type in the plan', async (t) => {
    mockSingleReads(t);
    const plan = await buildImportPlan(
        singleInput({ type: 'mixed', content: buildPackTemplateCsv('mixed', 'single') }),
        ctx()
    );
    assert.equal(plan.canCommit, true, JSON.stringify(plan.problems));
    assert.deepEqual(plan.targets[0].items.map((item) => item.type), ['multiple_choice', 'fill_in_blank', 'true_false']);
    const preview = previewResponseFor(plan, ctx());
    assert.equal(preview.type, 'mixed');
    assert.deepEqual(preview.sampleItems.map((item) => item.type), ['multiple_choice', 'fill_in_blank', 'true_false']);
    assert.equal(JSON.stringify(preview.sampleItems).includes('correctOptionId'), false);
});

/* ------------------------------------------------------------------ */
/* Bulk mode                                                           */
/* ------------------------------------------------------------------ */

const mockBulkReads = (t, { keys = [], skills = [], packs = [] } = {}) => {
    t.mock.method(GameSkill, 'find', (query) => chain(query.key ? skills : keys));
    t.mock.method(GamePack, 'find', () => chain(packs));
    t.mock.method(Standard, 'find', () => chain([]));
};

test('bulk rows for a brand-new skill stay in the plan and import after confirmation', async (t) => {
    const content = bulkCsv([
        bulkRow({ skill_key: 'new-skill', skill_name: 'Brand new skill' }),
        bulkRow({ external_id: 'U3-002', skill_key: 'new-skill', skill_name: 'Brand new skill', prompt: 'Which word means "not kind"?', option_1: 'unkind', option_2: 'kind' })
    ]);
    mockBulkReads(t);
    const input = normalizeImportInput({ mode: 'advanced', type: 'mcq', content });
    const plan = await buildImportPlan(input, ctx());
    assert.deepEqual(plan.requiredConfirmations, ['skillCreate']);
    assert.equal(plan.canCommit, false);
    assert.equal(plan.targets[0].items.length, 2, 'rows for the created skill must not be dropped');
    assert.ok(plan.targets[0].items.every((item) => item.skillId === null && item.sourceSkillKey === 'new-skill'));

    const confirmed = await buildImportPlan(
        normalizeImportInput({ mode: 'advanced', type: 'mcq', content, confirmations: ['skillCreate'] }),
        ctx()
    );
    assert.equal(confirmed.canCommit, true);

    t.mock.method(GameSkill, 'findOne', () => chain(null));
    t.mock.method(GameSkill, 'create', async ([doc]) => [{ _id: NEW_SKILL, ...doc }]);
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    t.mock.method(GamePack, 'findOne', () => chain(null));
    let createdPack = null;
    t.mock.method(GamePack, 'create', async ([doc]) => {
        createdPack = doc;
        return [{ _id: PACK, ...doc }];
    });

    const { summary, primaryPackId } = await executeImportPlan(confirmed, ctx());
    assert.equal(primaryPackId, PACK);
    assert.deepEqual(summary, { packsCreated: 1, packsUpdated: 0, itemsImported: 2, skillsCreated: 1, rowsSkipped: 0 });
    assert.equal(createdPack.items.length, 2);
    assert.ok(createdPack.items.every((item) => String(item.skillId) === NEW_SKILL));
    assert.ok(createdPack.items.every((item) => !('sourceSkillKey' in item)));
    assert.deepEqual(createdPack.skillIds.map(String), [NEW_SKILL]);
    assert.equal(String(createdPack.defaultSkillId), NEW_SKILL);
    assert.equal(createdPack.authoringRevision, 1);
});

test('an archived skill key blocks the bulk import instead of reviving the skill', async (t) => {
    const content = bulkCsv([bulkRow({ skill_name: 'Would-be revival' })]);
    mockBulkReads(t, { skills: [skillLean({ status: 'archived' })] });
    const plan = await buildImportPlan(
        normalizeImportInput({ mode: 'advanced', type: 'mcq', content, confirmations: ['skillCreate', 'replace', 'unpublish', 'validRows'] }),
        ctx()
    );
    assert.equal(plan.canCommit, false);
    assert.ok(plan.problems.some((problem) => /Restore it in the studio/.test(problem)));
    assert.ok(!plan.skillActions.some((action) => action.action === 'create'));
});

test('bulk replace of a published pack requires replace and unpublish confirmations', async (t) => {
    const pack = packDoc({ status: 'published' });
    mockBulkReads(t, { keys: [{ key: 'prefix-un' }], skills: [skillLean()], packs: [pack] });
    const content = bulkCsv([bulkRow()]);
    const plan = await buildImportPlan(normalizeImportInput({ mode: 'advanced', type: 'mcq', content }), ctx());
    assert.ok(plan.requiredConfirmations.includes('replace'));
    assert.ok(plan.requiredConfirmations.includes('unpublish'));
    assert.equal(plan.canCommit, false);
});

/* ------------------------------------------------------------------ */
/* Execution guards                                                    */
/* ------------------------------------------------------------------ */

test('executing a replace demotes a published pack and pins the previewed revision', async (t) => {
    const pack = packDoc({ status: 'published' });
    mockSingleReads(t, { pack });
    const plan = await buildImportPlan(
        singleInput({ operation: 'replace', packId: PACK, newPack: {}, confirmations: ['replace', 'unpublish'] }),
        ctx()
    );
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    const { summary } = await executeImportPlan(plan, ctx());
    assert.equal(summary.packsUpdated, 1);
    assert.equal(summary.itemsImported, 2);
    assert.equal(pack.status, 'draft');
    assert.equal(String(pack.defaultSkillId), SKILL);
    assert.equal(pack.authoringRevision, 3);
    assert.equal(pack.__lastSave.filter.authoringRevision, 2);
    assert.ok(pack.items.every((item) => !('sourceSkillKey' in item)));
});

test('a pack that moved since the preview fails the commit with a 409', async (t) => {
    const pack = packDoc();
    mockSingleReads(t, { pack });
    const plan = await buildImportPlan(
        singleInput({ operation: 'replace', packId: PACK, newPack: {}, confirmations: ['replace'] }),
        ctx()
    );
    t.mock.method(GameSkill, 'updateMany', async (query) => ({ matchedCount: query._id.$in.length }));
    pack.__saveResult = null;
    await assert.rejects(
        executeImportPlan(plan, ctx()),
        (error) => error instanceof ImportConflictError && /changed since the preview/.test(error.message)
    );
});

test('an archived skill discovered at commit time aborts the whole import', async (t) => {
    mockSingleReads(t);
    const plan = await buildImportPlan(singleInput(), ctx());
    t.mock.method(GameSkill, 'updateMany', async () => ({ matchedCount: 0 }));
    t.mock.method(GamePack, 'create', async () => { throw new Error('must not create a pack when the skill guard fails'); });
    await assert.rejects(
        executeImportPlan(plan, ctx()),
        (error) => error instanceof ImportConflictError && error.code === 'SKILL_UNAVAILABLE'
    );
});