import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { DEFAULT_PRESENTATION_LAYOUT_SYSTEM } from "../config/presentationLayoutSystems.js";

const { Schema } = mongoose;

const citationSchema = new Schema(
  {
    source: { type: String, maxlength: 200 },
    page: { type: String, maxlength: 20 },
    chunk: { type: String, maxlength: 100 },
  },
  { _id: false }
);

const slideBackgroundSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["solid", "gradient", "image"],
      default: "solid",
    },
    solidColor: { type: String, default: "#ffffff" },
    gradientFrom: { type: String, default: "#1a73e8" },
    gradientTo: { type: String, default: "#174ea6" },
    gradientAngle: { type: Number, default: 135 },
    imageUrl: { type: String, default: "" },
    overlayColor: { type: String, default: "#000000" },
    overlayOpacity: { type: Number, default: 0 },
  },
  { _id: false }
);

const slideSchema = new Schema(
  {
    order: { type: Number, required: true },
    layout: {
      type: String,
      enum: [
        "title",
        "title-body",
        "two-column",
        "image-left",
        "image-right",
        "image-full",
        "quote",
        "bullets",
        "comparison",
        "blank",
      ],
      default: "title-body",
    },
    title: { type: String, maxlength: 200, default: "" },
    subtitle: { type: String, maxlength: 300, default: "" },
    bodyHtml: { type: String, maxlength: 5000, default: "" },
    bodyHtml2: { type: String, maxlength: 5000, default: "" },
    speakerNotes: { type: String, maxlength: 2000, default: "" },
    imageUrl: { type: String, default: "" },
    imageAlt: { type: String, maxlength: 200, default: "" },
    imageCaption: { type: String, maxlength: 300, default: "" },
    background: { type: slideBackgroundSchema, default: () => ({}) },
    citations: { type: [citationSchema], default: [] },
    aiGenerated: { type: Boolean, default: true },
    editedAt: { type: Date },
  },
  { _id: false }
);

const commentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, maxlength: 2000 },
    slideIndex: { type: Number, min: 0, default: 0 },
    resolved: { type: Boolean, default: false },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

const presentationSchema = new Schema(
  {
    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    academicYear: { type: String, required: true },

    // Content
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 500 },
    slides: { type: [slideSchema], default: [] },

    // Context references
    lessonPlan: { type: Schema.Types.ObjectId, ref: "LessonPlan" },
    class: { type: Schema.Types.ObjectId, ref: "Class" },
    subject: { type: Schema.Types.ObjectId, ref: "Subject" },
    standards: [{ type: Schema.Types.ObjectId, ref: "Standard" }],

    // Template & theme
    template: { type: Schema.Types.ObjectId, ref: "PresentationTemplate" },
    theme: {
      primaryColor: { type: String, default: "#1976d2" },
      secondaryColor: { type: String, default: "#ffffff" },
      fontFamily: { type: String, default: "Inter" },
      fontSize: {
        type: String,
        enum: ["small", "medium", "large"],
        default: "medium",
      },
    },
    themeTokens: {
      titleColor: { type: String, default: "#0f172a" },
      bodyColor: { type: String, default: "#1f2937" },
      canvasColor: { type: String, default: "#ffffff" },
      surfaceColor: { type: String, default: "#f8fafc" },
      gradientFrom: { type: String, default: "#1a73e8" },
      gradientTo: { type: String, default: "#174ea6" },
      gradientAngle: { type: Number, default: 135 },
    },
    schemaVersion: { type: Number, default: 2 },
    layoutSystem: {
      type: String,
      default: DEFAULT_PRESENTATION_LAYOUT_SYSTEM,
      maxlength: 80,
    },

    // Source materials
    extractions: [
      { type: Schema.Types.ObjectId, ref: "PresentationExtraction" },
    ],

    // Generation metadata
    generation: {
      prompt: { type: String, maxlength: 2000 },
      modelName: { type: String },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      generatedAt: { type: Date },
      durationMs: { type: Number },
      version: { type: Number, default: 1 },
      language: { type: String, default: "en" },
      requestedLanguages: [String],
    },

    // Lifecycle
    status: {
      type: String,
      enum: ["draft", "ready", "presented", "archived"],
      default: "draft",
    },
    presentedAt: { type: Date },
    presentCount: { type: Number, default: 0 },

    // Sharing
    sharedWith: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        permission: {
          type: String,
          enum: ["view", "edit", "present"],
          default: "view",
        },
      },
    ],
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

presentationSchema.index({ school: 1, teacher: 1, status: 1 });
presentationSchema.index({ school: 1, class: 1, subject: 1 });
presentationSchema.index({ school: 1, createdAt: -1 });

presentationSchema.plugin(tenantIsolationPlugin);

const Presentation = mongoose.model("Presentation", presentationSchema);
export default Presentation;
