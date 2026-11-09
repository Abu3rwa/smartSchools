import assert from 'node:assert/strict';
import test from 'node:test';

import { renderTemplate } from '../emailTemplates/templateLoader.js';

test('renderTemplate applies class update shared styling to attendance request emails', () => {
  const html = renderTemplate('attendanceRequestNew', {
    requesterName: 'Parent Name',
    requesterEmail: 'parent@example.com',
    typeLabel: 'Late Arrival',
    notesSection:
      '<div class="section"><h3 class="section-title">Notes</h3><div class="row-list"><div class="row-item"><div class="row-left muted">Bus delay</div></div></div></div>',
    schoolName: 'School One',
  });

  assert.match(html, /Attendance Request/);
  assert.match(html, /style="[^"]*background-color:#f6f7fb/);
  assert.match(html, /style="[^"]*max-width:640px/);
  assert.match(html, /style="[^"]*display:inline-block[^"]*border-radius:999px/);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\{\{.+\}\}/);
});

test('renderTemplate preserves the standardized academic summary styling for grade updates', () => {
  const html = renderTemplate('gradeUpdate', {
    studentFullName: 'Student Name',
    studentFirstName: 'Student',
    teacherName: 'Teacher Name',
    schoolName: 'School One',
    subjectName: 'Math',
    assignmentTitleRow:
      '<div class="row-item"><div class="row-left"><div>Title</div><div class="meta-line">Fractions Quiz</div></div></div>',
    gradeType: 'Quiz',
    gradeDate: '03/13/2026',
    marks: '8',
    maxMarks: '10',
    percentage: '80',
    remarksSection: '',
    year: '2026',
  });

  assert.match(html, /Academic Summary/);
  assert.match(html, /Fractions Quiz/);
  assert.match(html, /Recorded by Teacher Name\./);
  assert.match(html, /style="[^"]*border:1px solid #dbe6ff/);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\{\{.+\}\}/);
});

test('grade update emails omit the title row when the grade has no title', () => {
  const html = renderTemplate('gradeUpdate', {
    studentFullName: 'Student Name',
    studentFirstName: 'Student',
    teacherName: 'Teacher Name',
    schoolName: 'School One',
    subjectName: 'Math',
    assignmentTitleRow: '',
    gradeType: 'Quiz',
    gradeDate: '03/13/2026',
    marks: '8',
    maxMarks: '10',
    percentage: '80',
    remarksSection: '',
    year: '2026',
  });

  assert.doesNotMatch(html, /\{\{.+\}\}/);
  assert.doesNotMatch(html, /<div>Title<\/div>/);
});

test('classwork and gradebook grade rows show the assignment title when present', () => {
  for (const template of ['classworkGradeRow', 'classworkGradeRow_ar', 'gradebookGradeRow', 'gradebookGradeRow_ar']) {
    const html = renderTemplate(template, {
      gradeDate: 'Nov 3',
      scoreClass: '',
      marks: '8',
      maxMarks: '10',
      titleLine: '<div class="meta-line">Fractions Quiz</div>',
      notesLine: '',
    });

    assert.match(html, /Fractions Quiz/);
    assert.doesNotMatch(html, /\{\{.+\}\}/);
  }
});
