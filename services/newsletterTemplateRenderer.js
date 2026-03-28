/**
 * Newsletter Template Renderer
 *
 * Renders a NewsletterTemplate document into inline-CSS HTML suitable for
 * email clients. Used by the email-send pipeline when a template is active.
 */

function esc(str) {
  return (str || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function md2html(text) {
  return esc(text).replace(/\n/g, "<br/>");
}

/* ── Resolve colours from template + school branding fallback ──── */
function resolveStyle(template, branding = {}) {
  const g = template?.globalStyle || {};
  return {
    primaryColor: g.primaryColor || branding.primaryColor || "#0d9488",
    secondaryColor: g.secondaryColor || branding.secondaryColor || "#0f766e",
    backgroundColor: g.backgroundColor || "#ffffff",
    headerBg: g.headerBackgroundColor || "",
    headerTextColor: g.headerTextColor || "#ffffff",
    bodyTextColor: g.bodyTextColor || "#334155",
    footerTextColor: g.footerTextColor || "#94a3b8",
    accentColor: g.accentColor || "",
    cardBg: g.cardBackgroundColor || "#f8fafc",
    cardBorder: g.cardBorderColor || "#e2e8f0",
    dividerColor: g.dividerColor || "#e2e8f0",
    fontFamily: g.fontFamily || "Arial, Helvetica, sans-serif",
    headingFont: g.headingFontFamily || g.fontFamily || "Arial, Helvetica, sans-serif",
    baseFontSize: g.baseFontSize || "14px",
    headingFontSize: g.headingFontSize || "20px",
    lineHeight: g.lineHeight || "1.6",
    maxWidth: g.maxWidth || "680px",
    contentPadding: g.contentPadding || "24px",
    sectionSpacing: g.sectionSpacing || "16px",
    borderRadius: g.borderRadius || "12px",
    headerBorderRadius: g.headerBorderRadius || "12px",
    showLogo: g.showLogo !== false,
    logoPosition: g.logoPosition || "right",
    logoMaxHeight: g.logoMaxHeight || "40px",
    headerStyle: g.headerStyle || "gradient",
    footerText:
      g.footerText ||
      "This email was sent by the school. If you have questions, please contact the school office.",
    showFooter: g.showFooter !== false,
  };
}

/* ── Header block builders ─────────────────────────────────────── */
function buildHeaderGradient(s, logoUrl, schoolName) {
  const bg = `linear-gradient(135deg, ${esc(s.primaryColor)} 0%, ${esc(s.secondaryColor)} 100%)`;
  return buildHeaderShell(bg, s, logoUrl, schoolName);
}

function buildHeaderSolid(s, logoUrl, schoolName) {
  return buildHeaderShell(esc(s.headerBg || s.primaryColor), s, logoUrl, schoolName);
}

function buildHeaderMinimal(s, logoUrl, schoolName) {
  return buildHeaderShell("#ffffff", { ...s, headerTextColor: s.bodyTextColor }, logoUrl, schoolName);
}

function buildHeaderBanner(s, logoUrl, schoolName) {
  const bg = `linear-gradient(90deg, ${esc(s.primaryColor)} 0%, ${esc(s.secondaryColor)} 100%)`;
  return buildHeaderShell(bg, s, logoUrl, schoolName);
}

function buildHeaderShell(background, s, logoUrl, schoolName) {
  const logoAlign = { left: "flex-start", center: "center", right: "flex-end" }[s.logoPosition] || "flex-end";
  const logoHtml =
    s.showLogo && logoUrl
      ? `<img src="${esc(logoUrl)}" alt="${esc(schoolName)} logo" style="max-height:${esc(s.logoMaxHeight)};max-width:140px;object-fit:contain;background:#fff;padding:4px;border-radius:6px;" />`
      : "";
  return `<div style="padding:16px ${esc(s.contentPadding)};border-radius:${esc(s.headerBorderRadius)};background:${background};">
  <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;">
    <div style="flex:1;">{HEADER_CONTENT}</div>
    ${logoHtml ? `<div style="display:flex;align-items:center;justify-content:${logoAlign};">${logoHtml}</div>` : ""}
  </div>
</div>`;
}

const headerBuilders = {
  gradient: buildHeaderGradient,
  solid: buildHeaderSolid,
  minimal: buildHeaderMinimal,
  banner: buildHeaderBanner,
};

/* ── Section block renderers ───────────────────────────────────── */
function blockStyle(block, defaults = {}) {
  const bs = block.style || {};
  const parts = [];
  if (bs.backgroundColor || defaults.bg) parts.push(`background:${esc(bs.backgroundColor || defaults.bg)}`);
  if (bs.textColor || defaults.color) parts.push(`color:${esc(bs.textColor || defaults.color)}`);
  if (bs.textAlign) parts.push(`text-align:${esc(bs.textAlign)}`);
  if (bs.padding || defaults.padding) parts.push(`padding:${esc(bs.padding || defaults.padding)}`);
  if (bs.borderRadius || defaults.borderRadius) parts.push(`border-radius:${esc(bs.borderRadius || defaults.borderRadius)}`);
  if (bs.fontSize || defaults.fontSize) parts.push(`font-size:${esc(bs.fontSize || defaults.fontSize)}`);
  if (bs.fontWeight) parts.push(`font-weight:${esc(bs.fontWeight)}`);
  return parts.join(";");
}

function renderHeaderBlock(block, s, logoUrl, schoolName) {
  const heading = block.heading || "Weekly Newsletter";
  const sub = block.subheading || "";
  const builder = headerBuilders[s.headerStyle] || headerBuilders.gradient;
  let shell = builder(s, logoUrl, schoolName);
  const innerHtml = `
    <div style="font-size:${esc(s.headingFontSize)};font-weight:800;color:${esc(s.headerTextColor)};font-family:${esc(s.headingFont)};">${esc(heading)}</div>
    ${sub ? `<div style="margin-top:4px;font-size:13px;color:${esc(s.headerTextColor)};opacity:0.85;">${md2html(sub)}</div>` : ""}
  `;
  shell = shell.replace("{HEADER_CONTENT}", innerHtml);
  return shell;
}

function renderImageBlock(block) {
  if (!block.imageUrl) return "";
  const align = block.style?.textAlign || "center";
  return `<div style="text-align:${align};"><img src="${esc(block.imageUrl)}" alt="${esc(block.imageAlt || "")}" style="max-width:100%;border-radius:8px;" /></div>`;
}

function renderSubjectsBlock(subjectSections, s) {
  if (!subjectSections || subjectSections.length === 0) {
    return `<div style="color:${esc(s.bodyTextColor)};">No sections available.</div>`;
  }
  return subjectSections
    .map((sec) => {
      const name = esc(sec.subject?.name || "Subject");
      const content = md2html(sec.content || "");
      return `<div style="margin:${esc(s.sectionSpacing)} 0;padding:14px;background:${esc(s.cardBg)};border:1px solid ${esc(s.cardBorder)};border-radius:${esc(s.borderRadius)};">
  <div style="font-weight:700;color:${esc(s.accentColor || s.primaryColor)};margin-bottom:6px;font-family:${esc(s.headingFont)};">${name}</div>
  <div style="color:${esc(s.bodyTextColor)};line-height:${esc(s.lineHeight)};font-size:${esc(s.baseFontSize)};">${content}</div>
</div>`;
    })
    .join("\n");
}

function renderDividerBlock(s) {
  return `<hr style="border:0;border-top:1px solid ${esc(s.dividerColor)};margin:${esc(s.sectionSpacing)} 0;" />`;
}

function renderCalloutBlock(block, s) {
  const emoji = block.iconEmoji || "💡";
  const style = blockStyle(block, {
    bg: s.cardBg,
    padding: "14px 16px",
    borderRadius: s.borderRadius,
    color: s.bodyTextColor,
    fontSize: s.baseFontSize,
  });
  return `<div style="border-left:4px solid ${esc(s.accentColor || s.primaryColor)};${style}">
  <span style="font-size:18px;margin-right:6px;">${esc(emoji)}</span>${md2html(block.content || "")}
</div>`;
}

function renderTwoColumnBlock(block, s) {
  const style = blockStyle(block, { color: s.bodyTextColor, fontSize: s.baseFontSize });
  return `<div style="display:flex;gap:16px;${style}">
  <div style="flex:1;line-height:${esc(s.lineHeight)};">${md2html(block.leftContent || "")}</div>
  <div style="flex:1;line-height:${esc(s.lineHeight)};">${md2html(block.rightContent || "")}</div>
</div>`;
}

function renderFooterBlock(block, s) {
  const text = block.content || s.footerText;
  if (!s.showFooter && !block.content) return "";
  return `<div style="margin-top:${esc(s.sectionSpacing)};padding-top:12px;border-top:1px solid ${esc(s.dividerColor)};color:${esc(s.footerTextColor)};font-size:12px;">${md2html(text)}</div>`;
}

/* ── New block renderers ───────────────────────────────────────── */

function renderHeroBannerBlock(block, s) {
  const bgImage = block.style?.backgroundImageUrl || block.imageUrl || "";
  const opacity = block.style?.overlayOpacity ?? 0.5;
  const heading = block.heading || "";
  const sub = block.subheading || "";
  if (!bgImage && !heading) return "";
  const bgStyle = bgImage
    ? `background-image:url('${esc(bgImage)}');background-size:cover;background-position:center;`
    : `background:${esc(s.primaryColor)};`;
  return `<div style="position:relative;${bgStyle}border-radius:${esc(s.borderRadius)};overflow:hidden;min-height:180px;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,${opacity});"></div>
  <div style="position:relative;padding:32px ${esc(s.contentPadding)};text-align:center;">
    ${heading ? `<div style="font-size:${esc(s.headingFontSize)};font-weight:800;color:#fff;font-family:${esc(s.headingFont)};">${esc(heading)}</div>` : ""}
    ${sub ? `<div style="margin-top:8px;font-size:14px;color:#fff;opacity:0.9;">${md2html(sub)}</div>` : ""}
  </div>
</div>`;
}

function renderImageGridBlock(block, s) {
  const imgs = Array.isArray(block.images) ? block.images.filter((i) => i.url) : [];
  if (imgs.length === 0) return "";
  const cellWidth = imgs.length <= 2 ? "50%" : "33.33%";
  const cells = imgs
    .slice(0, 4)
    .map(
      (img) =>
        `<td style="width:${cellWidth};padding:4px;"><img src="${esc(img.url)}" alt="${esc(img.alt || "")}" style="width:100%;border-radius:6px;display:block;" /></td>`
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>${cells}</tr></table>`;
}

function renderEventsListBlock(block, s) {
  const events = Array.isArray(block.events) ? block.events.filter((e) => e.title) : [];
  if (events.length === 0) return "";
  const rows = events
    .map(
      (ev) =>
        `<tr>
  <td style="padding:8px 12px 8px 0;vertical-align:top;white-space:nowrap;font-weight:700;color:${esc(s.accentColor || s.primaryColor)};font-size:${esc(s.baseFontSize)};">${esc(ev.date || "")}</td>
  <td style="padding:8px 0;vertical-align:top;">
    <div style="font-weight:600;color:${esc(s.bodyTextColor)};font-size:${esc(s.baseFontSize)};">${esc(ev.title)}</div>
    ${ev.description ? `<div style="color:${esc(s.footerTextColor)};font-size:12px;margin-top:2px;">${esc(ev.description)}</div>` : ""}
  </td>
</tr>`
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">${rows}</table>`;
}

function renderSpotlightBlock(block, s) {
  const avatar = block.avatarUrl || "";
  const name = block.heading || "";
  const role = block.role || "";
  const quote = block.quote || block.content || "";
  if (!name && !quote) return "";
  const avatarHtml = avatar
    ? `<td style="width:64px;padding-right:14px;vertical-align:top;"><img src="${esc(avatar)}" alt="${esc(name)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" /></td>`
    : "";
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${esc(s.cardBg)};border:1px solid ${esc(s.cardBorder)};border-radius:${esc(s.borderRadius)};padding:14px;">
  <tr>
    ${avatarHtml}
    <td style="vertical-align:top;">
      ${name ? `<div style="font-weight:700;color:${esc(s.bodyTextColor)};font-size:${esc(s.baseFontSize)};">${esc(name)}</div>` : ""}
      ${role ? `<div style="color:${esc(s.footerTextColor)};font-size:12px;">${esc(role)}</div>` : ""}
      ${quote ? `<div style="margin-top:6px;color:${esc(s.bodyTextColor)};font-style:italic;font-size:${esc(s.baseFontSize)};">"${md2html(quote)}"</div>` : ""}
    </td>
  </tr>
</table>`;
}

function renderButtonBlock(block, s) {
  const label = block.buttonLabel || "Click Here";
  const url = block.buttonUrl || "#";
  const btnStyle = block.buttonStyle || "filled";
  const bgColor = btnStyle === "outline" ? "transparent" : esc(s.accentColor || s.primaryColor);
  const textColor = btnStyle === "outline" ? esc(s.accentColor || s.primaryColor) : "#ffffff";
  const border = btnStyle === "outline" ? `2px solid ${esc(s.accentColor || s.primaryColor)}` : "none";
  const radius = btnStyle === "pill" ? "50px" : "6px";
  return `<div style="text-align:center;padding:8px 0;">
  <a href="${esc(url)}" style="display:inline-block;padding:10px 24px;background:${bgColor};color:${textColor};border:${border};border-radius:${radius};font-weight:600;font-size:${esc(s.baseFontSize)};text-decoration:none;font-family:${esc(s.fontFamily)};">${esc(label)}</a>
</div>`;
}

function renderHeadingBlock(block, s) {
  const text = block.heading || block.content || "";
  if (!text) return "";
  const style = blockStyle(block, { color: s.accentColor || s.primaryColor, fontSize: s.headingFontSize });
  return `<h2 style="margin:0;font-family:${esc(s.headingFont)};font-weight:700;${style}">${esc(text)}</h2>`;
}

function renderThreeColumnBlock(block, s) {
  const style = blockStyle(block, { color: s.bodyTextColor, fontSize: s.baseFontSize });
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="${style}">
  <tr>
    <td style="width:33.33%;padding:0 8px 0 0;vertical-align:top;line-height:${esc(s.lineHeight)};">${md2html(block.leftContent || "")}</td>
    <td style="width:33.33%;padding:0 4px;vertical-align:top;line-height:${esc(s.lineHeight)};">${md2html(block.middleContent || "")}</td>
    <td style="width:33.33%;padding:0 0 0 8px;vertical-align:top;line-height:${esc(s.lineHeight)};">${md2html(block.rightContent || "")}</td>
  </tr>
</table>`;
}

function renderSpacerBlock(block) {
  const h = block.spacerHeight || "24px";
  return `<div style="height:${esc(h)};"></div>`;
}

function renderSocialLinksBlock(block, s) {
  const links = block.socialLinks || {};
  const items = [];
  if (links.website) items.push(`<a href="${esc(links.website)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">🌐 Website</a>`);
  if (links.email) items.push(`<a href="mailto:${esc(links.email)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">✉️ Email</a>`);
  if (links.phone) items.push(`<a href="tel:${esc(links.phone)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">📞 Phone</a>`);
  if (links.facebook) items.push(`<a href="${esc(links.facebook)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">Facebook</a>`);
  if (links.instagram) items.push(`<a href="${esc(links.instagram)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">Instagram</a>`);
  if (links.twitter) items.push(`<a href="${esc(links.twitter)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">Twitter</a>`);
  if (links.youtube) items.push(`<a href="${esc(links.youtube)}" style="color:${esc(s.accentColor || s.primaryColor)};text-decoration:none;margin:0 8px;">YouTube</a>`);
  if (items.length === 0) return "";
  return `<div style="text-align:center;padding:12px 0;font-size:13px;">${items.join("")}</div>`;
}

function renderContactInfoBlock(block, s) {
  const info = block.contactInfo || {};
  const parts = [];
  if (info.name) parts.push(`<strong>${esc(info.name)}</strong>`);
  if (info.address) parts.push(esc(info.address));
  if (info.phone) parts.push(`📞 ${esc(info.phone)}`);
  if (info.email) parts.push(`✉️ ${esc(info.email)}`);
  if (parts.length === 0) return "";
  return `<div style="text-align:center;color:${esc(s.footerTextColor)};font-size:12px;line-height:1.6;">${parts.join("<br/>")}</div>`;
}

/* ── Render text block (supports rich content) ─────────────────── */
function renderTextBlock(block, s) {
  const style = blockStyle(block, { color: s.bodyTextColor, fontSize: s.baseFontSize });
  // If richContent is present, render it directly (already sanitised on save).
  if (block.richContent) {
    return `<div style="line-height:${esc(s.lineHeight)};${style}">${block.richContent}</div>`;
  }
  return `<div style="line-height:${esc(s.lineHeight)};${style}">${md2html(block.content || "")}</div>`;
}

/* ── Main render function ──────────────────────────────────────── */

/**
 * Render a newsletter template into an inline-CSS HTML string.
 *
 * @param {Object} options
 * @param {Object} options.template      - The NewsletterTemplate document (lean ok)
 * @param {string} options.classLabel    - e.g. "5-A Green"
 * @param {string} options.weekLabel     - e.g. "3/21/2026 – 3/27/2026"
 * @param {Array}  options.sections      - Approved NewsletterSection docs with .subject populated
 * @param {string} options.schoolName    - School display name
 * @param {Object} options.branding      - school.settings.branding (fallback colours)
 * @returns {string} HTML string ready for email
 */
export function renderTemplateHtml({
  template,
  classLabel = "",
  weekLabel = "",
  sections = [],
  schoolName = "School",
  branding = {},
}) {
  const s = resolveStyle(template, branding);
  const logoUrl = (branding?.logoUrl || "").toString().trim();

  const blocks = [...(template?.sections || [])]
    .filter((b) => b.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Inject metadata placeholders for {classLabel} and {weekLabel}
  const interpolate = (text) =>
    (text || "")
      .replace(/\{classLabel\}/gi, esc(classLabel))
      .replace(/\{weekLabel\}/gi, esc(weekLabel))
      .replace(/\{schoolName\}/gi, esc(schoolName));

  const blockHtmls = blocks.map((block) => {
    // Make an interpolated copy for text-bearing blocks
    const b = {
      ...block,
      content: interpolate(block.content),
      richContent: block.richContent ? interpolate(block.richContent) : "",
      heading: interpolate(block.heading),
      subheading: interpolate(block.subheading),
      leftContent: interpolate(block.leftContent),
      rightContent: interpolate(block.rightContent),
      middleContent: interpolate(block.middleContent),
    };

    switch (b.type) {
      case "header":
        return renderHeaderBlock(b, s, logoUrl, schoolName);
      case "text":
        return renderTextBlock(b, s);
      case "image":
        return renderImageBlock(b);
      case "subjects":
        return renderSubjectsBlock(sections, s);
      case "divider":
        return renderDividerBlock(s);
      case "callout":
        return renderCalloutBlock(b, s);
      case "two_column":
        return renderTwoColumnBlock(b, s);
      case "footer":
        return renderFooterBlock(b, s);
      case "hero_banner":
        return renderHeroBannerBlock(b, s);
      case "image_grid":
        return renderImageGridBlock(b, s);
      case "events_list":
        return renderEventsListBlock(b, s);
      case "spotlight":
        return renderSpotlightBlock(b, s);
      case "button":
        return renderButtonBlock(b, s);
      case "heading":
        return renderHeadingBlock(b, s);
      case "three_column":
        return renderThreeColumnBlock(b, s);
      case "spacer":
        return renderSpacerBlock(b);
      case "social_links":
        return renderSocialLinksBlock(b, s);
      case "contact_info":
        return renderContactInfoBlock(b, s);
      default:
        return "";
    }
  });

  // If no explicit footer block and showFooter is on, append one
  const hasFooter = blocks.some((b) => b.type === "footer");
  if (!hasFooter && s.showFooter) {
    blockHtmls.push(renderFooterBlock({ content: s.footerText }, s));
  }

  return `<div style="font-family:${esc(s.fontFamily)};max-width:${esc(s.maxWidth)};margin:0 auto;padding:${esc(s.contentPadding)};background:${esc(s.backgroundColor)};">
${blockHtmls.filter(Boolean).join(`\n<div style="height:${esc(s.sectionSpacing)};"></div>\n`)}
</div>`;
}

/**
 * Returns a default template structure for schools with no saved template.
 * This produces the same visual output as the legacy hardcoded HTML.
 */
export function getBuiltinDefaultSections() {
  return [
    {
      id: "header-1",
      type: "header",
      order: 0,
      visible: true,
      heading: "Weekly Newsletter",
      subheading: "School: {schoolName}\nClass: {classLabel}\nWeek: {weekLabel}",
    },
    {
      id: "subjects-1",
      type: "subjects",
      order: 1,
      visible: true,
    },
    {
      id: "footer-1",
      type: "footer",
      order: 2,
      visible: true,
      content: "",
    },
  ];
}
