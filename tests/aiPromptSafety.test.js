import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CLASSMATE_PLACEHOLDER,
    CONTENT_RULES,
    PRIVACY_RULES,
    STUDENT_TOKEN,
    buildStudentFacts,
    correctivePrompt,
    createStudentRefs,
    fillStudentTokens,
    fillStudentTokensDeep,
    inspectGeneratedText,
    scrubForPrompt,
    stripFlaggedFormulas
} from '../services/aiPromptSafety.js';

test('the two rule blocks say what the product promises', () => {
    assert.match(PRIVACY_RULES, /never invent one/);
    assert.match(PRIVACY_RULES, /family composition/);
    assert.match(CONTENT_RULES, /religion/);
    assert.match(CONTENT_RULES, /Modern Standard Arabic/);
});

test('facts carry gender and grade only, never identity', () => {
    const facts = buildStudentFacts({ gender: 'female', grade: 5, name: 'Sara' });
    assert.match(facts, /Gender: female/);
    assert.match(facts, /Grade level: 5/);
    assert.equal(facts.includes('Sara'), false);
});

test('the student name becomes the token and classmate names become neutral', () => {
    const text = 'Sara helped Omar finish the task and called 0501234567.';
    const scrubbed = scrubForPrompt(text, { name: 'Sara', roster: ['Omar Haddad'] });
    assert.equal(scrubbed.includes('Sara'), false);
    assert.equal(scrubbed.includes('Omar'), false);
    assert.ok(scrubbed.includes(STUDENT_TOKEN));
    assert.ok(scrubbed.includes(CLASSMATE_PLACEHOLDER));
});

test('phone scrubbing can be switched off so dates survive', () => {
    const text = 'On 2026-10-01 Sara read for ten minutes.';
    const prose = scrubForPrompt(text, { name: 'Sara', phoneNumbers: false });
    assert.ok(prose.includes('2026-10-01'));
    assert.equal(prose.includes('Sara'), false);

    const contacts = scrubForPrompt('Call 0501234567 please.', { phoneNumbers: true });
    assert.equal(contacts.includes('0501234567'), false);
});

test('tokens are filled back, including nested replies', () => {
    assert.equal(fillStudentTokens('Well done, {{student}}.', 'Sara'), 'Well done, Sara.');
    assert.equal(fillStudentTokens('Well done, {{student}}.', ''), 'Well done, your child.');
    const filled = fillStudentTokensDeep(
        { parts: { greeting: 'Hello {{student}}' }, list: ['{{ student }} tried hard'] },
        'Sara'
    );
    assert.equal(filled.parts.greeting, 'Hello Sara');
    assert.equal(filled.list[0], 'Sara tried hard');
});

test('refs hide real names in the prompt and restore them in the reply', () => {
    const refs = createStudentRefs(
        [{ id: 'a', name: 'Layla Hassan' }, { id: 'b', name: 'Omar' }],
        { keyOf: (row) => row.id, labelOf: (row) => row.name }
    );
    assert.equal(refs.refFor('a'), 'S1');
    const scrubbed = refs.scrubText('Layla Hassan and Omar need support.');
    assert.equal(scrubbed.includes('Layla'), false);
    assert.equal(scrubbed.includes('Omar'), false);
    assert.match(scrubbed, /S1/);
    assert.equal(refs.restore('S1 and S2 need support.'), 'Layla Hassan and Omar need support.');
});

test('family-facing prose is rejected for religious, family and unsafe content', () => {
    const formula = inspectGeneratedText('Sara will improve soon, Inshallah.');
    assert.equal(formula.ok, false);
    assert.ok(formula.problems.some((problem) => problem.startsWith('religious-formula')));

    const arabic = inspectGeneratedText('سيتحسن المستوى إن شاء الله.');
    assert.equal(arabic.ok, false);

    const family = inspectGeneratedText('Ask your parents to sign the page.');
    assert.equal(family.ok, false);
    assert.ok(family.problems.some((problem) => problem.startsWith('family-assumption')));

    const rude = inspectGeneratedText('This answer is stupid.');
    assert.equal(rude.ok, false);
});

test('clean classroom prose passes, including lookalike words', () => {
    for (const text of [
        'The class sorted grapes by colour and counted them.',
        'We read a poem about a lament for the lost city.',
        'Sara finished the spelling task and helped tidy the shelves.',
        'The family can practise the words at home.'
    ]) {
        assert.deepEqual(inspectGeneratedText(text), { ok: true, problems: [] }, text);
    }
});

test('an unfilled name token is a problem unless the caller expects it', () => {
    assert.equal(inspectGeneratedText('Well done, {{student}}.').ok, false);
    assert.equal(inspectGeneratedText('Well done, {{student}}.', { allowToken: true }).ok, true);
});

test('flagged formulas are removed without touching the rest of the sentence', () => {
    const cleaned = stripFlaggedFormulas('Sara worked hard today, God willing. Ask your parents to sign.');
    assert.equal(cleaned.includes('God willing'), false);
    assert.equal(cleaned.includes('your parents'), false);
    assert.match(cleaned, /Sara worked hard today/);
});

test('the corrective retry names the exact problems', () => {
    const prompt = correctivePrompt('Write a note.', ['religious-formula:inshallah']);
    assert.match(prompt, /Write a note\./);
    assert.match(prompt, /religious-formula:inshallah/);
});

/* ------------------------------------------------------------------ */
/* Writing review Phase 1 — every part of the name, phones, short names */
/* and common-word names. Each of these failed before the fix.          */
/* ------------------------------------------------------------------ */

test('every part of the student name is scrubbed, not just the full name', () => {
    const essay = 'My name is Sara Ahmed Khan. Sara wrote about her cat. Ahmed likes football.';
    const safe = scrubForPrompt(essay, { name: 'Sara Ahmed Khan' });
    for (const leak of ['Sara', 'Ahmed', 'Khan']) {
        assert.equal(safe.includes(leak), false, `${leak} must not reach the model`);
    }
    assert.ok(safe.includes('cat'), 'the essay text must survive');
    assert.ok(safe.includes('football'), 'the essay text must survive');
});

test('a lowercase name in a child\'s draft is still scrubbed', () => {
    const safe = scrubForPrompt('my name is sara ahmed khan and i like cats.', {
        name: 'Sara Ahmed Khan',
    });
    assert.equal(/sara|ahmed|khan/i.test(safe), false);
});

test('phone numbers are scrubbed by default on the writing path', () => {
    const safe = scrubForPrompt('Call me on 0912345678 or email sara@school.com.', {
        name: 'Sara Ali',
    });
    assert.equal(safe.includes('0912345678'), false);
    assert.equal(safe.includes('sara@school.com'), false);
    assert.ok(safe.includes('[number]'));
    assert.ok(safe.includes('[email]'));
});

test('a two-character name is scrubbed', () => {
    const safe = scrubForPrompt('Li went home. Bo said hi.', { name: 'Li Bo' });
    assert.equal(safe.includes('Li'), false);
    assert.equal(safe.includes('Bo'), false);
});

test('a common-word name does not corrupt the essay', () => {
    const prose = 'I may go out. It may rain. Grace and I will help. We will win. I hope it is fun.';
    for (const name of ['May', 'Will', 'Hope']) {
        const safe = scrubForPrompt(prose, { name });
        assert.equal(safe, prose, `${name} must not rewrite ordinary prose`);
    }
});

test('a capitalised common-word name is still scrubbed when it is used as a name', () => {
    const safe = scrubForPrompt('May went to the park. I may go.', { name: 'May' });
    assert.equal(safe.includes('May went'), false);
    assert.ok(safe.includes('I may go'), 'the lowercase verb must survive');
});

test('a multi-part name with a common-word part scrubs both', () => {
    const safe = scrubForPrompt('I may go. May Jones wrote it.', { name: 'May Jones' });
    assert.equal(safe.includes('May Jones'), false);
    assert.ok(safe.includes('I may go'), 'the lowercase verb must survive');
});

test('classmate names never rewrite ordinary prose', () => {
    const prose = 'The children may play outside. We will win. I hope it is fun.';
    const safe = scrubForPrompt(prose, {
        name: 'Sara Ali',
        roster: ['May Jones', 'Will Smith', 'Hope Brown'],
    });
    assert.equal(safe, prose);
});
