import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";
import {
  DEFAULT_PALETTE_ID,
  paletteById,
  paletteCssVariables,
} from "../config/liveLessonPalettes.js";
import { cleanText } from "./liveLessonBuilderSanitizeService.js";

/**
 * Contract for AI-authored teaching slides. The model writes a fragment with
 * empty text slots; this module validates it, injects the text map and wraps the
 * result in a server-owned document. The model never supplies doctype, meta,
 * direction or palette values, so every slide shares one shell and one palette.
 */

export const AI_SLIDE_ROLES = Object.freeze({
  title: { minVmin: 6.7, maxVmin: 8.9, singleLine: true },
  section: { minVmin: 5, maxVmin: 6.1, singleLine: true },
  main: { minVmin: 4.2, maxVmin: 5, singleLine: false },
  learner: { minVmin: 3.9, maxVmin: 6.1, singleLine: false },
  support: { minVmin: 3.3, maxVmin: 3.9, singleLine: false },
  meta: { minVmin: 2.8, maxVmin: 3.3, singleLine: true },
});

export const AI_SLIDE_ROLE_IDS = Object.freeze(Object.keys(AI_SLIDE_ROLES));

const ALLOWED_TAGS = new Set([
  "section", "div", "header", "main", "footer", "article", "aside", "nav",
  "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "span", "strong", "em", "b",
  "i", "u", "s", "small", "sub", "sup", "code", "pre", "blockquote", "q",
  "cite", "figure", "figcaption", "mark", "hr", "br",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "svg", "g", "path", "circle", "rect", "line", "polyline", "polygon",
  "ellipse", "defs", "lineargradient", "radialgradient", "stop", "clippath",
  "mask",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const COMMON_ATTRS = new Set([
  "class", "id", "style", "data-text", "data-role", "data-static",
  "data-slide-root", "aria-hidden",
]);

const SVG_ATTRS = new Set([
  "viewbox", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "x2", "y1",
  "y2", "points", "width", "height", "transform", "opacity", "fill",
  "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset",
  "clip-rule", "gradientunits", "gradienttransform", "offset", "stop-color",
  "stop-opacity", "preserveaspectratio", "patternunits", "clippathunits",
]);

const BOOLEAN_ATTRS = new Set(["data-slide-root", "data-static", "aria-hidden"]);

const COLOR_ATTRS = new Set(["fill", "stroke", "stop-color"]);

const COLOR_PROPERTY = /^(?:color|background|background-color|background-image|border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|stop-color|caret-color|text-decoration-color|column-rule(?:-color)?|filter|backdrop-filter)$/;

const CSS_NAMED_COLORS = new Set(
  ("aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
    "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse " +
    "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
    "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta " +
    "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
    "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite " +
    "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender " +
    "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink " +
    "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey " +
    "lightsteelblue lightyellow lime limegreen linen magenta maroon " +
    "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise " +
    "palevioletred papayawhip peachpuff peru pink plum powderblue purple " +
    "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey " +
    "snow springgreen steelblue tan teal thistle tomato turquoise violet " +
    "wheat white whitesmoke yellow yellowgreen")
    .split(" "),
);

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[a-zA-Z_:][\w:.-]*(?:\s*=\s*"[^"<>]*")?)*)\s*(\/?)>/g;
const ATTR_PATTERN = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*"([^"<>]*)")?/g;
const STYLE_BLOCK_PATTERN = /<style\b([^<>]*)>([\s\S]*?)<\/style\s*>/gi;
const SLOT_ID_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const toBr = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");

const attrMap = (raw) => {
  const attrs = new Map();
  let duplicate = "";
  for (const match of raw.matchAll(ATTR_PATTERN)) {
    const name = match[1].toLowerCase();
    if (attrs.has(name)) duplicate = name;
    attrs.set(name, match[2] === undefined ? null : match[2]);
  }
  return { attrs, duplicate };
};

const fontSizes = (style) => [
  ...String(style || "").matchAll(/(?:^|;)\s*font-size\s*:\s*([^;]+)/gi),
].map((match) => match[1].trim());

const parseVmin = (value) => {
  const match = String(value || "").match(/^([0-9]*\.?[0-9]+)vmin$/);
  return match ? Number(match[1]) : null;
};

const neutralColorValue = (value) => String(value)
  .replace(/var\(--slide-[a-z0-9-]+(?:\s*,\s*[^)]*)?\)/gi, " ")
  .replace(/rgba?\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*,\s*[^)]*\)/gi, " ")
  .replace(/\b(?:transparent|currentcolor|none|inherit|initial|unset|auto)\b/gi, " ")
  .replace(/\b(?:linear-gradient|radial-gradient|conic-gradient)\(/gi, "(");

const hasOffPaletteColor = (value) => {
  const rest = neutralColorValue(value);
  if (/#[0-9a-f]{3,8}\b/i.test(rest)) return true;
  if (/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)\(/i.test(rest)) return true;
  const words = rest.toLowerCase().match(/[a-z]+/g) || [];
  return words.some((word) => CSS_NAMED_COLORS.has(word));
};

const inspectDeclarations = ({ css, language, violations }) => {
  for (const match of String(css || "").matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
    const property = match[1].toLowerCase();
    const value = match[2].trim();
    if (property === "letter-spacing" && String(language).toLowerCase().startsWith("ar")) {
      violations.push("Arabic slides must not use letter-spacing.");
    }
    if (property === "animation" || property === "animation-duration") {
      const time = value.match(/([0-9]*\.?[0-9]+)(ms|s)\b/i);
      if (time) {
        const ms = time[2].toLowerCase() === "s" ? Number(time[1]) * 1000 : Number(time[1]);
        if (ms > LIVE_LESSON_BUILDER.aiSlideMaxAnimationMs) {
          violations.push(`Animations must finish within ${LIVE_LESSON_BUILDER.aiSlideMaxAnimationMs} ms.`);
        }
      }
      if (/\binfinite\b/i.test(value)) {
        violations.push("Content slides must not loop animations forever.");
      }
    }
    if (property === "animation-iteration-count" && /\binfinite\b/i.test(value)) {
      violations.push("Content slides must not loop animations forever.");
    }
    if (COLOR_PROPERTY.test(property) && hasOffPaletteColor(value)) {
      violations.push(`Color "${property}: ${value}" must use a palette variable or a neutral transparent tone.`);
    }
  }
};

const inspectStyleBlock = ({ css, language, violations }) => {
  const text = String(css || "");
  if (/</.test(text)) violations.push("The style block must not contain markup.");
  if (/@import\b/i.test(text)) violations.push("@import is not allowed.");
  if (/url\s*\(/i.test(text)) violations.push("url() is not allowed.");
  if (/@font-face\b/i.test(text)) violations.push("Custom fonts are not allowed.");
  if (/\bexpression\s*\(|\bbehavior\s*:/i.test(text)) violations.push("Scripted CSS is not allowed.");
  if (/(^|[,{}])\s*(?:html|body|:root|:host)\b/i.test(text)) {
    violations.push("The slide must not style html, body or :root; the shared shell owns them.");
  }
  if (!/@keyframes\b/i.test(text)) {
    violations.push("The slide needs at least one @keyframes entrance animation.");
  }
  if (!/\banimation\b/i.test(text)) {
    violations.push("The slide needs at least one CSS animation.");
  }
  inspectDeclarations({ css: text, language, violations });
};

const injectTexts = (fragment, texts) => {
  let output = "";
  let cursor = 0;
  for (const match of fragment.matchAll(TAG_PATTERN)) {
    output += fragment.slice(cursor, match.index) + match[0];
    cursor = match.index + match[0].length;
    const [, closing, rawName, rawAttrs, selfClosing] = match;
    if (closing || selfClosing || VOID_TAGS.has(rawName.toLowerCase())) continue;
    const { attrs } = attrMap(rawAttrs);
    const slotId = attrs.get("data-text");
    if (slotId && texts[slotId] !== undefined) output += toBr(texts[slotId]);
  }
  return output + fragment.slice(cursor);
};

const parseFragment = ({ fragment, violations }) => {
  const markup = fragment.replace(STYLE_BLOCK_PATTERN, "");
  if (/<\/?\s*style\b/i.test(markup)) violations.push("Style tags must have a closing tag.");

  const roots = [];
  const stack = [];
  const slots = [];
  const inlineStyles = [];
  let staticTotal = 0;
  let cursor = 0;

  const noteText = (raw) => {
    const value = raw.trim();
    if (!value) return;
    if (value.includes("<")) {
      violations.push("A stray < character breaks the slide markup.");
      return;
    }
    const staticAncestor = [...stack].reverse().find((entry) => entry.attrs.has("data-static"));
    if (!staticAncestor) {
      violations.push("Visible text must live in an empty data-text slot.");
      return;
    }
    if ([...value].length > LIVE_LESSON_BUILDER.aiSlideStaticChars) {
      violations.push(`Decorative text is limited to ${LIVE_LESSON_BUILDER.aiSlideStaticChars} characters.`);
    }
    staticTotal += [...value].length;
  };

  for (const match of markup.matchAll(TAG_PATTERN)) {
    noteText(markup.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const [, closing, rawName, rawAttrs, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) {
      violations.push(`<${rawName}> is not an allowed element.`);
      continue;
    }
    if (closing) {
      if (!stack.length) {
        violations.push(`</${rawName}> has no matching opening tag.`);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.name !== name) {
        violations.push(`</${rawName}> closes <${top.name}> out of order.`);
        continue;
      }
      stack.pop();
      continue;
    }

    const { attrs, duplicate } = attrMap(rawAttrs);
    if (duplicate) violations.push(`Attribute "${duplicate}" appears twice on <${rawName}>.`);
    for (const [attrName, attrValue] of attrs) {
      if (!COMMON_ATTRS.has(attrName) && !SVG_ATTRS.has(attrName)) {
        violations.push(`Attribute "${attrName}" is not allowed on <${rawName}>.`);
      }
      if (attrValue === null && !BOOLEAN_ATTRS.has(attrName)) {
        violations.push(`Attribute "${attrName}" needs a quoted value.`);
      }
    }
    for (const [attrName, attrValue] of attrs) {
      if (COLOR_ATTRS.has(attrName) && attrValue && hasOffPaletteColor(attrValue)) {
        violations.push(`SVG paint "${attrName}" must use a palette variable or a neutral tone.`);
      }
    }
    if (attrs.has("style")) inlineStyles.push(attrs.get("style"));

    const slotId = attrs.get("data-text") ?? null;
    if (attrs.has("data-text")) {
      if (!SLOT_ID_PATTERN.test(slotId)) {
        violations.push(`Slot id "${slotId}" must be lowercase letters, digits and dashes.`);
      }
      const role = attrs.get("data-role");
      if (!AI_SLIDE_ROLES[role]) {
        violations.push(`Slot "${slotId}" needs data-role from: ${AI_SLIDE_ROLE_IDS.join(", ")}.`);
      }
      const sizes = fontSizes(attrs.get("style"));
      if (sizes.length !== 1) {
        violations.push(`Slot "${slotId}" needs exactly one inline font-size.`);
      } else {
        const vmin = parseVmin(sizes[0]);
        const range = AI_SLIDE_ROLES[role];
        if (vmin === null) {
          violations.push(`Slot "${slotId}" font-size must be a plain vmin value.`);
        } else if (range && (vmin < range.minVmin || vmin > range.maxVmin)) {
          violations.push(`Slot "${slotId}" font-size ${vmin}vmin is outside ${range.minVmin}–${range.maxVmin}vmin for role ${role}.`);
        }
      }
    }

    const node = { name, attrs, slotId };
    for (const ancestor of stack) {
      if (ancestor.slotId) ancestor.elementChildren = (ancestor.elementChildren || 0) + 1;
    }
    if (slotId) {
      node.elementChildren = 0;
      slots.push(node);
    }
    if (!stack.length) roots.push(node);
    if (!selfClosing && !VOID_TAGS.has(name)) stack.push(node);
  }
  noteText(markup.slice(cursor));
  if (stack.length) violations.push(`<${stack[stack.length - 1].name}> is never closed.`);
  if (staticTotal > LIVE_LESSON_BUILDER.aiSlideStaticTotalChars) {
    violations.push("Decorative text is too long.");
  }
  return { roots, slots, inlineStyles };
};

/** Text slots in document order; the visual editor and preview outline use this. */
export const listTextSlots = (fragment) => {
  const slots = [];
  for (const match of String(fragment || "").matchAll(TAG_PATTERN)) {
    if (match[1]) continue;
    const { attrs } = attrMap(match[3]);
    const id = attrs.get("data-text");
    if (!id) continue;
    const role = attrs.get("data-role");
    slots.push({
      id,
      role: AI_SLIDE_ROLES[role] ? role : "main",
      tag: match[2].toLowerCase(),
    });
  }
  return slots;
};

/**
 * Validates the model's fragment and text map. Returns human-readable
 * violations because the same list is fed back to the one included repair call.
 */
export const validateAiSlideFragment = ({
  html,
  texts,
  speakerNotes,
  language = "en",
}) => {
  const violations = [];
  const fragment = String(html || "");

  if (!fragment.trim()) {
    return { ok: false, violations: ["The slide is empty."], texts: {}, notes: "" };
  }
  if (fragment.length > LIVE_LESSON_BUILDER.aiSlideMaxChars) {
    violations.push(`The slide exceeds ${LIVE_LESSON_BUILDER.aiSlideMaxChars} characters.`);
  }
  if (/<!|<html|<head|<body|<meta|<link|<base|<form|<input|<img|<object|<embed|<script|<iframe/i.test(fragment)) {
    violations.push("The slide must be a fragment: no doctype, html, head, body, meta, links, forms or embeds.");
  }
  if (/<!--|<!\[CDATA\[/i.test(fragment)) violations.push("Comments are not allowed.");
  if (/javascript\s*:|https?\s*:|\bdata\s*:/i.test(fragment)) {
    violations.push("Script and external URLs are not allowed.");
  }

  const styleBlocks = [...fragment.matchAll(STYLE_BLOCK_PATTERN)];
  if (styleBlocks.length !== 1) violations.push("The slide needs exactly one style block.");
  for (const block of styleBlocks) {
    if (String(block[1] || "").trim()) violations.push("The style tag must not have attributes.");
  }

  const { roots, slots, inlineStyles } = parseFragment({ fragment, violations });
  if (roots.length !== 1) violations.push("The slide needs exactly one root element.");
  const root = roots[0];
  if (root) {
    if (root.name !== "section") violations.push("The slide root must be a <section>.");
    if (!String(root.attrs.get("class") || "").split(/\s+/).includes("slide")) {
      violations.push('The root must carry class="slide".');
    }
    if (!root.attrs.has("data-slide-root")) violations.push("The root must carry data-slide-root.");
  }
  for (const slot of slots) {
    if (slot.elementChildren > 0) violations.push(`Slot "${slot.slotId}" must be empty.`);
  }
  if (!slots.some((slot) => slot.attrs.get("data-role") === "title")) {
    violations.push("Every teaching slide needs one title slot.");
  }
  if (slots.length > LIVE_LESSON_BUILDER.aiSlideMaxSlots) {
    violations.push(`A slide may have at most ${LIVE_LESSON_BUILDER.aiSlideMaxSlots} text slots.`);
  }

  const blockCss = styleBlocks.map((block) => block[2]).join("\n");
  inspectStyleBlock({ css: blockCss, language, violations });
  for (const style of inlineStyles) inspectDeclarations({ css: style, language, violations });
  const allCss = [blockCss, ...inlineStyles].join("\n");
  if (!allCss.includes("var(--slide-")) {
    violations.push("The slide must color itself with the palette variables.");
  }

  const rawTexts = texts && typeof texts === "object" && !Array.isArray(texts) ? texts : {};
  const cleanTexts = {};
  for (const [key, value] of Object.entries(rawTexts)) {
    if (!SLOT_ID_PATTERN.test(key)) {
      violations.push(`Text key "${key}" must be lowercase letters, digits and dashes.`);
      continue;
    }
    if (typeof value !== "string") {
      violations.push(`Text "${key}" must be a string.`);
      continue;
    }
    cleanTexts[key] = cleanText(value, { maxLength: LIVE_LESSON_BUILDER.aiSlideSlotChars });
  }
  let visibleChars = 0;
  for (const slot of slots) {
    if (!(slot.slotId in cleanTexts)) {
      violations.push(`Slot "${slot.slotId}" has no text.`);
      continue;
    }
    const value = cleanTexts[slot.slotId];
    const range = AI_SLIDE_ROLES[slot.attrs.get("data-role")];
    if (!value.trim()) violations.push(`Slot "${slot.slotId}" text is empty.`);
    if (range?.singleLine && /\n/.test(value)) violations.push(`Slot "${slot.slotId}" must be one line.`);
    visibleChars += [...value].length;
  }
  for (const key of Object.keys(cleanTexts)) {
    if (!slots.some((slot) => slot.slotId === key)) violations.push(`Text "${key}" has no matching slot.`);
  }
  if (visibleChars > LIVE_LESSON_BUILDER.aiSlideVisibleChars) {
    violations.push(`A slide may hold at most ${LIVE_LESSON_BUILDER.aiSlideVisibleChars} characters of visible text.`);
  }
  const notes = typeof speakerNotes === "string" ? speakerNotes : "";
  if (notes.length > LIVE_LESSON_BUILDER.notesMax) {
    violations.push(`Speaker notes are limited to ${LIVE_LESSON_BUILDER.notesMax} characters.`);
  }

  return {
    ok: violations.length === 0,
    violations,
    fragment,
    texts: cleanTexts,
    notes: cleanText(notes, { maxLength: LIVE_LESSON_BUILDER.notesMax }),
  };
};

const SHELL_STYLES = `
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--slide-bg)}
body{font-family:'Segoe UI',system-ui,-apple-system,'Tajawal','Noto Naskh Arabic',sans-serif;color:var(--slide-ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
[data-text]{overflow-wrap:anywhere}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`.trim();

/** Wraps a validated fragment in the one shared document every AI slide uses. */
export const buildAiSlideDocument = ({ fragment, palette, language = "en" }) => {
  const theme = typeof palette === "string"
    ? paletteById(palette) || paletteById(DEFAULT_PALETTE_ID)
    : palette || paletteById(DEFAULT_PALETTE_ID);
  const arabic = String(language).toLowerCase().startsWith("ar");
  return `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root{${paletteCssVariables(theme)}}
${SHELL_STYLES}
</style></head>
<body>
${fragment}
</body>
</html>`;
};

/** Rebuilds the stored document from the fragment and text map after an edit. */
export const rebuildAiSlideHtml = ({ fragment, texts, palette, language = "en" }) =>
  compileAiSlide({ html: fragment, texts, speakerNotes: "", palette, language });

/**
 * Validate → inject text → wrap. The returned `html` is the stored slide; the
 * fragment and cleaned text map are what visual editing reads and rewrites.
 */
export const compileAiSlide = ({
  html,
  texts,
  speakerNotes,
  palette,
  language = "en",
}) => {
  const checked = validateAiSlideFragment({ html, texts, speakerNotes, language });
  if (!checked.ok) return checked;
  return {
    ok: true,
    fragment: checked.fragment,
    texts: checked.texts,
    speakerNotes: checked.notes,
    html: buildAiSlideDocument({
      fragment: injectTexts(checked.fragment, checked.texts),
      palette,
      language,
    }),
  };
};
