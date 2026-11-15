import mongoose from 'mongoose';
import SupportCase from '../models/SupportCase.js';
import SupportPlanVersion from '../models/SupportPlanVersion.js';
import SupportReview from '../models/SupportReview.js';
import SupportSurvey from '../models/SupportSurvey.js';
import { buildCaseFilter } from './supportCaseService.js';
import { rotateRespondentCode } from './supportAccessService.js';
import { toCsv } from '../utils/vocabCsv.js';

export const REPORT_ROW_LIMIT = 2000;

const nameOf = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

const monthLabel = ({ month, academicYear }) => {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const value = Number(month);
    if (!Number.isInteger(value) || value < 1 || value > 12) return academicYear || '';
    return `${names[value - 1]} ${academicYear || ''}`.trim();
};

const classLabel = (row) => {
    const cls = row.class || row.student?.currentClass;
    if (!cls) return '';
    return [cls.name || [cls.grade, cls.section].filter(Boolean).join('-'), cls.section && cls.name ? cls.section : '']
        .filter(Boolean)
        .join(' · ');
};

const safeCell = (value) => (
    typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
);

const surveyCounts = async ({ schoolId, caseIds }) => {
    if (!caseIds.length) return new Map();
    const rows = await SupportSurvey.aggregate([
        { $match: { school: new mongoose.Types.ObjectId(String(schoolId)), case: { $in: caseIds } } },
        {
            $group: {
                _id: '$case',
                total: { $sum: 1 },
                submitted: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', ['submitted', 'skipped']] },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

const publishedVersions = async ({ schoolId, caseIds }) => {
    if (!caseIds.length) return new Map();
    const rows = await SupportPlanVersion.aggregate([
        {
            $match: {
                school: new mongoose.Types.ObjectId(String(schoolId)),
                case: { $in: caseIds },
                status: 'published',
            },
        },
        { $sort: { version: -1 } },
        {
            $group: {
                _id: '$case',
                version: { $first: '$version' },
                publishedAt: { $first: '$publishedAt' },
                headline: { $first: '$headline' },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), row]));
};

/** Same scope as the case list: the export never widens visibility. */
export const collectCaseReport = async ({ schoolId, user, academicYear = null, filters = {} }) => {
    const { query } = await buildCaseFilter({ schoolId, user, academicYear, filters });
    const rows = await SupportCase.find(query)
        .populate('student', 'firstName lastName currentClass')
        .populate({ path: 'student', populate: { path: 'currentClass', select: 'name grade section' } })
        .populate('owner', 'firstName lastName')
        .populate('class', 'name grade section')
        .sort({ nextReviewAt: 1, updatedAt: -1 })
        .limit(REPORT_ROW_LIMIT)
        .lean();
    const ids = rows.map((row) => row._id);
    const [counts, versions] = await Promise.all([
        surveyCounts({ schoolId, caseIds: ids }),
        publishedVersions({ schoolId, caseIds: ids }),
    ]);

    return {
        generatedAt: new Date(),
        truncated: rows.length === REPORT_ROW_LIMIT,
        rows: rows.map((row) => {
            const count = counts.get(String(row._id));
            const version = versions.get(String(row._id));
            return {
                student: {
                    name: nameOf(row.student),
                    grade: row.student?.currentClass?.grade ?? null,
                    class: classLabel(row),
                },
                subjects: (row.subjects || []).map((entry) => entry.name).filter(Boolean).join(' / '),
                severity: row.severity,
                status: row.status,
                owner: nameOf(row.owner),
                openedAt: row.openedAt || row.createdAt,
                lastReviewAt: row.lastReviewAt,
                nextReviewAt: row.nextReviewAt,
                surveys: {
                    total: count?.total || 0,
                    submitted: count?.submitted || 0,
                },
                plan: version
                    ? { version: version.version, publishedAt: version.publishedAt, headline: version.headline || '' }
                    : null,
            };
        }),
    };
};

const headers = [
    'Student / الطالب',
    'Grade / الصف',
    'Class / الفصل',
    'Subjects / المواد',
    'Severity / درجة الدعم',
    'Status / الحالة',
    'Owner / المسؤول',
    'Opened / فُتحت',
    'Last review / آخر مراجعة',
    'Next review / المراجعة القادمة',
    'Surveys issued / الاستبيانات',
    'Surveys answered / الإجابات',
    'Plan version / نسخة الخطة',
    'Plan published / نُشرت الخطة',
];

const dateCell = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

export const caseReportCsv = (report) => {
    const rows = report.rows.map((row) => [
        row.student.name,
        row.student.grade ?? '',
        row.student.class,
        row.subjects,
        row.severity,
        row.status,
        row.owner,
        dateCell(row.openedAt),
        dateCell(row.lastReviewAt),
        dateCell(row.nextReviewAt),
        `${row.surveys.submitted} / ${row.surveys.total}`,
        String(row.surveys.submitted),
        row.plan ? String(row.plan.version) : '',
        dateCell(row.plan?.publishedAt),
    ].map(safeCell));
    return `\uFEFF${toCsv(headers, rows)}\r\n`;
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pageShell = ({ title, schoolName, body }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:18px 20px;font-family:Montserrat,Tajawal,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.5}
  h1{margin:0;font-size:19px;font-weight:800}
  h2{margin:0 0 6px;font-size:14px;font-weight:800}
  .meta{margin:2px 0 14px;color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #cbd5e1;padding:6px 7px;text-align:start;vertical-align:top}
  th{background:#f1f5f9;font-size:10px;font-weight:800;color:#334155}
  tr{page-break-inside:avoid}
  .empty{padding:24px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;text-align:center}
  .note{margin-top:12px;color:#64748b;font-size:10px}
  @media print{body{padding:0}}
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(schoolName || '')}</p>
</header>
${body}
</body>
</html>`;

export const buildCaseReportHtml = ({ report, schoolName }) => {
    const body = report.rows.length === 0
        ? '<div class="empty">No support cases match these filters. / لا توجد حالات دعم مطابقة.</div>'
        : `<table>
  <thead><tr>${headers.map((head) => `<th>${escapeHtml(head)}</th>`).join('')}</tr></thead>
  <tbody>
    ${report.rows.map((row) => `<tr>
      <td>${escapeHtml(row.student.name)}</td>
      <td>${escapeHtml(row.student.grade ?? '')}</td>
      <td>${escapeHtml(row.student.class)}</td>
      <td>${escapeHtml(row.subjects)}</td>
      <td>${escapeHtml(row.severity)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.owner)}</td>
      <td>${escapeHtml(dateCell(row.openedAt))}</td>
      <td>${escapeHtml(dateCell(row.lastReviewAt))}</td>
      <td>${escapeHtml(dateCell(row.nextReviewAt))}</td>
      <td>${escapeHtml(`${row.surveys.submitted} / ${row.surveys.total}`)}</td>
      <td>${escapeHtml(dateCell(row.plan?.publishedAt) || '—')}</td>
      <td>${escapeHtml(row.plan ? `v${row.plan.version}` : '—')}</td>
      <td>${escapeHtml(row.plan?.headline || '')}</td>
    </tr>`).join('')}
  </tbody>
</table>
<p class="note">${report.truncated ? `Only the first ${REPORT_ROW_LIMIT} cases are shown. Narrow the filters for a complete list.` : `${report.rows.length} case(s).`}</p>`;
    return pageShell({ title: 'Student support report / تقرير الدعم', schoolName, body });
};

/* ------------------------------ printed slips ------------------------------ */

const questionBlock = (question, index) => {
    const promptEn = question.prompt || '';
    const promptAr = question.promptAr || '';
    const lines = [];
    if (question.kind === 'scale') {
        const max = Number(question.scaleMax) || 4;
        const marks = Array.from({ length: max }, (_, i) => `${i + 1} ☐`).join('&nbsp;&nbsp;');
        lines.push(`<p class="answers">${marks}</p>`);
    } else if (question.kind === 'choice') {
        const options = question.options || [];
        const optionsAr = question.optionsAr || [];
        lines.push(`<ul class="options">${options.map((option, i) => (
            `<li>☐ ${escapeHtml(option)}${optionsAr[i] ? ` <span dir="rtl">/ ${escapeHtml(optionsAr[i])}</span>` : ''}</li>`
        )).join('')}</ul>`);
    } else {
        lines.push('<div class="write-lines"><span></span><span></span><span></span></div>');
    }
    return `<section class="question">
    <p class="q"><strong>${index + 1}.</strong> ${escapeHtml(promptEn)}</p>
    ${promptAr ? `<p class="q ar" dir="rtl">${escapeHtml(promptAr)}</p>` : ''}
    ${lines.join('')}
  </section>`;
};

const slipShell = ({ title, schoolName, body }) => {
    const base = pageShell({ title, schoolName, body });
    return base.replace(
        '</style>',
        `.question{page-break-inside:avoid;margin:0 0 16px;border-bottom:1px dashed #e2e8f0;padding-bottom:12px}
  .question:last-child{border-bottom:0}
  .q{margin:0 0 6px;font-size:13px}
  .q.ar{margin:0 0 8px;color:#0f172a}
  .answers{font-family:Menlo,Consolas,monospace;font-size:13px;letter-spacing:1px}
  .options{margin:4px 0 0;padding-inline-start:0;list-style:none}
  .options li{margin:3px 0}
  .write-lines span{display:block;border-bottom:1px solid #cbd5e1;height:22px;margin-bottom:6px}
  .slip-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:10px}
  .code-box{border:2px solid #0f172a;border-radius:10px;padding:8px 12px;text-align:center}
  .code-box .label{font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#64748b}
  .code-box .code{font-family:Menlo,Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:6px}
  .help{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f8fafc;color:#334155;font-size:11px}
</style>`,
    );
};

/**
 * Paper slips for families without email. Printing rotates the code so the slip
 * carries a working code; the staff member hands it over deliberately.
 */
export const buildPrintedSlips = async ({ survey, schoolName }) => {
    const respondent = survey.respondent;
    const student = survey.student;
    const studentName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim();
    let code = '';
    if (respondent?.kind === 'parent') {
        const full = await rotateRespondentCode(respondent);
        code = full || '';
    }
    const period = monthLabel({
        month: survey.review?.month,
        academicYear: survey.review?.academicYear || student?.academicYear,
    });
    const body = slipBody({ survey, studentName, code, period, schoolName });
    return slipShell({ title: `Support survey / استبيان الدعم — ${studentName}`, schoolName, body });
};

const slipBody = ({ survey, studentName, code, period, schoolName }) => `
  <div class="slip-head">
    <div>
      <h2>${escapeHtml(studentName)}</h2>
      <p class="meta">${escapeHtml(period)} · ${escapeHtml(survey.respondentSlot || '')} · ${escapeHtml(schoolName || '')}</p>
    </div>
    ${code ? `<div class="code-box"><p class="label">Code / الرمز</p><p class="code">${escapeHtml(code)}</p></div>` : ''}
  </div>
  <p class="q">Please answer these questions and return the sheet to the school. / يرجى الإجابة عن الأسئلة وإعادة الورقة إلى المدرسة.</p>
  ${(survey.questions || []).map(questionBlock).join('')}
  <div class="help">Your answers stay with the school and help the teacher agree on the next small step. / تبقى إجاباتكم لدى المدرسة وتساعد المعلم على الاتفاق على الخطوة الصغيرة التالية.</div>`;

/** One print job for every paper family in a review; each slip starts a new page. */
export const buildPrintedSlipSheet = async ({ surveys, schoolName, title = '' }) => {
    const pages = [];
    for (const survey of surveys) {
        const respondent = survey.respondent;
        const studentName = `${survey.student?.firstName || ''} ${survey.student?.lastName || ''}`.trim();
        let code = '';
        if (respondent?.kind === 'parent') {
            const full = await rotateRespondentCode(respondent);
            code = full || '';
        }
        const period = monthLabel({
            month: survey.review?.month,
            academicYear: survey.review?.academicYear || survey.student?.academicYear,
        });
        pages.push(`<div class="slip-page">${slipBody({ survey, studentName, code, period, schoolName })}</div>`);
    }
    const body = pages.length
        ? pages.join('')
        : '<div class="empty">No family in this review needs a printed slip. / لا توجد أسرة في هذه المراجعة تحتاج إلى ورقة مطبوعة.</div>';
    const html = slipShell({ title: title || 'Support survey slips / أوراق استبيان الدعم', schoolName, body });
    return html.replace(
        '</style>',
        `.slip-page{page-break-after:always;padding-bottom:24px}
  .slip-page:last-child{page-break-after:auto}
</style>`,
    );
};

/* ------------------------------ family plan -------------------------------- */

export const buildFamilyPlanHtml = ({ version, goals, studentName, schoolName }) => {
    const body = `
  <h2>${escapeHtml(studentName)}</h2>
  <p class="meta">${escapeHtml(version.headline || '')}</p>
  ${version.headlineAr ? `<p class="meta ar" dir="rtl">${escapeHtml(version.headlineAr)}</p>` : ''}
  <p>${escapeHtml(version.summary || '')}</p>
  ${version.summaryAr ? `<p dir="rtl">${escapeHtml(version.summaryAr)}</p>` : ''}
  ${goals.map((goal) => `
    <section class="question">
      <p class="q"><strong>${escapeHtml(goal.title)}</strong></p>
      ${goal.titleAr ? `<p class="q ar" dir="rtl">${escapeHtml(goal.titleAr)}</p>` : ''}
      ${goal.description ? `<p>${escapeHtml(goal.description)}</p>` : ''}
      ${goal.descriptionAr ? `<p dir="rtl">${escapeHtml(goal.descriptionAr)}</p>` : ''}
      ${goal.successLook ? `<p><strong>What success looks like:</strong> ${escapeHtml(goal.successLook)}</p>` : ''}
      ${goal.successLookAr ? `<p dir="rtl"><strong>معنى النجاح:</strong> ${escapeHtml(goal.successLookAr)}</p>` : ''}
      ${(goal.homeTasks || []).length ? `<p><strong>At home / في المنزل</strong></p><ul class="options">${(goal.homeTasks || []).map((task) => `<li>• ${escapeHtml(task.title)}${task.titleAr ? ` / <span dir="rtl">${escapeHtml(task.titleAr)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${(goal.classTasks || []).length ? `<p><strong>In class / في الصف</strong></p><ul class="options">${(goal.classTasks || []).map((task) => `<li>• ${escapeHtml(task.title)}${task.titleAr ? ` / <span dir="rtl">${escapeHtml(task.titleAr)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    </section>`).join('')}`;
    return slipShell({ title: `Support plan / خطة الدعم — ${studentName}`, schoolName, body });
};

export const latestReviewForCase = async ({ schoolId, caseId }) => SupportReview.findOne({
    school: schoolId,
    case: caseId,
}).sort({ createdAt: -1 }).lean();
