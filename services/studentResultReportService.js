import { PRACTICE_ORDER_SEPARATOR } from '../constants/practiceQuestionTypes.js';

/**
 * One server-rendered A4 sheet per student result, so the printed page and the screen never
 * disagree about who taught the class or what the answer key said.
 */

const LABELS = {
  en: {
    documentTitle: 'Student Test Result',
    resultSummary: 'Result summary',
    attempts: 'Attempt details',
    student: 'Student',
    studentNumber: 'Student number',
    class: 'Class',
    subject: 'Subject',
    standard: 'Standard',
    assignment: 'Assignment',
    academicYear: 'Academic year',
    semester: 'Semester',
    semesterOne: 'Semester 1',
    semesterTwo: 'Semester 2',
    teacher: 'Teacher',
    generatedAt: 'Generated at',
    status: 'Status',
    score: 'Total marks',
    percentage: 'Percentage',
    level: 'Level (1-4)',
    correctAnswers: 'Correct answers',
    answered: 'Answered',
    studentAnswer: 'Student Answer',
    correctAnswer: 'Correct Answer',
    teacherMarked: 'Teacher Override',
    studentPick: '← student',
    correctPick: '✓',
    noAttempts: 'No attempts available.',
    teacherSignature: 'Teacher signature',
    date: 'Date',
    seconds: (value) => `${value}s`,
    statuses: {
      released: 'Released',
      submitted: 'Submitted',
      in_progress: 'In progress',
      not_started: 'Not started',
      needs_review: 'Needs Review',
    },
    outcome: { correct: 'Correct', incorrect: 'Incorrect' },
    difficulties: { easy: 'easy', medium: 'medium', hard: 'hard' },
    types: {
      multiple_choice: 'multiple choice',
      true_false: 'true false',
      short_answer: 'short answer',
      multiple_select: 'multiple select',
      matching: 'matching',
      ordering: 'ordering',
      fill_in_blank: 'fill in blank',
      numeric_response: 'numeric response',
    },
  },
  ar: {
    documentTitle: 'نتيجة اختبار الطالب',
    resultSummary: 'ملخص النتيجة',
    attempts: 'تفاصيل المحاولة',
    student: 'الطالب',
    studentNumber: 'رقم الطالب',
    class: 'الفصل',
    subject: 'المادة',
    standard: 'المعيار',
    assignment: 'الإسناد',
    academicYear: 'العام الدراسي',
    semester: 'الفصل الدراسي',
    semesterOne: 'الفصل الدراسي الأول',
    semesterTwo: 'الفصل الدراسي الثاني',
    teacher: 'المعلم',
    generatedAt: 'تاريخ الإنشاء',
    status: 'الحالة',
    score: 'الدرجة الكلية',
    percentage: 'النسبة المئوية',
    level: 'المستوى (4-1)',
    correctAnswers: 'الإجابات الصحيحة',
    answered: 'تمت الإجابة',
    studentAnswer: 'إجابة الطالب',
    correctAnswer: 'الإجابة الصحيحة',
    teacherMarked: 'تعديل المعلم',
    studentPick: '← الطالب',
    correctPick: '✓',
    noAttempts: 'لا توجد محاولات متاحة.',
    teacherSignature: 'توقيع المعلم',
    date: 'التاريخ',
    seconds: (value) => `${value} ثانية`,
    statuses: {
      released: 'تم الإصدار',
      submitted: 'تم التسليم',
      in_progress: 'قيد التقدم',
      not_started: 'لم يبدأ',
      needs_review: 'يحتاج مراجعة',
    },
    outcome: { correct: 'صحيحة', incorrect: 'خاطئة' },
    difficulties: { easy: 'سهل', medium: 'متوسط', hard: 'صعب' },
    types: {
      multiple_choice: 'اختيار من متعدد',
      true_false: 'صح أو خطأ',
      short_answer: 'إجابة قصيرة',
      multiple_select: 'اختيار متعدد',
      matching: 'توصيل',
      ordering: 'ترتيب',
      fill_in_blank: 'إكمال الفراغ',
      numeric_response: 'إجابة رقمية',
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
    return {
      index: index + 1,
      outcome: isCorrect === null || isCorrect === undefined ? 'review' : isCorrect ? 'correct' : 'incorrect',
      outcomeLabel:
        isCorrect === null || isCorrect === undefined
          ? labels.statuses.needs_review
          : isCorrect
            ? labels.outcome.correct
            : labels.outcome.incorrect,
      difficulty: labels.difficulties[text(attempt.difficulty).toLowerCase()] || text(attempt.difficulty),
      typeLabel: labels.types[attempt.questionType] || text(attempt.questionType).replace(/_/g, ' '),
      timeLabel:
        Number.isFinite(Number(attempt.timeSpentSeconds)) && Number(attempt.timeSpentSeconds) > 0
          ? labels.seconds(Math.round(Number(attempt.timeSpentSeconds)))
          : '',
      overridden: attempt.teacherOverride?.isCorrect != null,
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
  .head p { margin: 2mm 0 0; font-size: 12pt; font-weight: 700; }
  .meta { width: 100%; margin-top: 5mm; border-collapse: collapse; }
  .meta th, .meta td { padding: 1.8mm; border: 1px solid #d9dee4; text-align: start; font-size: 9pt; overflow-wrap: anywhere; }
  .meta th { width: 18%; color: #4b5563; background: #f6f8fb; font-weight: 600; }
  .section { margin-top: 6mm; }
  .section > h2 { margin: 0 0 2mm; color: #1f3a5f; font-size: 11pt; }
  .cards { display: flex; flex-wrap: wrap; gap: 2mm; }
  .card { flex: 1 1 28%; padding: 2.5mm; border: 1px solid #d9dee4; border-radius: 2mm; background: #f6f8fb; }
  .card span { display: block; color: #6b7280; font-size: 7.5pt; }
  .card strong { font-size: 12pt; }
  .q { margin-top: 4mm; padding: 3mm; border: 1px solid #d9dee4; border-left-width: 3mm; border-radius: 1.5mm; break-inside: avoid; }
  /* The paper reuses the app's light-theme status tokens so a card means the same colour on both. */
  .q.correct { border-left-color: #059669; }
  .q.incorrect { border-left-color: #dc2626; }
  .q.review { border-left-color: #d97706; }
  .q-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2mm; }
  .q-no { font-weight: 700; }
  .badge { padding: 0.6mm 2mm; border-radius: 10mm; font-size: 8pt; font-weight: 700; }
  .correct .badge { background: rgba(5, 150, 105, 0.12); color: #059669; }
  .incorrect .badge { background: rgba(220, 38, 38, 0.1); color: #dc2626; }
  .review .badge { background: rgba(217, 119, 6, 0.1); color: #d97706; }
  .q-meta { color: #6b7280; font-size: 8pt; }
  .q-override { color: #059669; font-size: 8pt; font-weight: 700; }
  .q-text { margin: 2mm 0 0; line-height: 1.45; }
  .q-options { margin: 2mm 0 0; padding-inline-start: 6mm; list-style: none; }
  .q-options li { padding: 0.6mm 0; }
  .q-options li.pick-correct { color: #059669; font-weight: 700; }
  .q-options li.pick-wrong { color: #dc2626; font-weight: 700; }
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
    .card, .meta th, .badge, .q { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const metaRow = (label, value) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(shown(value))}</td></tr>`;

const card = (label, value) =>
  `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(shown(value))}</strong></div>`;

const renderQuestion = (row, labels) => {
  const options = row.options.length
    ? `<ul class="q-options">${row.options
        .map((option) => {
          const klass = option.isPick ? (row.outcome === 'correct' ? 'pick-correct' : 'pick-wrong') : option.isKey ? 'key' : '';
          const marks = [
            option.isPick ? `<span class="tag">${escapeHtml(labels.studentPick)}</span>` : '',
            option.isKey && !option.isPick ? `<span class="tag">${escapeHtml(labels.correctPick)}</span>` : '',
          ].filter(Boolean).join(' ');
          return `<li class="${klass}">${escapeHtml(`${option.label}. ${option.text}`)} ${marks}</li>`;
        })
        .join('')}</ul>`
    : '';
  const meta = [row.difficulty, row.typeLabel, row.timeLabel].filter(Boolean).join(' · ');
  return `
    <article class="q ${row.outcome}">
      <div class="q-head">
        <span class="q-no">#${row.index}</span>
        <span class="badge">${escapeHtml(row.outcomeLabel)}</span>
        ${meta ? `<span class="q-meta">${escapeHtml(meta)}</span>` : ''}
        ${row.overridden ? `<span class="q-override">&#9998; ${escapeHtml(labels.teacherMarked)}</span>` : ''}
      </div>
      <p class="q-text">${escapeHtml(row.questionText)}</p>
      ${options}
      <p class="q-answer"><span>${escapeHtml(labels.studentAnswer)}:</span> <strong>${escapeHtml(row.studentAnswer)}</strong></p>
      <p class="q-answer key"><span>${escapeHtml(labels.correctAnswer)}:</span> <strong>${escapeHtml(row.correctAnswer)}</strong></p>
      ${row.feedback ? `<p class="q-feedback">${escapeHtml(row.feedback)}</p>` : ''}
    </article>`;
};

export const renderStudentResultReportHtml = ({ language = 'en', report }) => {
  const labels = LABELS[language] || LABELS.en;
  const rows = buildAttemptRows(report.attempts, language);
  const isRtl = language === 'ar';

  // The sheet never restates a mark the gradebook table would not have shown for the same row.
  const scoreLabel =
    report.kind === 'practice'
      ? `${report.correctCount ?? 0}/${report.totalAnswered ?? 0}`
      : report.score === null || report.score === undefined
        ? null
        : `${report.score}/${report.maxScore || 100}`;
  const semesterLabel =
    report.semester === 1
      ? labels.semesterOne
      : report.semester === 2
        ? labels.semesterTwo
        : null;

  const summary = [
    card(labels.status, labels.statuses[report.status] || report.status),
    card(labels.score, scoreLabel),
    card(labels.percentage, report.percentage == null ? null : `${report.percentage}%`),
    card(labels.level, report.scale4),
    card(labels.correctAnswers, report.correctCount),
    card(labels.answered, report.totalAnswered),
  ].join('');

  const identity = [
    metaRow(labels.student, report.studentName),
    metaRow(labels.studentNumber, report.studentNumber),
    metaRow(labels.class, report.className),
    metaRow(labels.subject, report.subjectName),
    metaRow(labels.standard, report.standardLabel),
    metaRow(labels.assignment, report.assignmentTitle),
    metaRow(labels.academicYear, report.academicYear),
    metaRow(labels.semester, semesterLabel),
    metaRow(labels.teacher, report.teacherName),
    metaRow(labels.generatedAt, report.generatedAt),
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
      <p>${escapeHtml(labels.documentTitle)}</p>
    </header>
    <table class="meta"><tbody>${identity}</tbody></table>
    <section class="section"><h2>${escapeHtml(labels.resultSummary)}</h2><div class="cards">${summary}</div></section>
    <section class="section"><h2>${escapeHtml(labels.attempts)}</h2>${body}</section>
    <footer class="sign">
      <div><span>${escapeHtml(labels.teacherSignature)}</span><em>${escapeHtml(shown(report.teacherName))}</em></div>
      <div><span>${escapeHtml(labels.date)}</span><em>${escapeHtml(shown(report.generatedDate))}</em></div>
    </footer>
  </div>
</body>
</html>`;
};
