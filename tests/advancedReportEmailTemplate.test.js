import test from 'node:test';
import assert from 'node:assert/strict';
import emailService from '../services/emailService.js';

const student = {
    firstName: 'Layla',
    lastName: 'Ahmad',
    currentClass: { name: 'Grade 5' }
};

const teacher = {
    firstName: 'Hana',
    lastName: 'Saleh',
    email: 'hana@almanar.edu'
};

const render = (overrides = {}) => emailService.renderReportEmail({
    reportContent: '<div><h2>Overview</h2><p>Layla has shown steady progress this term.</p></div>',
    language: 'english',
    requestedLanguages: ['en'],
    studentData: student,
    schoolName: 'Al Manar Language School',
    teacher,
    period: 'October - November 2026',
    ...overrides
}).html;

test('the teacher remark is rendered word for word, with line breaks kept', () => {
    const html = render({ teacherRemark: 'Layla is a joy.\nKeep reading every night.' });

    assert.match(html, /A Note from the Teacher/);
    assert.match(html, /Layla is a joy\.<br \/>Keep reading every night\./);
    assert.match(html, /&mdash; Hana Saleh/);
});

test('an empty remark leaves no placeholder note behind', () => {
    const html = render({ teacherRemark: '' });

    assert.doesNotMatch(html, /A Note from the Teacher/);
    assert.doesNotMatch(html, /We are committed to supporting/);
    assert.doesNotMatch(html, />The Teacher</);
});

test('the signature names the real teacher, not a generic label', () => {
    const html = render();

    assert.match(html, /Hana Saleh/);
    assert.match(html, /Grade 5 Teacher/);
    assert.match(html, /mailto:hana@almanar\.edu/);
});

test('the teacher remark is escaped, never injected as markup', () => {
    const html = render({ teacherRemark: '<img src=x onerror=alert(1)> & "quotes"' });

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quotes&quot;/);
});

test('the KPI strip shows only measured figures, three at most', () => {
    const html = render({
        evidenceSnapshot: {
            sources: {
                grades: { metrics: { average: 87 } },
                attendance: { metrics: { attendanceRate: 95 } },
                homework: { metrics: { completionRate: 88 } },
                standards: { metrics: { overallPct: 80 } }
            }
        }
    });

    assert.match(html, />87%</);
    assert.match(html, />95%</);
    assert.match(html, />88%</);
    assert.match(html, /Overall Average/);
    assert.match(html, /Attendance/);
    assert.match(html, /Homework Completed/);
    assert.doesNotMatch(html, />80%</);
    assert.doesNotMatch(html, /Standards Mastery/);
});

test('a source with no measurement contributes no figure', () => {
    const html = render({
        evidenceSnapshot: {
            sources: {
                grades: { metrics: {} },
                attendance: { metrics: { absent: 2 } }
            }
        }
    });

    assert.doesNotMatch(html, /Overall Average/);
    assert.doesNotMatch(html, /Attendance/);
});

test('the layout survives clients that drop <style>: no grid, no CSS variables in markup', () => {
    const html = render({ teacherRemark: 'Keep it up.' });

    assert.match(html, /bgcolor="#0d9488"/);
    assert.doesNotMatch(html, /display:\s*grid/);
    assert.doesNotMatch(html, /grid-template/);
    assert.doesNotMatch(html, /::before/);
    assert.doesNotMatch(html, /var\(--/);
});

test('an Arabic-only report renders right to left', () => {
    const html = render({
        language: 'arabic',
        requestedLanguages: ['ar'],
        teacherRemark: 'أحسنت هذا الفصل.'
    });

    assert.match(html, /<html lang="ar" dir="rtl">/);
    assert.match(html, /كلمة من المعلم/);
    assert.match(html, /أحسنت هذا الفصل\./);
});
