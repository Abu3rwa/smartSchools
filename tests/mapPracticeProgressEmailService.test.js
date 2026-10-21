import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapPracticeProgressEmail } from '../services/mapPracticeProgressEmailService.js';

test('progress email includes completed scores, current progress, skills, and direct practice links', () => {
  const email = buildMapPracticeProgressEmail({
    student: { firstName: 'Ava', lastName: 'Student' },
    assignments: [
      {
        _id: 'assignment-in-progress',
        set: { _id: 'set-in-progress', title: 'Fractions', questionCount: 4 },
      },
      {
        _id: 'assignment-complete',
        set: { _id: 'set-complete', title: 'Decimals', questionCount: 5 },
      },
    ],
    attempts: [
      {
        _id: 'attempt-in-progress',
        set: 'set-in-progress',
        status: 'in_progress',
        answers: [
          { question: 'q1', response: 'A' },
          { question: 'q2', response: '' },
        ],
      },
      {
        _id: 'attempt-complete',
        set: 'set-complete',
        status: 'reviewed',
        submittedAt: '2026-10-20T10:00:00Z',
        score: 4,
        maxScore: 5,
      },
    ],
    skillsBySet: new Map([
      ['set-in-progress', ['Adding fractions', 'Adding fractions']],
      ['set-complete', ['Decimal place value']],
    ]),
  });

  assert.equal(email.rows.length, 2);
  assert.equal(email.completedCount, 1);
  assert.equal(email.progressCount, 1);
  assert.match(email.html, /Score 4 of 5/);
  assert.doesNotMatch(email.html, /teacher review|waiting for teacher/i);
  assert.doesNotMatch(email.text, /teacher review|waiting for teacher/i);
  assert.match(email.html, /1 of 4 questions answered/);
  assert.match(email.html, /Adding fractions/);
  assert.match(email.html, /Decimal place value/);
  assert.match(email.rows[0].url, /assignmentId=assignment-in-progress/);
  assert.match(email.rows[1].url, /attemptId=attempt-complete/);
  assert.equal(new URL(email.rows[0].url).origin, 'https://smile3-8c8c5.web.app');
  assert.equal(new URL(email.rows[1].url).origin, 'https://smile3-8c8c5.web.app');
  assert.doesNotMatch(email.rows[0].url, /attemptId=/);
});

test('progress email escapes user-provided content and avoids scores for unfinished sets', () => {
  const email = buildMapPracticeProgressEmail({
    student: { firstName: '<Ava>', lastName: 'Student' },
    assignments: [{
      _id: 'assignment-1',
      set: { _id: 'set-1', title: '<script>alert(1)</script>', questionCount: 3 },
    }],
    attempts: [{
      _id: 'attempt-1',
      set: 'set-1',
      status: 'in_progress',
      score: 2,
      maxScore: 3,
      answers: [{ question: 'q1', response: 'A' }],
    }],
  });

  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /Score 2 of 3/);
  assert.doesNotMatch(email.text, /score 2 of 3/i);
  assert.match(email.text, /1 of 3 questions answered/);
});
