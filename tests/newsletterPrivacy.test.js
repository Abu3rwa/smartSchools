import assert from 'node:assert/strict';
import test from 'node:test';

import {
    fillStudentToken,
    inspectLetterText,
    personalIdentifiers,
    scrubPersonalText,
    STUDENT_TOKEN,
} from '../services/newsletterPrivacy.js';
import {
    buildChildLetterPrompt,
    clampWordTarget,
    letterWordBounds,
} from '../services/newsletterChildAiService.js';
import { hasEnoughMaterial, normalizeSources, STUDENT_SOURCES } from '../services/newsletterFactsService.js';

const identifiers = personalIdentifiers({
    firstName: 'Layla',
    lastName: 'Hassan',
    email: 'parent@example.com',
});

test('personalIdentifiers lists every spelling of the name and the emails', () => {
    assert.deepEqual(identifiers.names.sort(), ['Hassan', 'Layla', 'Layla Hassan'].sort());
    assert.deepEqual(identifiers.emails, ['parent@example.com']);
});

test('scrubPersonalText removes names, emails and long numbers from teacher remarks', () => {
    const cleaned = scrubPersonalText(
        'Layla Hassan worked hard with Hassan. Call 0501234567 or parent@example.com. Keep going.',
        identifiers
    );

    assert.ok(!/layla/i.test(cleaned), 'first name must be gone');
    assert.ok(!/hassan/i.test(cleaned), 'last name must be gone');
    assert.ok(!cleaned.includes('parent@example.com'));
    assert.ok(!cleaned.includes('0501234567'));
    assert.match(cleaned, /worked hard/);
    assert.match(cleaned, /Keep going\./);
});

test('scrubPersonalText keeps text when there is nothing to remove', () => {
    assert.equal(scrubPersonalText('Good progress in fractions.', identifiers), 'Good progress in fractions.');
    assert.equal(scrubPersonalText('', identifiers), '');
});

test('inspectLetterText accepts a well-formed anonymous letter', () => {
    const result = inspectLetterText(
        `${STUDENT_TOKEN} handed in every classwork piece this week and kept a careful notebook. At home, five minutes of reading aloud would help her confidence.`,
        { forbiddenTerms: ['Layla', 'parent@example.com'], maxWords: 120, maxTokens: 3 }
    );
    assert.equal(result.ok, true, result.reasons.join(','));
    assert.equal(result.tokenCount, 1);
});

test('inspectLetterText rejects leaked personal data and token overflow', () => {
    const email = inspectLetterText('Write to parent@example.com for more.', {});
    assert.equal(email.ok, false);
    assert.ok(email.reasons.includes('email'));

    const link = inspectLetterText('See https://school.example.com/work', {});
    assert.ok(link.reasons.includes('link'));

    const name = inspectLetterText('Layla had a strong week.', { forbiddenTerms: ['Layla'] });
    assert.ok(name.reasons.includes('personal-name'));

    const tokens = inspectLetterText(`${STUDENT_TOKEN} ${STUDENT_TOKEN} ${STUDENT_TOKEN} ${STUDENT_TOKEN}`, { maxTokens: 3 });
    assert.ok(tokens.reasons.includes('too-many-name-tokens'));

    const phone = inspectLetterText('Call 0501234567 any time.', {});
    assert.ok(phone.reasons.includes('long-number'));
});

test('inspectLetterText enforces word bounds when given', () => {
    const short = inspectLetterText('One short line.', { minWords: 20 });
    assert.ok(short.reasons.includes('too-short'));
});

test('fillStudentToken is the only place a name joins the letter', () => {
    const filled = fillStudentToken(`${STUDENT_TOKEN} read every night.`, 'Layla');
    assert.equal(filled, 'Layla read every night.');
    assert.equal(fillStudentToken('No token here.', 'Layla'), 'No token here.');
    assert.equal(fillStudentToken(`${STUDENT_TOKEN} read.`, ''), 'your child read.');
});

test('child letter prompt never carries the student name and always states the token rule', () => {
    const prompt = buildChildLetterPrompt({
        facts: { gender: 'female', classwork: { recorded: 3, remarks: [{ area: 'classwork', text: 'the student worked hard' }] } },
        classTopics: [{ subject: 'English', topics: ['Story openings', 'Adjectives'] }],
        periodLabel: '20 Oct – 24 Oct',
        wordTarget: 90,
        languages: ['en'],
    });

    assert.ok(prompt.includes(STUDENT_TOKEN));
    assert.ok(prompt.includes('she/her/her'));
    assert.ok(!/layla/i.test(prompt));
    assert.ok(!prompt.includes('@example.com'));
    assert.ok(prompt.includes('Never mention marks'));
});

test('clampWordTarget and letterWordBounds stay inside the supported range', () => {
    assert.equal(clampWordTarget(10), 40);
    assert.equal(clampWordTarget(999), 320);
    assert.equal(clampWordTarget('90'), 90);
    const bounds = letterWordBounds(100);
    assert.equal(bounds.wordTarget, 100);
    assert.ok(bounds.minWords < 100 && bounds.maxWords > 100);
});

test('normalizeSources only keeps the allowlist', () => {
    assert.deepEqual(normalizeSources(['classwork', 'passwords', 'spelling'], STUDENT_SOURCES), ['classwork', 'spelling']);
    assert.deepEqual(normalizeSources('classwork', STUDENT_SOURCES), []);
});

test('hasEnoughMaterial is false for an empty week', () => {
    assert.equal(hasEnoughMaterial({ gender: 'female' }), false);
    assert.equal(hasEnoughMaterial({ spelling: { listsCompleted: 1 } }), true);
});
