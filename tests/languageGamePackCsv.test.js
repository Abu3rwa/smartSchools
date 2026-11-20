import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPackTemplateCsv,
    PACK_CSV_TEMPLATES,
    SIMPLE_CSV_TEMPLATES,
    validatePackCsv
} from '../services/languageGamePackCsv.js';
import { createPlanToken, verifyPlanToken, fingerprintOf, PREVIEW_TTL_MS } from '../services/languageGameImportToken.js';
import { sanitizePackItems, publicSessionItem, revealForItem, ITEM_TYPES } from '../services/languageGameItems.js';

const HEADER = PACK_CSV_TEMPLATES.multiple_choice.headers.join(',');

const mcqRow = (overrides = {}) => {
    const row = {
        pack_key: 'prefixes',
        pack_title: 'Prefixes',
        external_id: 'Q1',
        language: 'en',
        grade_levels: '5',
        skill_key: 'prefix-un',
        skill_name: '',
        standard_codes: '',
        prompt: 'Which word means "not happy"?',
        option_1: 'unhappy',
        option_2: 'happy',
        option_3: '',
        option_4: '',
        option_5: '',
        option_6: '',
        correct_option: '1',
        answer: '',
        accepted_answers: '',
        explanation: '',
        difficulty: '2',
        ...overrides
    };
    return PACK_CSV_TEMPLATES.multiple_choice.headers.map((header) => row[header]).join(',');
};

const csv = (rows) => `${HEADER}\n${rows.join('\n')}`;

const knownSkills = new Set(['prefix-un', 'shapes', 'even-odd', 'planets', 'day-cycle', 'times-tables']);

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

test('every shipped bulk template validates with no errors', () => {
    for (const type of ITEM_TYPES) {
        const result = validatePackCsv(buildPackTemplateCsv(type), type, { existingSkillKeys: knownSkills });
        assert.equal(result.errors.length, 0, `${type} template errors: ${JSON.stringify(result.errors)}`);
        assert.ok(result.packs.length >= 1);
        assert.equal(result.validRows, result.totalRows);
        assert.ok(result.invalidRows === 0);
        for (const pack of result.packs) {
            for (const item of pack.items) assert.deepEqual(item.standardCodes, []);
        }
    }
});

test('the AI prompt lists the same columns the parser accepts', () => {
    assert.deepEqual(PACK_CSV_TEMPLATES.multiple_choice.headers.slice(0, 4), ['pack_key', 'pack_title', 'external_id', 'language']);
    assert.ok(PACK_CSV_TEMPLATES.multiple_choice.headers.includes('correct_option'));
    assert.ok(PACK_CSV_TEMPLATES.fill_in_blank.headers.includes('accepted_answers'));
});

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

test('a BOM, quoted commas and a multiline prompt survive parsing', () => {
    const rows = [
        mcqRow({ prompt: '"Which word means ""not happy""?"' }),
        mcqRow({ external_id: 'Q2', prompt: '"Line one\nLine two"' })
    ];
    const result = validatePackCsv(`\uFEFF${csv(rows)}`, 'mcq', { existingSkillKeys: knownSkills });
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.packs[0].items[0].prompt, 'Which word means "not happy"?');
    assert.equal(result.packs[0].items[1].prompt, 'Line one\nLine two');
});

test('missing required columns are reported before any row is read', () => {
    assert.throws(
        () => validatePackCsv('pack_key,pack_title\na,b', 'mcq'),
        /Missing required column/
    );
});

/* ------------------------------------------------------------------ */
/* Row rules                                                           */
/* ------------------------------------------------------------------ */

test('unknown skills need skill_name to be created as a draft', () => {
    const missing = validatePackCsv(csv([mcqRow({ skill_key: 'prefix-re' })]), 'mcq', { existingSkillKeys: knownSkills });
    assert.equal(missing.errors.length, 1);
    assert.match(missing.errors[0].message, /Unknown skill prefix-re/);

    const allowed = validatePackCsv(csv([mcqRow({ skill_key: 'prefix-re', skill_name: 'Prefix re-' })]), 'mcq', { existingSkillKeys: knownSkills });
    assert.equal(allowed.errors.length, 0, JSON.stringify(allowed.errors));
});

test('conflicting pack metadata for one key is an error', () => {
    const result = validatePackCsv(csv([
        mcqRow(),
        mcqRow({ external_id: 'Q2', pack_title: 'Another title' })
    ]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(result.errors.some((error) => error.column === 'pack_title'));

    const language = validatePackCsv(csv([
        mcqRow(),
        mcqRow({ external_id: 'Q2', language: 'ar' })
    ]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(language.errors.some((error) => error.column === 'language'));
});

test('duplicate external ids inside a pack are rejected', () => {
    const result = validatePackCsv(csv([mcqRow(), mcqRow()]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(result.errors.some((error) => /Duplicate external_id/.test(error.message)));
    assert.equal(result.packs[0].items.length, 1);
});

test('MCQ needs two distinct options and a correct option within range', () => {
    const one = validatePackCsv(csv([mcqRow({ option_2: '' })]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(one.errors.some((error) => /at least two options/.test(error.message)));

    const repeated = validatePackCsv(csv([mcqRow({ option_2: 'Unhappy' })]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(repeated.errors.some((error) => /repeated/.test(error.message)));

    const range = validatePackCsv(csv([mcqRow({ correct_option: '4' })]), 'mcq', { existingSkillKeys: knownSkills });
    assert.ok(range.errors.some((error) => error.column === 'correct_option'));
});

test('fill_blank needs exactly one blank and an answer with de-duplicated alternatives', () => {
    const noBlank = validatePackCsv(csv([mcqRow({ prompt: 'Add un- to happy' })]), 'fill_blank', { existingSkillKeys: knownSkills });
    assert.ok(noBlank.errors.some((error) => /exactly one ___/.test(error.message)));

    const missingAnswer = validatePackCsv(csv([mcqRow({ prompt: 'Add un-: ___', answer: '' })]), 'fill_blank', { existingSkillKeys: knownSkills });
    assert.ok(missingAnswer.errors.some((error) => error.column === 'answer'));

    const result = validatePackCsv(csv([
        mcqRow({ prompt: 'Add un- to happy: ___', answer: 'unhappy', accepted_answers: 'Unhappy;un happy' })
    ]), 'fill_blank', { existingSkillKeys: knownSkills });
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.deepEqual(result.packs[0].items[0].acceptedAnswers, ['unhappy', 'un happy']);
});

/* ------------------------------------------------------------------ */
/* Standards                                                           */
/* ------------------------------------------------------------------ */

test('unknown and ambiguous standard codes are errors when a lookup is supplied', () => {
    const makeLookup = () => new Map([
        ['RF.5.3A', ['507f1f77bcf86cd799439011']],
        ['L.5.4', ['507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013']]
    ]);
    const result = validatePackCsv(csv([
        mcqRow({ standard_codes: 'RF.5.3A;ZZ.9.9' }),
        mcqRow({ external_id: 'Q2', standard_codes: 'L.5.4' })
    ]), 'mcq', { existingSkillKeys: knownSkills, standardLookup: makeLookup() });
    assert.ok(result.errors.some((error) => /Unknown standard code ZZ\.9\.9/.test(error.message)));
    assert.ok(result.errors.some((error) => /Ambiguous standard code L\.5\.4/.test(error.message)));

    const clean = validatePackCsv(csv([mcqRow({ standard_codes: 'rf.5.3a' })]), 'mcq', {
        existingSkillKeys: knownSkills,
        standardLookup: makeLookup()
    });
    assert.equal(clean.errors.length, 0);
    assert.deepEqual(clean.packs[0].items[0].standardIds, ['507f1f77bcf86cd799439011']);
});

/* ------------------------------------------------------------------ */
/* Editor item validation                                              */
/* ------------------------------------------------------------------ */

test('editor items follow the same rules as imported rows', () => {
    const skillId = '507f1f77bcf86cd799439011';
    const { items, errors } = sanitizePackItems([
        {
            externalId: 'E1', type: 'mcq', prompt: 'Pick one', skillId, difficulty: 2,
            options: [{ id: 'a', text: 'yes' }, { id: 'b', text: 'no' }], correctOptionId: 'a'
        },
        {
            externalId: 'E2', type: 'fill_blank', prompt: 'Type: ___', skillId, difficulty: 1,
            acceptedAnswers: ['ok', 'OK', ' okay ']
        },
        { externalId: 'E2', type: 'mcq', prompt: 'Dup', skillId, difficulty: 2, options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a' },
        { externalId: 'E3', type: 'mcq', prompt: 'Too few', skillId, difficulty: 2, options: [{ id: 'a', text: 'x' }], correctOptionId: 'a' }
    ]);
    assert.equal(items.length, 2);
    assert.deepEqual(items[1].acceptedAnswers, ['ok', 'okay']);
    assert.ok(errors.some((error) => /Duplicate question id E2/.test(error.message)));
    assert.ok(errors.some((error) => /at least two options/.test(error.message)));
});

test('publicSessionItem never leaks the answer key', () => {
    const item = {
        externalId: 'Q1', type: 'mcq', prompt: 'Pick', skillId: '507f1f77bcf86cd799439011', difficulty: 1,
        options: [{ id: 'a', text: 'yes' }, { id: 'b', text: 'no' }], correctOptionId: 'a', acceptedAnswers: ['yes']
    };
    const publicItem = publicSessionItem(item);
    assert.equal(publicItem.correctOptionId, undefined);
    assert.equal(publicItem.acceptedAnswers, undefined);
    assert.equal(JSON.stringify(publicItem).includes('"a"'), true, 'option ids stay so answers can be graded');
    assert.equal(JSON.stringify(publicItem).includes('correct'), false);
});

/* ------------------------------------------------------------------ */
/* Single-destination contract                                         */
/* ------------------------------------------------------------------ */

test('every single template validates without any pack or skill columns', () => {
    for (const type of ITEM_TYPES) {
        const template = buildPackTemplateCsv(type, 'single');
        assert.ok(!SIMPLE_CSV_TEMPLATES[type].headers.includes('pack_key'));
        assert.ok(!SIMPLE_CSV_TEMPLATES[type].headers.includes('skill_key'));
        const result = validatePackCsv(template, type, { target: 'single' });
        assert.equal(result.errors.length, 0, `${type} single template errors: ${JSON.stringify(result.errors)}`);
        assert.equal(result.packs.length, 1);
        assert.equal(result.packs[0].packKey, '__single__');
        assert.equal(result.validRows, result.totalRows);
        for (const item of result.packs[0].items) {
            assert.deepEqual(item.standardCodes, [], 'example cells must line up with the headers');
            assert.ok(item.explanation.length > 0);
        }
    }
});

test('single rows get an automatic id and renumbered option ids', () => {
    const content = 'prompt,option_1,option_2,option_3,correct_option\nPick,,x,y,3';
    const result = validatePackCsv(content, 'mcq', { target: 'single' });
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const item = result.packs[0].items[0];
    assert.equal(item.externalId, 'q-2');
    assert.deepEqual(item.options, [{ id: '1', text: 'x' }, { id: '2', text: 'y' }]);
    assert.equal(item.correctOptionId, '2');
});

test('correct_option must name a filled column, not an empty one', () => {
    const content = 'prompt,option_1,option_2,option_3,correct_option\nPick,,x,y,1';
    const result = validatePackCsv(content, 'mcq', { target: 'single' });
    assert.ok(result.errors.some((error) => error.column === 'correct_option'));
});

test('over-long text is rejected, never shortened', () => {
    const longPrompt = 'x'.repeat(1001);
    const content = `prompt,option_1,option_2,correct_option\n${longPrompt},a,b,1`;
    const result = validatePackCsv(content, 'mcq', { target: 'single' });
    assert.ok(result.errors.some((error) => /limit is 1000/.test(error.message)));
    assert.equal(result.validRows, 0);
});

test('a typed-answer question caps accepted answers at 20', () => {
    const alternatives = Array.from({ length: 21 }, (_, index) => `alt${index}`).join(';');
    const content = `prompt,answer,accepted_answers\nType: ___,ok,${alternatives}`;
    const result = validatePackCsv(content, 'fill_blank', { target: 'single' });
    assert.ok(result.errors.some((error) => /at most 20 accepted answers/.test(error.message)));
});

test('files over the row or byte ceiling are rejected before parsing rows', () => {
    const header = 'prompt,option_1,option_2,correct_option';
    const manyRows = Array.from({ length: 2001 }, (_, index) => `Q${index},a,b,1`).join('\n');
    assert.throws(() => validatePackCsv(`${header}\n${manyRows}`, 'mcq', { target: 'single' }), /more than 2000/);
    assert.throws(() => validatePackCsv('x'.repeat(5 * 1024 * 1024 + 1), 'mcq', { target: 'single' }), /larger than 5 MB/);
});

/* ------------------------------------------------------------------ */
/* Import plan token                                                   */
/* ------------------------------------------------------------------ */

test('a plan token is bound to school, actor, fingerprint and pack revision', () => {
    const args = { schoolId: 'school-1', userId: 'user-1', fingerprint: 'fp-1', packRevision: 4, now: 1000 };
    const { token, expiresAt } = createPlanToken(args);
    assert.equal(expiresAt.getTime(), 1000 + PREVIEW_TTL_MS);
    const verified = verifyPlanToken({ ...args, token, now: 1001 });
    assert.equal(verified.fingerprint, 'fp-1');
    assert.equal(verified.packRevision, 4);
    assert.throws(() => verifyPlanToken({ ...args, token, now: 1001, userId: 'user-2' }), /different import/);
    assert.throws(() => verifyPlanToken({ ...args, token, now: 1001, schoolId: 'school-2' }), /different import/);
    assert.throws(() => verifyPlanToken({ ...args, token, now: 1000 + PREVIEW_TTL_MS + 1 }), /expired/);
});

test('a tampered or malformed plan token is rejected', () => {
    const args = { schoolId: 'school-1', userId: 'user-1', fingerprint: 'fp-1', now: 1000 };
    const { token } = createPlanToken(args);
    const [encoded, signature] = token.split('.');
    const forged = `${encoded}.${signature.slice(0, -2)}xx`;
    assert.throws(() => verifyPlanToken({ ...args, token: forged, now: 1001 }), /not valid/);
    assert.throws(() => verifyPlanToken({ ...args, token: 'garbage', now: 1001 }), /missing or malformed/);
});

test('the fingerprint changes when any effective input changes', () => {
    const base = { school: 's', user: 'u', mode: 'single', type: 'mcq', content: 'a,b\n1,2' };
    assert.equal(fingerprintOf(base), fingerprintOf({ ...base }));
    assert.notEqual(fingerprintOf(base), fingerprintOf({ ...base, content: 'a,b\n1,3' }));
    assert.notEqual(fingerprintOf(base), fingerprintOf({ ...base, operation: 'replace' }));
});

/* ------------------------------------------------------------------ */
/* New question types                                                  */
/* ------------------------------------------------------------------ */

const single = (content, type) => validatePackCsv(content, type, { target: 'single' });

test('multiple_select remaps sparse correct columns to renumbered ids', () => {
    const result = single('prompt,option_1,option_2,option_3,option_4,correct_answer\nPick evens,,2,3,4,2|4', 'multiple_select');
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const item = result.packs[0].items[0];
    assert.deepEqual(item.options, [{ id: '1', text: '2' }, { id: '2', text: '3' }, { id: '3', text: '4' }]);
    assert.equal(item.correctAnswer, '1|3');
});

test('multiple_select rejects empty-column keys and a single correct key', () => {
    const emptyColumn = single('prompt,option_1,option_2,option_3,option_4,correct_answer\nPick evens,,2,3,4,1|4', 'multiple_select');
    assert.ok(emptyColumn.errors.some((error) => error.column === 'correct_answer'));
    const oneKey = single('prompt,option_1,option_2,correct_answer\nPick evens,2,3,1', 'multiple_select');
    assert.ok(oneKey.errors.some((error) => /at least two options as correct/.test(error.message)));
});

test('true_false accepts English and Arabic tokens and rejects anything else', () => {
    const english = single('prompt,correct_answer\nThe sun is a star,true', 'true_false');
    assert.equal(english.errors.length, 0, JSON.stringify(english.errors));
    assert.equal(english.packs[0].items[0].correctAnswer, 'true');
    const arabic = single('prompt,correct_answer\nالشمس نجم,صح', 'true_false');
    assert.equal(arabic.errors.length, 0, JSON.stringify(arabic.errors));
    assert.equal(arabic.packs[0].items[0].correctAnswer, 'true');
    const bad = single('prompt,correct_answer\nMaybe?,perhaps', 'true_false');
    assert.ok(bad.errors.some((error) => /true or false/.test(error.message)));
});

test('matching round-trips pairs and enforces the pair and term limits', () => {
    const result = single('prompt,matching_pairs\nMatch animals,cat::قطة|dog::كلب', 'matching');
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const item = result.packs[0].items[0];
    assert.deepEqual(item.matchingPairs, [{ left: 'cat', right: 'قطة' }, { left: 'dog', right: 'كلب' }]);
    assert.equal(item.correctAnswer, 'cat::قطة|dog::كلب');

    const onePair = single('prompt,matching_pairs\nMatch,cat::قطة', 'matching');
    assert.ok(onePair.errors.length > 0);
    const sevenPairs = single(`prompt,matching_pairs\nMatch,${Array.from({ length: 7 }, (_, i) => `l${i}::r${i}`).join('|')}`, 'matching');
    assert.ok(sevenPairs.errors.some((error) => /at most 6 pairs/.test(error.message)));
    const longTerm = single(`prompt,matching_pairs\nMatch,${'x'.repeat(121)}::y|a::b`, 'matching');
    assert.ok(longTerm.errors.some((error) => /limit is 120/.test(error.message)));
});

test('ordering hashes item ids and keeps the authored order as the key', () => {
    const result = single('prompt,ordering_items\nSort,smallest > middle > largest', 'ordering');
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const item = result.packs[0].items[0];
    assert.deepEqual(item.orderingItems.map((entry) => entry.text), ['smallest', 'middle', 'largest']);
    assert.ok(item.orderingItems.every((entry, index) => /^i[0-9a-z]+$/.test(entry.id) && entry.id !== String(index + 1)), 'ids are hashed, not positional');
    assert.equal(item.correctAnswer, item.orderingItems.map((entry) => entry.id).join('>'));

    const twoItems = single('prompt,ordering_items\nSort,a > b', 'ordering');
    assert.ok(twoItems.errors.some((error) => /at least 3/.test(error.message)));
    const nineItems = single(`prompt,ordering_items\nSort,${Array.from({ length: 9 }, (_, i) => `s${i}`).join(' > ')}`, 'ordering');
    assert.ok(nineItems.errors.some((error) => /at most 8/.test(error.message)));
});

test('numeric_response parses exact, tolerance and range rules into a display answer', () => {
    const exact = single('prompt,numeric_rule\n12 x 12?,144', 'numeric_response');
    assert.equal(exact.errors.length, 0, JSON.stringify(exact.errors));
    assert.equal(exact.packs[0].items[0].correctAnswer, '144');
    const tolerance = single('prompt,numeric_rule\nPi?,tolerance::3.14~0.01', 'numeric_response');
    assert.equal(tolerance.errors.length, 0, JSON.stringify(tolerance.errors));
    assert.equal(tolerance.packs[0].items[0].numericRule.mode, 'tolerance');
    assert.equal(tolerance.packs[0].items[0].correctAnswer, '3.14 ±0.01');
    const range = single('prompt,numeric_rule\nPick a range,range::10~20|unit::cm', 'numeric_response');
    assert.equal(range.errors.length, 0, JSON.stringify(range.errors));
    assert.equal(range.packs[0].items[0].correctAnswer, '10-20 cm');
    const bad = single('prompt,numeric_rule\nHow much?,banana', 'numeric_response');
    assert.ok(bad.errors.some((error) => error.column === 'numeric_rule'));
});

/* ------------------------------------------------------------------ */
/* Public payload and reveal for the new types                         */
/* ------------------------------------------------------------------ */

const skillId = '507f1f77bcf86cd799439011';
const buildItem = (raw) => {
    const { items, errors } = sanitizePackItems([{ externalId: 'Q1', skillId, difficulty: 2, explanation: 'Because.', ...raw }]);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    return items[0];
};

test('publicSessionItem keeps legacy wire names and sends new types canonically', () => {
    const mcq = buildItem({ type: 'multiple_choice', prompt: 'Pick', options: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }], correctOptionId: '1' });
    assert.equal(publicSessionItem(mcq).type, 'mcq');
    const fill = buildItem({ type: 'fill_in_blank', prompt: 'Type: ___', acceptedAnswers: ['ok'] });
    assert.equal(publicSessionItem(fill).type, 'fill_blank');
    const tf = buildItem({ type: 'true_false', prompt: 'Star?', correctAnswer: 'true' });
    assert.equal(publicSessionItem(tf).type, 'true_false');
});

test('publicSessionItem never leaks the new answer fields', () => {
    const matching = buildItem({ type: 'matching', prompt: 'Match', matchingPairs: 'cat::قطة|dog::كلب|cow::بقرة' });
    const view = publicSessionItem(matching, 'session-1');
    assert.equal(view.correctAnswer, undefined);
    assert.equal(view.matchingPairs, undefined);
    assert.deepEqual(view.matchingLefts, ['cat', 'dog', 'cow']);
    assert.deepEqual([...view.matchingRights].sort(), ['بقرة', 'قطة', 'كلب'].sort());

    const ordering = buildItem({ type: 'ordering', prompt: 'Sort', orderingItems: 'a > b > c > d' });
    const orderView = publicSessionItem(ordering, 'session-1');
    assert.equal(orderView.correctAnswer, undefined);
    assert.deepEqual([...orderView.orderingItems.map((entry) => entry.text)].sort(), ['a', 'b', 'c', 'd']);

    const numeric = buildItem({ type: 'numeric_response', prompt: '12 x 12?', numericRule: '144' });
    const numericView = publicSessionItem(numeric);
    assert.equal(numericView.correctAnswer, undefined);
    assert.equal(numericView.numericRule, undefined);

    const multi = buildItem({ type: 'multiple_select', prompt: 'Pick evens', options: [{ id: '1', text: '2' }, { id: '2', text: '3' }, { id: '3', text: '4' }], correctAnswer: '1|3' });
    assert.equal(publicSessionItem(multi).correctAnswer, undefined);
});

test('the seeded shuffle is stable per session and varies across sessions', () => {
    const item = buildItem({ type: 'ordering', prompt: 'Sort', orderingItems: 'a > b > c > d > e > f > g > h' });
    const textsFor = (seed) => publicSessionItem(item, seed).orderingItems.map((entry) => entry.text).join(',');
    assert.equal(textsFor('session-a'), textsFor('session-a'));
    const authored = 'a,b,c,d,e,f,g,h';
    const orders = ['session-a', 'session-b', 'session-c'].map(textsFor);
    assert.ok(orders.some((order) => order !== authored), 'at least one session shuffles the items');
    assert.ok(new Set(orders).size > 1, 'different sessions get different orders');
});

test('revealForItem reports the answer for every type', () => {
    const mcq = buildItem({ type: 'multiple_choice', prompt: 'Pick', options: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }], correctOptionId: '2' });
    assert.equal(revealForItem(mcq).expected, '2');
    const fill = buildItem({ type: 'fill_in_blank', prompt: 'Type: ___', acceptedAnswers: ['unhappy', 'un happy'] });
    assert.equal(revealForItem(fill).expected, 'unhappy');
    const tf = buildItem({ type: 'true_false', prompt: 'Star?', correctAnswer: 'false' });
    assert.equal(revealForItem(tf).expected, 'false');
    const multi = buildItem({ type: 'multiple_select', prompt: 'Pick evens', options: [{ id: '1', text: '2' }, { id: '2', text: '3' }, { id: '3', text: '4' }], correctAnswer: '1|3' });
    assert.equal(revealForItem(multi).expected, '2; 4');
    const matching = buildItem({ type: 'matching', prompt: 'Match', matchingPairs: 'cat::قطة|dog::كلب' });
    assert.equal(revealForItem(matching).expected, 'cat = قطة; dog = كلب');
    const ordering = buildItem({ type: 'ordering', prompt: 'Sort', orderingItems: 'a > b > c' });
    assert.equal(revealForItem(ordering).expected, 'a > b > c');
    const numeric = buildItem({ type: 'numeric_response', prompt: 'Pi?', numericRule: 'tolerance::3.14~0.01' });
    assert.equal(revealForItem(numeric).expected, '3.14 ±0.01');
    assert.equal(revealForItem(numeric).explanation, 'Because.');
});

/* ------------------------------------------------------------------ */
/* Mixed-type files                                                    */
/* ------------------------------------------------------------------ */

test('mixed templates carry every answer column and validate cleanly', () => {
    const bulk = validatePackCsv(buildPackTemplateCsv('mixed'), 'mixed', { existingSkillKeys: knownSkills });
    assert.equal(bulk.errors.length, 0, JSON.stringify(bulk.errors));
    assert.deepEqual(bulk.packs[0].items.map((item) => item.type), ['multiple_choice', 'fill_in_blank', 'true_false']);
    assert.ok(PACK_CSV_TEMPLATES.mixed.headers.includes('type'));

    const singleTemplate = validatePackCsv(buildPackTemplateCsv('mixed', 'single'), 'mixed', { target: 'single' });
    assert.equal(singleTemplate.errors.length, 0, JSON.stringify(singleTemplate.errors));
    assert.deepEqual(singleTemplate.packs[0].items.map((item) => item.type), ['multiple_choice', 'fill_in_blank', 'true_false']);
});

test('a mixed file resolves the type per row, aliases included', () => {
    const content = [
        'external_id,type,prompt,option_1,option_2,correct_option,answer,correct_answer',
        'Q1,mcq,Pick,a,b,2,,',
        'Q2,fill_blank,Type: ___,,,,ok,',
        'Q3,true_false,Star?,,,,,true'
    ].join('\n');
    const result = validatePackCsv(content, 'mixed', { target: 'single' });
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    const items = result.packs[0].items;
    assert.deepEqual(items.map((item) => item.type), ['multiple_choice', 'fill_in_blank', 'true_false']);
    assert.equal(items[0].correctOptionId, '2');
    assert.deepEqual(items[1].acceptedAnswers, ['ok']);
    assert.equal(items[2].correctAnswer, 'true');
});

test('a mixed file needs the type column and rejects an unknown type per row', () => {
    assert.throws(
        () => validatePackCsv('external_id,prompt\nQ1,Pick', 'mixed', { target: 'single' }),
        /Missing required column\(s\): type/
    );
    const result = validatePackCsv('external_id,type,prompt\nQ1,essay,Write about it', 'mixed', { target: 'single' });
    assert.ok(result.errors.some((error) => error.column === 'type' && /type must be one of/.test(error.message)));
    assert.equal(result.validRows, 0);
});
