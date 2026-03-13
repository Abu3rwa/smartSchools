import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const cache = {};
const REPORT_TEMPLATE_NAMES = new Set([
  "dailyReport",
  "monthlyReport",
  "dailyClassworkUpdate",
  "classworkSubjectSection",
  "classworkCategorySection",
  "classworkGradeRow",
  "gradeUpdate",
  "gradeUpdateRemarks",
  "attendanceRequestNew",
  "attendanceRequestStatus",
]);
const FINAL_REPORT_TEMPLATE_NAMES = new Set([
  "dailyReport",
  "monthlyReport",
  "dailyClassworkUpdate",
  "gradeUpdate",
  "attendanceRequestNew",
  "attendanceRequestStatus",
]);

const INLINE_REPORT_STYLE_MAP = {
  "report-scope":
    "margin:0;padding:12px;background-color:#f6f7fb;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.5;",
  "report-page":
    "margin:0;padding:12px;background-color:#f6f7fb;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#111827;font-size:14px;line-height:1.5;",
  "report-card":
    "max-width:640px;margin:0 auto;background-color:#ffffff;border:1px solid #dbe6ff;border-radius:12px;padding:16px;",
  "card-header":
    "margin-bottom:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;",
  "card-title": "margin:0;font-size:20px;line-height:1.25;font-weight:700;color:#111827;",
  "card-meta": "margin:6px 0 0 0;font-size:12px;color:#6b7280;",
  section: "margin-top:14px;",
  "subject-title": "margin:16px 0 4px 0;font-size:18px;line-height:1.3;font-weight:700;color:#111827;",
  "subject-meta": "margin:0 0 12px 0;font-size:12px;color:#6b7280;",
  "section-title": "margin:16px 0 8px 0;font-size:14px;font-weight:700;color:#111827;",
  "section-subtitle": "margin:0 0 12px 0;font-size:12px;color:#6b7280;",
  "row-list": "border:1px solid #dbe6ff;border-radius:10px;overflow:hidden;background-color:#ffffff;",
  "row-item": "padding:12px;border-bottom:1px solid #e5e7eb;",
  "row-top": "display:table;width:100%;",
  "row-date": "display:table-cell;vertical-align:middle;font-weight:600;color:#111827;",
  "row-bottom": "margin-top:6px;font-size:12px;color:#6b7280;",
  "row-notes": "margin-top:4px;font-size:12px;color:#6b7280;font-style:italic;",
  "row-left": "display:table-cell;vertical-align:top;color:#111827;",
  "row-right":
    "display:table-cell;vertical-align:top;text-align:right;white-space:nowrap;font-weight:700;color:#111827;",
  badge:
    "display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid #dbe6ff;background-color:#f9fafb;color:#111827;font-size:12px;font-weight:700;",
  tag: "display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid #dbe6ff;background-color:#f9fafb;color:#6b7280;font-size:12px;font-weight:700;",
  "score--good":
    "background-color:#ecfdf5;color:#047857;border:1px solid rgba(4,120,87,0.25);",
  "score--mid":
    "background-color:#fffbeb;color:#b45309;border:1px solid rgba(180,83,9,0.25);",
  "score--low":
    "background-color:#fef2f2;color:#b91c1c;border:1px solid rgba(185,28,28,0.25);",
  "summary-bar":
    "margin-top:10px;padding:12px;border-radius:10px;background-color:#f3f4f6;font-weight:700;",
  muted: "color:#6b7280;",
  "meta-line": "margin-top:8px;font-size:12px;color:#6b7280;",
};

function inlineEmailStyles(html) {
  if (!html) return "";

  const withoutStyleBlocks = html.replace(/<style[\s\S]*?<\/style>/gi, "");

  return withoutStyleBlocks.replace(/<([a-zA-Z][\w:-]*)([^>]*)>/g, (fullMatch, tagName, rawAttrs) => {
    const classMatch = rawAttrs.match(/\bclass\s*=\s*"([^"]*)"/i);
    if (!classMatch) {
      return fullMatch;
    }

    const inlineStyle = classMatch[1]
      .split(/\s+/)
      .map((className) => INLINE_REPORT_STYLE_MAP[className])
      .filter(Boolean)
      .join("");

    if (!inlineStyle) {
      return fullMatch;
    }

    const styleMatch = rawAttrs.match(/\bstyle\s*=\s*"([^"]*)"/i);
    let nextAttrs = rawAttrs;

    if (styleMatch) {
      const mergedStyle = `${styleMatch[1]}${styleMatch[1].trim().endsWith(";") ? "" : ";"}${inlineStyle}`;
      nextAttrs = rawAttrs.replace(styleMatch[0], `style="${mergedStyle}"`);
    } else {
      nextAttrs = `${rawAttrs} style="${inlineStyle}"`;
    }

    return `<${tagName}${nextAttrs}>`;
  });
}

/**
 * Load an HTML email template and replace {{placeholders}} with values.
 * Templates are cached after first read.
 *
 * @param {string} templateName - File name without extension (e.g. 'gradeUpdate')
 * @param {Object} data - Key/value pairs to replace in the template
 * @returns {string} Rendered HTML string
 */
export function renderTemplate(templateName, data = {}) {
  if (!cache[templateName]) {
    const filePath = join(__dirname, `${templateName}.html`);
    cache[templateName] = readFileSync(filePath, 'utf-8');
  }

  let html = cache[templateName];
  const mergedData = { ...data };

  if (
    REPORT_TEMPLATE_NAMES.has(templateName) &&
    !Object.prototype.hasOwnProperty.call(mergedData, "reportSharedStyles")
  ) {
    if (!cache.reportSharedStyles) {
      const sharedCssPath = join(__dirname, "reportSharedStyles.html");
      cache.reportSharedStyles = readFileSync(sharedCssPath, "utf-8");
    }
    mergedData.reportSharedStyles = cache.reportSharedStyles;
  }

  for (const [key, value] of Object.entries(mergedData)) {
    // Replace all occurrences of {{key}} with the value
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, value ?? '');
  }

  if (FINAL_REPORT_TEMPLATE_NAMES.has(templateName)) {
    html = inlineEmailStyles(html);
  }

  return html;
}
