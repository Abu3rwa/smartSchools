import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttemptRows,
  renderStudentResultReportHtml,
} from '../services/studentResultReportService.js';

const report = (overrides = {}) => ({
  schoolName: 'Al-Noor Academy',
  teacherName: 'Ms Amina Saleh',
  assignmentTitle: 'Place value and addition',
  className: 'Grade 5 Red',
  subjectName: 'Mathematics',
  academicYear: '2025-2026',
  semester: 1,
  studentName: 'Baheej Alhaj',
  studentNumber: '10',
  correctCount: 18,
  totalAnswered: 25,
  percentage: 72,
  passPercent: 50,
  generatedAt: '24 Oct 2026, 09:12',
  generatedDate: '24 Oct 2026',
  attempts: [],
  ...overrides,
});

const mcq = {
  _id: 'a1',
  questionType: 'multiple_choice',
  questionText: 'Which is the correct way to write 245,308 in words?',
  difficulty: 'easy',
  attemptNumber: 1,
  timeSpentSeconds: 38,
  isCorrect: false,
  studentAnswer: 'C',
  correctAnswer: 'B',
  options: [
    { label: 'A', text: 'Two hundred forty-five thousand, thirty-eight' },
    { label: 'B', text: 'Two hundred forty-five thousand, three hundred eight' },
    { label: 'C', text: 'Two hundred forty-five thousand, three hundred eighty' },
  ],
};

test('the sheet prints the school, the teacher and the marks the gradebook row holds', () => {
  const html = renderStudentResultReportHtml({ language: 'en', report: report() });
  assert.match(html, /<html lang="en" dir="ltr">/);
  assert.ok(html.includes('Al-Noor Academy'));
  assert.ok(html.includes('Ms Amina Saleh'));
  assert.ok(html.includes('Grade 5 Red'));
  assert.ok(html.includes('2025-2026'));
  assert.ok(html.includes('Semester 1'));
  assert.ok(html.includes('Place value and addition'));
  assert.ok(html.includes('18/25'));
  assert.ok(html.includes('72%'));
  assert.match(html, /@page\s*{\s*size: A4 portrait;/);
});

test('the sheet keeps the standard, the levels and the star rating off the paper', () => {
  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({ standardLabel: '5.NBT.A.1 - Place value' }),
  });
  assert.ok(!html.includes('5.NBT.A.1'));
  assert.ok(!html.includes('Correct answers'));
  assert.ok(!html.includes('Answered'));
  assert.ok(!html.includes('Level'));
  assert.ok(!html.includes('★★★★'));
});

test('the total score counts the questions, not the marks', () => {
  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({ correctCount: 24, totalAnswered: 25, percentage: 96 }),
  });
  assert.ok(html.includes('24/25'));
  assert.ok(html.includes('96%'));
  assert.ok(!html.includes('2.8'));
  assert.ok(!html.includes('14/100'));
});

test('a question the student never answered still counts in the total', () => {
  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({
      correctCount: 20,
      totalAnswered: 24,
      totalQuestions: 25,
      percentage: 80,
    }),
  });
  assert.ok(html.includes('20/25'));
  assert.ok(html.includes('80%'));
});

test('the score panel turns red when the student fails the paper', () => {
  const failed = renderStudentResultReportHtml({
    language: 'en',
    report: report({ correctCount: 10, totalAnswered: 25, percentage: 40 }),
  });
  assert.match(failed, /class="score-panel fail"/);

  const close = renderStudentResultReportHtml({
    language: 'en',
    report: report({ correctCount: 15, totalAnswered: 25, percentage: 60 }),
  });
  assert.match(close, /class="score-panel mid"/);

  const strong = renderStudentResultReportHtml({
    language: 'en',
    report: report({ correctCount: 23, totalAnswered: 25, percentage: 92 }),
  });
  assert.match(strong, /class="score-panel good"/);
});

test('an option list marks the student pick and the key with the card colours', () => {
  const [row] = buildAttemptRows([mcq], 'en');
  assert.equal(row.outcome, 'incorrect');
  assert.equal(row.questionText, mcq.questionText);
  assert.equal(row.studentAnswer, 'C. Two hundred forty-five thousand, three hundred eighty');
  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({ attempts: [mcq] }),
  });
  assert.ok(html.includes('class="pick-wrong">C. Two hundred forty-five thousand, three hundred eighty'));
  assert.ok(html.includes('class="key">B. Two hundred forty-five thousand, three hundred eight'));
  assert.match(html, /← student/);
  assert.match(html, /✓/);
});

test('every answer kind prints words instead of stored ids', () => {
  const attempts = [
    {
      _id: 'b1',
      questionType: 'ordering',
      questionText: 'Put these numbers in order from smallest to largest.',
      studentResponse: ['i4', 'i3', 'i2', 'i1'],
      correctAnswer: 'i1|i2|i3|i4',
      orderingItems: [
        { id: 'i1', text: '120,945' },
        { id: 'i2', text: '129,045' },
        { id: 'i3', text: '192,045' },
        { id: 'i4', text: '192,450' },
      ],
      isCorrect: false,
    },
    {
      _id: 'b2',
      questionType: 'fill_in_blank',
      questionText: '95 × 100 = {{b1}} and 52,000 ÷ 1,000 = {{b2}}.',
      studentResponse: [
        { id: 'b1', text: '9500' },
        { id: 'b2', text: '0,52000' },
      ],
      blanks: [
        { id: 'b1', accepts: ['9500', '9,500'] },
        { id: 'b2', accepts: ['52'] },
      ],
      isCorrect: false,
    },
    {
      _id: 'b3',
      questionType: 'matching',
      questionText: 'Match each calculation to its answer.',
      studentResponse: [{ left: '4500 × 10', right: '45000' }],
      matchingPairs: [{ left: '4500 × 10', right: '45000' }],
      isCorrect: true,
    },
    {
      _id: 'b4',
      questionType: 'numeric_response',
      questionText: 'What is the total length in metres?',
      studentResponse: '20,35',
      numericRule: { mode: 'exact', value: 20.35, unit: 'm' },
      teacherOverride: { isCorrect: true },
      isCorrect: false,
    },
    {
      _id: 'b5',
      questionType: 'multiple_select',
      questionText: 'Which calculations give an answer of 10,000?',
      studentAnswer: 'B',
      correctAnswer: 'A|B|D',
      options: [
        { label: 'A', text: '100 × 100' },
        { label: 'B', text: '1,000 × 10' },
        { label: 'C', text: '100,000 ÷ 100' },
        { label: 'D', text: '1,000,000 ÷ 100' },
      ],
      isCorrect: false,
    },
  ];

  const rows = buildAttemptRows(attempts, 'en');
  assert.equal(rows[0].studentAnswer, '192,450 > 192,045 > 129,045 > 120,945');
  assert.equal(rows[1].studentAnswer, 'b1: 9500; b2: 0,52000');
  assert.equal(rows[1].correctAnswer, 'b1: 9500 or 9,500; b2: 52');
  assert.equal(rows[2].studentAnswer, '4500 × 10: 45000');
  assert.equal(rows[3].correctAnswer, '20.35 m');
  assert.equal(rows[3].outcome, 'correct');
  assert.equal(rows[4].correctAnswer, 'A. 100 × 100, B. 1,000 × 10, D. 1,000,000 ÷ 100');

  const html = renderStudentResultReportHtml({ language: 'en', report: report({ attempts }) });
  assert.ok(html.includes('192,450 &gt; 192,045'));
  assert.ok(!html.includes('Teacher Override'));
});

test('a short answer waiting on review is not printed as wrong', () => {
  const attempt = {
    _id: 'c1',
    questionType: 'short_answer',
    questionText: 'In 463,729, which digit is in the thousands place?',
    studentResponse: '60,000',
    correctAnswer: '3',
    isCorrect: null,
  };
  const [row] = buildAttemptRows([attempt], 'en');
  assert.equal(row.outcome, 'review');
  assert.equal(row.outcomeLabel, 'Awaiting review');
  assert.equal(row.studentAnswer, '60,000');
  assert.equal(row.correctAnswer, '3');

  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({ attempts: [attempt] }),
  });
  assert.match(html, /class="q review"/);
  assert.ok(html.includes('Awaiting review'));
});

test('teacher text is escaped before it reaches the paper', () => {
  const attempt = {
    ...mcq,
    questionText: '<script>alert(1)</script> "quoted" & more',
  };
  const html = renderStudentResultReportHtml({ language: 'en', report: report({ attempts: [attempt] }) });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot;quoted&quot;'));
});

test('the Arabic sheet flips direction and keeps the same marks', () => {
  const html = renderStudentResultReportHtml({ language: 'ar', report: report({ attempts: [mcq] }) });
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.ok(html.includes('نتيجة اختبار الطالب'));
  assert.ok(html.includes('الدرجة الكلية'));
  assert.ok(html.includes('18/25'));
  assert.ok(html.includes('72%'));
  assert.ok(html.includes('← الطالب'));
});

test('an ungraded sheet prints dashes rather than an invented result', () => {
  const html = renderStudentResultReportHtml({
    language: 'en',
    report: report({
      correctCount: null,
      totalAnswered: null,
      percentage: null,
      attempts: [],
    }),
  });
  assert.ok(html.includes('No attempts available.'));
  assert.ok(!html.includes('Not started'));
  assert.match(html, /<strong>—<\/strong>/);
});
