import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMapPracticeClassReport,
  buildMapPracticeStudentReport,
  resolveMapPracticeReportPeriod
} from '../services/mapPracticeReportService.js';
import { buildMapPracticeReportHtml } from '../services/mapPracticeReportTemplate.js';

const school = { settings: { academicYearStartMonth: 8 } };
const period = {
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2027-07-31T23:59:59.999Z')
};
const skill = { _id: 'skill-1', code: 'VOC-CONTEXT', name: 'Context clues', strand: 'Vocabulary' };
const student = { _id: 'student-1', firstName: 'Alex', lastName: 'Student', studentId: 'S-0001' };

test('report period defaults to academic year and validates explicit inclusive dates', () => {
  const defaultPeriod = resolveMapPracticeReportPeriod({ query: {}, academicYear: '2026-2027', school });
  assert.equal(defaultPeriod.startDate.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(defaultPeriod.endDate.toISOString(), '2027-07-31T23:59:59.999Z');

  const selected = resolveMapPracticeReportPeriod({
    query: { startDate: '2026-10-01', endDate: '2026-10-31' },
    academicYear: '2026-2027',
    school
  });
  assert.equal(selected.startDate.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(selected.endDate.toISOString(), '2026-10-31T23:59:59.999Z');
  assert.throws(() => resolveMapPracticeReportPeriod({
    query: { startDate: '2026-02-30', endDate: '2026-03-01' },
    academicYear: '2026-2027',
    school
  }), { statusCode: 400 });
  assert.throws(() => resolveMapPracticeReportPeriod({
    query: { startDate: '2026-10-01' },
    academicYear: '2026-2027',
    school
  }), { statusCode: 400 });
  assert.throws(() => resolveMapPracticeReportPeriod({
    query: { startDate: '2027-08-01', endDate: '2027-08-02' },
    academicYear: '2026-2027',
    school
  }), { statusCode: 400 });
});

test('student report counts graded answers only and omits answer content', () => {
  const report = buildMapPracticeStudentReport({
    student,
    academicYear: '2026-2027',
    period,
    attempts: [{
      status: 'reviewed',
      submittedAt: '2026-10-10T12:00:00.000Z',
      set: { _id: 'set-1', title: 'Reading practice' },
      reviewStatus: 'pending',
      answers: [
        { isCorrect: true, response: 'sensitive student answer', question: { skill } },
        { isCorrect: false, response: 'another private response', question: { skill } },
        { isCorrect: null, response: 'waiting for review', question: { skill } }
      ]
    }]
  });

  assert.equal(report.metrics.submittedSets, 1);
  assert.equal(report.metrics.answered, 3);
  assert.equal(report.metrics.graded, 2);
  assert.equal(report.metrics.correct, 1);
  assert.equal(report.metrics.accuracy, 50);
  assert.equal(report.metrics.pendingReviews, 1);
  assert.equal(report.skills[0].graded, 2);
  assert.equal(report.skills[0].evidence, 'limited');
  assert.deepEqual(report.skillSets.map(({ name, correct, graded, accuracy }) => ({ name, correct, graded, accuracy })), [
    { name: 'Vocabulary', correct: 1, graded: 2, accuracy: 50 }
  ]);
  assert.equal(JSON.stringify(report).includes('sensitive student answer'), false);
});

test('student report does not count ungraded responses from already reviewed attempts as awaiting review', () => {
  const report = buildMapPracticeStudentReport({
    student,
    academicYear: '2026-2027',
    period,
    attempts: [{
      status: 'reviewed',
      submittedAt: '2026-10-10T12:00:00.000Z',
      reviewStatus: 'reviewed',
      answers: [{ isCorrect: null, question: { skill } }]
    }]
  });
  assert.equal(report.metrics.pendingReviews, 0);
  assert.equal(report.metrics.graded, 0);
  assert.equal(report.metrics.accuracy, null);
});

test('student report counts only unanswered grading decisions from attempts pending review', () => {
  const report = buildMapPracticeStudentReport({
    student,
    academicYear: '2026-2027',
    period,
    attempts: [{
      status: 'submitted',
      submittedAt: '2026-10-10T12:00:00.000Z',
      reviewStatus: 'pending',
      answers: [
        { isCorrect: null, question: { skill } },
        { isCorrect: false, question: { skill } }
      ]
    }]
  });

  assert.equal(report.metrics.pendingReviews, 1);
  assert.equal(report.metrics.graded, 1);
});

test('class report averages per-student accuracy instead of pooling responses', () => {
  const students = [
    student,
    { _id: 'student-2', firstName: 'Sam', lastName: 'Student', studentId: 'S-0002' }
  ];
  const attempts = [
    {
      student: 'student-1',
      status: 'submitted',
      submittedAt: '2026-10-10T12:00:00.000Z',
      set: 'set-1',
      answers: [
        { isCorrect: true, question: { skill } },
        { isCorrect: true, question: { skill } },
        { isCorrect: true, question: { skill } },
        { isCorrect: true, question: { skill } }
      ]
    },
    {
      student: 'student-2',
      status: 'submitted',
      submittedAt: '2026-10-11T12:00:00.000Z',
      set: 'set-2',
      answers: [{ isCorrect: false, question: { skill } }]
    }
  ];
  const report = buildMapPracticeClassReport({
    classRecord: { name: 'Grade 5-R', grade: 5, section: 'R' },
    students,
    sets: [
      { _id: 'set-1', student: 'student-1', title: 'Set 1' },
      { _id: 'set-2', student: 'student-2', title: 'Set 2' }
    ],
    assignments: [{ student: 'student-1' }],
    attempts,
    academicYear: '2026-2027',
    period
  });

  assert.equal(report.metrics.averageAccuracy, 50);
  assert.equal(report.metrics.studentsWithAccuracy, 2);
  assert.equal(report.metrics.submittedStudents, 2);
  assert.equal(report.metrics.withAssignments, 1);
  assert.deepEqual(report.students.map((item) => item.name), ['Alex Student', 'Sam Student']);
  assert.equal(report.skills[0].graded, 5);
  assert.deepEqual(report.skillSets.map(({ name, graded }) => ({ name, graded })), [
    { name: 'Vocabulary', graded: 5 }
  ]);
});

test('report HTML escapes user-controlled content and excludes student answers', () => {
  const report = buildMapPracticeStudentReport({
    student: { ...student, firstName: '<script>alert(1)</script>' },
    academicYear: '2026-2027',
    period,
    attempts: [{
      status: 'submitted',
      submittedAt: '2026-10-10T12:00:00.000Z',
      set: { _id: 'set-1', title: '<img src=x onerror=alert(1)>' },
      answers: [{ isCorrect: true, response: 'private response', question: { skill } }]
    }]
  });
  const html = buildMapPracticeReportHtml(report);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /private response/);
});

test('skill chart grows for any number of skills and wraps long labels without clipping', () => {
  const skills = Array.from({ length: 24 }, (_, index) => ({
    name: `Uses a complex punctuation and sentence construction skill number ${index + 1}`,
    accuracy: 100,
    correct: 3,
    graded: 3,
    evidence: 'sufficient'
  }));
  const html = buildMapPracticeReportHtml({
    type: 'student',
    student,
    metrics: {
      submittedSets: 0,
      answered: 0,
      graded: 0,
      correct: 0,
      accuracy: null,
      pendingReviews: 0,
      lastPractice: null
    },
    attempts: [],
    recentAttempts: [],
    skills,
    skillSets: [{
      name: 'Vocabulary',
      accuracy: 100,
      correct: 3,
      graded: 3,
      evidence: 'sufficient'
    }],
    interpretations: [],
    academicYear: '2026-2027',
    period,
    generatedAt: new Date('2026-10-19T00:00:00.000Z')
  });

  assert.match(html, /viewBox="0 0 760 1240"/);
  assert.match(html, /Practice accuracy by skill set \(strand\)/);
  assert.match(html, /Skill-set accuracy combines graded responses across all skills in each set/);
  assert.equal((html.match(/<rect x="230"/g) || []).length, skills.length * 2 + 2);
  assert.equal((html.match(/<tspan x="220"/g) || []).length, skills.length * 3 + 1);
  assert.doesNotMatch(html, /max-height:520px/);
});
