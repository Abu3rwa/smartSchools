import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPlpEmailRecipientCandidates,
    buildPlpProgressEmail,
    describeEmailDeliveryError,
    getPlpEmailDeliveryAttempt,
    normalizePlpEmailLanguage,
} from '../services/plpProgressEmailService.js';

const PROGRESS = {
    student: { firstName: 'Ava', lastName: 'Lee' },
    record: { academicYear: '2026-2027', month: 10, cycle: { title: 'October round' } },
    goals: [{
        title: 'Build confidence',
        goalType: 'character',
        status: 'active',
        successCriteria: 'Ask for help',
    }],
    tasks: [{
        title: 'Read a story',
        status: 'assigned',
        instructions: 'Read at home',
    }],
};

test('email candidates use student-record contacts without opt-in and deduplicate shared addresses', () => {
    const student = {
        firstName: 'Ava',
        lastName: 'Lee',
        studentEmail: 'STUDENT@example.test',
        parentInfo: {
            fatherName: 'Alex Lee',
            fatherEmail: 'family@example.test',
            motherName: 'Morgan Lee',
            motherEmail: 'family@example.test',
            guardianEmail: 'guardian@example.test',
        },
    };
    const recipients = buildPlpEmailRecipientCandidates(student, [
        { recipientEmail: 'family@example.test', recipientType: 'mother', optedIn: true },
        { recipientEmail: 'guardian@example.test', recipientType: 'guardian', optedIn: false, revokedAt: new Date() },
    ]);
    assert.deepEqual(recipients.map(({ email, type, name, optedIn }) => ({ email, type, name, optedIn })), [
        { email: 'family@example.test', type: 'father', name: 'Alex Lee', optedIn: true },
        { email: 'student@example.test', type: 'student', name: 'Ava Lee', optedIn: false },
    ]);
});

test('linked student portal email is available from the student record without opt-in', () => {
    const student = {
        firstName: 'Ava',
        lastName: 'Lee',
        user: { email: 'ava@example.test' },
    };
    assert.deepEqual(buildPlpEmailRecipientCandidates(student, []), [{
        email: 'ava@example.test',
        type: 'student',
        name: 'Ava Lee',
        optedIn: false,
    }]);
});

test('explicitly opted-out contacts are excluded while contacts without a preference remain available', () => {
    const student = {
        firstName: 'Ava',
        parentInfo: {
            fatherEmail: 'no-preference@example.test',
            motherEmail: 'opted-out@example.test',
        },
    };
    assert.deepEqual(buildPlpEmailRecipientCandidates(student, [
        { recipientEmail: 'opted-out@example.test', optedIn: false, revokedAt: new Date() },
    ]).map(({ email }) => email), ['no-preference@example.test']);
});

test('family email includes allowlisted progress only and escapes HTML', () => {
    const email = buildPlpProgressEmail({
        student: { firstName: '<Ava>', lastName: 'Lee' },
        record: { academicYear: '2026-2027', month: 10 },
        goals: [{
            title: '<Build confidence>',
            successCriteria: 'Ask for help',
            status: 'active',
            teacherProgressNote: 'private',
            reviewNote: 'internal',
        }],
        tasks: [{
            title: 'Read a story',
            instructions: 'Read at home',
            status: 'assigned',
            studentCompletionNote: 'private work',
        }],
    });
    assert.match(email.text, /Build confidence/);
    assert.doesNotMatch(email.text, /private|internal/);
    assert.match(email.html, /&lt;Ava&gt;/);
    assert.doesNotMatch(email.html, /<Ava>/);
    assert.doesNotMatch(email.html, /private|internal/);
});

const LINKED_GOALS = [{
    title: 'Build confidence',
    goalType: 'character',
    status: 'active',
    successCriteria: 'Ask for help',
    linkedPractice: [
        {
            kind: 'spelling_session',
            targetId: '6984f2771b6aa993e32a0f28',
            label: 'Spelling assessment · week 3',
            detail: '4 of 12 words missed · 5 Oct 2026',
            source: 'ai_suggested',
            reason: 'internal teacher reasoning about the missed words',
        },
        {
            kind: 'map_practice_plan',
            targetId: '6984f2771b6aa993e32a0f29',
            label: 'MAP plan · Reading Informational Text',
            detail: 'Find the main idea, Use context clues',
            source: 'teacher',
            reason: '',
        },
    ],
}];

test('the family email names the practice a goal is linked to without exposing ids or reasons', () => {
    const email = buildPlpProgressEmail({ ...PROGRESS, goals: LINKED_GOALS });
    assert.match(email.text, /Practice work: Spelling assessment · week 3 · MAP plan · Reading Informational Text/);
    assert.doesNotMatch(email.html, /6984f2771b6aa993e32a0f/);
    assert.doesNotMatch(email.html, /ai_suggested|internal teacher reasoning/);
    assert.doesNotMatch(email.html, /4 of 12 words missed/);
});

test('linked practice is translated in Arabic and appears in both halves of a bilingual email', () => {
    const arabic = buildPlpProgressEmail({ ...PROGRESS, goals: LINKED_GOALS, language: 'ar' });
    assert.match(arabic.text, /أنشطة التطبيق: Spelling assessment · week 3/);

    const bilingual = buildPlpProgressEmail({ ...PROGRESS, goals: LINKED_GOALS, language: 'both' });
    const englishIndex = bilingual.html.indexOf('Practice work:');
    const arabicIndex = bilingual.html.indexOf('أنشطة التطبيق:');
    const rtlSection = bilingual.html.indexOf('dir="rtl" lang="ar"');
    assert.ok(englishIndex > -1);
    assert.ok(rtlSection > englishIndex, 'English section closes before the Arabic one opens');
    assert.ok(arabicIndex > rtlSection, 'the Arabic practice line sits inside the right-to-left block');
});

test('only the first three linked activities are listed and the rest are counted', () => {
    const email = buildPlpProgressEmail({
        ...PROGRESS,
        goals: [{
            title: 'Build confidence',
            linkedPractice: [1, 2, 3, 4, 5].map((n) => ({
                kind: 'spelling_session',
                targetId: `6984f2771b6aa993e32a0f2${n}`,
                label: `Session ${n}`,
            })),
        }],
    });
    assert.match(email.text, /Practice work: Session 1 · Session 2 · Session 3 \(and 2 more\)/);
    assert.doesNotMatch(email.text, /Session 4|Session 5/);
});

test('family email names the teacher, the school and the day it was sent', () => {
    const email = buildPlpProgressEmail({
        ...PROGRESS,
        school: { name: 'AMLY School' },
        teacher: { firstName: 'Nabeel', lastName: 'Nash' },
        sentAt: new Date('2026-10-22T09:00:00Z'),
    });
    assert.match(email.text, /Nabeel Nash/);
    assert.match(email.text, /AMLY School/);
    assert.match(email.text, /22 October 2026/);
});

test('the English email speaks in family words instead of stored statuses', () => {
    const email = buildPlpProgressEmail({
        ...PROGRESS,
        goals: [{ title: 'Build confidence', goalType: 'character', status: 'carried_forward', successCriteria: 'Ask for help' }],
        tasks: [{ title: 'Read a story', status: 'needs_revision', dueDate: new Date('2026-10-28T00:00:00Z'), instructions: 'Read at home' }],
    });
    assert.match(email.text, /Carried on to the next plan/);
    assert.match(email.text, /Needs another attempt/);
    assert.match(email.text, /Character — Build confidence/);
    assert.doesNotMatch(email.text, /carried_forward|needs_revision/);
});

test('an Arabic email reads right to left with translated chrome', () => {
    const email = buildPlpProgressEmail({
        ...PROGRESS,
        language: 'ar',
        school: { name: 'AMLY School' },
        teacher: { firstName: 'Nabeel', lastName: 'Nash' },
        sentAt: new Date('2026-10-22T09:00:00Z'),
    });
    assert.match(email.html, /<html dir="rtl" lang="ar">/);
    assert.match(email.html, /text-align:right/);
    assert.match(email.text, /خطة التعلم الشخصية/);
    assert.match(email.text, /أهداف الخطة/);
    assert.match(email.text, /22 أكتوبر 2026/);
    assert.doesNotMatch(email.text, /Goals in this plan|Dear family/);
});

test('bilingual sends merge both versions into one right-to-left Arabic section', () => {
    const email = buildPlpProgressEmail({ ...PROGRESS, language: 'both' });
    assert.equal(email.language, 'both');
    assert.match(email.subject, /PLP progress update/);
    assert.match(email.subject, /تحديث خطة التعلم الشخصية/);
    assert.match(email.html, /<html dir="ltr" lang="en">/);
    assert.match(email.html, /dir="rtl" lang="ar"/);
    assert.match(email.text, /Goals in this plan/);
    assert.match(email.text, /أهداف الخطة/);
    const rightToLeft = email.html.indexOf('dir="rtl" lang="ar"');
    assert.ok(rightToLeft > -1 && email.html.indexOf('أرسلها') > rightToLeft);
});

test('unknown languages fall back to English instead of an unwritten message', () => {
    assert.equal(normalizePlpEmailLanguage('fr'), 'en');
    assert.equal(normalizePlpEmailLanguage(undefined), 'en');
    assert.equal(normalizePlpEmailLanguage('AR'), 'ar');
    assert.equal(normalizePlpEmailLanguage('both'), 'both');
    assert.equal(buildPlpProgressEmail({ ...PROGRESS, language: 'de' }).language, 'en');
});

test('delivery errors never repeat the recipient address', () => {
    assert.equal(
        describeEmailDeliveryError(new Error('550 5.1.1 <family@example.test> rejected')),
        '550 5.1.1 [recipient] rejected',
    );
    assert.equal(describeEmailDeliveryError(new Error('   ')), 'Email delivery failed');
    assert.equal(describeEmailDeliveryError('SMTP timeout').length <= 500, true);
});

test('delivery policy blocks accidental duplicate sends and allows explicit resends', () => {
    const previous = { status: 'sent', attempt: 1 };
    assert.deepEqual(getPlpEmailDeliveryAttempt(previous), {
        blocked: true,
        reason: 'duplicate_blocked',
        attempt: 1,
    });
    assert.deepEqual(getPlpEmailDeliveryAttempt(previous, { resend: true }), {
        blocked: false,
        reason: '',
        attempt: 2,
    });
});

test('delivery policy blocks active attempts and permits stale or failed retries', () => {
    const now = Date.now();
    assert.equal(getPlpEmailDeliveryAttempt({
        status: 'sending',
        attempt: 1,
        startedAt: new Date(now - 60_000),
    }, { now }).reason, 'sending');
    assert.equal(getPlpEmailDeliveryAttempt({
        status: 'sending',
        attempt: 1,
        startedAt: new Date(now - 11 * 60_000),
    }, { now }).attempt, 2);
    assert.equal(getPlpEmailDeliveryAttempt({ status: 'failed', attempt: 2 }).attempt, 3);
});
