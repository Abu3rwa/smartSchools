import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const templateSlideLayoutSchema = new Schema(
  {
    layout: {
      type: String,
      required: true,
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
    },
    purpose: {
      type: String,
      enum: [
        "opener",
        "objective",
        "content",
        "activity",
        "assessment",
        "summary",
        "closer",
        "custom",
      ],
      required: true,
    },
    promptHint: { type: String, maxlength: 500 },
    required: { type: Boolean, default: false },
  },
  { _id: false }
);

const presentationTemplateSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", index: true },
    name: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 300 },
    category: {
      type: String,
      enum: ["lesson", "review", "assessment", "meeting", "custom"],
      default: "lesson",
    },

    // Slide structure definition
    slideStructure: { type: [templateSlideLayoutSchema], default: [] },

    // Theme defaults
    defaultTheme: {
      primaryColor: { type: String, default: "#1976d2" },
      secondaryColor: { type: String, default: "#ffffff" },
      fontFamily: { type: String, default: "Inter" },
      fontSize: {
        type: String,
        enum: ["small", "medium", "large"],
        default: "medium",
      },
    },

    // Controls
    isGlobal: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

presentationTemplateSchema.index({ school: 1, isActive: 1 });
presentationTemplateSchema.index({ isGlobal: 1, isActive: 1 });
presentationTemplateSchema.plugin(tenantIsolationPlugin);

const PresentationTemplate = mongoose.model(
  "PresentationTemplate",
  presentationTemplateSchema
);
export default PresentationTemplate;
