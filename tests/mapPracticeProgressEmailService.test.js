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

test('progress email lists at most 3 skill chips per set with a +N more marker', () => {
  const skills = [
    'Skill one', 'Skill two', 'Skill three', 'Skill four', 'Skill five',
    'Skill six', 'Skill seven', 'Skill eight', 'Skill nine', 'Skill ten',
    'Skill eleven', 'Skill twelve',
  ];
  const email = buildMapPracticeProgressEmail({
    student: { firstName: 'Ava', lastName: 'Student' },
    assignments: [{
      _id: 'assignment-many-skills',
      set: { _id: 'set-many-skills', title: 'Many skills', questionCount: 10 },
    }],
    attempts: [],
    skillsBySet: new Map([['set-many-skills', skills]]),
  });

  assert.match(email.html, /Skill one/);
  assert.match(email.html, /Skill two/);
  assert.match(email.html, /Skill three/);
  assert.match(email.html, /\+9 more/);
  assert.doesNotMatch(email.html, /Skill four/);
  assert.doesNotMatch(email.html, /Skill twelve/);
  assert.match(email.text, /Skills: Skill one, Skill two, Skill three \+9 more/);
  assert.doesNotMatch(email.text, /Skill twelve/);
});

test('progress email keeps every skill chip when a set has few skills', () => {
  const email = buildMapPracticeProgressEmail({
    student: { firstName: 'Ava', lastName: 'Student' },
    assignments: [{
      _id: 'assignment-few-skills',
      set: { _id: 'set-few-skills', title: 'Few skills', questionCount: 2 },
    }],
    attempts: [],
    skillsBySet: new Map([['set-few-skills', ['Only skill']]]),
  });

  assert.match(email.html, /Only skill/);
  assert.doesNotMatch(email.html, /\+1 more/);
  assert.doesNotMatch(email.text, /\+1 more/);
});
