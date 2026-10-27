import { PRACTICE_ORDER_SEPARATOR } from '../constants/practiceQuestionTypes.js';

/**
 * One server-rendered A4 sheet per student result, so the printed page and the screen never
 * disagree about who taught the class or what the answer key said.
 */

const LABELS = {
  en: {
    documentTitle: 'Student Test Result',
    resultSummary: 'Result summary',
    attempts: 'Question review',
    question: 'Question',
    student: 'Student',
    studentNumber: 'Student number',
    class: 'Class',
    subject: 'Subject',
    academicYear: 'Academic year',
    semester: 'Semester',
    semesterOne: 'Semester 1',
    semesterTwo: 'Semester 2',
    teacher: 'Teacher',
    score: 'Total score',
    percentage: 'Percentage',
    studentAnswer: "Student's answer",
    correctAnswer: 'Correct answer',
    studentPick: '← student',
    correctPick: '✓',
    noAttempts: 'No attempts available.',
    teacherSignature: 'Teacher signature',
    date: 'Date',
    outcome: {
      correct: 'Correct',
      incorrect: 'Needs practice',
      review: 'Awaiting review',
    },
  },
  ar: {
    documentTitle: 'نتيجة اختبار الطالب',
    resultSummary: 'ملخص النتيجة',
    attempts: 'مراجعة الأسئلة',
    question: 'السؤال',
    student: 'الطالب',
    studentNumber: 'رقم الطالب',
    class: 'الفصل',
    subject: 'المادة',
    academicYear: 'العام الدراسي',
    semester: 'الفصل الدراسي',
    semesterOne: 'الفصل الدراسي الأول',
    semesterTwo: 'الفصل الدراسي الثاني',
    teacher: 'المعلم',
    score: 'الدرجة الكلية',
    percentage: 'النسبة المئوية',
    studentAnswer: 'إجابة الطالب',
    correctAnswer: 'الإجابة الصحيحة',
    studentPick: '← الطالب',
    correctPick: '✓',
    noAttempts: 'لا توجد محاولات متاحة.',
    teacherSignature: 'توقيع المعلم',
    date: 'التاريخ',
    outcome: {
      correct: 'صحيحة',
      incorrect: 'يحتاج إلى تدريب',
      review: 'بانتظار المراجعة',
    },
  },
};

const text = (value) => String(value ?? '').trim();

const escapeHtml = (value) =>
  text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const DASH = '—';

const shown = (value) => (text(value) || DASH);

const OPTION_TYPES = ['multiple_choice', 'true_false', 'multiple_select'];

const toLabels = (value) => {
  const parts = Array.isArray(value)
    ? value.map((entry) => (entry && typeof entry === "object" ? entry.id : entry))
    : text(value).split('|');
  return parts.map((entry) => text(entry).toUpperCase()).filter(Boolean);
};

const optionText = (attempt, value) => {
  const options = Array.isArray(attempt.options) ? attempt.options : [];
  const labels = toLabels(value);
  if (!options.length || !labels.length) return text(value);
  return labels
    .map((label) => {
      const option = options.find(
        (entry) => text(entry.label).toUpperCase() === label || text(entry.text).toUpperCase() === label,
      );
      return option ? `${text(option.label)}. ${text(option.text)}` : label;
    })
    .join(', ');
};

const toRows = (value) =>
  String(value ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

const matchingText = (value) => {
  const rawPairs = Array.isArray(value)
    ? value.map((pair) => `${text(pair?.left)}::${text(pair?.right)}`)
    : toRows(value);
  if (!rawPairs.length) return '';
  return rawPairs
    .map((entry) => {
      const separator = entry.indexOf('::');
      if (separator === -1) return text(entry);
      return `${text(entry.slice(0, separator))}: ${text(entry.slice(separator + 2))}`;
    })
    .join('; ');
};

const orderingText = (attempt, value) => {
  const items = Array.isArray(attempt.orderingItems) ? attempt.orderingItems : [];
  const byId = new Map(items.map((item) => [text(item.id), text(item.text)]));
  const ids = Array.isArray(value)
    ? value.map((entry) => (entry && typeof entry === "object" ? entry.id : entry))
    : text(value).split(PRACTICE_ORDER_SEPARATOR);
  return ids
    .map((entry) => text(entry))
    .filter(Boolean)
    .map((id) => byId.get(id) || id)
    .join(' > ');
};

const blanksText = (attempt, value) => {
  const answers = new Map();
  const entries = Array.isArray(value)
    ? value
    : text(value)
        .split(';')
        .map((entry) => {
          const separator = entry.indexOf(':');
          if (separator === -1) return null;
          return { id: entry.slice(0, separator), text: entry.slice(separator + 1) };
        })
        .filter(Boolean);
  entries.forEach((entry) => {
    if (entry && typeof entry === 'object') answers.set(text(entry.id), text(entry.text));
  });
  const ids = (Array.isArray(attempt.blanks) ? attempt.blanks : []).map((blank) => text(blank.id)).filter(Boolean);
  return ids.map((id) => `${id}: ${answers.get(id) || DASH}`).join('; ') || text(value);
};

const keyBlanksText = (attempt) =>
  (Array.isArray(attempt.blanks) ? attempt.blanks : [])
    .map((blank) => {
      const accepts = Array.isArray(blank.accepts) ? blank.accepts.map((entry) => text(entry)).filter(Boolean) : [];
      return accepts.length ? `${text(blank.id)}: ${accepts.join(' or ')}` : '';
    })
    .filter(Boolean)
    .join('; ');

const numericKeyText = (attempt) => {
  const rule = attempt.numericRule;
  if (!rule) return text(attempt.correctAnswer);
  const body =
    rule.mode === 'range'
      ? `${rule.min} – ${rule.max}`
      : `${text(rule.value)}${text(rule.tolerance) ? ` ± ${rule.tolerance}${rule.mode === 'relative' ? '%' : ''}` : ''}`;
  return `${body}${text(rule.unit) ? ` ${text(rule.unit)}` : ''}`;
};

/** The same words the on-screen card shows, so the sheet never prints a raw id or a bare label. */
export const formatAttemptAnswer = (attempt, value, kind) => {
  const questionType = attempt.questionType;
  if (OPTION_TYPES.includes(questionType)) return optionText(attempt, value);
  if (questionType === 'ordering') return orderingText(attempt, value);
  if (questionType === 'fill_in_blank') {
    return kind === 'correct' ? keyBlanksText(attempt) || blanksText(attempt, value) : blanksText(attempt, value);
  }
  if (questionType === 'matching') return matchingText(value);
  if (questionType === 'numeric_response' && kind === 'correct') return numericKeyText(attempt);
  return text(value);
};

const studentResponseOf = (attempt) => attempt.studentResponse ?? attempt.studentAnswer;

export const buildAttemptRows = (attempts = [], language = 'en') => {
  const labels = LABELS[language] || LABELS.en;
  return attempts.map((attempt, index) => {
    const isCorrect = attempt.teacherOverride?.isCorrect != null ? attempt.teacherOverride.isCorrect : attempt.isCorrect;
    const studentAnswer = formatAttemptAnswer(attempt, studentResponseOf(attempt), 'student');
    const correctAnswer = formatAttemptAnswer(attempt, attempt.correctAnswer, 'correct');
    const picked = new Set(toLabels(studentResponseOf(attempt)));
    const keyed = new Set(toLabels(attempt.correctAnswer));
    const outcome =
      isCorrect === null || isCorrect === undefined ? 'review' : isCorrect ? 'correct' : 'incorrect';
    return {
      index: index + 1,
      outcome,
      outcomeLabel: labels.outcome[outcome],
      questionText: text(attempt.questionText),
      options: (Array.isArray(attempt.options) ? attempt.options : []).map((option) => ({
        label: text(option.label),
        text: text(option.text),
        isPick: picked.has(text(option.label).toUpperCase()),
        isKey: keyed.has(text(option.label).toUpperCase()),
      })),
      studentAnswer: studentAnswer || DASH,
      correctAnswer: correctAnswer || DASH,
      feedback: text(attempt.feedbackParts?.correctionOrConfirmation),
    };
  });
};

const css = () => `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eef1f4;
    color: #263238;
    font-family: Arial, "Segoe UI", sans-serif;
    font-size: 10pt;
  }
  .sheet {
    width: 210mm;
    margin: 0 auto;
    padding: 14mm;
    background: #fff;
  }
  .head { padding-bottom: 4mm; border-bottom: 2px solid #1f3a5f; text-align: center; }
  .head h1 { margin: 0; color: #1f3a5f; font-size: 18pt; }
  .head .doc-title { margin: 1.5mm 0 0; color: #6b7280; font-size: 9pt; letter-spacing: 0.08em; }
  .head .assignment-title { margin: 1.5mm 0 0; color: #1f3a5f; font-size: 12.5pt; font-weight: 700; }
  .facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3mm 5mm;
    margin-top: 4mm;
    padding: 3mm 4mm;
    border: 1px solid #e3e8ee;
    border-radius: 2mm;
    background: #f8fafc;
  }
  .fact span { display: block; color: #6b7280; font-size: 7.5pt; }
  .fact strong { font-size: 9pt; overflow-wrap: anywhere; }
  .section { margin-top: 6mm; }
  .section > h2 { margin: 0 0 2.5mm; color: #1f3a5f; font-size: 11pt; }
  .score-panel { display: flex; flex-wrap: wrap; gap: 3mm; }
  .score-panel > div {
    flex: 1 1 30%;
    min-width: 45mm;
    padding: 3mm 4mm;
    border: 1px solid #d9dee4;
    border-radius: 2mm;
    background: #f6f8fb;
  }
  .score-panel span { display: block; color: #6b7280; font-size: 7.5pt; }
  .score-panel strong { font-size: 13pt; }
  .score-panel .score-main strong { font-size: 20pt; line-height: 1.1; }
  .score-panel.fail .score-main, .score-panel.fail .score-percentage { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
  .score-panel.mid .score-main, .score-panel.mid .score-percentage { border-color: #fde68a; background: #fffbeb; color: #b45309; }
  .score-panel.good .score-main, .score-panel.good .score-percentage { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
  .q { margin-top: 3.5mm; padding: 3mm 3.5mm; border: 1px solid #e3e8ee; border-left-width: 2mm; border-radius: 2mm; break-inside: avoid; }
  /* The paper reuses the app's light-theme status tokens so a card means the same colour on both. */
  .q.correct { border-left-color: #059669; }
  .q.incorrect { border-left-color: #dc2626; }
  .q.review { border-left-color: #d97706; }
  .q-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2mm; }
  .q-no { font-weight: 700; }
  .badge { padding: 0.6mm 2.5mm; border-radius: 10mm; font-size: 8pt; font-weight: 700; }
  .correct .badge { background: rgba(5, 150, 105, 0.12); color: #059669; }
  .incorrect .badge { background: rgba(220, 38, 38, 0.1); color: #dc2626; }
  .review .badge { background: rgba(217, 119, 6, 0.1); color: #d97706; }
  .q-text { margin: 2mm 0 0; line-height: 1.45; unicode-bidi: plaintext; }
  .q-options { margin: 2mm 0 0; padding-inline-start: 6mm; list-style: none; }
  .q-options li { padding: 0.6mm 0; unicode-bidi: plaintext; }
  .q-options li.pick-correct { color: #059669; font-weight: 700; }
  .q-options li.pick-wrong { color: #dc2626; font-weight: 700; }
  .q-options li.pick-review { color: #b45309; font-weight: 700; }
  .q-options li.key { color: #059669; font-weight: 700; }
  .tag { font-weight: 400; font-style: italic; }
  .q-answer { margin: 1.6mm 0 0; font-size: 9pt; }
  .q-answer span { color: #6b7280; }
  .q-answer strong { color: #263238; font-weight: 500; }
  .q-answer.key strong { color: #059669; }
  .q-feedback { margin: 2mm 0 0; color: #6b7280; font-size: 8.5pt; font-style: italic; }
  .sign { display: flex; justify-content: space-between; gap: 10mm; margin-top: 12mm; }
  .sign div { flex: 1; padding-top: 1mm; border-top: 1px solid #9aa4b2; font-size: 8.5pt; }
  .sign span { display: block; color: #6b7280; }
  .sign em { display: block; min-height: 6mm; font-style: normal; font-weight: 700; }
  @page { size: A4 portrait; margin: 14mm; }
  @media print {
    body { background: #fff; }
    .sheet { width: 100%; margin: 0; padding: 0; }
    .facts, .score-panel > div, .badge, .q { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const fact = (label, value) =>
  `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(shown(value))}</strong></div>`;

const renderQuestion = (row, labels) => {
  const options = row.options.length
    ? `<ul class="q-options">${row.options
        .map((option) => {
          const klass = option.isPick
            ? row.outcome === 'correct'
              ? 'pick-correct'
              : row.outcome === 'incorrect'
                ? 'pick-wrong'
                : 'pick-review'
            : option.isKey
              ? 'key'
              : '';
          const marks = [
            option.isPick ? `<span class="tag">${escapeHtml(labels.studentPick)}</span>` : '',
            option.isKey && !option.isPick ? `<span class="tag">${escapeHtml(labels.correctPick)}</span>` : '',
          ].filter(Boolean).join(' ');
          return `<li class="${klass}">${escapeHtml(`${option.label}. ${option.text}`)} ${marks}</li>`;
        })
        .join('')}</ul>`
    : '';
  const showKey = row.outcome !== 'correct';
  const showFeedback = showKey && row.feedback;
  return `
    <article class="q ${row.outcome}">
      <div class="q-head">
        <span class="q-no">${escapeHtml(labels.question)} ${row.index}</span>
        <span class="badge">${escapeHtml(row.outcomeLabel)}</span>
      </div>
      <p class="q-text">${escapeHtml(row.questionText)}</p>
      ${options}
      <p class="q-answer"><span>${escapeHtml(labels.studentAnswer)}:</span> <strong>${escapeHtml(row.studentAnswer)}</strong></p>
      ${showKey ? `<p class="q-answer key"><span>${escapeHtml(labels.correctAnswer)}:</span> <strong>${escapeHtml(row.correctAnswer)}</strong></p>` : ''}
      ${showFeedback ? `<p class="q-feedback">${escapeHtml(row.feedback)}</p>` : ''}
    </article>`;
};

const scoreTone = (percentage, passPercent) => {
  const pct = Number(percentage);
  if (percentage === null || percentage === undefined || !Number.isFinite(pct)) return 'none';
  const pass = Number.isFinite(Number(passPercent)) ? Number(passPercent) : 50;
  if (pct < pass) return 'fail';
  return pct < Math.max(pass, 70) ? 'mid' : 'good';
};

export const renderStudentResultReportHtml = ({ language = 'en', report }) => {
  const labels = LABELS[language] || LABELS.en;
  const rows = buildAttemptRows(report.attempts, language);
  const isRtl = language === 'ar';

  // The printed score is the count of correct questions out of the questions on the paper,
  // so a question the student never answered still counts against the total.
  const totalQuestions = report.totalQuestions ?? report.totalAnswered;
  const scoreLabel =
    report.correctCount === null ||
    report.correctCount === undefined ||
    !Number(totalQuestions)
      ? null
      : `${report.correctCount}/${totalQuestions}`;
  const percentageLabel =
    report.percentage === null || report.percentage === undefined
      ? null
      : `${Number(report.percentage).toFixed(1).replace(/\.0$/, '')}%`;
  const semesterLabel =
    report.semester === 1
      ? labels.semesterOne
      : report.semester === 2
        ? labels.semesterTwo
        : null;
  const tone = scoreTone(report.percentage, report.passPercent);

  const facts = [
    fact(labels.student, report.studentName),
    fact(labels.studentNumber, report.studentNumber),
    fact(labels.class, report.className),
    fact(labels.subject, report.subjectName),
    fact(labels.academicYear, report.academicYear),
    fact(labels.semester, semesterLabel),
    fact(labels.teacher, report.teacherName),
  ].join('');

  const body = rows.length
    ? rows.map((row) => renderQuestion(row, labels)).join('')
    : `<p class="q-meta">${escapeHtml(labels.noAttempts)}</p>`;

  return `<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(`${labels.documentTitle} — ${report.studentName || ''}`)}</title>
<style>${css()}</style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <h1>${escapeHtml(shown(report.schoolName))}</h1>
      <p class="doc-title">${escapeHtml(labels.documentTitle)}</p>
      ${report.assignmentTitle ? `<p class="assignment-title">${escapeHtml(report.assignmentTitle)}</p>` : ''}
    </header>
    <section class="facts">${facts}</section>
    <section class="section">
      <h2>${escapeHtml(labels.resultSummary)}</h2>
      <div class="score-panel ${tone}">
        <div class="score-main"><span>${escapeHtml(labels.score)}</span><strong>${escapeHtml(shown(scoreLabel))}</strong></div>
        <div class="score-percentage"><span>${escapeHtml(labels.percentage)}</span><strong>${escapeHtml(shown(percentageLabel))}</strong></div>
      </div>
    </section>
    <section class="section"><h2>${escapeHtml(labels.attempts)}</h2>${body}</section>
    <footer class="sign">
      <div><span>${escapeHtml(labels.teacherSignature)}</span><em>${escapeHtml(shown(report.teacherName))}</em></div>
      <div><span>${escapeHtml(labels.date)}</span><em>${escapeHtml(shown(report.generatedDate))}</em></div>
    </footer>
  </div>
</body>
</html>`;
};
