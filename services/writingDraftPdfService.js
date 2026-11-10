/**
 * Printable writing draft for the student and the teacher.
 *
 * The student export carries the draft and its published feedback only. The
 * teacher export may carry an unpublished review too. There is no parent export:
 * writing has no parent-facing route, and this service must not invent one.
 */
import mongoose from "mongoose";
import puppeteer from "puppeteer";

import WritingProject from "../models/WritingProject.js";
import WritingAssignment from "../models/WritingAssignment.js";
import WritingDraft from "../models/WritingDraft.js";
import WritingAssessment from "../models/WritingAssessment.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import { resolvePuppeteerExecutablePath } from "../utils/resolvePuppeteerExecutablePath.js";

const PDF_TIMEOUT_MS = 45000;
const STEP_TIMEOUT_MS = 30000;

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = statusCode < 500;
  return error;
};

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

const LABELS = {
  en: {
    draft: "Draft",
    submitted: "Submitted",
    feedback: "Teacher feedback",
    summary: "What this draft does well and what to work on",
    priorities: "Next priorities",
    scores: "Rubric",
    section: "Section",
    score: "Score",
    strengths: "Worked well",
    improvements: "To improve",
    nextStep: "Next step",
    spelling: "Spelling words",
    spellingWins: "Spelling wins",
    wordUse: "Word support evidence",
    used: "used",
    near: "possible near miss",
    notUsed: "not used",
    student: "Student",
    noFeedback: "Feedback has not been published yet.",
    page: "Writing",
  },
  ar: {
    draft: "المسودة",
    submitted: "تاريخ التسليم",
    feedback: "ملاحظات المعلم",
    summary: "ما أجاده هذا النص وما يحتاج إلى عمل",
    priorities: "الأولويات القادمة",
    scores: "معايير التقييم",
    section: "القسم",
    score: "الدرجة",
    strengths: "ما نجح",
    improvements: "ما يحتاج تحسينًا",
    nextStep: "الخطوة القادمة",
    spelling: "كلمات الإملاء",
    spellingWins: "كلمات إملاء صحيحة",
    wordUse: "استخدام الكلمات المدعومة",
    used: "مستخدمة",
    near: "كتابة قريبة محتملة",
    notUsed: "غير مستخدمة",
    student: "الطالب",
    noFeedback: "لم تُنشر الملاحظات بعد.",
    page: "الكتابة",
  },
};

const listHtml = (items) =>
  items?.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";

const sectionFeedbackHtml = (row, L) => {
  if (!row) return "";
  const strengths = listHtml(row.strengths);
  const improvements = listHtml(row.improvements);
  if (!strengths && !improvements && !row.nextStep) return "";
  return `
    <div class="note">
      <h4>${escapeHtml(row.label || row.key)}</h4>
      ${strengths ? `<p class="tag">${L.strengths}</p>${strengths}` : ""}
      ${improvements ? `<p class="tag">${L.improvements}</p>${improvements}` : ""}
      ${row.nextStep ? `<p><strong>${L.nextStep}:</strong> ${escapeHtml(row.nextStep)}</p>` : ""}
    </div>`;
};

const spellingHtml = (targets, wins, L) => {
  if (!targets?.length && !wins?.length) return "";
  const winSet = new Set((wins || []).map((row) => row.word));
  return `
    <section class="block">
      ${targets?.length ? `<h3>${L.spelling}</h3><p class="chips">${targets
        .map(
          (row) =>
            `<span class="chip${winSet.has(row.word) ? " win" : ""}">${escapeHtml(row.word)}</span>`,
        )
        .join("")}</p>` : ""}
      ${wins?.length ? `<p class="muted">${L.spellingWins}: ${wins.map((row) => escapeHtml(row.word)).join(", ")}</p>` : ""}
    </section>`;
};

const wordUseHtml = (evidence, L) => {
  if (!evidence) return "";
  const rows = [
    ...(evidence.spelling || []).map((row) => ({ ...row, source: "spelling" })),
    ...(evidence.vocabulary || []).map((row) => ({
      ...row,
      source: "vocabulary",
    })),
  ];
  if (!rows.length) return "";
  // Unused words are the rail's whole list; printing them buries the evidence.
  const activeRows = rows.filter(
    (row) => row.used || row.nearMisses?.length,
  );
  const unusedCount = rows.length - activeRows.length;
  return `
    <section class="block">
      <h3>${L.wordUse}</h3>
      ${
        activeRows.length
          ? `<table>
        <tbody>
          ${activeRows
            .map(
              (row) => `
            <tr>
              <td><strong>${escapeHtml(row.word)}</strong></td>
              <td>${row.used ? `${L.used}${row.count ? ` ×${Number(row.count)}` : ""}` : `${L.near}: ${row.nearMisses.map(escapeHtml).join(", ")}`}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
          : ""
      }
      ${unusedCount ? `<p class="muted">${L.notUsed} (${unusedCount})</p>` : ""}
    </section>`;
};

const buildHtml = ({
  school,
  student,
  assignment,
  draft,
  assessment,
  includeWordUse,
}) => {
  const language = assessment?.language === "ar" ? "ar" : "en";
  const L = LABELS[language];
  const studentName =
    `${student?.firstName || ""} ${student?.lastName || ""}`.trim();
  const scores = assessment?.scores || [];
  const overall = assessment?.overall || {};
  const date = draft?.submittedAt
    ? new Date(draft.submittedAt).toLocaleDateString(
        language === "ar" ? "ar" : "en-GB",
        { day: "2-digit", month: "short", year: "numeric" },
      )
    : "";

  return `<!doctype html>
<html lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(assignment?.title || L.page)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12pt; line-height: 1.55; }
  header { border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-bottom: 18px; }
  .school { font-size: 10pt; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
  h1 { margin: 4px 0 2px; font-size: 20pt; }
  .meta { color: #64748b; font-size: 9.5pt; display: flex; gap: 18px; flex-wrap: wrap; }
  h2 { font-size: 13pt; margin: 20px 0 6px; color: #0d9488; }
  h3 { font-size: 11.5pt; margin: 0 0 6px; }
  h4 { font-size: 11pt; margin: 0 0 4px; }
  .body { display: flex; flex-direction: column; gap: 14px; }
  .part { page-break-inside: avoid; }
  .part h3 { color: #334155; }
  .part p { white-space: pre-wrap; margin: 0; }
  .block { page-break-inside: avoid; margin-top: 14px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
  .note { margin-top: 8px; padding: 8px 10px; border-inline-start: 3px solid #0d9488; background: #f8fafc; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
  ul { margin: 4px 0 6px; padding-inline-start: 18px; }
  .tag { margin: 4px 0 0; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; }
  .chip { border: 1px solid #cbd5e1; border-radius: 999px; padding: 2px 9px; font-size: 10pt; }
  .chip.win { border-color: #16a34a; background: #f0fdf4; color: #15803d; }
  .muted { color: #64748b; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  td, th { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: start; vertical-align: top; }
  footer { margin-top: 22px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9pt; color: #94a3b8; }
</style>
</head>
<body>
  <header>
    <p class="school">${escapeHtml(school?.name || "")}</p>
    <h1>${escapeHtml(assignment?.title || L.page)}</h1>
    <p class="meta">
      <span>${L.student}: ${escapeHtml(studentName)}</span>
      <span>${L.draft} ${escapeHtml(draft?.number || "")}</span>
      ${date ? `<span>${L.submitted}: ${escapeHtml(date)}</span>` : ""}
    </p>
  </header>

  <div class="body">
    ${(draft?.sections || [])
      .map(
        (section) => `
      <div class="part">
        <h3>${escapeHtml(section.label || section.key)}</h3>
        <p>${escapeHtml(section.text || "")}</p>
      </div>`,
      )
      .join("")}
  </div>

  <h2>${L.feedback}</h2>
  ${
    assessment
      ? `
    ${overall.summary ? `<p>${escapeHtml(overall.summary)}</p>` : ""}
    ${overall.nextPriorities?.length ? `<div class="block"><h3>${L.priorities}</h3>${listHtml(overall.nextPriorities)}</div>` : ""}
    ${scores.length ? `<div class="block"><h3>${L.scores}</h3><table><tbody>${scores.map((row) => `<tr><td>${escapeHtml(row.label || row.key)}</td><td>${Number(row.score) || 0} / ${Number(row.maxScore) || 0}</td><td>${escapeHtml(row.explanation || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${(assessment.sections || []).map((row) => sectionFeedbackHtml(row, L)).join("")}
    ${spellingHtml(assessment.spellingTargets, assessment.spellingWins, L)}
    ${includeWordUse ? wordUseHtml(assessment.wordUseEvidence, L) : ""}
  `
      : `<p class="muted">${L.noFeedback}</p>`
  }

  <footer>${escapeHtml(school?.name || "")} · ${escapeHtml(assignment?.title || "")}</footer>
</body>
</html>`;
};

const browserUsable = (browser) =>
  Boolean(
    browser &&
      (typeof browser.isConnected === "function"
        ? browser.isConnected()
        : browser.connected),
  );

let browserPromise = null;
let browserGeneration = 0;

const launchBrowser = async () => {
  // A request must never wait on a browser download; `npm install` warms the cache.
  const executablePath = await resolvePuppeteerExecutablePath({
    allowInstall: false,
  });
  if (!executablePath) {
    throw fail("PDF export is not available on this server right now.", 503);
  }
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath,
    timeout: STEP_TIMEOUT_MS,
  });
};

/**
 * One headless browser reused by every export. Launching one per request made a
 * single print cost hundreds of MB, and a browser that outlived its request never
 * came back; a browser the OS killed is dropped rather than handed out again.
 */
const getBrowser = async () => {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && browserUsable(existing)) return existing;
    browserPromise = null;
  }
  const generation = (browserGeneration += 1);
  const pending = launchBrowser();
  browserPromise = pending;
  pending
    .then((browser) => {
      browser.once("disconnected", () => {
        if (browserGeneration === generation) browserPromise = null;
      });
    })
    .catch(() => {
      if (browserGeneration === generation) browserPromise = null;
    });
  return pending;
};

let renderSlot = Promise.resolve();

/**
 * A browser that is alive but wedged would otherwise hold the render slot, and
 * everything queued behind it, forever. Same budget and wording as the outer one.
 */
const withStepTimeout = (step, ms = STEP_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          fail("The PDF took too long to prepare. Please try again.", 504),
        ),
      ms,
    );
    if (typeof timer.unref === "function") timer.unref();
    step.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/** Repeated clicks queue on one browser instead of stacking pages inside Chrome. */
const acquireRenderSlot = () => {
  const waiting = renderSlot;
  let release;
  renderSlot = new Promise((resolve) => {
    release = resolve;
  });
  return waiting.then(() => release);
};

const renderPdf = async (html) => {
  const releaseRender = await acquireRenderSlot();
  try {
    const browser = await withStepTimeout(getBrowser());
    const page = await withStepTimeout(browser.newPage());
    try {
      page.setDefaultTimeout(STEP_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);
      await page.setContent(html, {
        waitUntil: "load",
        timeout: STEP_TIMEOUT_MS,
      });
      const pdf = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          timeout: STEP_TIMEOUT_MS,
          margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
        }),
      );
      if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw fail("The PDF renderer returned an invalid document.", 500);
      }
      return pdf;
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    releaseRender();
  }
};

export const renderWritingProjectPdf = async ({
  schoolId,
  projectId,
  draftId = null,
  studentId = null,
  publishedOnly = true,
  includeWordUse = false,
}) => {
  if (!mongoose.isValidObjectId(String(projectId || ""))) {
    throw fail("Writing project not found.", 404);
  }
  const project = await WritingProject.findOne({
    school: schoolId,
    _id: projectId,
    ...(studentId ? { student: studentId } : {}),
  }).lean();
  if (!project) throw fail("Writing project not found.", 404);

  const [assignment, student, school] = await Promise.all([
    WritingAssignment.findOne({
      school: schoolId,
      _id: project.assignment,
    }).lean(),
    Student.findOne({ school: schoolId, _id: project.student })
      .select("firstName lastName")
      .lean(),
    School.findOne({ _id: schoolId }).select("name").lean(),
  ]);
  if (!assignment) throw fail("Writing task not found.", 404);

  const draft = draftId
    ? await WritingDraft.findOne({
        school: schoolId,
        project: project._id,
        _id: draftId,
      }).lean()
    : await WritingDraft.findOne({
        school: schoolId,
        project: project._id,
      })
        .sort({ number: -1 })
        .lean();
  if (!draft) throw fail("This writing task has no submitted draft yet.", 404);

  const assessment = await WritingAssessment.findOne({
    school: schoolId,
    draft: draft._id,
    kind: "feedback",
    aiStatus: "done",
    ...(publishedOnly ? { "publish.state": "published" } : {}),
  })
    .sort({ createdAt: -1 })
    .lean();

  const html = buildHtml({
    school,
    student,
    assignment,
    draft,
    assessment,
    includeWordUse,
  });

  let timer;
  try {
    return await Promise.race([
      renderPdf(html),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(fail("The PDF took too long to prepare. Please try again.", 504)),
          PDF_TIMEOUT_MS,
        );
        if (typeof timer.unref === "function") timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
