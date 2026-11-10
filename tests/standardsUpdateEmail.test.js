import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildStandardsUpdateEmail,
    buildStandardsUpdateRow,
    formatScaleScore,
    isStandardsUpdateEntryPending,
    resolveStandardsUpdateLanguage,
    selectStandardsUpdateEntries,
    standardsMasteryLevel,
    standardsUpdateAveragePercentage,
    standardsUpdatePeriodLabel,
} from '../services/standardsUpdateEmailService.js';

const student = {
    firstName: 'Layla',
    lastName: 'Ahmad',
    reportPreferences: { language: 'english' },
};

const rows = [
    {
        title: 'Fractions quiz',
        date: new Date('2026-11-12T12:00:00.000Z'),
        standard: '5.NF.1 Add and subtract fractions',
        standardId: 'std-fractions',
        score: 3.5,
        percentage: 88,
    },
    {
        title: 'Reading comprehension',
        date: new Date('2026-10-20T12:00:00.000Z'),
        standard: '5.RL.2 Determine a theme',
        standardId: 'std-reading',
        score: 3,
        percentage: 75,
    },
];

const build = (overrides = {}) =>
    buildStandardsUpdateEmail({
        student,
        schoolName: 'Al Noor School',
        courseName: 'Mathematics',
        sender: { name: 'Ms Huda', roleLabel: 'Math Teacher' },
        className: 'Grade 5A',
        semester: 1,
        academicYear: '2026-2027',
        rows,
        isFirstUpdate: true,
        ...overrides,
    });

test('English update uses the approved subject and a four-column results table', () => {
    const email = build();
    assert.equal(email.language, 'en');
    assert.equal(email.subject, 'Standards update for Layla Ahmad \u2014 Semester 1');
    assert.equal(email.averagePercentage, 82);
    assert.equal(email.assessmentCount, 2);
    assert.equal(email.standardsCount, 2);
    assert.match(email.html, /<html lang="en" dir="ltr">/);
    assert.match(email.html, /Semester 1 \u00b7 2026\u20132027/);
    assert.match(email.html, /<h1 class="em-title"[^>]*>Mathematics<\/h1>/);
    assert.match(email.html, /Fractions quiz/);
    assert.match(email.html, />Title<\/td>/);
    assert.match(email.html, />Standard<\/td>/);
    assert.match(email.html, />Date<\/td>/);
    assert.match(email.html, />Mark<\/td>/);
    assert.match(email.html, /88%/);
    assert.match(email.html, /82%/);
    assert.match(email.html, /2026\u20132027/);
    assert.match(email.html, /Al Noor School/);
});

test('the scale, the intro speech and the mastery pills are gone', () => {
    const email = build();
    assert.doesNotMatch(email.html, /\/ 4/);
    assert.doesNotMatch(email.html, />Scale</);
    assert.doesNotMatch(email.html, /Meets standard|Approaching standard|Exceeds standard/);
    assert.doesNotMatch(email.html, /Here is the (first|latest) standards update/);
    assert.doesNotMatch(email.text, /Here is the (first|latest) standards update/);
    assert.doesNotMatch(email.text, /Scale:/);
});

test('the mark is bold and carries the exact gradebook mastery colour', () => {
    const email = build();
    assert.match(email.html, /font-weight:800;color:#166534;unicode-bidi:isolate;white-space:nowrap;">88%/);
    assert.match(email.html, /font-weight:800;color:#15803d;unicode-bidi:isolate;white-space:nowrap;">75%/);
});

test('Arabic update mirrors the layout in RTL and isolates Latin scores', () => {
    const email = build({
        student: { ...student, reportPreferences: { language: 'arabic' } },
        semester: 2,
    });
    assert.equal(email.language, 'ar');
    assert.equal(email.subject, '\u062a\u062d\u062f\u064a\u062b \u0645\u0639\u0627\u064a\u064a\u0631 \u0627\u0644\u062a\u0639\u0644\u0651\u0645: Layla Ahmad \u2014 \u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062b\u0627\u0646\u064a');
    assert.match(email.html, /<html lang="ar" dir="rtl">/);
    assert.match(email.html, /dir="ltr" style="font-size:16px;line-height:1.5;font-weight:800;color:#166534;unicode-bidi:isolate;white-space:nowrap;">88%/);
    assert.match(email.html, /<h1 class="em-title"[^>]*><span dir="ltr" style="unicode-bidi:isolate;">Mathematics<\/span><\/h1>/);
    assert.match(email.html, /<span dir="ltr" style="unicode-bidi:isolate;">2026\u20132027<\/span>/);
    assert.match(email.html, />\u0627\u0644\u062f\u0631\u062c\u0629<\/td>/);
    assert.match(email.html, /\u0646\u0648\u0641\u0645\u0628\u0631/);
});

test('manual teacher marks show a note instead of the placeholder percentage', () => {
    const email = build({
        rows: [{
            title: 'Teacher assessment',
            date: new Date('2026-11-01T12:00:00.000Z'),
            standard: '5.NF.1 Add and subtract fractions',
            standardId: 'std-fractions',
            score: 2,
            percentage: null,
            isManual: true,
        }],
    });
    assert.match(email.html, /Teacher mark/);
    assert.doesNotMatch(email.html, />0%</);
    assert.doesNotMatch(email.html, /\/ 4/);
    assert.equal(email.averagePercentage, 50);
});

test('neither update variant adds an intro speech anymore', () => {
    const first = build();
    const latest = build({ isFirstUpdate: false });
    assert.doesNotMatch(first.html, /standards update for this semester/);
    assert.doesNotMatch(latest.html, /standards update for this semester/);
    assert.doesNotMatch(first.text, /this school year|this semester/);
});

test('header falls back to the email title when no course name is given', () => {
    const email = build({ courseName: '' });
    assert.match(email.html, /<h1 class="em-title"[^>]*>Standards update<\/h1>/);
    assert.doesNotMatch(email.text, /\nStandards update\n/);
});

test('titles, standards and dates are escaped in the HTML body', () => {
    const email = build({
        schoolName: 'A & B <School>',
        rows: [{
            title: '<b>Quiz</b> & "review"',
            date: new Date('2026-11-12T12:00:00.000Z'),
            standard: '5.<NF>.1',
            standardId: 'std-x',
            score: 4,
            percentage: 100,
        }],
    });
    assert.match(email.html, /&lt;b&gt;Quiz&lt;\/b&gt; &amp; &quot;review&quot;/);
    assert.match(email.html, /5\.&lt;NF&gt;\.1/);
    assert.match(email.html, /A &amp; B &lt;School&gt;/);
});

test('plain-text version lists the course, standard, date and mark', () => {
    const email = build();
    assert.match(email.text, /STANDARDS UPDATE \u2014 Semester 1/);
    assert.match(email.text, /Al Noor School\nMathematics\nLayla Ahmad \u00b7 Grade 5A/);
    assert.match(email.text, /Summary: 82% \u00b7 2 Standards \u00b7 2 Assessments/);
    assert.match(email.text, /1\. Fractions quiz \u2014 12 Nov 2026/);
    assert.match(email.text, /Standard: 5\.NF\.1 Add and subtract fractions \u00b7 Mark: 88%/);
    assert.doesNotMatch(email.text, /Scale:/);
});

test('an empty update reports a dash average and zero counts', () => {
    const email = build({ rows: [] });
    assert.equal(email.averagePercentage, null);
    assert.equal(email.assessmentCount, 0);
    assert.match(email.text, /Summary: \u2014/);
});

test('rows sort newest first and duplicate standards count once', () => {
    const email = build({
        rows: [
            ...rows,
            {
                title: 'Fractions retake',
                date: new Date('2026-11-20T12:00:00.000Z'),
                standard: '5.NF.1 Add and subtract fractions',
                standardId: 'std-fractions',
                score: 4,
                percentage: 100,
            },
        ],
    });
    assert.equal(email.standardsCount, 2);
    assert.equal(email.assessmentCount, 3);
    assert.ok(email.html.indexOf('Fractions retake') < email.html.indexOf('Fractions quiz'));
});

test('mastery level rounds the scale score and clamps out-of-range values', () => {
    assert.equal(standardsMasteryLevel(3.4), 3);
    assert.equal(standardsMasteryLevel(3.5), 4);
    assert.equal(standardsMasteryLevel(2.5), 3);
    assert.equal(standardsMasteryLevel(-1), 0);
    assert.equal(standardsMasteryLevel(7), 4);
    assert.equal(standardsMasteryLevel('nope'), 0);
});

test('scale score keeps two decimals and stays within 0-4', () => {
    assert.equal(formatScaleScore(3.456), '3.46');
    assert.equal(formatScaleScore(3), '3');
    assert.equal(formatScaleScore(0), '0');
    assert.equal(formatScaleScore(-2), '0');
    assert.equal(formatScaleScore(9), '4');
    assert.equal(formatScaleScore(undefined), '0');
});

test('average percentage ignores manual rows without a percentage', () => {
    assert.equal(standardsUpdateAveragePercentage([
        { score: 4, percentage: 100 },
        { score: 2, percentage: null },
        { score: 0, percentage: 0 },
    ]), 50);
});

test('average percentage falls back to the scale score when every percentage is missing', () => {
    assert.equal(standardsUpdateAveragePercentage([
        { score: 4, percentage: null },
        { score: 2, percentage: null },
    ]), 75);
    assert.equal(standardsUpdateAveragePercentage([]), null);
});

test('pending helper sends never-emailed entries and re-sends after a changed result', () => {
    assert.equal(isStandardsUpdateEntryPending(null), false);
    assert.equal(isStandardsUpdateEntryPending({ updatedAt: new Date('2026-11-01T00:00:00.000Z') }), true);
    assert.equal(isStandardsUpdateEntryPending({
        lastEmailedAt: new Date('2026-11-02T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    }), false);
    assert.equal(isStandardsUpdateEntryPending({
        lastEmailedAt: new Date('2026-11-02T00:00:00.000Z'),
        updatedAt: new Date('2026-11-03T00:00:00.000Z'),
    }), true);
    assert.equal(isStandardsUpdateEntryPending({ lastEmailedAt: 'not-a-date' }), true);
});

test('include-all keeps already-emailed entries while the default stays new/changed-only', () => {
    const entries = [
        { _id: 'new', updatedAt: new Date('2026-11-01T00:00:00.000Z') },
        {
            _id: 'sent',
            lastEmailedAt: new Date('2026-11-02T00:00:00.000Z'),
            updatedAt: new Date('2026-11-01T00:00:00.000Z'),
        },
        {
            _id: 'changed',
            lastEmailedAt: new Date('2026-11-02T00:00:00.000Z'),
            updatedAt: new Date('2026-11-03T00:00:00.000Z'),
        },
    ];
    assert.deepEqual(
        selectStandardsUpdateEntries(entries).map((entry) => entry._id),
        ['new', 'changed'],
    );
    assert.deepEqual(
        selectStandardsUpdateEntries(entries, true).map((entry) => entry._id),
        ['new', 'sent', 'changed'],
    );
    assert.deepEqual(selectStandardsUpdateEntries([], true), []);
});

test('row builder localizes the manual placeholder and hides its percentage', () => {
    const manualEnteredAt = new Date('2026-11-01T12:00:00.000Z');
    const row = buildStandardsUpdateRow({
        entry: {
            isManualEntry: true,
            effectiveScore: 2,
            percentage: 0,
            manualEnteredAt,
        },
        assignment: null,
        standard: { name: '5.NF.1 Add and subtract fractions' },
        language: 'en',
    });
    assert.equal(row.title, 'Teacher assessment');
    assert.equal(row.percentage, null);
    assert.equal(row.isManual, true);
    assert.equal(row.score, 2);
    assert.equal(row.date, manualEnteredAt);
    assert.equal(row.standard, '5.NF.1 Add and subtract fractions');
});

test('row builder falls back to the standard name when the assignment has no real title', () => {
    const row = buildStandardsUpdateRow({
        entry: { effectiveScore: 3, percentage: 75 },
        assignment: { title: 'Manual Assessment', dueDate: new Date('2026-11-05T12:00:00.000Z') },
        standard: { name: '5.RL.2 Determine a theme' },
        language: 'ar',
    });
    assert.equal(row.title, '5.RL.2 Determine a theme');
    assert.equal(row.percentage, 75);
});

test('row builder derives the score from the percentage when no score is stored', () => {
    const row = buildStandardsUpdateRow({
        entry: { percentage: 50 },
        assignment: { title: 'Quick check' },
        standard: null,
        language: 'en',
    });
    assert.equal(row.score, 2);
    assert.equal(row.title, 'Quick check');
});

test('language resolves from the stored report preference', () => {
    assert.equal(resolveStandardsUpdateLanguage({ reportPreferences: { language: 'arabic' } }), 'ar');
    assert.equal(resolveStandardsUpdateLanguage({ reportPreferences: { language: 'English' } }), 'en');
    assert.equal(resolveStandardsUpdateLanguage({ reportPreferences: { language: 'bilingual' } }), 'en');
    assert.equal(resolveStandardsUpdateLanguage(null), 'en');
});

test('period labels cover both semesters and the full year in both languages', () => {
    assert.equal(standardsUpdatePeriodLabel(1), 'Semester 1');
    assert.equal(standardsUpdatePeriodLabel(2), 'Semester 2');
    assert.equal(standardsUpdatePeriodLabel(null), 'Full year');
    assert.equal(standardsUpdatePeriodLabel(1, 'ar'), '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644');
    assert.equal(standardsUpdatePeriodLabel(null, 'ar'), '\u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629');
});

test('no portal CTA or closing speech remains, and the privacy note addresses students as well as families', () => {
    const english = build();
    assert.doesNotMatch(english.html, /Open portal/);
    assert.doesNotMatch(english.html, /The button opens your portal/);
    assert.doesNotMatch(english.html, /reply to this email or message me in the app/);
    assert.doesNotMatch(english.text, /Open portal/);
    assert.doesNotMatch(english.text, /reply to this email or message me in the app/);
    assert.match(english.html, /intended for the parent, guardian or student only\./);

    const arabic = build({
        student: { ...student, reportPreferences: { language: 'arabic' } },
    });
    assert.doesNotMatch(arabic.html, /\u0641\u062a\u062d \u0627\u0644\u0628\u0648\u0627\u0628\u0629/);
    assert.match(arabic.html, /\u0644\u0648\u0644\u064a \u0627\u0644\u0623\u0645\u0631 \u0623\u0648 \u0627\u0644\u0637\u0627\u0644\u0628 \u0641\u0642\u0637/);
});

test('mobile layout stacks cards at 480px while keeping the desktop table', () => {
    const email = build();
    assert.match(email.html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(email.html, /max-width:600px/);
    assert.match(email.html, /@media only screen and \(max-width: 480px\)/);
    assert.match(email.html, /\.em-results-desktop \{ display: none !important; \}/);
    assert.match(email.html, /class="em-results-desktop"/);
    assert.match(email.html, /class="em-results-mobile" style="display:none;"/);
    assert.match(email.html, /border-radius:999px;background-color:#f0fdf4;[^"]*">88%/);
    assert.match(email.html, />Avg score<\/div>/);
    assert.match(email.html, />Standards<\/div>/);
    assert.match(email.html, />Assessments<\/div>/);
    assert.match(email.html, /height="88"/);
    assert.match(email.html, /font-size:16px;line-height:1.5;color:#334155/);
    assert.match(email.html, /font-size:14px;line-height:1.5;color:#64748b;font-weight:600/);
    assert.match(email.html, /font-size:14px;line-height:1.4;color:#64748b;font-weight:700;margin-top:5px/);

    const arabic = build({
        student: { ...student, reportPreferences: { language: 'arabic' } },
    });
    assert.match(arabic.html, /class="em-results-mobile" style="display:none;"/);
    assert.match(arabic.html, />\u0627\u0644\u0645\u0639\u064a\u0627\u0631<\/td>/);
});
