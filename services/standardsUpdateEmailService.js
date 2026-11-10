import { escapeHtml } from '../helpers/spellingEmailLayout.js';

/**
 * Standards update email for students and their families.
 *
 * Layout and palette mirror the approved family shell: the shared dark header
 * (#0f172a) with the course name under the school name, three equal KPI tiles,
 * and the released results. Wide screens get the four-column table; at 480px
 * and below each result becomes a stacked card (title on top, label/value rows,
 * mastery-coloured mark badge). No portal CTA — the email is the deliverable.
 */

// Exact light-theme mastery colours from StandardsGradebookPage.css.
const MARK_COLORS = {
  4: '#166534',
  3: '#15803d',
  2: '#a16207',
  1: '#b91c1c',
  0: '#475569',
};

const MARK_TINTS = {
  4: '#f0fdf4',
  3: '#f0fdf4',
  2: '#fefce8',
  1: '#fef2f2',
  0: '#f8fafc',
};

const COPY = {
  en: {
    lang: 'en',
    dir: 'ltr',
    align: 'left',
    edge: 'left',
    title: 'Standards update',
    kpiAverage: 'Avg score',
    kpiStandards: 'Standards',
    kpiAssessments: 'Assessments',
    colTitle: 'Title',
    colStandard: 'Standard',
    colDate: 'Date',
    colMark: 'Mark',
    teacherMark: 'Teacher mark',
    manualTitle: 'Teacher assessment',
    privacy: 'This update is confidential and intended for the parent, guardian or student only.',
    defaultTeacher: 'Teacher',
    greeting: 'Hello,',
    standardWord: 'Standard',
    summaryWord: 'Summary',
  },
  ar: {
    lang: 'ar',
    dir: 'rtl',
    align: 'right',
    edge: 'right',
    title: 'تحديث معايير التعلّم',
    kpiAverage: 'متوسط الدرجة',
    kpiStandards: 'المعايير',
    kpiAssessments: 'التقييمات',
    colTitle: 'العنوان',
    colStandard: 'المعيار',
    colDate: 'التاريخ',
    colMark: 'الدرجة',
    teacherMark: 'درجة المعلمة',
    manualTitle: 'تقييم المعلم',
    privacy: 'هذا التحديث سري ومخصص لولي الأمر أو الطالب فقط.',
    defaultTeacher: 'المعلم',
    greeting: 'مرحبًا،',
    standardWord: 'المعيار',
    summaryWord: 'الملخص',
  },
};

const PERIOD_LABELS = {
  en: { 1: 'Semester 1', 2: 'Semester 2', full: 'Full year' },
  ar: { 1: 'الفصل الأول', 2: 'الفصل الثاني', full: 'السنة الدراسية' },
};

export const resolveStandardsUpdateLanguage = (student) => {
  const preference = String(student?.reportPreferences?.language || '').toLowerCase();
  return preference === 'arabic' ? 'ar' : 'en';
};

export const standardsMasteryLevel = (score) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(4, Math.round(value)));
};

export const formatScaleScore = (score) => {
  const value = Number(score);
  if (!Number.isFinite(value)) return '0';
  const clamped = Math.max(0, Math.min(4, value));
  return String(Math.round(clamped * 100) / 100);
};

export const standardsUpdatePeriodLabel = (semester, language = 'en') => {
  const labels = PERIOD_LABELS[language === 'ar' ? 'ar' : 'en'];
  if (semester === 1 || semester === 2) return labels[semester];
  return labels.full;
};

/**
 * An entry belongs in the next update when it has never been emailed, or when
 * the released result changed after the last send.
 */
export const isStandardsUpdateEntryPending = (entry) => {
  if (!entry) return false;
  if (!entry.lastEmailedAt) return true;
  const lastSent = new Date(entry.lastEmailedAt).getTime();
  if (!Number.isFinite(lastSent)) return true;
  const changedAt = new Date(entry.updatedAt || entry.lastEmailedAt).getTime();
  if (!Number.isFinite(changedAt)) return false;
  return changedAt > lastSent;
};

export const selectStandardsUpdateEntries = (entries = [], includeAll = false) =>
  includeAll ? entries : entries.filter(isStandardsUpdateEntryPending);

const MANUAL_ASSIGNMENT_TITLE = 'manual assessment';

export const buildStandardsUpdateRow = ({ entry, assignment = null, standard = null, language = 'en' }) => {
  const copy = COPY[language === 'ar' ? 'ar' : 'en'];
  const isManual = Boolean(entry?.isManualEntry);
  let score = Number(entry?.effectiveScore);
  if (!Number.isFinite(score)) {
    if (entry?.manualScore !== null && entry?.manualScore !== undefined) {
      score = Number(entry.manualScore);
    } else if (Number.isFinite(Number(entry?.percentage))) {
      score = (Number(entry.percentage) / 100) * 4;
    }
  }

  const rawTitle = String(assignment?.title || '').trim();
  const standardLabel = String(
    standard?.name || standard?.description || standard?.code || '',
  ).trim();
  const title = rawTitle && rawTitle.toLowerCase() !== MANUAL_ASSIGNMENT_TITLE
    ? rawTitle
    : isManual
      ? copy.manualTitle
      : standardLabel || copy.manualTitle;
  const date = assignment?.dueDate
    || assignment?.assignedDate
    || entry?.manualEnteredAt
    || entry?.releasedAt
    || entry?.submittedAt
    || entry?.updatedAt
    || null;
  const percentage = isManual
    ? null
    : Number.isFinite(Number(entry?.percentage))
      ? Number(entry.percentage)
      : null;

  return {
    title,
    date,
    standard: standardLabel,
    standardId: String(standard?._id || entry?.standard || ''),
    score: Number.isFinite(score) ? score : 0,
    percentage,
    isManual,
  };
};

const formatDate = (value, language) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatAcademicYear = (academicYear) =>
  String(academicYear || '').trim().replace(/-/g, '\u2013');

const studentDisplayName = (student, language) => {
  const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
  return name || (language === 'ar' ? 'الطالب' : 'Student');
};

export const standardsUpdateAveragePercentage = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const hasPercentage = (row) =>
    row?.percentage !== null
    && row?.percentage !== undefined
    && Number.isFinite(Number(row.percentage));
  const withPercentage = list.filter(hasPercentage);
  if (withPercentage.length) {
    const total = withPercentage.reduce((sum, row) => sum + Number(row.percentage), 0);
    return Math.round(total / withPercentage.length);
  }
  const hasScore = (row) =>
    row?.score !== null
    && row?.score !== undefined
    && Number.isFinite(Number(row.score));
  const withScore = list.filter(hasScore);
  if (!withScore.length) return null;
  const total = withScore.reduce((sum, row) => sum + (Number(row.score) / 4) * 100, 0);
  return Math.round(total / withScore.length);
};

const normalizeRows = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const rawScore = Number(row?.score);
      const score = Number.isFinite(rawScore) ? rawScore : 0;
      const percentage = row?.percentage === null || row?.percentage === undefined
        ? null
        : Number.isFinite(Number(row.percentage))
          ? Number(row.percentage)
          : null;
      return {
        title: String(row.title || '').trim(),
        date: row.date || null,
        standard: String(row.standard || '').trim(),
        score,
        percentage,
        isManual: Boolean(row.isManual),
        standardKey: String(row.standardId || row.standard || ''),
        level: standardsMasteryLevel(score),
      };
    })
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return left.title.localeCompare(right.title);
    });

const markCell = (row, copy) => {
  if (row.isManual) {
    return `<span style="font-size:16px;line-height:1.5;font-weight:700;color:#475569;">${escapeHtml(copy.teacherMark)}</span>`;
  }
  const color = MARK_COLORS[row.level] || MARK_COLORS[0];
  const value = row.percentage !== null ? `${Math.round(row.percentage)}%` : '\u2014';
  return `<span dir="ltr" style="font-size:16px;line-height:1.5;font-weight:800;color:${color};unicode-bidi:isolate;white-space:nowrap;">${escapeHtml(value)}</span>`;
};

const markBadge = (row, copy) => {
  if (row.isManual) {
    return `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background-color:#f1f5f9;font-size:16px;line-height:1.4;font-weight:700;color:#475569;">${escapeHtml(copy.teacherMark)}</span>`;
  }
  const color = MARK_COLORS[row.level] || MARK_COLORS[0];
  const tint = MARK_TINTS[row.level] || MARK_TINTS[0];
  const value = row.percentage !== null ? `${Math.round(row.percentage)}%` : '\u2014';
  return `<span dir="ltr" style="display:inline-block;padding:6px 12px;border-radius:999px;background-color:${tint};font-size:16px;line-height:1.4;font-weight:800;color:${color};unicode-bidi:isolate;white-space:nowrap;">${escapeHtml(value)}</span>`;
};

const resultsTable = (rows, copy) => {
  if (!rows.length) return '';
  const opposite = copy.align === 'left' ? 'right' : 'left';
  const headCell = (label, width, align) =>
    `<td class="em-th" width="${width}" style="padding:10px 12px;font-size:14px;line-height:1.4;letter-spacing:${copy.lang === 'ar' ? '0' : '.6px'};text-transform:uppercase;color:#64748b;font-weight:700;text-align:${align};">${escapeHtml(label)}</td>`;
  const body = rows
    .map((row, index) => {
      const zebra = index % 2 === 1 ? '#f8fafc' : '#ffffff';
      const cell = 'padding:12px;border-top:1px solid #e2e8f0;vertical-align:top;';
      return `
                <tr bgcolor="${zebra}">
                  <td class="em-td" style="${cell}font-size:16px;line-height:1.5;font-weight:700;color:#0f172a;text-align:${copy.align};">${escapeHtml(row.title)}</td>
                  <td class="em-td" style="${cell}font-size:16px;line-height:1.5;color:#475569;text-align:${copy.align};">${escapeHtml(row.standard)}</td>
                  <td class="em-td" style="${cell}font-size:16px;line-height:1.5;color:#475569;text-align:${copy.align};white-space:nowrap;">${escapeHtml(formatDate(row.date, copy.lang))}</td>
                  <td class="em-td" style="${cell}text-align:${opposite};">${markCell(row, copy)}</td>
                </tr>`;
    })
    .join('');
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-results-desktop" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <tr bgcolor="#f1f5f9">
                  ${headCell(copy.colTitle, '32%', copy.align)}
                  ${headCell(copy.colStandard, '28%', copy.align)}
                  ${headCell(copy.colDate, '24%', copy.align)}
                  ${headCell(copy.colMark, '16%', opposite)}
                </tr>${body}
              </table>`;
};

// Stacked cards for narrow screens; toggled with the desktop table at 480px.
const resultsCards = (rows, copy) => {
  if (!rows.length) return '';
  const opposite = copy.align === 'left' ? 'right' : 'left';
  const labelStyle = `padding:8px 16px 0;font-size:14px;line-height:1.5;color:#64748b;font-weight:600;text-align:${copy.align};white-space:nowrap;vertical-align:top;`;
  const valueStyle = `padding:8px 16px 0;font-size:16px;line-height:1.5;color:#334155;text-align:${copy.align};vertical-align:top;`;
  return rows
    .map((row, index) => `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;${index > 0 ? 'margin-top:12px;' : ''}">
                <tr>
                  <td colspan="2" style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:16px;line-height:1.5;font-weight:700;color:#0f172a;text-align:${copy.align};">${escapeHtml(row.title)}</td>
                </tr>
                ${row.standard ? `<tr>
                  <td width="90" style="${labelStyle}">${escapeHtml(copy.colStandard)}</td>
                  <td style="${valueStyle}">${escapeHtml(row.standard)}</td>
                </tr>` : ''}
                <tr>
                  <td width="90" style="${labelStyle}">${escapeHtml(copy.colDate)}</td>
                  <td style="${valueStyle}">${escapeHtml(formatDate(row.date, copy.lang))}</td>
                </tr>
                <tr>
                  <td width="90" style="${labelStyle}padding-bottom:14px;">${escapeHtml(copy.colMark)}</td>
                  <td style="${valueStyle}padding-bottom:14px;text-align:${opposite};">${markBadge(row, copy)}</td>
                </tr>
              </table>`)
    .join('');
};

const textVersion = ({ copy, schoolName, courseLabel, teacherName, teacherRole, studentName, className, periodLabel, average, standardsCount, rows }) => {
  const lines = [
    `${copy.title.toUpperCase()} \u2014 ${periodLabel}`,
    schoolName,
    ...(courseLabel ? [courseLabel] : []),
    className ? `${studentName} \u00b7 ${className}` : studentName,
    '',
    copy.greeting,
    '',
    `${copy.summaryWord}: ${average === null ? '\u2014' : `${average}%`} \u00b7 ${standardsCount} ${copy.kpiStandards} \u00b7 ${rows.length} ${copy.kpiAssessments}`,
    '',
  ];

  rows.forEach((row, index) => {
    const dateLabel = formatDate(row.date, copy.lang);
    const mark = row.isManual
      ? copy.teacherMark
      : row.percentage !== null
        ? `${Math.round(row.percentage)}%`
        : '\u2014';
    lines.push(`${index + 1}. ${row.title}${dateLabel ? ` \u2014 ${dateLabel}` : ''}`);
    const detail = [
      row.standard ? `${copy.standardWord}: ${row.standard}` : '',
      `${copy.colMark}: ${mark}`,
    ].filter(Boolean).join(' \u00b7 ');
    lines.push(`   ${detail}`);
    lines.push('');
  });

  lines.push(
    teacherName,
    teacherRole,
    schoolName,
    '',
    copy.privacy,
  );
  return lines.join('\n');
};

export const buildStandardsUpdateEmail = ({
  student,
  schoolName,
  courseName = '',
  sender = {},
  className = '',
  semester = null,
  academicYear = '',
  rows = [],
  generatedAt = new Date(),
}) => {
  const language = resolveStandardsUpdateLanguage(student);
  const copy = COPY[language];
  const studentName = studentDisplayName(student, language);
  const normalizedRows = normalizeRows(rows);
  const periodLabel = standardsUpdatePeriodLabel(semester, language);
  const yearLabel = formatAcademicYear(academicYear);
  const chip = yearLabel ? `${periodLabel} \u00b7 ${yearLabel}` : periodLabel;
  const courseLabel = String(courseName || '').trim() || copy.title;
  const teacherName = String(sender.name || '').trim() || copy.defaultTeacher;
  const teacherRole = String(sender.roleLabel || '').trim() || copy.defaultTeacher;
  const average = standardsUpdateAveragePercentage(normalizedRows);
  const standardsCount = new Set(
    normalizedRows.map((row) => row.standardKey).filter(Boolean),
  ).size;

  const subject = language === 'ar'
    ? `${copy.title}: ${studentName} \u2014 ${periodLabel}`
    : `${copy.title} for ${studentName} \u2014 ${periodLabel}`;
  const preheader = `${studentName} \u00b7 ${periodLabel}`;

  const kpis = [
    { value: average === null ? '\u2014' : `${average}%`, label: copy.kpiAverage },
    { value: String(standardsCount), label: copy.kpiStandards },
    { value: String(normalizedRows.length), label: copy.kpiAssessments },
  ]
    .map(
      (item, index) => `
                  <td width="33.33%" valign="top" style="padding:0;${index > 0 ? `padding-${copy.edge}:8px;` : ''}${index < 2 ? `padding-${copy.edge === 'left' ? 'right' : 'left'}:8px;` : ''}">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                      <tr>
                        <td align="center" valign="top" height="88" style="height:88px;padding:18px 6px;">
                          <div class="em-kpi-value" style="font-size:22px;line-height:1.2;font-weight:700;color:#0f766e;">${escapeHtml(item.value)}</div>
                          <div style="font-size:14px;line-height:1.4;color:#64748b;font-weight:700;margin-top:5px;">${escapeHtml(item.label)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>`,
    )
    .join('');

  const table = resultsTable(normalizedRows, copy);
  const cards = resultsCards(normalizedRows, copy);

  const chipHtml = language === 'ar' && yearLabel
    ? `${escapeHtml(periodLabel)} \u00b7 <span dir="ltr" style="unicode-bidi:isolate;">${escapeHtml(yearLabel)}</span>`
    : escapeHtml(chip);
  const courseHtml = language === 'ar'
    && /[A-Za-z]/.test(courseLabel)
    && !/[\u0600-\u06FF]/.test(courseLabel)
    ? `<span dir="ltr" style="unicode-bidi:isolate;">${escapeHtml(courseLabel)}</span>`
    : escapeHtml(courseLabel);

  const html = `<!DOCTYPE html>
<html lang="${language}" dir="${copy.dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(copy.title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, h1 { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0 !important; padding: 0 !important; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif; }
    table { border-collapse: collapse !important; }
    @media only screen and (max-width: 600px) {
      .em-shell { padding: 16px 8px !important; }
      .em-header { padding: 22px 18px !important; }
      .em-title { font-size: 20px !important; }
      .em-pad { padding-left: 18px !important; padding-right: 18px !important; }
      .em-kpi-value { font-size: 20px !important; }
    }
    @media only screen and (max-width: 480px) {
      .em-results-desktop { display: none !important; }
      .em-results-mobile { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,Arial,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f1f5f9;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" dir="${copy.dir}" class="em-shell" style="background-color:#f1f5f9;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #0f766e;border-radius:16px;overflow:hidden;">

          <tr>
            <td bgcolor="#0f172a" class="em-header" style="background-color:#0f172a;padding:26px 24px;text-align:${copy.align};">
              <div style="font-size:14px;line-height:1.5;font-weight:700;${language === 'ar' ? '' : 'letter-spacing:1.2px;text-transform:uppercase;'}color:#5eead4;text-align:${copy.align};">${escapeHtml(schoolName)}</div>
              <h1 class="em-title" style="margin:8px 0 0;font-size:22px;line-height:1.35;color:#ffffff;font-weight:700;text-align:${copy.align};">${courseHtml}</h1>
              <div style="margin-top:13px;text-align:${copy.align};">
                <span style="display:inline-block;padding:5px 14px;border-radius:999px;background-color:#0f766e;color:#ecfeff;font-size:14px;line-height:1.6;font-weight:600;">${chipHtml}</span>
              </div>
              <div style="margin-top:10px;font-size:16px;line-height:1.6;color:#cbd5e1;text-align:${copy.align};">${escapeHtml(className ? `${studentName} \u00b7 ${className}` : studentName)}</div>
            </td>
          </tr>

          <tr>
            <td class="em-pad" style="padding:20px 24px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>${kpis}</tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="em-pad" style="padding:18px 24px 0;">
              ${table}
              <div class="em-results-mobile" style="display:none;">${cards}</div>
            </td>
          </tr>

          <tr>
            <td class="em-pad" style="padding:24px 24px 26px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0;">
                <tr>
                  <td style="padding-top:16px;text-align:${copy.align};">
                    <div style="font-size:16px;line-height:1.4;font-weight:700;color:#0f172a;">${escapeHtml(teacherName)}</div>
                    <div style="font-size:14px;line-height:1.5;color:#64748b;margin-top:3px;">${escapeHtml(teacherRole)}</div>
                    <div style="font-size:14px;line-height:1.5;color:#94a3b8;margin-top:2px;">${escapeHtml(schoolName)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
              <div style="font-size:14px;line-height:1.5;color:#64748b;font-weight:600;">${escapeHtml(schoolName)}</div>
              <div style="font-size:14px;line-height:1.6;color:#94a3b8;margin-top:5px;">${escapeHtml(copy.privacy)}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = textVersion({
    copy,
    schoolName,
    courseLabel: String(courseName || '').trim(),
    teacherName,
    teacherRole,
    studentName,
    className,
    periodLabel,
    average,
    standardsCount,
    rows: normalizedRows,
  });

  return {
    subject,
    text,
    html,
    language,
    averagePercentage: average,
    assessmentCount: normalizedRows.length,
    standardsCount,
    generatedAt,
  };
};

export default { buildStandardsUpdateEmail };
