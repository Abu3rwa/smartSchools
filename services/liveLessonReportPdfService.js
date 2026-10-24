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

const formatDate = (value) => value ? new Date(value).toLocaleString("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
}) : "—";

const metricCards = (entries) => entries.map(([label, value]) => `
  <div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
`).join("");

const LIVE_RESULT_LABELS = {
  correct: "Correct",
  partial: "Partially correct",
  wrong: "Incorrect",
  // A written answer nobody has read yet. It is never printed as incorrect.
  pending: "To mark",
};

const resultLabel = (answer) => (
  LIVE_RESULT_LABELS[answer.result]
  || answer.status?.replace(/_/g, " ")
  || "—"
);

const marksLabel = (answer) => (
  answer.marks == null ? "—" : `${answer.marks}${answer.maxMarks == null ? "" : ` / ${answer.maxMarks}`}`
);

/**
 * A levelled slide asks each group a different question, so its blended accuracy would describe no
 * one. One row per level keeps each group's own key, counts and accuracy visible.
 */
const questionRows = (perQuestion) => perQuestion.flatMap((question, index) => {
  const levels = question.levels || [null];
  return levels.map((level) => `
    <tr><td>${index + 1}</td><td>${escapeHtml([question.title || question.prompt, level?.level]
    .filter(Boolean).join(" · "))}</td>
    <td>${(level || question).answered || 0}</td><td>${(level || question).correct || 0}</td>
    <td>${(level || question).partial || 0}</td><td>${(level || question).pending || 0}</td>
    <td>${(level || question).percentCorrect || 0}%</td></tr>
  `);
});

const renderSessionReport = (report, studentIds) => {
  const students = (report.perStudent || []).filter((student) => (
    !studentIds.length || studentIds.includes(String(student.studentId))
  ));
  const questions = questionRows(report.perQuestion || []);
  const studentSections = students.map((student) => `
    <section class="student page-break">
      <h2>${escapeHtml(student.name)}</h2>
      <div class="metrics">${metricCards([
    ["Attendance", student.joined ? "Present" : "Absent"],
    ["Score", `${student.scorePercent || 0}%`],
    ["Correct", student.correct || 0],
    ["To mark", student.toMark || 0],
    ["Answered", student.answered || 0],
    ["Away time", `${student.totalAwaySeconds || 0}s`],
  ])}</div>
      <table><thead><tr><th>#</th><th>Question</th><th>Student answer</th><th>Correct answer</th><th>Result</th><th>Marks</th><th>Response time</th></tr></thead>
      <tbody>${(student.answerDetails || []).map((answer) => `
        <tr><td>${answer.questionNumber || ""}</td><td>${escapeHtml([answer.prompt, answer.level && `Level: ${answer.level}`]
    .filter(Boolean).join(" "))}</td>
        <td>${escapeHtml(answer.selectedAnswer || "—")}</td><td>${escapeHtml(answer.correctAnswer || "—")}</td>
        <td>${escapeHtml(resultLabel(answer))}</td>
        <td>${escapeHtml(marksLabel(answer))}</td>
        <td>${answer.latencyMs == null ? "—" : `${(answer.latencyMs / 1000).toFixed(1)}s`}</td></tr>
      `).join("")}</tbody></table>
    </section>
  `).join("");
  const className = report.session?.class?.name || "Class";
  const metrics = [
    ["Students", report.summary?.rosterCount || 0],
    ["Joined", report.summary?.joinedCount || 0],
    ["Questions", report.summary?.questionCount || 0],
    ["Answers", report.summary?.submittedAnswers || 0],
    ["Answers to mark", report.summary?.awaitingMarks || 0],
  ];
  return `
    <header><div class="eyebrow">LIVE LESSON REPORT</div><h1>${escapeHtml(report.session?.title || "Session report")}</h1>
    <p>${escapeHtml(className)} · ${escapeHtml(report.session?.subject || "Subject not set")}</p>
    <p>${escapeHtml(formatDate(report.session?.startedAt))} — ${escapeHtml(formatDate(report.session?.endedAt))}</p></header>
    <section><div class="metrics">${metricCards(metrics)}</div>
    <h2>Class question results</h2><table><thead><tr><th>#</th><th>Question</th><th>Answered</th><th>Correct</th><th>Partial</th><th>To mark</th><th>Accuracy</th></tr></thead><tbody>${questions || "<tr><td colspan='7'>No questions were included.</td></tr>"}</tbody></table></section>
    ${studentSections}
  `;
};

const renderPerformanceReport = (report, studentIds) => {
  const students = (report.students || []).filter((student) => (
    !studentIds.length || studentIds.includes(String(student.studentId))
  ));
  const sessionRows = (report.sessions || []).map((session) => `
    <tr><td>${escapeHtml(formatDate(session.date))}</td><td>${escapeHtml(session.title)}</td>
    <td>${session.attendanceRate}%</td><td>${session.engagementRate}%</td><td>${session.accuracyRate}%</td></tr>
  `).join("");
  const studentRows = students.map((student) => `
    <tr><td>${escapeHtml(student.name)}</td><td>${student.sessions}</td>
    <td>${student.attendanceRate}%</td><td>${student.engagementRate}%</td><td>${student.accuracyRate}%</td>
    <td>${student.answers}</td></tr>
  `).join("");
  return `
    <header><div class="eyebrow">CLASS PERFORMANCE & ENGAGEMENT</div>
    <h1>${escapeHtml(report.class?.name || "Class")}</h1>
    <p>${escapeHtml(report.dateFrom)} — ${escapeHtml(report.dateTo)}</p></header>
    <section><div class="metrics">${metricCards([
    ["Sessions", report.summary?.sessionCount || 0],
    ["Attendance", `${report.summary?.averageAttendanceRate || 0}%`],
    ["Answered at least once", `${report.summary?.participationRate || 0}%`],
    ["Answer completion", `${report.summary?.averageEngagementRate || 0}%`],
    ["Accuracy", `${report.summary?.averageAccuracyRate || 0}%`],
    ["Avg. session", `${report.summary?.averageSessionMinutes || 0} min`],
  ])}</div>
    <h2>Session trends</h2><table><thead><tr><th>Date</th><th>Lesson</th><th>Attendance</th><th>Answered at least once</th><th>Accuracy</th></tr></thead>
    <tbody>${sessionRows || "<tr><td colspan='5'>No completed sessions were recorded in this period.</td></tr>"}</tbody></table>
    <h2>Student performance</h2><table><thead><tr><th>Student</th><th>Sessions</th><th>Attendance</th><th>Answer completion</th><th>Accuracy</th><th>Answers</th></tr></thead>
    <tbody>${studentRows || "<tr><td colspan='6'>No student data is available.</td></tr>"}</tbody></table></section>
  `;
};

export const generateLiveLessonReportPdf = async (report, { type, studentIds = [] } = {}) => {
  const content = type === "performance"
    ? renderPerformanceReport(report, studentIds)
    : renderSessionReport(report, studentIds);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#203746;margin:0}
    header{padding:0 0 18px;border-bottom:2px solid #197c76;margin-bottom:20px}
    h1{font-size:23pt;margin:6px 0;color:#173b49}h2{font-size:14pt;margin:22px 0 10px}
    p{margin:5px 0;color:#61727a}.eyebrow{font-size:8pt;letter-spacing:2px;font-weight:bold;color:#168078}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 22px}
    .metric{border:1px solid #dce8e5;border-radius:8px;padding:10px}
    .metric span{display:block;font-size:8pt;color:#63757d;margin-bottom:5px}.metric strong{font-size:13pt;color:#176c68}
    table{width:100%;border-collapse:collapse;margin:8px 0 18px;table-layout:fixed}
    th,td{border:1px solid #d8e0e1;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
    th{background:#eff5f3;color:#405b63;font-size:8pt}td{font-size:8.5pt}
    .page-break{break-before:page}.student .metrics{grid-template-columns:repeat(5,1fr)}
    @page{size:A4;margin:16mm}
  </style></head><body>${content}</body></html>`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    }));
    if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("The PDF renderer returned an invalid document.");
    }
    return pdf;
  } finally {
    await page.close();
  }
};
