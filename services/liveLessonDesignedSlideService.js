import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";
import { LIVE_LESSON_PALETTES, resolveSlidePalette } from "../config/liveLessonPalettes.js";
import { bodyLines, cleanLine, cleanText } from "./liveLessonBuilderSanitizeService.js";

/**
 * Teaching slides are designed HTML, but the design is owned here: the model
 * only supplies text and a layout name. Everything below is escaped, the CSS is
 * self-contained, and no script, external resource or url() reference is ever
 * produced. The same function feeds the builder preview, the saved lesson and
 * the CSV export, so all three show one slide.
 */

export const DESIGNED_LAYOUTS = Object.freeze([
  "hero",
  "goals",
  "vocabulary",
  "steps",
  "compare",
  "story",
  "examples",
  "activity",
  "exit",
]);

const LAYOUTS_BY_SLIDE_TYPE = Object.freeze({
  opening: ["hero"],
  goals: ["goals"],
  content: ["vocabulary", "steps", "compare", "story"],
  examples: ["examples"],
  activity: ["activity"],
  "exit-ticket": ["exit"],
});

// One palette vocabulary for the designed renderer and the AI slide shell.
const PALETTES = LIVE_LESSON_PALETTES;

const BLOCK_TYPES = new Set(["text", "bullets", "cards", "steps", "compare", "callout", "examples"]);

const KICKERS = {
  en: {
    opening: "Lesson opening",
    goals: "Lesson goals",
    content: "Key idea",
    examples: "Worked examples",
    activity: "Practice together",
    "exit-ticket": "Exit ticket",
  },
  ar: {
    opening: "افتتاح الدرس",
    goals: "أهداف الدرس",
    content: "الفكرة المفتاحية",
    examples: "أمثلة محلولة",
    activity: "تدريب جماعي",
    "exit-ticket": "تذكرة الخروج",
  },
};

const kickerFor = (slideType, language) => {
  const list = String(language).toLowerCase().startsWith("ar") ? KICKERS.ar : KICKERS.en;
  return list[slideType] || list.content;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const line = (value, maxLength = LIVE_LESSON_BUILDER.designTextChars) =>
  cleanLine(value, maxLength);

const text = (value, maxLength = LIVE_LESSON_BUILDER.bodyMax) =>
  cleanText(value, { maxLength });

const stringList = (value, maxLength = LIVE_LESSON_BUILDER.designItemChars, max = LIVE_LESSON_BUILDER.designPointsMax) =>
  (Array.isArray(value) ? value : [])
    .map((row) => line(row, maxLength))
    .filter(Boolean)
    .filter((row, index, all) => all.indexOf(row) === index)
    .slice(0, max);

const itemList = (value, { max = LIVE_LESSON_BUILDER.designPointsMax, titleKey = "term", textKey = "text" } = {}) =>
  (Array.isArray(value) ? value : [])
    .map((row) => {
      if (row && typeof row === "object") {
        return {
          title: line(row[titleKey] ?? row.title ?? row.label ?? row.left ?? "", LIVE_LESSON_BUILDER.designTitleItemChars),
          text: line(row[textKey] ?? row.body ?? row.definition ?? "", LIVE_LESSON_BUILDER.designItemChars),
        };
      }
      const single = line(row, LIVE_LESSON_BUILDER.designItemChars);
      return { title: single, text: "" };
    })
    .filter((row) => row.title || row.text)
    .slice(0, max);

const normalizeCompare = (value) => {
  if (!value || typeof value !== "object") return null;
  const normalizeSide = (side) => {
    if (!side || typeof side !== "object") return null;
    const title = line(side.title, LIVE_LESSON_BUILDER.designTitleItemChars);
    const items = stringList(side.items, LIVE_LESSON_BUILDER.designItemChars, 5);
    if (!title && !items.length) return null;
    return { title, items };
  };
  const left = normalizeSide(value.left);
  const right = normalizeSide(value.right);
  if (!left || !right) return null;
  return { left, right };
};

export const normalizeDesignedBlocks = (rawBlocks) => {
  const rows = Array.isArray(rawBlocks) ? rawBlocks : [];
  const blocks = [];
  rows.forEach((row) => {
    const type = String(row?.type || "").trim().toLowerCase();
    if (!BLOCK_TYPES.has(type)) return;
    if (type === "text") {
      const value = text(row.text, LIVE_LESSON_BUILDER.designTextChars * 2);
      if (value) blocks.push({ type, text: value });
      return;
    }
    if (type === "bullets") {
      const items = stringList(row.items);
      if (items.length) blocks.push({ type, items });
      return;
    }
    if (type === "cards") {
      const items = itemList(row.items, { titleKey: "term" }).filter((item) => item.title);
      if (items.length) blocks.push({ type, items: items.slice(0, LIVE_LESSON_BUILDER.designCardsMax) });
      return;
    }
    if (type === "steps") {
      const items = itemList(row.items, { max: LIVE_LESSON_BUILDER.designStepsMax, titleKey: "title" });
      if (items.length) blocks.push({ type, items });
      return;
    }
    if (type === "compare") {
      const compare = normalizeCompare(row);
      if (compare) blocks.push({ type, ...compare });
      return;
    }
    if (type === "callout") {
      const title = line(row.title, LIVE_LESSON_BUILDER.designTitleItemChars);
      const value = line(row.text ?? row.body, LIVE_LESSON_BUILDER.designCalloutChars);
      if (title || value) blocks.push({ type, title, text: value });
      return;
    }
    if (type === "examples") {
      const items = itemList(row.items, {
        max: LIVE_LESSON_BUILDER.examplesMax,
        titleKey: "label",
      }).filter((item) => item.title || item.text);
      if (items.length) blocks.push({ type, items });
    }
  });
  return blocks.slice(0, LIVE_LESSON_BUILDER.designBlocksMax);
};

/**
 * A teacher edit replaces the text, not the design language: the saved plain
 * lines become the blocks for a slide of the same type.
 */
export const blocksFromPlainText = ({ slideType, body = "", examples = [] }) => {
  if (slideType === "goals") {
    return [{ type: "bullets", items: stringList(bodyLines(body), LIVE_LESSON_BUILDER.designItemChars, 8) }];
  }
  if (slideType === "examples") {
    const items = (Array.isArray(examples) ? examples : [])
      .map((example) => line(example, LIVE_LESSON_BUILDER.exampleChars))
      .filter(Boolean)
      .slice(0, LIVE_LESSON_BUILDER.examplesMax)
      .map((example) => {
        const split = example.split(/\s+[—–-]\s+|\s*:\s+/);
        return split.length > 1
          ? { title: split[0], text: split.slice(1).join(": ") }
          : { title: example, text: "" };
      });
    return [{ type: "examples", items }];
  }
  const lines = bodyLines(body).slice(0, LIVE_LESSON_BUILDER.bodyLinesMax);
  if (!lines.length) return [];
  const hasPairs = lines.filter((row) => /[:—–]/.test(row)).length >= Math.ceil(lines.length / 2);
  if (slideType === "activity" && lines.length > 1) {
    return [{ type: "steps", items: lines.map((row) => ({ title: row, text: "" })) }];
  }
  if (hasPairs && slideType === "content") {
    const items = lines.map((row) => {
      const split = row.split(/\s*:\s+|\s+[—–]\s+/);
      return split.length > 1
        ? { title: split[0], text: split.slice(1).join(": ") }
        : { title: row, text: "" };
    });
    return [{ type: "cards", items: items.slice(0, LIVE_LESSON_BUILDER.designCardsMax) }];
  }
  return [{ type: "bullets", items: lines }];
};

export const plainTextFromBlocks = (blocks) => {
  const lines = [];
  const examples = [];
  blocks.forEach((block) => {
    if (block.type === "text") lines.push(block.text);
    if (block.type === "bullets") lines.push(...block.items);
    if (block.type === "cards") lines.push(...block.items.map((item) => (item.text ? `${item.title}: ${item.text}` : item.title)));
    if (block.type === "steps") lines.push(...block.items.map((item) => item.title || item.text));
    if (block.type === "compare") {
      const side = (part) => [part.title, ...part.items].filter(Boolean).join(": ");
      lines.push(...[side(block.left), side(block.right)].filter(Boolean));
    }
    if (block.type === "callout") lines.push([block.title, block.text].filter(Boolean).join(": "));
    if (block.type === "examples") {
      const rows = block.items
        .map((item) => (item.text ? `${item.title} — ${item.text}` : item.title))
        .filter(Boolean);
      examples.push(...rows);
      lines.push(...rows);
    }
  });
  const cleanLines = bodyLines(lines.join("\n")).slice(0, LIVE_LESSON_BUILDER.bodyLinesMax);
  return {
    body: cleanText(cleanLines.join("\n"), { maxLength: LIVE_LESSON_BUILDER.bodyMax }),
    examples: examples.slice(0, LIVE_LESSON_BUILDER.examplesMax),
  };
};

export const layoutForSlide = ({ slideType, requested }) => {
  const allowed = LAYOUTS_BY_SLIDE_TYPE[slideType] || LAYOUTS_BY_SLIDE_TYPE.content;
  return allowed.includes(requested) ? requested : allowed[0];
};

const hashSeed = (value) => {
  let hash = 0;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const paletteFor = ({ slideType, seed = "" }) => {
  const layouts = {
    opening: ["navy"],
    goals: ["teal", "navy"],
    content: ["navy", "plum", "forest", "sunset"],
    examples: ["sunset", "teal"],
    activity: ["plum", "forest"],
    "exit-ticket": ["forest", "navy"],
  };
  const allowed = layouts[slideType] || PALETTES.map((palette) => palette.name);
  const choices = PALETTES.filter((palette) => allowed.includes(palette.name));
  return choices[hashSeed(`${slideType}:${seed}`) % choices.length] || PALETTES[0];
};

const blockHtml = (block) => {
  if (block.type === "text") return `<p class="lead">${escapeHtml(block.text)}</p>`;
  if (block.type === "bullets") {
    return `<ul class="points">${block.items
      .map((item, index) => `<li style="--d:${120 + index * 90}ms"><span class="point-dot"></span><span>${escapeHtml(item)}</span></li>`)
      .join("")}</ul>`;
  }
  if (block.type === "cards") {
    return `<div class="cards count-${Math.min(block.items.length, 3)}">${block.items
      .map((item, index) => `<article class="card" style="--d:${140 + index * 110}ms">
        <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
        <h2>${escapeHtml(item.title)}</h2>
        ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
      </article>`)
      .join("")}</div>`;
  }
  if (block.type === "steps") {
    return `<ol class="steps">${block.items
      .map((item, index) => `<li style="--d:${140 + index * 120}ms">
        <span class="step-dot">${index + 1}</span>
        <div class="step-copy">
          ${item.title ? `<strong>${escapeHtml(item.title)}</strong>` : ""}
          ${item.text ? `<span>${escapeHtml(item.text)}</span>` : ""}
        </div>
      </li>`)
      .join("")}</ol>`;
  }
  if (block.type === "compare") {
    const side = (part, sideName) => `<section class="compare-side">
      <h2>${escapeHtml(part.title || sideName)}</h2>
      <ul>${part.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>`;
    return `<div class="compare">${side(block.left, "A")}<span class="compare-arrow" aria-hidden="true">⇄</span>${side(block.right, "B")}</div>`;
  }
  if (block.type === "callout") {
    return `<aside class="callout" style="--d:420ms">${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ""}${block.text ? `<p>${escapeHtml(block.text)}</p>` : ""}</aside>`;
  }
  return `<div class="examples">${block.items
    .map((item, index) => `<article class="example" style="--d:${140 + index * 120}ms">
      <span class="example-label">${escapeHtml(item.title || `Example ${index + 1}`)}</span>
      ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
    </article>`)
    .join("")}</div>`;
};

const baseStyles = `
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0}
body{font-family:'Segoe UI',system-ui,-apple-system,'Tajawal','Noto Naskh Arabic',sans-serif;color:#f8fafc;background:#101b33;-webkit-font-smoothing:antialiased}
.slide{position:relative;display:flex;width:100%;height:100%;flex-direction:column;justify-content:center;overflow:hidden;padding:clamp(18px,3.4vmin,46px);background:var(--bg)}
.slide::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 88% 4%,rgba(255,255,255,.14),transparent 42%),radial-gradient(circle at 6% 96%,rgba(0,0,0,.22),transparent 46%)}
.frame{position:relative;z-index:1;display:flex;width:100%;min-width:0;flex-direction:column;gap:clamp(10px,2vmin,24px)}
.kicker{display:inline-flex;align-self:flex-start;margin:0;padding:.42em .95em;border:1px solid var(--accent-line);border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:clamp(.62rem,1.15vmin,.9rem);font-weight:800;letter-spacing:.14em;text-transform:uppercase;animation:rise .5s ease-out both}
h1{margin:0;font-size:clamp(1.5rem,4.6vmin,3.5rem);font-weight:800;letter-spacing:-.035em;line-height:1.06;text-wrap:balance;overflow-wrap:anywhere;animation:rise .6s .06s ease-out both}
.body{display:flex;min-width:0;flex-direction:column;gap:clamp(8px,1.6vmin,18px)}
.lead{margin:0;max-width:58ch;color:#e8eefb;font-size:clamp(.88rem,2.2vmin,1.5rem);line-height:1.5;animation:rise .6s .12s ease-out both}
.points{display:grid;margin:0;padding:0;gap:clamp(6px,1.2vmin,12px);list-style:none;grid-template-columns:repeat(auto-fit,minmax(min(100%,30ch),1fr))}
.points li{display:flex;align-items:flex-start;gap:.7em;padding:.7em .95em;border:1px solid rgba(255,255,255,.2);border-radius:clamp(10px,1.6vmin,16px);background:rgba(255,255,255,.09);font-size:clamp(.8rem,1.95vmin,1.25rem);line-height:1.4;animation:rise .55s ease-out both;animation-delay:var(--d)}
.point-dot{width:.5em;height:.5em;flex:0 0 auto;margin-top:.42em;border-radius:50%;background:var(--accent)}
.cards{display:grid;gap:clamp(8px,1.4vmin,16px);grid-template-columns:repeat(auto-fit,minmax(min(100%,22ch),1fr))}
.card{display:flex;min-width:0;flex-direction:column;gap:.35em;padding:clamp(10px,2vmin,22px);border:1px solid rgba(255,255,255,.22);border-radius:clamp(12px,2vmin,20px);background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.06));box-shadow:0 14px 30px rgba(0,0,0,.16);animation:rise .6s ease-out both;animation-delay:var(--d)}
.card-index{color:var(--accent);font-size:clamp(.6rem,1.4vmin,.85rem);font-weight:800;letter-spacing:.12em}
.card h2{margin:0;font-size:clamp(.95rem,2.5vmin,1.6rem);line-height:1.15}
.card p{margin:0;color:#dde7f6;font-size:clamp(.78rem,1.85vmin,1.15rem);line-height:1.4}
.steps{display:grid;margin:0;padding:0;gap:clamp(6px,1.2vmin,12px);list-style:none}
.steps li{display:flex;align-items:flex-start;gap:.8em;animation:rise .55s ease-out both;animation-delay:var(--d)}
.step-dot{display:grid;width:clamp(24px,4.2vmin,38px);height:clamp(24px,4.2vmin,38px);flex:0 0 auto;place-items:center;border:2px solid var(--accent-line);border-radius:50%;background:var(--accent-soft);color:var(--accent);font-size:clamp(.72rem,1.7vmin,1rem);font-weight:800}
.step-copy{display:flex;min-width:0;flex-direction:column;gap:.15em;padding-top:.15em}
.step-copy strong{font-size:clamp(.85rem,2.1vmin,1.3rem);line-height:1.25;overflow-wrap:anywhere}
.step-copy span{color:#d5e0f0;font-size:clamp(.78rem,1.85vmin,1.1rem);line-height:1.4}
.compare{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:stretch;gap:clamp(8px,1.6vmin,18px);animation:rise .6s ease-out both}
.compare-side{min-width:0;padding:clamp(10px,2vmin,20px);border:1px solid rgba(255,255,255,.22);border-radius:clamp(12px,2vmin,20px);background:rgba(255,255,255,.09)}
.compare-side h2{margin:0 0 .5em;color:var(--accent);font-size:clamp(.9rem,2.2vmin,1.35rem)}
.compare-side ul{display:grid;margin:0;padding-inline-start:1.1em;gap:.4em;font-size:clamp(.78rem,1.85vmin,1.12rem);line-height:1.4}
.compare-arrow{align-self:center;color:var(--accent);font-size:clamp(1rem,2.6vmin,1.7rem)}
.callout{display:flex;flex-direction:column;gap:.25em;padding:clamp(9px,1.8vmin,16px) clamp(12px,2.2vmin,20px);border:1px solid var(--accent-line);border-radius:clamp(10px,1.8vmin,16px);background:var(--accent-soft);animation:rise .6s ease-out both;animation-delay:var(--d)}
.callout strong{color:var(--accent);font-size:clamp(.7rem,1.6vmin,.95rem);letter-spacing:.08em;text-transform:uppercase}
.callout p{margin:0;color:#f2f6ff;font-size:clamp(.82rem,1.95vmin,1.2rem);line-height:1.4}
.examples{display:grid;gap:clamp(8px,1.4vmin,16px);grid-template-columns:repeat(auto-fit,minmax(min(100%,24ch),1fr))}
.example{display:flex;min-width:0;flex-direction:column;gap:.35em;padding:clamp(10px,2vmin,20px);border-inline-start:4px solid var(--accent);border-radius:clamp(10px,1.6vmin,16px);background:rgba(255,255,255,.1);animation:rise .6s ease-out both;animation-delay:var(--d)}
.example-label{color:var(--accent);font-size:clamp(.62rem,1.4vmin,.85rem);font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.example p{margin:0;font-size:clamp(.82rem,1.95vmin,1.2rem);line-height:1.42;overflow-wrap:anywhere}
.layout-hero h1{font-size:clamp(1.9rem,6.4vmin,4.6rem)}
.layout-hero .body{gap:clamp(10px,2vmin,22px)}
.layout-goals .body,.layout-vocabulary .body,.layout-steps .body,.layout-examples .body{justify-content:flex-start}
.layout-steps .steps{grid-template-columns:repeat(auto-fit,minmax(min(100%,26ch),1fr))}
.layout-compare h1{font-size:clamp(1.35rem,3.6vmin,2.6rem)}
.layout-activity .body{justify-content:center}
.layout-exit .body{justify-content:center;gap:clamp(12px,2.4vmin,26px)}
.layout-exit h1{font-size:clamp(1.7rem,5vmin,3.6rem)}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@media (max-width:640px){.compare{grid-template-columns:1fr}.compare-arrow{display:none}.points{grid-template-columns:1fr}}
@media (max-height:420px){.kicker{display:none}.frame{gap:8px}h1{font-size:clamp(1.2rem,4vmin,2rem)}.body{gap:6px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

/**
 * Renders the one designed document for a teaching slide. `layout` and
 * `palette` are chosen from closed lists, never from model markup.
 */
export const renderDesignedSlideHtml = ({
  slideType = "content",
  title = "",
  blocks = [],
  layout = "",
  palette = null,
  language = "en",
}) => {
  const safeType = LAYOUTS_BY_SLIDE_TYPE[slideType] ? slideType : "content";
  const safeLayout = layoutForSlide({ slideType: safeType, requested: layout });
  const theme = palette || paletteFor({ slideType: safeType, seed: title });
  const direction = String(language).toLowerCase().startsWith("ar") ? "rtl" : "ltr";
  const bodyMarkup = blocks.length
    ? blocks.map(blockHtml).join("")
    : `<p class="lead">${escapeHtml(cleanLine(title))}</p>`;
  const html = `<!doctype html>
<html lang="${direction === "rtl" ? "ar" : "en"}" dir="${direction}">
<head><meta charset="utf-8"><style>
:root{--accent:${theme.accent};--accent-soft:${theme.accentSoft};--accent-line:${theme.accentLine};--bg:${theme.bg}}
${baseStyles}
</style></head>
<body>
<main class="slide layout-${safeLayout}" data-palette="${theme.name}">
<div class="frame">
<span class="kicker">${escapeHtml(kickerFor(safeType, language))}</span>
<header><h1>${escapeHtml(title)}</h1></header>
<div class="body">${bodyMarkup}</div>
</div>
</main>
</body>
</html>`;
  return html.slice(0, LIVE_LESSON_BUILDER.designMaxHtmlChars);
};

/**
 * Builds the stored slide from whatever the model or teacher supplied: real
 * blocks when present, otherwise the same text the native renderer used.
 */
export const buildDesignedSlide = ({
  slideType = "content",
  title = "",
  body = "",
  examples = [],
  blocks = [],
  layout = "",
  language = "en",
  seed = "",
  setupPalette = "",
}) => {
  const normalized = normalizeDesignedBlocks(blocks);
  const fallback = normalized.length ? normalized : blocksFromPlainText({ slideType, body, examples });
  const safeLayout = layoutForSlide({ slideType, requested: layout });
  const palette = resolveSlidePalette({
    setupPalette,
    fallback: paletteFor({ slideType, seed: seed || title }),
  });
  const html = renderDesignedSlideHtml({
    slideType,
    title,
    blocks: fallback,
    layout: safeLayout,
    palette,
    language,
  });
  return { blocks: fallback, layout: safeLayout, palette: palette.name, html };
};
