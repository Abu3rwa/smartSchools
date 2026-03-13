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
    gradeType: 'Quiz',
    gradeDate: '03/13/2026',
    marks: '8',
    maxMarks: '10',
    percentage: '80',
    remarksSection: '',
    year: '2026',
  });

  assert.match(html, /Academic Summary/);
  assert.match(html, /Recorded by Teacher Name\./);
  assert.match(html, /style="[^"]*border:1px solid #dbe6ff/);
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\{\{.+\}\}/);
});
