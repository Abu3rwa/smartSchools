import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(
  __dirname,
  "../templates/presentation-slides.html"
);

let browserPromise = null;
let compiledTemplatePromise = null;

// ─── Puppeteer singleton ────────────────────────────────────────────────────

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
  return browserPromise;
};

const getTemplate = async () => {
  if (!compiledTemplatePromise) {
    compiledTemplatePromise = fs
      .readFile(TEMPLATE_PATH, "utf8")
      .then((raw) => Handlebars.compile(raw));
  }
  return compiledTemplatePromise;
};

// ─── Handlebars helpers ─────────────────────────────────────────────────────

Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
Handlebars.registerHelper("colorWithOpacity", (hex, opacity) => {
  if (!hex || typeof hex !== "string") return "rgba(0,0,0,0.1)";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
});

// ─── Map presentation for template ──────────────────────────────────────────

function buildColorWithOpacity(hex, opacity) {
  if (!hex || typeof hex !== "string") return `rgba(0,0,0,${opacity || 0})`;
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function buildSlideBackgroundStyle(background = {}, theme = {}, themeTokens = {}) {
  if (background.type === "image" && background.imageUrl) {
    const overlayOpacity = Number(background.overlayOpacity) || 0;
    const overlayColor = background.overlayColor || "#000000";

    return `linear-gradient(${buildColorWithOpacity(overlayColor, overlayOpacity)}, ${buildColorWithOpacity(overlayColor, overlayOpacity)}), url(${background.imageUrl}) center / cover no-repeat`;
  }

  if (background.type === "gradient") {
    const angle = background.gradientAngle ?? themeTokens.gradientAngle ?? 135;
    const gradientFrom = background.gradientFrom || themeTokens.gradientFrom || theme.primaryColor || "#1a73e8";
    const gradientTo = background.gradientTo || themeTokens.gradientTo || theme.secondaryColor || "#174ea6";
    return `linear-gradient(${angle}deg, ${gradientFrom} 0%, ${gradientTo} 100%)`;
  }

  return background.solidColor || themeTokens.canvasColor || "#ffffff";
}

function mapPresentationForTemplate(presentation, schoolBranding = {}) {
  const theme = presentation.theme || {};
  const themeTokens = presentation.themeTokens || {};

  return {
    title: presentation.title || "Untitled Presentation",
    schoolName: schoolBranding.schoolName || "",
    schoolLogo: schoolBranding.schoolLogo || "",
    primaryColor: theme.primaryColor || "#1a73e8",
    secondaryColor: theme.secondaryColor || "#174ea6",
    titleColor: themeTokens.titleColor || theme.primaryColor || "#0f172a",
    bodyColor: themeTokens.bodyColor || "#1f2937",
    surfaceColor: themeTokens.surfaceColor || "#f8fafc",
    fontFamily: theme.fontFamily || "Segoe UI, Roboto, Arial, sans-serif",
    slides: (presentation.slides || [])
      .sort((a, b) => a.order - b.order)
      .map((slide, idx) => ({
        ...slide,
        order: idx,
        slideNumber: idx + 1,
        totalSlides: presentation.slides.length,
        bodyHtml: slide.bodyHtml || "",
        bodyHtml2: slide.bodyHtml2 || "",
        backgroundStyle: buildSlideBackgroundStyle(slide.background, theme, themeTokens),
      })),
  };
}

// ─── Export to PDF ──────────────────────────────────────────────────────────

export async function exportPresentationPdf(
  presentation,
  schoolBranding = {}
) {
  const template = await getTemplate();
  const payload = mapPresentationForTemplate(presentation, schoolBranding);
  const html = template(payload);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      width: "10in",
      height: "7.5in",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
  } finally {
    await page.close();
  }
}

// ─── Export to HTML (for preview/download) ──────────────────────────────────

export async function exportPresentationHtml(
  presentation,
  schoolBranding = {}
) {
  const template = await getTemplate();
  const payload = mapPresentationForTemplate(presentation, schoolBranding);
  return template(payload);
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

export async function closePresentationBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}
