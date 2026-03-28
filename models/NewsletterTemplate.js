import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

/* ─── Section block inside a template ───────────────────────────── */
const sectionBlockSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "header",
        "text",
        "image",
        "subjects",
        "divider",
        "callout",
        "two_column",
        "footer",
        "hero_banner",
        "image_grid",
        "events_list",
        "spotlight",
        "button",
        "heading",
        "three_column",
        "spacer",
        "social_links",
        "contact_info",
      ],
      required: true,
    },
    order: { type: Number, required: true, default: 0 },
    visible: { type: Boolean, default: true },

    /* ── Content fields (vary by type) ────────────────────────── */
    content: { type: String, default: "" },
    richContent: { type: String, default: "" },
    heading: { type: String, default: "" },
    subheading: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageAlt: { type: String, default: "" },
    iconEmoji: { type: String, default: "" },

    /* ── Two-column / three-column children ───────────────────── */
    leftContent: { type: String, default: "" },
    rightContent: { type: String, default: "" },
    middleContent: { type: String, default: "" },

    /* ── Image grid ───────────────────────────────────────────── */
    images: [{ url: { type: String, default: "" }, alt: { type: String, default: "" } }],

    /* ── Events list ──────────────────────────────────────────── */
    events: [{ date: { type: String, default: "" }, title: { type: String, default: "" }, description: { type: String, default: "" } }],

    /* ── Spotlight ────────────────────────────────────────────── */
    avatarUrl: { type: String, default: "" },
    role: { type: String, default: "" },
    quote: { type: String, default: "" },

    /* ── Button / CTA ─────────────────────────────────────────── */
    buttonLabel: { type: String, default: "" },
    buttonUrl: { type: String, default: "" },
    buttonStyle: { type: String, enum: ["filled", "outline", "pill", ""], default: "" },

    /* ── Spacer ───────────────────────────────────────────────── */
    spacerHeight: { type: String, default: "24px" },

    /* ── Social links ─────────────────────────────────────────── */
    socialLinks: {
      website: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      twitter: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },

    /* ── Contact info ─────────────────────────────────────────── */
    contactInfo: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },

    /* ── Per-block style overrides ────────────────────────────── */
    style: {
      backgroundColor: { type: String, default: "" },
      textColor: { type: String, default: "" },
      textAlign: {
        type: String,
        enum: ["left", "center", "right", ""],
        default: "",
      },
      padding: { type: String, default: "" },
      borderRadius: { type: String, default: "" },
      fontSize: { type: String, default: "" },
      fontWeight: { type: String, default: "" },
      backgroundImageUrl: { type: String, default: "" },
      overlayOpacity: { type: Number, min: 0, max: 1, default: 0.5 },
    },
  },
  { _id: false },
);

/* ─── Global style config ───────────────────────────────────────── */
const globalStyleSchema = new Schema(
  {
    /* Palette */
    primaryColor: { type: String, default: "" },
    secondaryColor: { type: String, default: "" },
    backgroundColor: { type: String, default: "#ffffff" },
    headerBackgroundColor: { type: String, default: "" },
    headerTextColor: { type: String, default: "#ffffff" },
    bodyTextColor: { type: String, default: "#334155" },
    footerTextColor: { type: String, default: "#94a3b8" },
    accentColor: { type: String, default: "" },
    cardBackgroundColor: { type: String, default: "#f8fafc" },
    cardBorderColor: { type: String, default: "#e2e8f0" },
    dividerColor: { type: String, default: "#e2e8f0" },

    /* Typography */
    fontFamily: {
      type: String,
      default: "Arial, Helvetica, sans-serif",
    },
    headingFontFamily: { type: String, default: "" },
    baseFontSize: { type: String, default: "14px" },
    headingFontSize: { type: String, default: "20px" },
    lineHeight: { type: String, default: "1.6" },

    /* Layout */
    maxWidth: { type: String, default: "680px" },
    contentPadding: { type: String, default: "24px" },
    sectionSpacing: { type: String, default: "16px" },
    borderRadius: { type: String, default: "12px" },
    headerBorderRadius: { type: String, default: "12px" },

    /* Logo */
    showLogo: { type: Boolean, default: true },
    logoPosition: {
      type: String,
      enum: ["left", "center", "right"],
      default: "right",
    },
    logoMaxHeight: { type: String, default: "40px" },

    /* Header layout */
    headerStyle: {
      type: String,
      enum: ["gradient", "solid", "minimal", "banner"],
      default: "gradient",
    },

    /* Footer */
    footerText: {
      type: String,
      default:
        "This email was sent by the school. If you have questions, please contact the school office.",
    },
    showFooter: { type: Boolean, default: true },

    /* Issue metadata */
    issueTitle: { type: String, default: "" },
    issueNumber: { type: String, default: "" },

    /* Preset theme */
    presetTheme: {
      type: String,
      enum: ["classic", "modern", "colorful", "minimal", "custom", ""],
      default: "",
    },
  },
  { _id: false },
);

/* ─── Main template schema ──────────────────────────────────────── */
const newsletterTemplateSchema = new Schema(
  {
    school: {
      type: ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Template name is required"],
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    thumbnail: {
      type: String,
      default: "",
    },

    /* ── Content blocks ───────────────────────────────────────── */
    sections: [sectionBlockSchema],

    /* ── Global styles ────────────────────────────────────────── */
    globalStyle: {
      type: globalStyleSchema,
      default: () => ({}),
    },

    /* ── Audit ────────────────────────────────────────────────── */
    createdBy: { type: ObjectId, ref: "User" },
    lastEditedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true },
);

newsletterTemplateSchema.plugin(tenantIsolationPlugin);

/* Only one default per school */
newsletterTemplateSchema.pre("save", async function (next) {
  if (this.isDefault && this.isModified("isDefault")) {
    await this.constructor.updateMany(
      { school: this.school, _id: { $ne: this._id }, isDefault: true },
      { $set: { isDefault: false } },
    );
  }
  next();
});

export default mongoose.model("NewsletterTemplate", newsletterTemplateSchema);
