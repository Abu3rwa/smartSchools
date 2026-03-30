import { VALID_SLIDE_LAYOUTS } from "../config/presentationLimits.js";

const ensureHtml = (value) => (typeof value === "string" ? value : "");

export const applyLayoutToSlide = ({ slide, layout, preserveContent = true }) => {
  if (!VALID_SLIDE_LAYOUTS.includes(layout)) {
    throw Object.assign(new Error("Invalid layout"), { status: 400 });
  }

  const next = slide;
  next.layout = layout;

  if (preserveContent) {
    if (!["two-column", "comparison"].includes(layout)) {
      next.bodyHtml2 = "";
    }
    if (!["image-left", "image-right", "image-full"].includes(layout)) {
      next.imageUrl = "";
      next.imageAlt = "";
      next.imageCaption = "";
    }
    return next;
  }

  next.title = next.title || "";
  next.subtitle = "";
  next.bodyHtml = ensureHtml(next.bodyHtml);
  next.bodyHtml2 = "";
  next.speakerNotes = next.speakerNotes || "";

  if (["image-left", "image-right", "image-full"].includes(layout)) {
    next.bodyHtml = ensureHtml(next.bodyHtml);
  } else {
    next.imageUrl = "";
    next.imageAlt = "";
    next.imageCaption = "";
  }

  return next;
};
