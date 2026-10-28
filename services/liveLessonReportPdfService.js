import puppeteer from "puppeteer";
import { resolvePuppeteerExecutablePath } from "../utils/resolvePuppeteerExecutablePath.js";

let browserPromise;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await resolvePuppeteerExecutablePath();
      return puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        ...(executablePath ? { executablePath } : {}),
      });
    })().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

const formatDateTime = (value) => value ? new Date(value).toLocaleString("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}) : "—";

const formatDate = (value) => {
  if (!value) return "—";
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { dateStyle: "medium" });
};

const LIVE_RESULT_LABELS = {
  correct: "Correct",
  partial: "Partially correct",
  wrong: "Incorrect",
  // A written answer nobody has read yet. It is never printed as incorrect.
  pending: "To mark",
};

const ANSWER_STATUS_LABELS = {
  unanswered: "Not answered",
  not_present: "Not present",
  not_opened: "Not opened",
  pending: "Not answered yet",
};

const resultLabel = (answer) => (
  answer.status === "answered"
    ? LIVE_RESULT_LABELS[answer.result] || "—"
    : ANSWER_STATUS_LABELS[answer.status] || "—"
);

const marksLabel = (answer) => (
  answer.marks == null ? "—" : `${answer.marks}${answer.maxMarks == null ? "" : ` / ${answer.maxMarks}`}`
);

// Accuracy only speaks for answers that have a verdict. A dash keeps an unmarked stack from
// reading as a class that answered wrongly.
const accuracyLabel = (rate, marked) => (marked ? `${rate}%` : "—");

const sessionAccuracy = (perQuestion = []) => {
  let marked = 0;
  let credit = 0;
  for (const question of perQuestion) {
    const graded = Math.max(0, (question.answered || 0) - (question.pending || 0));
    marked += graded;
    credit += (question.percentCorrect || 0) * graded;
  }
  return { marked, rate: marked ? Math.round(credit / marked) : 0 };
};

const kpiRow = (entries) => `<div class="kpis">${entries.map(([label, value, alert]) => `
  <div class="kpi${alert ? " alert" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
`).join("")}</div>`;

const sectionHead = (title, note = "") => `
  <div class="section-head">
    <div><h2>${escapeHtml(title)}</h2>${note ? `<p>${escapeHtml(note)}</p>` : ""}</div>
  </div>
`;

const facts = (entries) => `<dl class="facts">${entries.map(([label, value]) => `
  <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
`).join("")}</dl>`;

const cover = ({ eyebrow, title, meta = [], badge = "" }) => `
  <header class="cover">
    <div class="cover-top">
      <div>
        <div class="eyebrow">${escapeHtml(eyebrow)}</div>
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}
    </div>
    ${meta.map((line) => `<p class="meta">${escapeHtml(line)}</p>`).join("")}
  </header>
`;

/**
 * A levelled slide asks each group a different question, so its blended accuracy would describe no
 * one. One row per level keeps each group's own key, counts and accuracy visible.
 */
const questionRows = (perQuestion) => perQuestion.flatMap((question, index) => {
  const levels = question.levels || [null];
  return levels.map((level) => {
    const counts = level || question;
    const marked = Math.max(0, (counts.answered || 0) - (counts.pending || 0));
    return `
      <tr>
        <td class="index">${index + 1}</td>
        <td>${escapeHtml([
    question.title,
    counts.prompt || question.prompt,
    level?.level && `Level: ${level.level}`,
  ].filter(Boolean).join(" · "))}</td>
        <td class="num">${counts.answered || 0}</td>
        <td class="num">${counts.correct || 0}</td>
        <td class="num">${counts.partial || 0}</td>
        <td class="num">${counts.pending || 0}</td>
        <td class="num">${marked ? `${counts.percentCorrect || 0}%` : "—"}</td>
      </tr>
    `;
  });
});

const studentSheet = (student, { className, lessonTitle, dateLabel, questionCount, first = false }) => {
  const visibilityCount = (student.presenceEvents || []).filter((event) => (
    event.reason === "visibility_hidden" || event.reason === "visibility_visible"
  )).length;
  const marked = (student.correct || 0) + (student.partial || 0) + (student.wrong || 0);
  return `
    <section class="student-sheet${first ? " first" : ""}">
      <div class="student-head">
        <div><div class="eyebrow">STUDENT REPORT</div><h2>${escapeHtml(student.name)}</h2></div>
        <div class="student-head-meta"><strong>${escapeHtml(className)}</strong><span>${escapeHtml(lessonTitle)}</span><span>${escapeHtml(dateLabel)}</span></div>
      </div>
      <div class="chips">
        <span class="chip">${student.joined ? "Present" : "Absent"}</span>
        <span class="chip">Answered ${student.answered || 0} of ${questionCount || 0}</span>
        <span class="chip">Correct ${student.correct || 0}</span>
        <span class="chip">To mark ${student.toMark || 0}</span>
        <span class="chip">Score ${accuracyLabel(student.scorePercent || 0, marked)}</span>
        <span class="chip">Away ${student.totalAwaySeconds || 0}s</span>
      </div>
      <table class="data">
        <thead><tr><th class="index">#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Result</th><th class="num">Marks</th></tr></thead>
        <tbody>${(student.answerDetails || []).map((answer) => `
          <tr>
            <td class="index">${answer.questionNumber || ""}</td>
            <td>${escapeHtml([answer.title, answer.prompt, answer.level && `Level: ${answer.level}`].filter(Boolean).join(" · "))}</td>
            <td>${escapeHtml(answer.selectedAnswer || "—")}</td>
            <td>${escapeHtml(answer.correctAnswer || "—")}</td>
            <td>${escapeHtml(resultLabel(answer))}</td>
            <td class="num">${escapeHtml(marksLabel(answer))}</td>
          </tr>
        `).join("") || "<tr><td colspan='6'>No questions were included in this session.</td></tr>"}</tbody>
      </table>
      ${visibilityCount ? `<p class="note">Tab visibility signals: ${visibilityCount}. These are browser events only and do not establish why a student left the lesson tab.</p>` : ""}
    </section>
  `;
};

const renderSessionReport = (report, studentIds) => {
  const students = (report.perStudent || []).filter((student) => (
    !studentIds.length || studentIds.includes(String(student.studentId))
  ));
  const perQuestion = report.perQuestion || [];
  const className = report.session?.class?.name || "Class";
  const lessonTitle = report.session?.title || "Live lesson";
  const dateLabel = report.session?.startedAt ? formatDate(report.session.startedAt) : "—";
  const rosterCount = report.summary?.rosterCount || 0;
  const joinedCount = report.summary?.joinedCount || 0;
  const presentedQuestions = report.summary?.presentedQuestionCount || 0;
  const answers = report.summary?.submittedAnswers || 0;
  const toMark = report.summary?.awaitingMarks || 0;
  const accuracy = sessionAccuracy(perQuestion);
  const participating = students.filter((student) => (student.answered || 0) > 0).length;
  const awayMinutes = Math.round(
    (report.perStudent || []).reduce((total, student) => total + (student.totalAwaySeconds || 0), 0) / 60,
  );
  const studentOnly = Boolean(studentIds.length);
  const sessionPeriod = report.session?.endedAt
    ? `${formatDateTime(report.session.startedAt)} — ${formatDateTime(report.session.endedAt)}`
    : report.session?.startedAt
      ? `Started ${formatDateTime(report.session.startedAt)}`
      : "Not started";
  const sheets = students.map((student, index) => studentSheet(student, {
    className,
    lessonTitle,
    dateLabel,
    questionCount: report.summary?.questionCount || 0,
    first: studentOnly && index === 0,
  })).join("");

  const classContent = `
    ${kpiRow([
    ["Students", rosterCount],
    ["Joined", `${joinedCount}${rosterCount ? ` · ${Math.round((joinedCount / rosterCount) * 100)}%` : ""}`],
    ["Questions", report.summary?.questionCount || 0],
    ["Answers", answers],
    ["To mark", toMark, toMark > 0],
  ])}
    <section>
      ${sectionHead("Session summary", "Attendance, answering and marking for this lesson.")}
      <div class="summary-grid">
        <div class="summary-card">
          <h3>Participation</h3>
          ${facts([
    ["Joined the lesson", `${joinedCount} of ${rosterCount}`],
    ["Answered at least once", `${participating} of ${rosterCount}`],
    ["Answers submitted", `${answers} of ${rosterCount * presentedQuestions}`],
    ["Time away across the class", `${awayMinutes} min`],
  ])}
        </div>
        <div class="summary-card">
          <h3>Marking</h3>
          ${facts([
    ["Answers to mark", String(toMark)],
    ["Accuracy of marked answers", accuracyLabel(accuracy.rate, accuracy.marked)],
    ["Questions presented", `${presentedQuestions} of ${report.summary?.questionCount || 0}`],
  ])}
        </div>
      </div>
    </section>
    <section>
      ${sectionHead("Question results", "How the class answered each check for understanding.")}
      <table class="data">
        <thead><tr><th class="index">#</th><th>Question</th><th class="num">Answered</th><th class="num">Correct</th><th class="num">Partial</th><th class="num">To mark</th><th class="num">Accuracy</th></tr></thead>
        <tbody>${questionRows(perQuestion).join("") || "<tr><td colspan='7'>No question slides were included.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      ${sectionHead("Student participation", "Joined, answered and scored for every student on the session roster.")}
      <table class="data">
        <thead><tr><th>Student</th><th>Joined</th><th class="num">Answered</th><th class="num">Correct</th><th class="num">To mark</th><th class="num">Score</th><th class="num">Away</th></tr></thead>
        <tbody>${students.map((student) => {
    const verdicts = (student.correct || 0) + (student.partial || 0) + (student.wrong || 0);
    return `
          <tr>
            <td>${escapeHtml(student.name)}</td>
            <td>${student.joined ? "Yes" : "No"}</td>
            <td class="num">${student.answered || 0}</td>
            <td class="num">${student.correct || 0}</td>
            <td class="num">${student.toMark || 0}</td>
            <td class="num">${accuracyLabel(student.scorePercent || 0, verdicts)}</td>
            <td class="num">${student.totalAwaySeconds || 0}s</td>
          </tr>
        `;
  }).join("") || "<tr><td colspan='7'>No students were included in this session roster.</td></tr>"}</tbody>
      </table>
      <p class="note">A written answer stays “To mark” until a teacher marks it. It is never counted as incorrect.</p>
    </section>
  `;

  return `
    ${cover({
    eyebrow: "LIVE LESSON REPORT",
    title: lessonTitle,
    badge: report.session?.status === "live" ? "In progress" : "Completed",
    meta: [
      `${className} · ${report.session?.subject || "Subject not set"}`,
      sessionPeriod,
    ],
  })}
    ${studentOnly
    ? `<p class="note">Selected students: ${students.length} of ${report.perStudent?.length || 0}.</p>${sheets}`
    : `${classContent}${sheets}`}
  `;
};

const renderPerformanceReport = (report, studentIds) => {
  const students = (report.students || []).filter((student) => (
    !studentIds.length || studentIds.includes(String(student.studentId))
  ));
  const className = report.class?.name || "Class";
  const sessions = report.sessions || [];
  return `
    ${cover({
    eyebrow: "CLASS PERFORMANCE & ENGAGEMENT",
    title: className,
    badge: studentIds.length ? `${students.length} students` : "",
    meta: [`${formatDate(report.dateFrom)} — ${formatDate(report.dateTo)}`],
  })}
    ${kpiRow([
    ["Sessions", report.summary?.sessionCount || 0],
    ["Attendance", `${report.summary?.averageAttendanceRate || 0}%`],
    ["Answered at least once", `${report.summary?.participationRate || 0}%`],
    ["Answer completion", `${report.summary?.averageEngagementRate || 0}%`],
    ["Accuracy", accuracyLabel(report.summary?.averageAccuracyRate || 0, report.summary?.markedAnswers)],
    ["Avg. session", `${report.summary?.averageSessionMinutes || 0} min`],
  ])}
    <section>
      ${sectionHead("Session trends", "Each completed live lesson in this period.")}
      <table class="data">
        <thead><tr><th>Date</th><th>Lesson</th><th class="num">Attendance</th><th class="num">Answered at least once</th><th class="num">Answer completion</th><th class="num">Accuracy</th></tr></thead>
        <tbody>${sessions.map((session) => `
          <tr>
            <td>${escapeHtml(formatDate(session.date))}</td>
            <td>${escapeHtml(session.title)}</td>
            <td class="num">${session.attendanceRate}%</td>
            <td class="num">${session.participationRate}%</td>
            <td class="num">${session.engagementRate}%</td>
            <td class="num">${accuracyLabel(session.accuracyRate, session.markedAnswers)}</td>
          </tr>
        `).join("") || "<tr><td colspan='6'>No completed sessions were recorded in this period.</td></tr>"}</tbody>
      </table>
    </section>
    <section>
      ${sectionHead("Student performance", studentIds.length ? "Only the selected students are included." : "Every student on the class roster.")}
      <table class="data">
        <thead><tr><th>Student</th><th class="num">Sessions</th><th class="num">Attendance</th><th class="num">Answer completion</th><th class="num">Accuracy</th><th class="num">Answers</th></tr></thead>
        <tbody>${students.map((student) => `
          <tr>
            <td>${escapeHtml(student.name)}</td>
            <td class="num">${student.sessions}</td>
            <td class="num">${student.attendanceRate}%</td>
            <td class="num">${student.engagementRate}%</td>
            <td class="num">${accuracyLabel(student.accuracyRate, student.marked)}</td>
            <td class="num">${student.answers}</td>
          </tr>
        `).join("") || "<tr><td colspan='6'>No student data is available.</td></tr>"}</tbody>
      </table>
      <p class="note">Attendance counts students on the session roster who joined. “Answered at least once” is observable answering, not attention or learning. Accuracy counts only answers with a verdict; unmarked written answers are left out.</p>
    </section>
  `;
};

const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #243a46; font: 9.5pt/1.5 "Segoe UI", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover { padding-bottom: 14px; border-bottom: 3px solid #177c73; }
  .cover-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .eyebrow { margin-bottom: 4px; color: #16796f; font-size: 7.5pt; font-weight: 700; letter-spacing: .14em; }
  h1 { margin: 0; color: #173b49; font-size: 21pt; line-height: 1.2; }
  .badge { flex: 0 0 auto; padding: 4px 10px; border: 1px solid #cfe4dd; border-radius: 99px; color: #256a60; background: #f0f8f4; font-size: 8pt; font-weight: 700; }
  .meta { margin: 6px 0 0; color: #5f747c; font-size: 9pt; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 6px; margin: 14px 0 4px; }
  .kpi { display: flex; flex-direction: column; justify-content: space-between; gap: 4px; padding: 8px 10px; border: 1px solid #dfeae6; border-radius: 8px; background: #f8fbfa; break-inside: avoid; }
  .kpi span { display: block; color: #6c8087; font-size: 7.2pt; font-weight: 700; letter-spacing: .02em; }
  .kpi strong { display: block; color: #176d68; font-size: 13pt; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .kpi.alert { border-color: #eed9a9; background: #fff9ec; }
  .kpi.alert strong { color: #9a6413; }
  section { margin-top: 16px; }
  .section-head { margin-bottom: 7px; padding-bottom: 5px; border-bottom: 1px solid #e2eae8; }
  .section-head h2 { margin: 0; color: #183b48; font-size: 12pt; }
  .section-head p { margin: 2px 0 0; color: #6d7f86; font-size: 8pt; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .summary-card { padding: 10px 12px; border: 1px solid #e2eae8; border-radius: 8px; background: #fff; break-inside: avoid; }
  .summary-card h3 { margin: 0 0 4px; color: #274654; font-size: 9.5pt; }
  .facts { margin: 0; }
  .facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #edf2f0; }
  .facts > div:last-child { border-bottom: 0; }
  .facts dt { color: #6a7c84; font-size: 8.2pt; }
  .facts dd { margin: 0; color: #1f3c49; font-size: 9pt; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  thead th { padding: 6px 7px; border-bottom: 1px solid #d9e5e1; color: #5d737b; background: #f1f6f4; font-size: 7.2pt; font-weight: 700; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
  tbody td { padding: 6px 7px; border-bottom: 1px solid #e9efed; font-size: 8.6pt; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) td { background: #fafcfb; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  th.num, td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.index, td.index { width: 26px; color: #7b8c92; text-align: right; }
  .note { margin: 7px 0 0; color: #73858b; font-size: 7.8pt; line-height: 1.45; }
  .student-sheet { break-before: page; margin-top: 0; }
  .student-sheet.first { break-before: auto; }
  .student-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #177c73; }
  .student-head h2 { margin: 0; color: #173b49; font-size: 16pt; }
  .student-head-meta { display: grid; gap: 1px; color: #6a7c84; font-size: 8pt; text-align: right; }
  .student-head-meta strong { color: #2c4a56; font-size: 9pt; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 9px 0 10px; }
  .chip { padding: 3px 8px; border: 1px solid #dfe9e6; border-radius: 99px; color: #4c646d; background: #f7faf9; font-size: 7.8pt; }
`;

const pageFooter = (label) => `
  <div style="width:100%;padding:0 14mm;font:7pt Arial,sans-serif;color:#7d8d93;display:flex;justify-content:space-between;">
    <span>${escapeHtml(label)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>
`;

export const buildLiveLessonReportHtml = (report, { type, studentIds = [] } = {}) => {
  const content = type === "performance"
    ? renderPerformanceReport(report, studentIds)
    : renderSessionReport(report, studentIds);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_STYLES}</style></head><body>${content}</body></html>`;
};

export const generateLiveLessonReportPdf = async (report, { type, studentIds = [] } = {}) => {
  const performance = type === "performance";
  const html = buildLiveLessonReportHtml(report, { type, studentIds });
  const label = performance
    ? `Class performance · ${report.class?.name || "Class"}`
    : `Live lesson report · ${report.session?.class?.name || "Class"}`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: pageFooter(label),
      margin: { top: "15mm", bottom: "16mm", left: "14mm", right: "14mm" },
    }));
    if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("The PDF renderer returned an invalid document.");
    }
    return pdf;
  } finally {
    await page.close();
  }
};
